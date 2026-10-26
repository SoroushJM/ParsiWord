import { describe, expect, it } from 'vitest';
import { MAX_MARKDOWN_LENGTH } from './document-limits';
import { defaultSettings } from './document-model';
import { isClientMessage, isHostMessage, isSyncEdit, isSyncPending } from './host-protocol';
import { normalizeSettings } from './document-validation';
import { PendingDocument } from './pending-document';

describe('runtime host protocol', () => {
  it('accepts only supported editor actions from the host', () => {
    for (const action of ['find', 'replace', 'goToLine', 'findNext', 'findPrevious']) expect(isHostMessage({ type: 'editorAction', action })).toBe(true);
    for (const action of [null, [], 'undo', 'execute', 1]) expect(isHostMessage({ type: 'editorAction', action })).toBe(false);
    expect(isClientMessage({ type: 'focus', focused: true })).toBe(true);
    expect(isClientMessage({ type: 'focus', focused: false })).toBe(true);
    expect(isClientMessage({ type: 'focus', focused: 'true' })).toBe(false);
  });
  it('validates requests and settings before dispatch', () => {
    expect(isClientMessage({ type: 'request', id: 1, method: 'command', args: { name: 'save' } })).toBe(true);
    for (const value of [null, { type: 'request', id: 1, method: 'unknown', args: {} }, { type: 'request', id: 1, method: 'command', args: { name: ['save'] } }, { type: 'request', id: 1, method: 'saveBytes', args: { filename: 'a.md', extension: 'md', bytes: [256] } }, { type: 'settings', settings: { ...defaultSettings, direction: 'sideways' } }]) expect(isClientMessage(value)).toBe(false);
    expect(isClientMessage({ type: 'settings', settings: defaultSettings })).toBe(true);
    expect(isHostMessage({ type: 'document', snapshot: { text: '', version: -1, dirty: false } })).toBe(false);
    expect(isHostMessage({ type: 'response', id: 1, errorCode: 'SYNC_REJECTED' })).toBe(true);
    expect(isHostMessage({ type: 'response', id: 1, errorCode: 'unrecognized' })).toBe(false);
    expect(isHostMessage({ type: 'init', snapshot: { text: '', version: 1, dirty: false }, client: 'a', settings: defaultSettings, assetRoot: '', locale: 'en', version: '1', viewMode: ['source'] })).toBe(false);
  });
  it('permits complete oversized snapshots and shrinking recovery, with final journal size validation', () => {
    const base = 'a'.repeat(MAX_MARKDOWN_LENGTH + 20), text = 'b'.repeat(MAX_MARKDOWN_LENGTH + 10);
    const edit = { id: 1, sequence: 1, version: 1, base, text };
    expect(isHostMessage({ type: 'document', snapshot: { text: base, version: 1, dirty: true } })).toBe(true);
    expect(isSyncEdit(edit)).toBe(true); expect(isSyncEdit({ ...edit, text: base + 'a' })).toBe(false);
    const journal = new PendingDocument(); journal.record(edit);
    const shrinking = { previous: 1, sequence: 2, change: { start: 0, end: text.length, text: 'c'.repeat(MAX_MARKDOWN_LENGTH + 1) } };
    expect(isSyncPending(shrinking)).toBe(true); expect(journal.stage(shrinking)).toBe(true);
    expect(journal.stage({ previous: 2, sequence: 3, change: { start: 0, end: 0, text: 'x' } })).toBe(false);
  });
  it('migrates partial settings without accepting coerced enum values', () => {
    expect(normalizeSettings({ direction: ['rtl'], fontSize: '18', title: 'x' })).toEqual({ ...defaultSettings, title: 'x' });
    expect(normalizeSettings({ direction: 'ltr', fontSize: 18, alignmentOnly: true })).toMatchObject({ direction: 'ltr', fontSize: 18, alignmentOnly: false });
  });
  it('validates comparison metadata and navigation across the webview boundary', () => {
    const comparison = { side: 'original', other: 'متن English', staged: true };
    expect(isHostMessage({ type: 'comparison', comparison })).toBe(true);
    expect(isHostMessage({ type: 'comparison', comparison: null })).toBe(true);
    for (const invalid of [{ ...comparison, side: 'both' }, { ...comparison, other: 1 }, { ...comparison, staged: 'true' }]) {
      expect(isHostMessage({ type: 'comparison', comparison: invalid })).toBe(false);
    }
    for (const index of [0, 3]) {
      expect(isClientMessage({ type: 'comparisonNavigate', index })).toBe(true);
      expect(isHostMessage({ type: 'comparisonNavigate', index })).toBe(true);
    }
    for (const index of [-1, 0.5, '1', Number.POSITIVE_INFINITY]) {
      expect(isClientMessage({ type: 'comparisonNavigate', index })).toBe(false);
      expect(isHostMessage({ type: 'comparisonNavigate', index })).toBe(false);
    }
  });
});
