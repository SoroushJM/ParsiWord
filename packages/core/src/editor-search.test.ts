import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { findRich, findText, linePosition, searchPattern } from './editor-search';

describe('editor search', () => {
  it('finds literal syntax and mixed Unicode without treating the query as a regex', () => {
    expect(findText('😀 فارسی a+b A+B', 'a+b')).toEqual([{ from: 9, to: 12 }, { from: 13, to: 16 }]);
    expect(findText('a+b A+B', 'a+b', true)).toEqual([{ from: 0, to: 3 }]);
    expect(findText('anything', '')).toEqual([]);
    expect('a.b a.b'.replace(searchPattern('a.b'), () => '$& فارسی')).toBe('$& فارسی $& فارسی');
  });
  it('finds across inline marks while respecting block boundaries and inline atoms', () => {
    const schema = new Schema({ nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'inline*' }, text: { group: 'inline' }, atom: { group: 'inline', inline: true, atom: true } }, marks: { strong: {} } });
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('فارسی ', [schema.mark('strong')]), schema.text('English')]), schema.node('paragraph', null, [schema.text('فارسی'), schema.node('atom'), schema.text('English')])]);
    expect(findRich(doc, 'فارسی English')).toEqual([{ from: 1, to: 14 }]);
    expect(findRich(doc, 'Englishفارسی')).toEqual([]);
  });
  it('clamps Markdown line and column requests to real source positions', () => {
    expect(linePosition('abc\nفارسی\nlast', 2, 3)).toBe(6);
    expect(linePosition('abc\nفارسی\nlast', 50, 100)).toBe(14);
    expect(linePosition('', 1)).toBe(0);
    expect(linePosition('abc', 0, 0)).toBe(0);
  });
});
