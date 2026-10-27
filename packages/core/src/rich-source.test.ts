import { describe, expect, it, vi } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { patchRichBlock } from './rich-source';
import { RichSourceDocument, replaceRichSourceState } from './rich-source';
import { markdownParser } from './markdown';
import { Schema } from '@tiptap/pm/model';
import { EditorState, Plugin } from '@tiptap/pm/state';
import { history, undo, redo, closeHistory } from '@tiptap/pm/history';
import { parseRichMarkdown } from './rich-editor-markdown';
import { splitListItem } from '@tiptap/pm/schema-list';
import { TextSelection } from '@tiptap/pm/state';

function edit(source: string, mutate: (block: JSONContent) => void) {
  const parsed = parseRichMarkdown(source), previous = parsed.document.content![0];
  const next = structuredClone(previous); mutate(next);
  return patchRichBlock(previous, next, source, parsed.definitions);
}
describe('precise rich source patches', () => {
  it('changes one character without normalizing entities, escapes, soft CRLF or mark spelling', () => {
    const source = String.raw`A &amp; \*literal\* __bold__` + '\r\nnext   end';
    expect(edit(source, block => { block.content![0].text = block.content![0].text!.replace('A', 'B'); })).toBe(source.replace('A', 'B'));
  });
  it('keeps trailing spaces when typing and escapes newly typed syntax only', () => {
    expect(edit('hello', block => { block.content![0].text += ' $ '; })).toBe('hello \\$ ');
  });
  it('retains soft EOLs and unrelated entities while adding a partial mark', () => {
    const source = 'one &amp; two\r\nthree';
    expect(edit(source, block => { block.content = [{ type: 'text', text: 'one & ' }, { type: 'text', text: 'two', marks: [{ type: 'bold' }] }, { type: 'text', text: ' three' }]; })).toBe('one &amp; **two**\r\nthree');
  });
  it('preserves unrelated underscore mark syntax when formatting another word', () => {
    expect(edit('__old__ and new', block => { block.content!.pop(); block.content!.push({ type: 'text', text: ' and ' }, { type: 'text', text: 'new', marks: [{ type: 'italic' }] }); })).toBe('__old__ and *new*');
  });
  it('removes part of a mark without changing unrelated encoded text', () => {
    expect(edit('__one &amp; two__', block => { block.content = [{ type: 'text', text: 'one ' }, { type: 'text', text: '& two', marks: [{ type: 'bold' }] }]; })).toBe('one **&amp; two**');
  });
  it('retains a reference suffix when formatting its label', () => {
    const source = '[one two][ref]';
    const parsed = parseRichMarkdown(source, new Map([['ref', { url: 'https://example.com', title: null }]]));
    const previous = parsed.document.content![0], next = structuredClone(previous);
    next.content = [{ type: 'text', text: 'one ', marks: previous.content![0].marks }, { type: 'text', text: 'two', marks: [...previous.content![0].marks!, { type: 'bold' }] }];
    expect(patchRichBlock(previous, next, source, parsed.definitions)).toBe('[one **two**][ref]');
  });
  it('patches nested list text without changing list numbering, indentation or gaps', () => {
    const source = '3.  one &amp; two\r\n    next\r\n\r\n4.  other';
    expect(edit(source, block => { block.content![0].content![0].content![0].text = 'One & two next'; })).toBe(source.replace('one', 'One'));
  });
  it('preserves fenced-code metadata and line endings while changing code', () => {
    const source = '~~~ts title="x"\r\na\r\nb\r\n~~~';
    expect(edit(source, block => { block.content![0].text = 'a\nB'; })).toBe(source.replace('\r\nb\r\n', '\r\nB\r\n'));
  });
  it.each(['    aa\n\taa', '> ```ts\r\n> aa\r\n> bb\r\n> ```', '- ```ts\n  aa\n  bb\n  ```'])('keeps original code indentation/container spelling: %s', source => {
    const result = edit(source, block => { let code = block; while (code.type !== 'codeBlock') code = code.content![0]; code.content![0].text = code.content![0].text!.replace('aa', 'aA'); });
    expect(result).toBe(source.replace('aa', 'aA'));
  });
  it.each(['```\n```', '```\r\n\r\n```', '> ```\r\n> ```', '- ```\n  ```', '```'])('inserts into an empty fenced code block without consuming the closing fence: %s', source => {
    const result = edit(source, block => { let code = block; while (code.type !== 'codeBlock') code = code.content![0]; code.content = [{ type: 'text', text: 'x\ny' }]; });
    let code = parseRichMarkdown(result).document.content![0]; while (code.type !== 'codeBlock') code = code.content![0];
    expect(code.content).toEqual([{ type: 'text', text: 'x\ny' }]);
  });
  it('rewrites only the structurally affected list item', () => {
    const source = '3.  first\r\n\r\n9.   second \\* &amp;';
    const result = edit(source, list => { list.content![0].content = [{ type: 'paragraph', content: [{ type: 'text', text: 'fi' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'rst' }] }]; });
    expect(result).toContain('\r\n\r\n9.   second \\* &amp;');
    expect(parseRichMarkdown(result).document.content![0].content![0].content).toHaveLength(2);
  });
  it('inserts a hard break in one table cell while preserving unrelated padding', () => {
    const source = '| first   |   second &amp;  |\r\n| :--- | ---: |\r\n| third  | fourth |';
    const result = edit(source, table => { table.content![0].content![0].content![0].content = [{ type: 'text', text: 'fi' }, { type: 'hardBreak' }, { type: 'text', text: 'rst' }]; });
    expect(result).toBe(source.replace('first', 'fi<br>rst'));
    expect(parseRichMarkdown(result).document.content![0].content![0].content![0].content![0].content).toEqual([{ type: 'text', text: 'fi' }, { type: 'hardBreak' }, { type: 'text', text: 'rst' }]);
  });
  it('patches astral characters and whole escaped/entity source spans', () => {
    expect(edit('a &#x1F642; b', block => { block.content![0].text = 'a 🙂 B'; })).toBe('a &#x1F642; B');
    expect(edit('a &#x1F642; b', block => { block.content![0].text = 'a 🙃 b'; })).toBe('a 🙃 b');
  });
  it('repairs literal delimiter/entity boundaries without activating new Markdown', () => {
    expect(edit('a * b*', block => { block.content![0].text = 'a *b*'; })).toBe('a \\*b*');
    expect(edit('a & amp; b', block => { block.content![0].text = 'a &amp; b'; })).toBe('a \\&amp; b');
    const source = '[x] (https://example.com)';
    const result = edit(source, block => { block.content![0].text = '[x]('; });
    expect(parseRichMarkdown(result).document).toEqual(parseRichMarkdown(source).document && { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '[x](' }, { type: 'text', text: 'https://example.com', marks: [{ type: 'link', attrs: { href: 'https://example.com', title: null } }] }, { type: 'text', text: ')' }] }] });
    const plain = edit(source, block => { block.content = [{ type: 'text', text: '[x](https://example.com)' }]; });
    expect(parseRichMarkdown(plain).document.content![0].content).toEqual([{ type: 'text', text: '[x](https://example.com)' }]);
  });
});

