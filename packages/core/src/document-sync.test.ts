import { describe, it, expect } from 'vitest';
import { minimalChange, applyChange, rebaseText, DocumentSync, EditConflict, type SyncEdit, type SyncPending } from './document-sync';
import { PendingDocument } from './pending-document';
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
    expect(() => rebaseText('abc', 'aXc', 'aYc')).toThrow(EditConflict);
    expect(() => rebaseText('ab', 'aXb', 'aYb')).toThrow(EditConflict);
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
  it('drains coalesced input after delayed acknowledgements before allowing Save', async () => {
    const writes: SyncEdit[] = [], staged: SyncPending[] = [];
    const sync = new DocumentSync({ text: 'a', version: 1, dirty: false }, edit => writes.push(edit), () => {}, () => {}, patch => staged.push(patch));
    sync.edit('ab'); sync.edit('abc'); sync.edit('abcd');
    let saved = false;
    const save = sync.drain().then(() => { saved = true; });
    await Promise.resolve(); expect(saved).toBe(false);
    expect(staged).toEqual([
      { previous: 1, sequence: 2, change: { start: 2, end: 2, text: 'c' } },
      { previous: 2, sequence: 3, change: { start: 3, end: 3, text: 'd' } },
    ]);
    sync.receive({ text: 'ab', version: 2, dirty: true, ack: 1 }, true);
    await Promise.resolve(); expect(saved).toBe(false);
    sync.receive({ text: 'abcd', version: 3, dirty: true, ack: 2 }, true);
    await save; expect(saved).toBe(true);
    expect(writes[1].sequence).toBe(3);
  });
  it('rejects waiting commands after rejection or timeout without losing the local draft', async () => {
    const recovered: string[] = [];
    const sync = new DocumentSync({ text: 'a', version: 1, dirty: false }, () => {}, () => {}, text => recovered.push(text));
    sync.edit('local');
    const rejected = expect(sync.drain()).rejects.toMatchObject({ code: 'SYNC_REJECTED' });
    sync.receive({ text: 'remote', version: 2, dirty: true, rejected: true });
    await rejected;
    expect(recovered).toEqual(['local']);
    sync.edit('tail');
    await expect(sync.drain(1)).rejects.toMatchObject({ code: 'SYNC_TIMEOUT' });
    expect(sync.pending).toBe(true);
  });
  it('keeps composing text immediate, journals its tail, and commits once after a deferred own acknowledgement', async () => {
    const writes: SyncEdit[] = [], drafts: SyncEdit[] = [], patches: SyncPending[] = [], views: string[] = [], recovered: string[] = [];
    const sync = new DocumentSync({ text: 'start', version: 1, dirty: false }, edit => writes.push(edit), state => views.push(state.text), text => recovered.push(text), patch => patches.push(patch), draft => drafts.push(draft));
    sync.edit('start!');
    sync.composition(true);
    sync.edit('start!س'); sync.edit('start!سلام');
    sync.receive({ text: 'start!', version: 2, dirty: true, ack: 1 }, true);
    expect(views).toEqual([]); expect(writes).toHaveLength(1);
    expect(patches).toHaveLength(2); expect(drafts).toEqual([]);
    sync.composition(false);
    await new Promise(resolve => setTimeout(resolve, 1));
    expect(views).toEqual(['start!سلام']);
    expect(writes).toHaveLength(2); expect(writes[1].text).toBe('start!سلام');
    sync.receive({ text: 'start!سلام', version: 3, dirty: true, ack: 2 }, true);
    expect(sync.pending).toBe(false); expect(recovered).toEqual([]);
  });
  it('rebases a host edit arriving during composition without replacing the composing DOM text', async () => {
    const writes: SyncEdit[] = [], drafts: SyncEdit[] = [], patches: SyncPending[] = [], views: string[] = [];
    const sync = new DocumentSync({ text: 'one two', version: 1, dirty: false }, edit => writes.push(edit), state => views.push(state.text), () => {}, patch => patches.push(patch), draft => drafts.push(draft));
    sync.composition(true); sync.edit('one twoس'); sync.edit('one twoسلام');
    sync.receive({ text: 'ONE two', version: 2, dirty: true });
    expect(writes).toEqual([]); expect(views).toEqual([]);
    expect(drafts[0]).toMatchObject({ base: 'one two', text: 'one twoس', sequence: 1 }); expect(patches).toHaveLength(1);
    let saved = false; const drain = sync.drain().then(() => { saved = true; });
    sync.composition(false);
    await new Promise(resolve => setTimeout(resolve, 1));
    expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ base: 'ONE two', text: 'ONE twoسلام' });
    expect(views).toEqual(['ONE twoسلام']); expect(saved).toBe(false);
    sync.receive({ text: 'ONE twoسلام', version: 3, dirty: true, ack: 1 }, true);
    await drain; expect(saved).toBe(true);
  });
  it('recovers overlapping native edits after composition instead of losing the completed IME text', async () => {
    const recovered: string[] = [], views: string[] = [], writes: SyncEdit[] = [];
    const sync = new DocumentSync({ text: 'abc', version: 1, dirty: false }, edit => writes.push(edit), state => views.push(state.text), text => recovered.push(text));
    sync.composition(true); sync.edit('aسلامc'); sync.receive({ text: 'aREMOTEc', version: 2, dirty: true });
    expect(recovered).toEqual([]); expect(views).toEqual([]);
    sync.composition(false);
    await new Promise(resolve => setTimeout(resolve, 1));
    expect(recovered).toEqual(['aسلامc']); expect(views).toEqual(['aREMOTEc']); expect(writes).toEqual([]);
  });
  it('settles waiting Save when composition returns to its original text without any host write', async () => {
    const journal = new PendingDocument(), writes: SyncEdit[] = [];
    const sync = new DocumentSync({ text: 'a', version: 1, dirty: false }, edit => writes.push(edit), () => {}, () => {}, patch => { expect(journal.stage(patch)).toBe(true); }, draft => journal.record(draft));
    sync.composition(true); sync.edit('ab');
    const save = sync.drain();
    sync.edit('a'); sync.composition(false);
    await save;
    expect(sync.pending).toBe(false); expect(journal.pending).toBe(false); expect(writes).toEqual([]);
  });
  it.each([true, false])('commits the final IME value once when compositionend precedes final input: %s', async endBeforeInput => {
    const writes: SyncEdit[] = [];
    const sync = new DocumentSync({ text: 'a', version: 1, dirty: false }, edit => writes.push(edit), () => {}, () => {});
    sync.composition(true); sync.edit('aس');
    if (endBeforeInput) sync.composition(false);
    sync.edit('aسلام');
    if (!endBeforeInput) sync.composition(false);
    expect(writes).toEqual([]);
    await new Promise(resolve => setTimeout(resolve, 1));
    expect(writes).toHaveLength(1); expect(writes[0].text).toBe('aسلام');
  });
});
