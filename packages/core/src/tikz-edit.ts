import type { EditorState, Transaction } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { Fragment, Slice } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { isTikzLanguage, tikzSample } from './tikz-language';

/** Insert at a caret, preserving any highlighted source text after the drawing. */
export function insertTikzSample(transaction: Transaction): Transaction {
  const schema = transaction.doc.type.schema, position = transaction.selection.from;
  const content = Fragment.fromArray([
    schema.nodes.codeBlock.create({ language: 'tikz' }, schema.text(tikzSample)),
    schema.nodes.paragraph.create(),
  ]);
  transaction.replaceRange(position, position, new Slice(content, 0, 0));
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(transaction.mapping.map(position, 1)), -1));
  return closeHistory(transaction);
}

/** Replace only the current drawing body; its fence, language and metadata
 * remain owned by the existing lossless code-block source ledger. */
export function replaceTikzSource(state: EditorState, position: number, source: string, expected: string): Transaction | null {
  if (!Number.isInteger(position) || position < 0 || position >= state.doc.content.size) return null;
  const node = state.doc.nodeAt(position);
  if (node?.type.name !== 'codeBlock' || !isTikzLanguage(node.attrs.language) || node.textContent !== expected) return null;
  const value = source.replace(/\r\n?/g, '\n');
  return closeHistory(state.tr.insertText(value, position + 1, position + 1 + node.content.size));
}
