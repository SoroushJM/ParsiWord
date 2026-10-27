import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import type { RichSourceDocument } from './rich-source';
import { sourceRanges } from './editor-search';
import type { SourcePosition } from './rich-editor-markdown';
import './linked-selection.css';

// Native textarea offsets use LF; Markdown provenance retains the original EOL.
export function canonicalOffset(text: string, offset: number) {
  if (!text.includes('\r')) return offset;
  let native = 0, at = 0;
  while (at < text.length && native < offset) { at += text[at] === '\r' && text[at + 1] === '\n' ? 2 : 1; native++; }
  return at;
}
export function textareaOffset(text: string, offset: number) {
  return text.includes('\r') ? text.slice(0, offset).replace(/\r\n?/g, '\n').length : offset;
}

/** Paint the peer selection without moving focus, native ranges or history. */
export function useLinkedSelection(
  source: RefObject<HTMLTextAreaElement | null>, rich: Editor | null,
  ledger: RefObject<RichSourceDocument | null>, markdown: string, sourceMarkdown: string, instanceId?: string,
) {
  const [hasSelection, setHasSelection] = useState(false);
  const latest = useRef({ markdown, sourceMarkdown });
  latest.current = { markdown, sourceMarkdown };
  const refresh = useRef<() => void>(() => {});
  useLayoutEffect(() => refresh.current(), [markdown, sourceMarkdown, hasSelection]);
  useEffect(() => {
    const input = source.current;
    if (!input || !rich || !('Highlight' in window) || !CSS.highlights) return;
    const suffix = instanceId ? `-${instanceId}` : '';
    const sourceName = `parsiword-linked-source${suffix}`, previewName = `parsiword-linked-preview${suffix}`;
    let frame = 0, composing = false;
    let owner: 'source' | 'preview' | null = null;
    let selected: SourcePosition | null = null;
    const clear = () => { CSS.highlights.delete(sourceName); CSS.highlights.delete(previewName); };
    const paint = () => {
      frame = 0;
      if (rich.isDestroyed || !ledger.current || composing) { clear(); return; }
      const { markdown, sourceMarkdown } = latest.current;
      const snapshot = ledger.current.snapshot(rich.state.doc);
      if (snapshot.text !== markdown || sourceMarkdown !== markdown) { clear(); return; }
      if (owner === 'source') selected = input.selectionStart === input.selectionEnd ? null : {
        start: canonicalOffset(markdown, input.selectionStart), end: canonicalOffset(markdown, input.selectionEnd),
      };
      else if (owner === 'preview') {
        const native = getSelection();
        if (native?.rangeCount && rich.view.dom.contains(native.anchorNode) && rich.view.dom.contains(native.focusNode)) {
          const range = native.getRangeAt(0);
          selected = native.isCollapsed ? null : ledger.current.sourceRange(rich.state.doc,
            rich.view.posAtDOM(range.startContainer, range.startOffset), rich.view.posAtDOM(range.endContainer, range.endOffset));
        }
      }
      setHasSelection(!!selected);
      clear();
      if (!selected) return;
      if (owner === 'preview') {
        const mirror = input.parentElement?.querySelector('.markdown-source-highlight');
        if (mirror) CSS.highlights.set(sourceName, new Highlight(...sourceRanges(mirror, [{
          from: textareaOffset(markdown, selected.start), to: textareaOffset(markdown, selected.end),
        }])));
      } else {
        const ranges = ledger.current.richRanges(rich.state.doc, selected).flatMap(match => {
          try {
            const from = rich.view.domAtPos(match.from), to = rich.view.domAtPos(match.to), range = document.createRange();
            range.setStart(from.node, from.offset); range.setEnd(to.node, to.offset);
            return [range];
          } catch { return []; }
        });
        CSS.highlights.set(previewName, new Highlight(...ranges));
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    refresh.current = schedule;
    const selectSource = () => { owner = 'source'; schedule(); };
    const selectionChange = () => {
      const native = getSelection();
      if (document.activeElement === input) selectSource();
      else if (native?.anchorNode && rich.view.dom.contains(native.anchorNode)) { owner = 'preview'; schedule(); }
    };
    const compositionStart = () => { composing = true; clear(); };
    const compositionEnd = () => { composing = false; schedule(); };
    input.addEventListener('select', selectSource);
    document.addEventListener('selectionchange', selectionChange);
    const root = input.closest('.live-workspace') ?? input.parentElement!;
    root.addEventListener('compositionstart', compositionStart);
    root.addEventListener('compositionend', compositionEnd);
    // External source replacements and React node views may update without a
    // Tiptap selection event. Repaint only after their DOM has caught up.
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    rich.on('selectionUpdate', schedule);
    rich.on('update', schedule);
    return () => {
      refresh.current = () => {};
      cancelAnimationFrame(frame); clear(); observer.disconnect();
      input.removeEventListener('select', selectSource);
      document.removeEventListener('selectionchange', selectionChange);
      root.removeEventListener('compositionstart', compositionStart);
      root.removeEventListener('compositionend', compositionEnd);
      rich.off('selectionUpdate', schedule); rich.off('update', schedule);
    };
  }, [source, rich, ledger, instanceId]);
  return hasSelection;
}
