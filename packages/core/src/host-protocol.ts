import { isAppearanceSettings, type AppearanceSettings } from './appearance';
import { isExportSettings, isRecord } from './document-validation';
import { canApplyMarkdown } from './document-limits';
import type { ExportSettings } from './document-model';
import type { DocumentViewMode, HostCommand, DocumentComparison, EditorAction } from './host';
import type { SyncEdit, SyncPending, SyncSnapshot } from './document-sync';
import { isErrorCode, type ErrorCode } from './errors';
import { isMarkdownLink } from './markdown-link';

const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
export function isDocumentComparison(value: unknown): value is DocumentComparison {
  return isRecord(value) && (value.side === 'original' || value.side === 'modified') && typeof value.other === 'string' && typeof value.staged === 'boolean'
    && (value.singleTab === undefined || typeof value.singleTab === 'boolean')
    && (value.originalUri === undefined || typeof value.originalUri === 'string' && value.originalUri.length <= 8192);
}
export const isViewMode = (value: unknown): value is DocumentViewMode => typeof value === 'string' && ['combined', 'source', 'rendered'].includes(value);
export const isHostCommand = (value: unknown): value is HostCommand => typeof value === 'string' && ['source', 'preview', 'diff', 'stagedDiff', 'nativeDiff', 'nativeStagedDiff', 'save', 'undo', 'redo', 'new'].includes(value);
export function isSyncSnapshot(value: unknown): value is SyncSnapshot {
  return isRecord(value) && typeof value.text === 'string' && integer(value.version) && typeof value.dirty === 'boolean'
    && (value.eol === undefined || value.eol === '\n' || value.eol === '\r\n')
    && (value.ack === undefined || integer(value.ack)) && (value.client === undefined || typeof value.client === 'string')
    && (value.rejected === undefined || typeof value.rejected === 'boolean');
}
export function isSyncEdit(value: unknown): value is SyncEdit {
  return isRecord(value) && integer(value.id) && integer(value.version) && integer(value.sequence)
    && typeof value.base === 'string' && typeof value.text === 'string'
    && canApplyMarkdown(value.base, value.text);
}
export function isSyncPending(value: unknown): value is SyncPending {
  if (!isRecord(value) || !integer(value.sequence) || !integer(value.previous) || !isRecord(value.change)) return false;
  const change = value.change;
  return integer(change.start) && integer(change.end) && change.start <= change.end
    && typeof change.text === 'string';
}
export type ClientMessage = { type: 'ready'; restoreComparison?: string } | { type: 'edit' | 'draft'; edit: SyncEdit } | { type: 'pending'; pending: SyncPending }
  | { type: 'focus'; focused: boolean; comparisonSide?: 'original' | 'modified' }
  | { type: 'comparisonNavigate'; index: number }
  | { type: 'appearance'; appearance: AppearanceSettings }
  | { type: 'settings'; settings: ExportSettings } | { type: 'locale'; locale: 'fa' | 'en' }
  | { type: 'request'; id: number; method: 'command' | 'open' | 'openLink' | 'saveBytes' | 'font' | 'recover' | 'imageUri' | 'imageBytes'; args: Record<string, unknown> };
export function isClientMessage(value: unknown): value is ClientMessage {
  if (!isRecord(value)) return false;
  if (value.type === 'ready') return value.restoreComparison === undefined || typeof value.restoreComparison === 'string' && value.restoreComparison.length <= 8192;
  if (value.type === 'focus') return typeof value.focused === 'boolean' && (value.comparisonSide === undefined || value.comparisonSide === 'original' || value.comparisonSide === 'modified');
  if (value.type === 'comparisonNavigate') return integer(value.index);
  if (value.type === 'edit' || value.type === 'draft') return isSyncEdit(value.edit);
  if (value.type === 'pending') return isSyncPending(value.pending);
  if (value.type === 'appearance') return isAppearanceSettings(value.appearance);
  if (value.type === 'settings') return isExportSettings(value.settings);
  if (value.type === 'locale') return value.locale === 'fa' || value.locale === 'en';
  if (value.type !== 'request' || !integer(value.id) || !isRecord(value.args)) return false;
  const args = value.args;
  if (value.method === 'command') return isHostCommand(args.name);
  if (value.method === 'open') return true;
  if (value.method === 'openLink') return isMarkdownLink(args.href) && (args.baseUri === undefined || typeof args.baseUri === 'string' && args.baseUri.length <= 8192);
  if (value.method === 'font') return typeof args.url === 'string' && args.url.length <= 2048;
  if (value.method === 'imageUri' || value.method === 'imageBytes') return typeof args.source === 'string' && args.source.length <= 8192 && (args.baseUri === undefined || typeof args.baseUri === 'string' && args.baseUri.length <= 8192);
  if (value.method === 'recover') return typeof args.text === 'string';
  if (value.method === 'saveBytes') return typeof args.filename === 'string' && args.filename.length <= 512
    && typeof args.extension === 'string' && ['md', 'docx', 'pdf'].includes(args.extension) && Array.isArray(args.bytes) && args.bytes.length <= 64 * 1024 * 1024
    && args.bytes.every(byte => Number.isInteger(byte) && Number(byte) >= 0 && Number(byte) <= 255);
  return false;
}
export type HostMessage = { type: 'document'; snapshot: SyncSnapshot }
  | { type: 'appearance'; appearance: AppearanceSettings }
  | { type: 'editorAction'; action: EditorAction }
  | { type: 'comparison'; comparison: DocumentComparison | null }
  | { type: 'comparisonNavigate'; index: number }
  | { type: 'response'; id: number; result?: unknown; error?: string; errorCode?: ErrorCode }
  | { type: 'init'; snapshot: SyncSnapshot; client: string; settings: ExportSettings; assetRoot: string; locale: 'fa' | 'en'; version: string; viewMode: DocumentViewMode; appearance?: AppearanceSettings; readOnly?: boolean; comparison?: DocumentComparison | null };
export function isHostMessage(value: unknown): value is HostMessage {
  if (!isRecord(value)) return false;
  if (value.type === 'appearance') return isAppearanceSettings(value.appearance);
  if (value.type === 'editorAction') return typeof value.action === 'string' && ['find', 'replace', 'goToLine', 'findNext', 'findPrevious'].includes(value.action);
  if (value.type === 'comparison') return value.comparison === null || isDocumentComparison(value.comparison);
  if (value.type === 'comparisonNavigate') return integer(value.index);
  if (value.type === 'document') return isSyncSnapshot(value.snapshot);
  if (value.type === 'response') return integer(value.id) && (value.error === undefined || typeof value.error === 'string') && (value.errorCode === undefined || isErrorCode(value.errorCode));
  return value.type === 'init' && isSyncSnapshot(value.snapshot) && typeof value.client === 'string'
    && isExportSettings(value.settings) && typeof value.assetRoot === 'string'
    && (value.locale === 'fa' || value.locale === 'en') && typeof value.version === 'string' && isViewMode(value.viewMode)
    && (value.appearance === undefined || isAppearanceSettings(value.appearance))
    && (value.readOnly === undefined || typeof value.readOnly === 'boolean')
    && (value.comparison === undefined || value.comparison === null || isDocumentComparison(value.comparison));
}
