import type { ExportSettings } from './document-model';

export type DocumentSnapshot = { markdown: string; dirty: boolean };
export type SaveFormat = { label: string; extension: string; mime: string };
export type HostCommand = 'source' | 'preview' | 'diff' | 'stagedDiff' | 'save' | 'undo' | 'redo' | 'new';
export type DocumentViewMode = 'combined' | 'source' | 'rendered';

/** Environment services. The shared workspace never imports a host SDK. */
export interface EditorHost {
  kind: 'web' | 'native' | 'vscode';
  version: string;
  asset?: (path: string) => string;
  nativeFonts?: boolean;
  fontResource?: (url: string) => Promise<Uint8Array>;
  saveBytes?: (bytes: Uint8Array, filename: string, format: SaveFormat) => Promise<boolean>;
  openMarkdown?: () => Promise<{ name: string; text: string } | null>;
  initial?: { markdown: string; settings: ExportSettings; dirty: boolean; viewMode?: DocumentViewMode; recovery?: 'oversize' };
  documentChanged?: (markdown: string) => void;
  compositionChanged?: (composing: boolean) => void;
  subscribeDocument?: (listener: (snapshot: DocumentSnapshot) => void) => () => void;
  settingsChanged?: (settings: ExportSettings) => void;
  persistDraft?: (draft: { markdown: string; settings: ExportSettings }) => void;
  command?: (command: HostCommand) => void;
  locale?: 'fa' | 'en';
  localeChanged?: (locale: 'fa' | 'en') => void;
}

let host: EditorHost = { kind: 'web', version: '0.4.7' };
export function configureHost(next: EditorHost): void { host = next; }
export function editorHost(): EditorHost { return host; }
