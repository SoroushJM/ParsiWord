import { Table } from '@tiptap/extension-table';
import { Fragment, type Node, type ResolvedPos } from '@tiptap/pm/model';
import { Plugin, TextSelection, type Command, type EditorState } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { CellSelection, tableEditingKey } from '@tiptap/pm/tables';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    markdownTable: { repairMarkdownTable: () => ReturnType };
  }
}

type Shape = { headerWidth: number; width: number; irregular: boolean };
const shapes = new WeakMap<Node, Shape>();

/** Inspect only the selected immutable table, never parse the whole document. */
export function markdownTableShape(table: Node): Shape {
  const cached = shapes.get(table);
  if (cached) return cached;
  const headerWidth = table.firstChild?.childCount || 0;
  let width = headerWidth, irregular = false;
  table.forEach(row => {
    width = Math.max(width, row.childCount);
    irregular ||= row.childCount !== headerWidth;
  });
  const shape = { headerWidth, width, irregular };
  shapes.set(table, shape);
  return shape;
}

function tableAt($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === 'table') {
      return { table: $pos.node(depth), pos: $pos.before(depth), row: $pos.index(depth) };
    }
  }
  return null;
}

export function selectedMarkdownTable(state: EditorState) {
  const selection = state.selection;
  const from = tableAt(selection instanceof CellSelection ? selection.$anchorCell : selection.$from);
  const to = tableAt(selection instanceof CellSelection ? selection.$headCell : selection.$to);
  return from && to?.pos === from.pos ? { ...from, row: Math.min(from.row, to.row), lastRow: Math.max(from.row, to.row) } : null;
}

function blankCell(table: Node, header: boolean, column: number) {
  const type = table.type.schema.nodes[header ? 'tableHeader' : 'tableCell'];
  return type.createAndFill({ align: table.firstChild?.maybeChild(column)?.attrs.align || null })!;
}

export const repairMarkdownTable: Command = (state, dispatch) => {
  const selected = selectedMarkdownTable(state);
  if (!selected) return false;
  const { table, pos } = selected, shape = markdownTableShape(table);
  if (!shape.irregular) return false;
  if (dispatch) {
    // Insert only missing cells, backwards, so existing content/selection map
    // through the transaction instead of replacing the entire table node.
    const additions: { pos: number; cells: Node[] }[] = [];
    table.forEach((row, offset, index) => {
      const cells = Array.from({ length: shape.width - row.childCount }, (_, extra) => blankCell(table, index === 0, row.childCount + extra));
      if (cells.length) additions.push({ pos: pos + offset + row.nodeSize, cells });
    });
    const tr = closeHistory(state.tr).setMeta('explicitMarkdownTableRepair', true);
    for (const addition of additions.reverse()) tr.insert(addition.pos, Fragment.fromArray(addition.cells));
    dispatch(tr);
  }
  return true;
};

/** Row creation follows the header, independently of any longer body row. */
export function addMarkdownRow(before = false): Command {
  return (state, dispatch) => {
    const selected = selectedMarkdownTable(state);
    if (!selected) return false;
    const { table, pos } = selected;
    const index = before ? selected.row : selected.lastRow + 1;
    if (dispatch) {
      const cells = Array.from({ length: markdownTableShape(table).headerWidth }, (_, column) => blankCell(table, index === 0, column));
      const row = table.type.schema.nodes.tableRow.create(null, cells);
      let offset = pos + 1;
      for (let i = 0; i < index; i++) offset += table.child(i).nodeSize;
      const tr = closeHistory(state.tr.insert(offset, row));
      if (index === 0) {
        // Markdown has exactly one header: the first row. Inserting before it
        // demotes the old header without changing its text or column count.
        table.firstChild!.forEach((cell, cellOffset) => {
          tr.setNodeMarkup(pos + row.nodeSize + 2 + cellOffset, state.schema.nodes.tableCell, cell.attrs);
        });
      }
      dispatch(tr);
    }
    return true;
  };
}

export const deleteMarkdownRow: Command = (state, dispatch) => {
  const selected = selectedMarkdownTable(state);
  if (!selected) return false;
  const { table, pos, row, lastRow } = selected;
  if (dispatch) {
    let from = pos + 1, to: number;
    for (let i = 0; i < row; i++) from += table.child(i).nodeSize;
    to = from;
    for (let i = row; i <= lastRow; i++) to += table.child(i).nodeSize;
    const tr = closeHistory(state.tr);
    if (row === 0 && lastRow === table.childCount - 1) tr.delete(pos, pos + table.nodeSize);
    else {
      tr.delete(from, to);
      if (row === 0) {
        // The first surviving row becomes the Markdown header, with its own
        // width/content. Do not pad or drop any of its cells.
        tr.doc.nodeAt(pos)!.firstChild!.forEach((cell, offset) => {
          tr.setNodeMarkup(pos + 2 + offset, state.schema.nodes.tableHeader, cell.attrs);
        });
      }
    }
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(from, tr.doc.content.size))));
    dispatch(tr);
  }
  return true;
};

/** Keep upstream cell selection/keyboard behavior, without its implicit
 * fixTables pass: ragged Markdown is intentionally editable (ADR 0010). */
export const MarkdownTable = Table.extend({
  addGlobalAttributes() {
    return [...(this.parent?.() || []), {
      types: ['tableCell', 'tableHeader'],
      attributes: { align: {
        default: null,
        parseHTML: element => ['left', 'center', 'right'].includes(element.style.textAlign) ? element.style.textAlign : null,
        renderHTML: attributes => attributes.align ? { style: `text-align: ${attributes.align}` } : {},
      } },
    }];
  },
  addCommands() {
    const parent = this.parent?.();
    const regular = (state: EditorState) => {
      const selected = selectedMarkdownTable(state);
      return !!selected && !markdownTableShape(selected.table).irregular;
    };
    return {
      ...parent,
      repairMarkdownTable: () => ({ state, dispatch }) => repairMarkdownTable(state, dispatch),
      addRowBefore: () => ({ state, dispatch }) => addMarkdownRow(true)(state, dispatch),
      addRowAfter: () => ({ state, dispatch }) => addMarkdownRow()(state, dispatch),
      deleteRow: () => ({ state, dispatch }) => deleteMarkdownRow(state, dispatch),
      addColumnBefore: () => props => regular(props.state) && (parent?.addColumnBefore?.()(props) ?? false),
      addColumnAfter: () => props => regular(props.state) && (parent?.addColumnAfter?.()(props) ?? false),
      deleteColumn: () => props => regular(props.state) && (parent?.deleteColumn?.()(props) ?? false),
    };
  },
  addProseMirrorPlugins() {
    return (this.parent?.() || []).map(plugin => plugin.spec.key !== tableEditingKey ? plugin : explicitTableRepair(plugin));
  },
});

export function explicitTableRepair<T>(plugin: Plugin<T>): Plugin<T> {
  return new Plugin({
    ...plugin.spec,
    appendTransaction(transactions, _oldState, state) {
      // Upstream fixTables skips unchanged documents. Passing the current
      // state as both snapshots retains upstream selection normalization
      // without silently padding any table after typing, row edits or Undo.
      const normalized = plugin.spec.appendTransaction!.call(this, transactions, state, state);
      return transactions.some(tr => tr.getMeta('explicitMarkdownTableRepair')) ? closeHistory(normalized || state.tr) : normalized;
    },
  });
}
