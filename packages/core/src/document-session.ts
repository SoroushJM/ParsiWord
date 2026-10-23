import { canApplyMarkdown } from './document-limits';
import type { ExportSettings } from './document-model';

export type MutationOrigin = 'source' | 'rich' | 'toolbar' | 'import' | 'restore' | 'host';
export type SessionSnapshot = {
  markdown: string;
  settings: Readonly<ExportSettings>;
  revision: number;
  origin: MutationOrigin;
  composing: boolean;
};

/** Synchronous logical document ownership; display delays never enter this store. */
export class DocumentSession {
  private value: SessionSnapshot;
  private readonly listeners = new Set<() => void>();
  constructor(markdown: string, settings: ExportSettings) {
    this.value = { markdown, settings: { ...settings }, revision: 0, origin: 'host', composing: false };
  }
  readonly getSnapshot = (): SessionSnapshot => this.value;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(next: SessionSnapshot): void {
    this.value = next;
    for (const listener of this.listeners) listener();
  }
  change(markdown: string, origin: Exclude<MutationOrigin, 'host'>): boolean {
    if (!canApplyMarkdown(this.value.markdown, markdown)) return false;
    this.replace(markdown, origin);
    return true;
  }
  /** External content is preserved in full; the UI supplies oversize recovery. */
  replace(markdown: string, origin: MutationOrigin = 'host'): void {
    if (markdown === this.value.markdown) return;
    this.publish({ ...this.value, markdown, origin, revision: this.value.revision + 1 });
  }
  update<K extends keyof ExportSettings>(key: K, value: ExportSettings[K]): void {
    if (this.value.settings[key] === value) return;
    this.publish({ ...this.value, settings: { ...this.value.settings, [key]: value }, revision: this.value.revision + 1 });
  }
  composition(composing: boolean): void {
    if (composing !== this.value.composing) this.publish({ ...this.value, composing });
  }
  /** Capture settings as well as text before any asynchronous export work. */
  snapshot(): { markdown: string; settings: ExportSettings; revision: number } {
    return { markdown: this.value.markdown, settings: { ...this.value.settings }, revision: this.value.revision };
  }
}
