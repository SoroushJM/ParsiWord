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
    for (const name of ['nativeDiff', 'nativeStagedDiff']) expect(isClientMessage({ type: 'request', id: 1, method: 'command', args: { name } })).toBe(true);
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
  it('bounds comparison restoration metadata before accepting a ready message', () => {
    for (const restoreComparison of [undefined, 'git:/workspace/readme.md?ref=HEAD', 'a'.repeat(8192)]) {
      expect(isClientMessage({ type: 'ready', restoreComparison })).toBe(true);
    }
    for (const restoreComparison of [null, true, 1, [], {}, 'a'.repeat(8193)]) {
      expect(isClientMessage({ type: 'ready', restoreComparison })).toBe(false);
    }
  });
  it('accepts only an explicit original or modified comparison focus side', () => {
    for (const focused of [true, false]) {
      for (const comparisonSide of [undefined, 'original', 'modified']) {
        expect(isClientMessage({ type: 'focus', focused, comparisonSide })).toBe(true);
      }
    }
    for (const comparisonSide of [null, true, 0, 'both', ['modified'], {}]) {
      expect(isClientMessage({ type: 'focus', focused: true, comparisonSide })).toBe(false);
    }
    expect(isClientMessage({ type: 'focus', comparisonSide: 'modified' })).toBe(false);
  });
  it('validates single-tab comparison metadata consistently for init and updates', () => {
    const init = { type: 'init', snapshot: { text: '', version: 1, dirty: false }, client: 'client', settings: defaultSettings, assetRoot: '', locale: 'en', version: '1', viewMode: 'source' };
    const comparison = { side: 'modified', other: 'original source', staged: false };
    const accepts = (metadata: unknown) => [
      isHostMessage({ type: 'comparison', comparison: metadata }),
      isHostMessage({ ...init, comparison: metadata }),
    ];
    for (const singleTab of [undefined, true, false]) {
      for (const originalUri of [undefined, 'git:/workspace/readme.md?ref=HEAD', 'a'.repeat(8192)]) {
        expect(accepts({ ...comparison, singleTab, originalUri })).toEqual([true, true]);
      }
    }
    for (const singleTab of [null, 0, 'true', [], {}]) {
      expect(accepts({ ...comparison, singleTab })).toEqual([false, false]);
    }
    for (const originalUri of [null, 0, true, [], {}, 'a'.repeat(8193)]) {
      expect(accepts({ ...comparison, singleTab: true, originalUri })).toEqual([false, false]);
    }
  });
  it.each(['imageUri', 'imageBytes'])('bounds %s requests and optional document bases without coercing values', method => {
    const request = { type: 'request', id: 1, method };
    for (const source of ['./assets/a%20b.svg', 'https://example.com/a.png', 'a'.repeat(8192)]) {
      for (const baseUri of [undefined, 'file:///workspace/readme.md', 'a'.repeat(8192)]) {
        expect(isClientMessage({ ...request, args: { source, baseUri } })).toBe(true);
      }
    }
    for (const source of [undefined, null, 0, true, [], {}, 'a'.repeat(8193)]) {
      expect(isClientMessage({ ...request, args: { source } })).toBe(false);
    }
    for (const baseUri of [null, 0, true, [], {}, 'a'.repeat(8193)]) {
      expect(isClientMessage({ ...request, args: { source: './image.svg', baseUri } })).toBe(false);
    }
    for (const args of [undefined, null, [], './image.svg']) {
      expect(isClientMessage({ ...request, args })).toBe(false);
    }
    for (const id of [-1, 0.5, '1', Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(isClientMessage({ ...request, id, args: { source: './image.svg' } })).toBe(false);
    }
  });
});
