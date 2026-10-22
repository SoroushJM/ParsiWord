import { describe, it, expect } from 'vitest';
import { minimalChange, applyChange, rebaseText, DocumentSync, type SyncEdit } from './document-sync';
describe('TextDocument bridge', () => {
  it.each([['سلام\r\n😀 متن', 'سلام\r\n😃 متن'], ['', 'سلام'], ['a\r\nb', 'a\r\nBB'], ['x\\*y  \n', 'x\\*z  \n']])('uses a minimal reversible edit: %s', (before, after) => {
    const edit = minimalChange(before, after)!;
    expect(applyChange(before, edit)).toBe(after);
    expect(minimalChange(after, after)).toBeNull();
    expect(edit.text.length).toBeLessThanOrEqual(after.length);
  });
  it('rebases disjoint source and preview edits in either order', () => {
    expect(rebaseText('one two three', 'ONE two three', 'one two THREE')).toBe('ONE two THREE');
    expect(rebaseText('one two three', 'one two THREE', 'ONE two three')).toBe('ONE two THREE');
    expect(rebaseText('a b c', 'a b cc', 'aa b c')).toBe('aa b cc');
  });
  it('rejects overlapping replacements and same-position insertion', () => {
    expect(() => rebaseText('abc', 'aXc', 'aYc')).toThrow('overlap');
    expect(() => rebaseText('ab', 'aXb', 'aYb')).toThrow('overlap');
  });
  it('does not lose fast input while a host edit is in flight', () => {
    const writes: SyncEdit[] = [], views: string[] = [], recovered: string[] = [];
    const sync = new DocumentSync({ text: 'a', version: 1, dirty: false }, edit => writes.push(edit), state => views.push(state.text), text => recovered.push(text));
    sync.edit('ab'); sync.edit('abc'); sync.edit('abcd');
    expect(writes).toHaveLength(1);
    sync.receive({ text: 'ab', version: 2, dirty: true, ack: 1 }, true);
    expect(views[views.length - 1]).toBe('abcd'); expect(writes).toHaveLength(2);
    expect(writes[1]).toMatchObject({ base: 'ab', text: 'abcd', version: 2 });
    sync.receive({ text: 'abcd', version: 3, dirty: true, ack: 2 }, true);
    expect(sync.pending).toBe(false); expect(recovered).toEqual([]);
  });
  it('tracks native undo, redo and save without echoing writes', () => {
    const writes: SyncEdit[] = [], views: string[] = [];
    const sync = new DocumentSync({ text: 'ab', version: 2, dirty: true }, edit => writes.push(edit), state => views.push(state.text), () => {});
    sync.receive({ text: 'a', version: 3, dirty: true });
    sync.receive({ text: 'ab', version: 4, dirty: true });
    sync.receive({ text: 'ab', version: 4, dirty: false });
    expect(views).toEqual(['a','ab','ab']); expect(writes).toEqual([]);
  });
  it('preserves a rejected local draft instead of overwriting a concurrent edit', () => {
    const recovered: string[] = [];
    const sync = new DocumentSync({ text: 'a', version: 1, dirty: false }, () => {}, () => {}, text => recovered.push(text));
    sync.edit('local'); sync.receive({ text: 'remote', version: 2, dirty: true, rejected: true });
    expect(recovered).toEqual(['local']); expect(sync.pending).toBe(false);
  });
});