const schema = new Schema({ nodes: {
  doc: { content: 'block+' }, paragraph: { group: 'block', content: 'inline*' }, text: { group: 'inline' },
  heading: { group: 'block', content: 'inline*', attrs: { level: { default: 1 } } },
  table: { group: 'block', content: 'tableRow+' }, tableRow: { content: '(tableCell | tableHeader)+' },
  tableCell: { content: 'paragraph+', attrs: { align: { default: null } } }, tableHeader: { content: 'paragraph+', attrs: { align: { default: null } } },
  hardBreak: { group: 'inline', inline: true },
  codeBlock: { group: 'block', content: 'text*', code: true, attrs: { language: { default: null }, meta: { default: null } } },
  rawBlock: { group: 'block', atom: true, attrs: { source: { default: '' } } },
  rawInline: { group: 'inline', inline: true, atom: true, attrs: { source: { default: '' }, label: { default: '' } } },
  mathInline: { group: 'inline', inline: true, atom: true, attrs: { source: { default: '' } } },
  blockquote: { group: 'block', content: 'block+' },
  orderedList: { group: 'block', content: 'listItem+', attrs: { start: { default: 1 } } },
  bulletList: { group: 'block', content: 'listItem+' },
  listItem: { content: 'paragraph block*', attrs: { checked: { default: null } } },
}, marks: { bold: {}, italic: {}, link: { attrs: { href: {}, title: { default: null }, reference: { default: null } } } } });
function session(source: string, depth = 100) {
  const parsed = parseRichMarkdown(source);
  const ledger = new RichSourceDocument();
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(parsed.document), plugins: [history({ depth }),
    new Plugin({ filterTransaction: (transaction, previous) => { if (transaction.docChanged) ledger.prepare(transaction, previous); return true; } }),
    new Plugin({ appendTransaction: (transactions, _old, current) => transactions.some(transaction => transaction.docChanged) && !transactions.some(transaction => transaction.getMeta('richSourceDerived')) ? ledger.refreshReferences(current) : null }),
  ] });
  ledger.reset(state.doc, source, parsed.positions, parsed.definitions);
  const apply = (transaction: typeof state.tr) => { state = state.applyTransaction(transaction).state; return ledger.commit(state.doc, state).text; };
  const replace = (source: string) => { const parsed = parseRichMarkdown(source); state = replaceRichSourceState(state, parsed.document); ledger.reset(state.doc, source, parsed.positions, parsed.definitions); };
  return { ledger, get state() { return state; }, apply, replace };
}
describe('linked source and preview selection provenance', () => {
  function selected(source: string, start: number, end: number) {
    const current = session(source), doc = current.state.doc;
    const ranges = current.ledger.richRanges(doc, { start, end });
    return { current, ranges, text: ranges.map(range => doc.textBetween(range.from, range.to, '\n')).join('|') };
  }
  it.each([
    ['# عنوان فارسی English', 'فارسی', 'فارسی'],
    ['A &amp; \\*literal\\* **bold** 😀', '&amp;', '&'],
    ['A &amp; \\*literal\\* **bold** 😀', '\\*literal\\*', '*literal*'],
    ['A &amp; \\*literal\\* **bold** 😀', '😀', '😀'],
    ['- first\r\n- **دوم** English', 'دوم', 'دوم'],
    ['> first\r\n> second', 'second', 'second'],
    ['~~~ts\r\na\r\nb\r\n~~~', 'a\r\nb', 'a\nb'],
    ['| نام | مقدار |\n| --- | --- |\n| فارسی | 12 |', 'فارسی', 'فارسی'],
  ])('maps encoded and nested text in both directions: %s', (source, needle, rendered) => {
    const start = source.indexOf(needle), end = start + needle.length;
    const { current, ranges, text } = selected(source, start, end);
    expect(text).toBe(rendered);
    expect(current.ledger.sourceRange(current.state.doc, ranges[0].from, ranges[ranges.length - 1].to)).toEqual({ start, end });
    expect(current.ledger.snapshot(current.state.doc).text).toBe(source);
  });
  it('anchors the second identical label and block instead of searching visible text', () => {
    const source = '**same** [same](https://example.com)\n\n**same** [same](https://example.com)';
    const start = source.lastIndexOf('[same]') + 1;
    const { current, ranges, text } = selected(source, start, start + 4);
    expect(text).toBe('same');
    expect(ranges).toHaveLength(1);
    expect(ranges[0].from).toBeGreaterThan(current.state.doc.child(0).nodeSize);
    expect(current.ledger.sourceRange(current.state.doc, ranges[0].from, ranges[0].to)).toEqual({ start, end: start + 4 });
  });
  it('identifies rendered owners of source-only URL and formatting syntax', () => {
    const source = '**bold** [label](https://example.com)';
    expect(selected(source, 0, 2).text).toBe('bold');
    const start = source.indexOf('https:');
    expect(selected(source, start, start + 'https://example.com'.length).text).toBe('label');
  });
  it('maps a selection across blocks and clears collapsed ranges', () => {
    const source = '**first**\n\nsecond', current = session(source), doc = current.state.doc;
    const ranges = current.ledger.richRanges(doc, { start: 2, end: source.length });
    expect(ranges.map(range => doc.textBetween(range.from, range.to))).toEqual(['first', 'second']);
    expect(current.ledger.sourceRange(doc, ranges[0].from, ranges[1].to)).toEqual({ start: 2, end: source.length });
    expect(current.ledger.richRanges(doc, { start: 3, end: 3 })).toEqual([]);
    expect(current.ledger.sourceRange(doc, 2, 2)).toBeNull();
  });
  it('retains provenance through rich edits, undo and an external replacement', () => {
    const current = session('**same**\n\n&#97;a');
    current.apply(closeHistory(current.state.tr.insertText('!', 3)));
    let doc = current.state.doc, range = current.ledger.richRanges(doc, { start: 3, end: 4 })[0];
    expect(doc.textBetween(range.from, range.to)).toBe('a');
    const encoded = current.ledger.snapshot(doc).text.indexOf('&#97;');
    range = current.ledger.richRanges(doc, { start: encoded, end: encoded + 5 })[0];
    expect(current.ledger.sourceRange(doc, range.from, range.to)).toEqual({ start: encoded, end: encoded + 5 });
    undo(current.state, transaction => current.apply(transaction));
    doc = current.state.doc;
    expect(current.ledger.sourceRange(doc, doc.child(0).nodeSize + 1, doc.child(0).nodeSize + 2)).toEqual({ start: 10, end: 15 });
    current.replace('new **متن**'); doc = current.state.doc;
    range = current.ledger.richRanges(doc, { start: 6, end: 9 })[0];
    expect(doc.textBetween(range.from, range.to)).toBe('متن');
  });
  it('reuses a touched block map for repeated selections without parsing other blocks', () => {
    const source = Array.from({ length: 80 }, (_, index) => `**block ${index}**`).join('\n\n'), current = session(source);
    const parse = vi.spyOn(markdownParser, 'parse'), start = source.lastIndexOf('block');
    for (let index = 0; index < 5; index++) current.ledger.richRanges(current.state.doc, { start, end: start + 5 });
    expect(parse).toHaveBeenCalledTimes(1); parse.mockRestore();
  });
});
describe('transaction source provenance', () => {
  it.each([{ from: 1, to: 2, output: 'a' }, { from: 2, to: 3, output: '&#97;' }])('deletes the selected repeated decoded character ($from)', ({ from, to, output }) => {
    const current = session('&#97;a'); expect(current.apply(current.state.tr.delete(from, to))).toBe(output);
  });
  it('anchors insertions before or after an encoded duplicate', () => {
    const first = session('&#97;a'); expect(first.apply(first.state.tr.insertText('a', 1))).toBe('a&#97;a');
    const last = session('&#97;a'); expect(last.apply(last.state.tr.insertText('a', 3))).toBe('&#97;aa');
  });
  it('keeps the selected source block when identical visible blocks repeat', () => {
    const current = session('&#97;a\r\n\r\naa\n\n&#97;a');
    expect(current.apply(current.state.tr.delete(5, 6))).toBe('&#97;a\r\n\r\na\n\n&#97;a');
  });
  it('restores exact encoded source on undo and redo', () => {
    const current = session('&#97;a'); current.apply(closeHistory(current.state.tr.delete(1, 2)));
    undo(current.state, transaction => { expect(current.apply(transaction)).toBe('&#97;a'); });
    redo(current.state, transaction => { expect(current.apply(transaction)).toBe('a'); });
  });
  it('anchors repeated code newline deletion to its actual EOL occurrence', () => {
    const first = session('```\naa\r\n\naa\n```');
    expect(first.apply(first.state.tr.delete(3, 4))).toBe('```\naa\naa\n```');
    const second = session('```\naa\r\n\naa\n```');
    expect(second.apply(second.state.tr.delete(4, 5))).toBe('```\naa\r\naa\n```');
  });
  it.each(['```\na\n```', '> ```\n> a\n> ```'])('updates the cached code value between ordinary sequential PM edits: %s', source => {
    const current = session(source); let position = 0;
    current.state.doc.descendants((node, at) => { if (node.type.name === 'codeBlock') position = at + 2; });
    expect(current.apply(current.state.tr.insertText('b', position))).toBe(source.replace('a', 'ab'));
    expect(current.apply(current.state.tr.insertText('c', position + 1))).toBe(source.replace('a', 'abc'));
  });
  it('refreshes derived hrefs when a nested definition changes, disappears and returns', () => {
    const source = '> [ref]: https://first.example\n\n[x][ref]';
    const current = session(source);
    const update = (value: string) => current.apply(closeHistory(current.state.tr.setNodeAttribute(1, 'source', value)));
    expect(update('[ref]: https://second.example')).toBe(source.replace('first', 'second'));
    expect(current.state.doc.lastChild?.firstChild?.marks[0].attrs.href).toBe('https://second.example');
    expect(update('definition removed')).toContain('[x][ref]');
    expect(current.state.doc.lastChild?.textContent).toBe('[x][ref]');
    update('[ref]: https://third.example');
    expect(current.state.doc.lastChild?.textContent).toBe('x');
    expect(current.state.doc.lastChild?.firstChild?.marks[0].attrs.href).toBe('https://third.example');
    undo(current.state, transaction => { expect(current.apply(transaction)).toBe('> definition removed\n\n[x][ref]'); });
    undo(current.state, transaction => { expect(current.apply(transaction)).toBe(source.replace('first', 'second')); });
    undo(current.state, transaction => { expect(current.apply(transaction)).toBe(source); });
  });
  it('maps a sustained typing run incrementally instead of reparsing each key', () => {
    const current = session('&#97;a'), parse = vi.spyOn(markdownParser, 'parse');
    try {
      current.apply(current.state.tr.insertText('bbb', current.state.doc.content.size - 1)); parse.mockClear();
      for (let index = 0; index < 600; index++) current.apply(current.state.tr.insertText('b', current.state.doc.content.size - 1));
      expect(current.ledger.snapshot(current.state.doc).text).toBe('&#97;a' + 'b'.repeat(603));
      expect(parse).not.toHaveBeenCalled();
      undo(current.state, transaction => { expect(current.apply(transaction)).toBe('&#97;a'); });
    } finally { parse.mockRestore(); }
  });
  it.each([200_000, 499_998])('accepts the first mapped PM edit in a %i-character paragraph without an argument-stack overflow', size => {
    const current = session('a'.repeat(size));
    expect(current.apply(current.state.tr.insertText('b', size))).toBe('a'.repeat(size - 1) + 'ba');
  });
  it.each([
    { source: 'a * b*', edit: (state: EditorState) => state.tr.insertText('X', 4), text: 'a *X b*' },
    { source: 'before __bold__ after', edit: (state: EditorState) => state.tr.delete(7, 8), text: 'beforebold after' },
    { source: 'before __bold__ after', edit: (state: EditorState) => state.tr.insertText('X', 8), text: 'before Xbold after' },
  ])('retains PM marks when changed neighbours alter delimiter flanking: $source', ({ source, edit, text }) => {
    const current = session(source), result = current.apply(edit(current.state));
    expect(current.state.doc.textContent).toBe(text);
    const reparsed = schema.nodeFromJSON(parseRichMarkdown(result).document);
    expect(reparsed.eq(current.state.doc)).toBe(true);
  });
  it('does not expose a new list marker when removing the first character', () => {
    const current = session('a * b*'), result = current.apply(current.state.tr.delete(1, 2));
    expect(parseRichMarkdown(result).document.content![0].type).toBe('paragraph');
    expect(schema.nodeFromJSON(parseRichMarkdown(result).document).eq(current.state.doc)).toBe(true);
  });
  it.each([{ from: 1, to: 2 }, { from: 3, to: 4 }])('keeps an explicit break exposed at a paragraph edge ($from)', ({ from, to }) => {
    const current = session('a  \r\nb'), result = current.apply(current.state.tr.delete(from, to));
    expect(schema.nodeFromJSON(parseRichMarkdown(result).document).eq(current.state.doc)).toBe(true);
    expect(result).toContain('<br>');
  });
  it.each(['https://example.com', 'www.example.com', 'person@example.com'])('makes an edited implicit autolink label explicit while retaining its destination: %s', source => {
    const current = session(source), href = current.state.doc.firstChild!.firstChild!.marks[0].attrs.href;
    const result = current.apply(current.state.tr.insertText('X', 3));
    const parsed = parseRichMarkdown(result).document.content![0].content![0];
    expect(parsed.text).toBe(current.state.doc.textContent); expect(parsed.marks![0].attrs!.href).toBe(href);
  });
  it('retains a multi-codepoint entity once when its source is unrelated to the edit', () => {
    const first = session('a &NotEqualTilde; b'); expect(first.apply(first.state.tr.delete(1, 2))).toContain('&NotEqualTilde;');
    const last = session('a &NotEqualTilde; b'); expect(last.apply(last.state.tr.delete(6, 7))).toContain('&NotEqualTilde;');
  });
  it('ties retained provenance to actual bounded PM history events and clears redo on a new edit', () => {
    const current = session('&#97;a', 3);
    for (let index = 0; index < 100; index++) current.apply(closeHistory(current.state.tr.insertText('b', current.state.doc.content.size - 1)));
    expect((current.ledger as unknown as { historySources: unknown }).historySources).toBeInstanceOf(WeakMap);
    expect(Object.prototype.hasOwnProperty.call(current.ledger.snapshot(current.state.doc), 'parent')).toBe(false);
    let count = 0;
    while (undo(current.state, transaction => { expect(current.apply(transaction)).toMatch(/^&#97;a/); })) count++;
    expect(count).toBeGreaterThanOrEqual(3); expect(count).toBeLessThanOrEqual(23);
    current.apply(current.state.tr.insertText('new', 1));
    expect(redo(current.state)).toBe(false);
  });
  it('aligns an external source replacement with fresh rich history, then preserves new undo provenance', () => {
    const current = session('old'); current.apply(current.state.tr.insertText('!', 4));
    current.replace('&#97;a'); expect(undo(current.state)).toBe(false);
    current.apply(current.state.tr.delete(1, 2));
    undo(current.state, transaction => { expect(current.apply(transaction)).toBe('&#97;a'); });
    redo(current.state, transaction => { expect(current.apply(transaction)).toBe('a'); });
  });
  it('keeps a raw widget editable through incomplete source without losing surrounding source', () => {
    const current = session('before ![old](url) &amp; after');
    expect(current.apply(current.state.tr.setNodeAttribute(8, 'source', '![new](url'))).toBe('before ![new](url &amp; after');
    expect(current.state.doc.firstChild!.child(1).type.name).toBe('rawInline');
    expect(current.apply(current.state.tr.setNodeAttribute(8, 'source', 'temporary'))).toBe('before temporary &amp; after');
    expect(current.apply(current.state.tr.insertText('B', 1))).toBe('Bbefore temporary &amp; after');
  });
  it.each(['[ref]: https://first.example\n\n[x][ref]', '> [ref]: https://first.example\n\n[x][ref]'])('retains a count-changing raw definition widget and refreshes its dependent sibling: %s', source => {
    const current = session(source), at = source.startsWith('>') ? 1 : 0;
    current.apply(current.state.tr.setNodeAttribute(at, 'source', 'temporary\n\nextra'));
    const widget = source.startsWith('>') ? current.state.doc.firstChild!.firstChild! : current.state.doc.firstChild!;
    expect(widget.type.name).toBe('rawBlock'); expect(widget.attrs.source).toBe('temporary\n\nextra');
    expect(current.state.doc.lastChild!.textContent).toBe('[x][ref]');
    current.apply(current.state.tr.setNodeAttribute(at, 'source', '[ref]: https://third.example'));
    expect(current.state.doc.lastChild!.firstChild!.marks[0].attrs.href).toBe('https://third.example');
  });
  it('retains a partial raw-inline widget and incremental typing inside a list item', () => {
    const current = session('3. before ![old](url) &amp; after\n9. second'); let at = 0;
    current.state.doc.descendants((node, position) => { if (node.type.name === 'rawInline') at = position; });
    current.apply(current.state.tr.setNodeAttribute(at, 'source', '![new](url'));
    expect(current.apply(current.state.tr.setNodeAttribute(at, 'source', 'temporary'))).toContain('before temporary &amp; after');
    const parse = vi.spyOn(markdownParser, 'parse');
    try { current.apply(current.state.tr.insertText('B', 3)); expect(parse).not.toHaveBeenCalled(); } finally { parse.mockRestore(); }
    expect(current.state.doc.firstChild!.firstChild!.firstChild!.child(1).type.name).toBe('rawInline');
  });
  it('retains a raw definition when its temporary source expands the same blockquote children', () => {
    const current = session('> [ref]: https://first.example\n>\n> [x][ref]');
    current.apply(current.state.tr.setNodeAttribute(1, 'source', 'temporary\n\nextra'));
    expect(current.state.doc.firstChild!.childCount).toBe(2);
    expect(current.state.doc.firstChild!.firstChild!.type.name).toBe('rawBlock');
    expect(current.state.doc.firstChild!.lastChild!.textContent).toBe('[x][ref]');
    const result = current.apply(current.state.tr.setNodeAttribute(1, 'source', '[ref]: https://last.example'));
    expect(current.state.doc.firstChild!.lastChild!.firstChild!.marks[0]?.attrs.href, result).toBe('https://last.example');
  });
  it('splits an actual PM list item while preserving the untouched sibling marker and spelling', () => {
    const source = '3.  first\r\n\r\n9.   second \\* &amp;', current = session(source);
    current.apply(current.state.tr.setSelection(TextSelection.create(current.state.doc, 5)));
    expect(splitListItem(schema.nodes.listItem)(current.state, transaction => current.apply(transaction))).toBe(true);
    const result = current.ledger.snapshot(current.state.doc).text;
    expect(result).toContain('\r\n\r\n9.   second \\* &amp;');
    expect(schema.nodeFromJSON(parseRichMarkdown(result).document).eq(current.state.doc)).toBe(true);
    undo(current.state, transaction => expect(current.apply(transaction)).toBe(source));
  });
});
