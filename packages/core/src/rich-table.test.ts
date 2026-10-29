import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { EditorState, Plugin, TextSelection, type Command } from '@tiptap/pm/state';
import { history, undo, redo } from '@tiptap/pm/history';
import { CellSelection, tableEditing } from '@tiptap/pm/tables';
import { MarkdownTable, addMarkdownRow, deleteMarkdownRow, explicitTableRepair, markdownTableShape, repairMarkdownTable } from './rich-table';
import { parseRichMarkdown, serializeRichBlock } from './rich-editor-markdown';
import { RichSourceDocument } from './rich-source';

const schema = getSchema([StarterKit, TableKit.configure({ table: false }), MarkdownTable]);
const ragged = '| نام | سن |\n| :--- | ---: |\n| علی | ۲۰ | تهران |\n| سارا |\n| رضا | ۴۰ | شیراز | مهندس |';
const prefix = '# قبل\r\n\r\n__قالب__ &amp; محفوظ\r\n\r\n';
const suffix = '\r\n\r\nبعد \\*محفوظ\\*';

function session(source = ragged) {
  const parsed = parseRichMarkdown(source), ledger = new RichSourceDocument();
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(parsed.document), plugins: [history(),
    new Plugin({ filterTransaction(tr, previous) { if (tr.docChanged) ledger.prepare(tr, previous); return true; } }),
    explicitTableRepair(tableEditing()),
  ] });
  ledger.reset(state.doc, source, parsed.positions, parsed.definitions);
  const apply = (tr: typeof state.tr) => { state = state.applyTransaction(tr).state; return ledger.commit(state.doc, state).text; };
  const tables = () => { const result: { node: typeof state.doc; pos: number }[] = []; state.doc.descendants((node, pos) => { if (node.type.name === 'table') { result.push({ node, pos }); return false; } }); return result; };
  const cellPos = (row: number, cell = 0, table = 0) => {
    const target = tables()[table];
    let pos = target.pos + 2;
    for (let index = 0; index < row; index++) pos += target.node.child(index).nodeSize;
    for (let index = 0; index < cell; index++) pos += target.node.child(row).child(index).nodeSize;
    return pos;
  };
  const select = (row: number, cell = 0, table = 0) => apply(state.tr.setSelection(TextSelection.create(state.doc, cellPos(row, cell, table) + 2)));
  const run = (command: Command) => { let text: string | undefined; const success = command(state, tr => { text = apply(tr); }); return { success, text }; };
  const rows = (table = 0) => { const result: string[][] = []; tables()[table].node.forEach(row => { const cells: string[] = []; row.forEach(cell => cells.push(cell.textContent)); result.push(cells); }); return result; };
  return { get state() { return state; }, tables, cellPos, select, apply, run, rows, text: () => ledger.snapshot(state.doc).text };
}

