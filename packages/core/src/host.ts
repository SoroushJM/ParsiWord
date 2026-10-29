import type { ExportSettings } from './document-model';
import type { AppearanceSettings } from './appearance';

export type DocumentSnapshot = { markdown: string; dirty: boolean };
export type SaveFormat = { label: string; extension: string; mime: string };
export type HostCommand = 'source' | 'preview' | 'diff' | 'stagedDiff' | 'nativeDiff' | 'nativeStagedDiff' | 'save' | 'undo' | 'redo' | 'new';
export type DocumentViewMode = 'combined' | 'source' | 'rendered';
export type EditorAction = 'find' | 'replace' | 'goToLine' | 'findNext' | 'findPrevious';
export type { DocumentComparison } from './markdown-diff';
import type { DocumentComparison } from './markdown-diff';

/** Environment services. The shared workspace never imports a host SDK. */
export interface EditorHost {
  kind: 'web' | 'native' | 'vscode';
  version: string;
  asset?: (path: string) => string;
  /** Resolve a Markdown image URL relative to this document's environment. */
  resolveImage?: (source: string) => Promise<string | null>;
  /** Read export image bytes through the host, outside webview fetch/CORS. */
  readImage?: (source: string) => Promise<{ bytes: Uint8Array; mimeType?: string }>;
  nativeFonts?: boolean;
  fontResource?: (url: string) => Promise<Uint8Array>;
  saveBytes?: (bytes: Uint8Array, filename: string, format: SaveFormat) => Promise<boolean>;
  openMarkdown?: () => Promise<{ name: string; text: string } | null>;
  /** Follow a preview link using this document's host, outside the editor webview. */
  openLink?: (href: string) => Promise<void>;
  initial?: { markdown: string; settings: ExportSettings; dirty: boolean; viewMode?: DocumentViewMode; recovery?: 'oversize' };
  documentChanged?: (markdown: string) => void;
  compositionChanged?: (composing: boolean) => void;
  subscribeDocument?: (listener: (snapshot: DocumentSnapshot) => void) => () => void;
  settingsChanged?: (settings: ExportSettings) => void;
  persistDraft?: (draft: { markdown: string; settings: ExportSettings }) => void;
  command?: (command: HostCommand) => void;
  locale?: 'fa' | 'en';
  localeChanged?: (locale: 'fa' | 'en') => void;
  appearanceChanged?: (settings: AppearanceSettings) => void;
  readOnly?: boolean;
  comparison?: DocumentComparison;
  subscribeComparison?: (listener: (comparison: DocumentComparison | undefined) => void) => () => void;
  navigateComparison?: (index: number) => void;
  subscribeComparisonNavigation?: (listener: (index: number) => void) => () => void;
  subscribeEditorAction?: (listener: (action: EditorAction) => void) => () => void;
}

let host: EditorHost = { kind: 'web', version: '0.4.7' };
export function configureHost(next: EditorHost): void { host = next; }
export function editorHost(): EditorHost { return host; }
