import { applyChange, rebaseText, type SyncEdit, type SyncPending } from './document-sync';
import { canApplyMarkdown } from './document-limits';
import { ParsiWordError } from './errors';

/** Host recovery journal: full text only for real writes, tiny patches for tails. */
export class PendingDocument {
  private base = '';
  private text = '';
  private sequence = 0;
  record(edit: SyncEdit): void {
    if (edit.sequence < this.sequence) throw new ParsiWordError('SYNC_REJECTED');
    this.base = edit.base; this.text = edit.text; this.sequence = edit.sequence;
  }
  stage(pending: SyncPending): boolean {
    if (pending.previous !== this.sequence || pending.sequence !== pending.previous + 1
      || pending.change.start > pending.change.end || pending.change.end > this.text.length) return false;
    const next = applyChange(this.text, pending.change);
    if (!canApplyMarkdown(this.text, next)) return false;
    this.text = next; this.sequence = pending.sequence;
    return true;
  }
  applied(edit: SyncEdit): void { this.base = edit.text; }
  get pending(): boolean { return this.base !== this.text; }
  get baseline(): string { return this.base; }
  get draft(): string { return this.text; }
  against(current: string): string { return rebaseText(this.base, this.text, current); }
  clear(): void { this.base = this.text; }
}