describe('explicit ragged Markdown table repair', () => {
  it('detects unequal widths, while header-only and rectangular tables are regular', () => {
    expect(markdownTableShape(session().tables()[0].node)).toEqual({ headerWidth: 2, width: 4, irregular: true });
    expect(markdownTableShape(session('| A | B |\n| --- | --- |').tables()[0].node).irregular).toBe(false);
    expect(markdownTableShape(session('| A | B |\n| --- | --- |\n| | |').tables()[0].node).irregular).toBe(false);
  });

  it('does not normalize ragged rows on selection or ordinary typing', () => {
    const current = session();
    current.select(2);
    current.apply(current.state.tr.insertText('X'));
    expect(current.rows().map(row => row.length)).toEqual([2, 3, 1, 4]);
    expect(parseRichMarkdown(current.text()).document.content![0].content!.map(row => row.content!.length)).toEqual([2, 3, 1, 4]);
    expect(current.rows()[3]).toEqual(['رضا', '۴۰', 'شیراز', 'مهندس']);
  });

  it('fills only trailing cells to the widest row and preserves content and alignment', () => {
    const current = session(); current.select(2);
    expect(current.run(repairMarkdownTable).success).toBe(true);
    expect(current.rows()).toEqual([
      ['نام', 'سن', '', ''], ['علی', '۲۰', 'تهران', ''], ['سارا', '', '', ''], ['رضا', '۴۰', 'شیراز', 'مهندس'],
    ]);
    const parsed = parseRichMarkdown(current.text()).document.content![0];
    expect(parsed.content!.map(row => row.content!.length)).toEqual([4, 4, 4, 4]);
    expect(parsed.content![0].content!.map(cell => cell.attrs?.align)).toEqual(['left', 'right', null, null]);
    expect(current.run(repairMarkdownTable).success).toBe(false);
  });

  it('keeps exact original source through one Undo and redoes the whole repair', () => {
    const source = prefix + ragged.replace(/\n/g, '\r\n') + suffix;
    const current = session(source); current.select(2);
    current.run(repairMarkdownTable);
    const repaired = current.text();
    expect(repaired.startsWith(prefix)).toBe(true); expect(repaired.endsWith(suffix)).toBe(true);
    expect(repaired.replace(/\r\n/g, '')).not.toContain('\n');
    expect(current.run(undo).text).toBe(source);
    expect(current.rows().map(row => row.length)).toEqual([2, 3, 1, 4]);
    expect(current.run(redo).text).toBe(repaired);
  });

  it('fills short body rows when the header is already the widest row', () => {
    const current = session('| A | B | C |\n| --- | --- | --- |\n| one |\n| two | 2 |');
    current.select(1); current.run(repairMarkdownTable);
    expect(current.rows()).toEqual([['A', 'B', 'C'], ['one', '', ''], ['two', '2', '']]);
    expect(session(current.text()).rows()).toEqual(current.rows());
  });

  it.each(['quote', 'list'])('repairs a nested table without rewriting surrounding %s content', container => {
    const indent = container === 'quote' ? '> ' : '   ';
    const opening = container === 'quote' ? '> before __keep__\r\n>\r\n' : '3. before __keep__\r\n\r\n';
    const closing = container === 'quote' ? '\r\n>\r\n> after &amp;' : '\r\n\r\n   after &amp;';
    const source = opening + ragged.split('\n').map(line => indent + line).join('\r\n') + closing;
    const current = session(source); current.select(2); current.run(repairMarkdownTable);
    expect(current.text().startsWith(opening)).toBe(true); expect(current.text().endsWith(closing)).toBe(true);
    expect(session(current.text()).rows().map(row => row.length)).toEqual([4, 4, 4, 4]);
    expect(current.run(undo).text).toBe(source);
  });

  it('keeps later typing separate from repair history', () => {
    const current = session(); current.select(2);
    current.run(repairMarkdownTable);
    current.apply(current.state.tr.insertText('بعد'));
    current.run(undo);
    expect(current.rows().every(row => row.length === 4)).toBe(true);
    current.run(undo); expect(current.text()).toBe(ragged);
  });

  it('repairs only the selected table, leaving the other source byte-for-byte', () => {
    const source = ragged + '\n\nفاصله __محفوظ__\n\n' + ragged;
    const current = session(source); current.select(2, 0, 1);
    current.run(repairMarkdownTable);
    expect(current.text().startsWith(ragged + '\n\nفاصله __محفوظ__\n\n')).toBe(true);
    expect(current.rows(0).map(row => row.length)).toEqual([2, 3, 1, 4]);
    expect(current.rows(1).map(row => row.length)).toEqual([4, 4, 4, 4]);
  });

  it.each([false, true])('adds a header-width row without repairing other rows (before=%s)', before => {
    const current = session(); current.select(2);
    current.run(addMarkdownRow(before));
    expect(current.rows().map(row => row.length)).toEqual(before ? [2, 3, 2, 1, 4] : [2, 3, 1, 2, 4]);
    const reloaded = session(current.text());
    expect(reloaded.rows()).toEqual(current.rows());
    expect(current.run(undo).text).toBe(ragged);
  });

  it('deletes a row while retaining all other row widths and extra cells', () => {
    const current = session(); current.select(2);
    current.run(deleteMarkdownRow);
    expect(current.rows()).toEqual([['نام', 'سن'], ['علی', '۲۰', 'تهران'], ['رضا', '۴۰', 'شیراز', 'مهندس']]);
    expect(session(current.text()).rows()).toEqual(current.rows());
    expect(current.run(undo).text).toBe(ragged);
  });

  it('keeps one actual header when inserting before the first row', () => {
    const current = session(); current.select(0);
    current.run(addMarkdownRow(true));
    expect(current.rows()).toEqual([['', ''], ['نام', 'سن'], ['علی', '۲۰', 'تهران'], ['سارا'], ['رضا', '۴۰', 'شیراز', 'مهندس']]);
    const table = current.tables()[0].node;
    expect(table.child(0).firstChild!.type.name).toBe('tableHeader');
    expect(table.child(1).firstChild!.type.name).toBe('tableCell');
    expect(session(current.text()).tables()[0].node.toJSON()).toEqual(table.toJSON());
    expect(current.run(undo).text).toBe(ragged);
  });

  it('deletes the selected row range and promotes a surviving first row to header', () => {
    const current = session();
    current.apply(current.state.tr.setSelection(CellSelection.create(current.state.doc, current.cellPos(0), current.cellPos(1, 1))));
    current.run(deleteMarkdownRow);
    expect(current.rows()).toEqual([['سارا'], ['رضا', '۴۰', 'شیراز', 'مهندس']]);
    expect(current.tables()[0].node.firstChild!.firstChild!.type.name).toBe('tableHeader');
    expect(session(current.text()).rows()).toEqual(current.rows());
  });

  it('deletes a sole row/table without losing surrounding content and can undo it', () => {
    const source = prefix + '| H |\r\n| --- |' + suffix, current = session(source);
    current.select(0); current.run(deleteMarkdownRow);
    expect(current.tables()).toHaveLength(0);
    expect(current.text()).toContain('__قالب__ &amp; محفوظ');
    expect(current.run(undo).text).toBe(source);
  });

  it('returns false outside a table and supports dry-run availability without mutation', () => {
    const current = session(prefix + ragged); const original = current.state.doc;
    expect(current.run(repairMarkdownTable).success).toBe(false);
    expect(current.run(addMarkdownRow()).success).toBe(false);
    expect(current.run(deleteMarkdownRow).success).toBe(false);
    current.select(2);
    expect(repairMarkdownTable(current.state)).toBe(true);
    expect(addMarkdownRow()(current.state)).toBe(true);
    expect(deleteMarkdownRow(current.state)).toBe(true);
    expect(current.state.doc).toBe(original);
  });

  it('serializes ragged cells using GFM escaping without inventing columns', () => {
    const source = '| A | B |\n| --- | ---: |\n| **bold** | `a\\|b` | [link](https://example.com) |\n| \\*literal\\* |';
    const parsed = parseRichMarkdown(source).document.content![0];
    expect(parseRichMarkdown(serializeRichBlock(parsed)).document.content![0]).toEqual(parsed);
  });
});
