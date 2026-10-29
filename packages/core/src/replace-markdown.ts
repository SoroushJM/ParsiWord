import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { parseRichMarkdown } from './rich-editor-markdown';
import type { RichSourceDocument } from './rich-source';
import { canApplyMarkdown } from './document-limits';

/** One source-exact document replacement in the existing ProseMirror history. */
export function replaceMarkdown(editor: Editor, ledger: RichSourceDocument, current: string, next: string, silent = false) {
  if (editor.isDestroyed || !editor.isEditable || !canApplyMarkdown(current, next)) return false;
  const displayed = ledger.snapshot(editor.state.doc).text;
  // Flush a pending source edit without discarding earlier sample history.
  if (displayed !== current && !replaceMarkdown(editor, ledger, displayed, current, true)) return false;
  if (current === next) return true;
  const parsed = parseRichMarkdown(next), doc = editor.schema.nodeFromJSON(parsed.document);
  const tr = closeHistory(editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content))
    .setMeta('richSourceDerived', { text: next, positions: parsed.positions, definitions: parsed.definitions });
  if (silent) {
    tr.setMeta('preventUpdate', true);
    // The length filter deliberately bypasses silent, already-validated
    // source syncs. Install their exact spelling before view decorations read it.
    ledger.prepare(tr, editor.state);
  }
  editor.view.dispatch(tr);
  ledger.commit(editor.state.doc, editor.state);
  editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false));
  return ledger.snapshot(editor.state.doc).text === next;
}
