import { describe, expect, it } from 'vitest';
import { PendingDocument } from './pending-document';

describe('host pending-tail journal', () => {
  const edit = { id: 1, version: 1, sequence: 1, base: 'a', text: 'ab' };
  it('recovers an unsent tail after disposal without replaying its applied predecessor', () => {
    const journal = new PendingDocument();
    journal.record(edit);
    expect(journal.stage({ previous: 1, sequence: 2, change: { start: 2, end: 2, text: 'c' } })).toBe(true);
    journal.applied(edit);
    expect(journal.against('ab')).toBe('abc');
    expect(journal.against('Xab')).toBe('Xabc');
    journal.clear(); expect(journal.pending).toBe(false);
  });
  it('rejects malformed/out-of-order tails and preserves conflict recovery text', () => {
    const journal = new PendingDocument();
    journal.record(edit); journal.applied(edit);
    expect(journal.stage({ previous: 0, sequence: 2, change: { start: 2, end: 2, text: 'c' } })).toBe(false);
    expect(journal.stage({ previous: 1, sequence: 2, change: { start: 20, end: 20, text: 'c' } })).toBe(false);
    expect(journal.stage({ previous: 1, sequence: 2, change: { start: 1, end: 2, text: 'local' } })).toBe(true);
    expect(() => journal.against('aremote')).toThrowError(expect.objectContaining({ code: 'DOCUMENT_CONFLICT' }));
    expect(journal.draft).toBe('alocal');
  });
});
