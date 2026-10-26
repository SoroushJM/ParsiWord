import { describe, expect, it } from 'vitest';
import { changedBlock, compareMarkdown } from './markdown-diff';

describe('Markdown comparisons', () => {
  it('keeps identical text and Windows-only EOL differences unmarked', () => {
    const diff = compareMarkdown('# فارسی\r\n\r\nEnglish\r\n', '# فارسی\n\nEnglish\n');
    expect(diff.original.count).toBe(0); expect(diff.modified.count).toBe(0);
  });
  it('separates insertions and deletions with anchors on both sides', () => {
    const diff = compareMarkdown('اول\nحذف\nثابت\n', 'اول\nثابت\nافزوده\n');
    expect([...diff.original.lines.keys()]).toEqual([1]);
    expect([...diff.modified.lines.keys()]).toEqual([2]);
    expect(diff.original.anchors).toHaveLength(2); expect(diff.modified.anchors).toHaveLength(2);
    expect(changedBlock(diff.original, 0, 3)).toBeUndefined();
    expect(changedBlock(diff.original, 4, 7)).toBe('delete');
  });
  it('finds changed Persian words without marking unchanged mixed text', () => {
    const oldLine = 'متن قدیمی با English و نیم‌فاصله 😀';
    const newLine = 'متن جدید با English و نیم‌فاصله 😀';
    const diff = compareMarkdown(oldLine, newLine);
    expect(diff.original.lines.get(0)!.words.map(range => oldLine.slice(range.start, range.end))).toEqual(['قدیمی']);
    expect(diff.modified.lines.get(0)!.words.map(range => newLine.slice(range.start, range.end))).toEqual(['جدید']);
  });
  it('includes whitespace and Markdown syntax changes', () => {
    const diff = compareMarkdown('**متن**\n', '*متن*  \n');
    expect(diff.original.count).toBe(1); expect(diff.modified.count).toBe(1);
    expect(diff.modified.lines.get(0)!.words.length).toBeGreaterThan(0);
  });
  it('handles empty documents, blank lines and final newlines', () => {
    expect(compareMarkdown('', 'افزوده').modified.count).toBe(1);
    expect(compareMarkdown('حذف', '').original.count).toBe(1);
    expect(compareMarkdown('a', 'a\n').modified.count).toBe(1);
    expect(compareMarkdown('a\n\nb', 'a\nb').original.lines.get(1)).toBeDefined();
  });
  it('does not split Unicode code points in changed words', () => {
    const diff = compareMarkdown('😀 old', '🚀 old');
    expect(diff.original.lines.get(0)!.words).toEqual([{ start: 0, end: 2 }]);
    expect(diff.modified.lines.get(0)!.words).toEqual([{ start: 0, end: 2 }]);
  });
  it('falls back to a bounded changed region while retaining common ends', () => {
    const diff = compareMarkdown('same\na\nb\nend', 'same\nx\ny\nend', 0);
    expect(diff.coarse).toBe(true);
    expect([...diff.original.lines.keys()]).toEqual([1, 2]);
    expect(changedBlock(diff.modified, 0, 4)).toBeUndefined();
    expect(changedBlock(diff.modified, 5, 8)).toBe('insert');
  });
});
