import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import { ArrowDown, ArrowUp, CaseSensitive, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Toggle } from '@/components/ui/toggle';
import { findRich, findText, linePosition, searchPattern, sourceRanges, type SearchMatch } from './editor-search';
import type { EditorAction } from './host';
import { useLocale } from './locale';
import './editor-search.css';

export type SearchRequest = { action: EditorAction; sequence: number; rich: boolean };
export function EditorSearch({ request, markdown, source, rich, readOnly, onChange, onClose }: {
  request: SearchRequest; markdown: string; source: RefObject<HTMLTextAreaElement | null>; rich: Editor | null;
  readOnly: boolean; onChange: (text: string) => boolean; onClose: () => void;
}) {
  const { locale, number } = useLocale();
  const fa = locale === 'fa', isRich = request.rich && !!rich;
  const input = useRef<HTMLInputElement>(null);
  const anchor = useRef(isRich ? rich!.state.selection.from : source.current?.selectionStart ?? 0);
  const [query, setQuery] = useState(() => isRich ? rich!.state.doc.textBetween(rich!.state.selection.from, rich!.state.selection.to, ' ') : source.current?.value.slice(source.current.selectionStart, source.current.selectionEnd) ?? '');
  const [replacement, setReplacement] = useState('');
  const [mode, setMode] = useState(request.action);
  const [matchCase, setMatchCase] = useState(false);
  const [index, setIndex] = useState(0);
  const [revision, setRevision] = useState(0);
  const goTo = mode === 'goToLine';
  const matches = useMemo(() => goTo ? [] : isRich ? findRich(rich!.state.doc, query, matchCase) : findText(markdown, query, matchCase), [goTo, isRich, rich, query, matchCase, markdown, revision]);
  const activeIndex = Math.min(index, Math.max(0, matches.length - 1));
  const current = matches[activeIndex];
  useEffect(() => {
    if (!rich) return;
    const update = ({ transaction }: { transaction: { docChanged: boolean } }) => { if (transaction.docChanged) setRevision(value => value + 1); };
    rich.on('transaction', update);
    return () => { rich.off('transaction', update); };
  }, [rich]);
  const select = (match: SearchMatch | undefined, focus = false) => {
    if (!match) return;
    if (isRich) {
      rich!.commands.setTextSelection({ from: match.from, to: match.to });
      rich!.commands.scrollIntoView();
      if (focus) rich!.commands.focus();
    } else if (source.current) {
      source.current.setSelectionRange(match.from, match.to);
      const line = source.current.value.slice(0, match.from).split('\n').length - 1;
      document.querySelector(`[data-source-line="${line}"]`)?.scrollIntoView({ block: 'center' });
      if (focus) source.current.focus();
    }
  };
  const navigate = (step: number) => { if (matches.length) setIndex(value => (Math.min(value, matches.length - 1) + step + matches.length) % matches.length); };
  useEffect(() => { const first = matches.findIndex(match => match.from >= anchor.current); setIndex(first < 0 ? 0 : first); }, [query, matchCase, isRich]);
  useEffect(() => {
    if (request.action === 'findNext') navigate(1);
    else if (request.action === 'findPrevious') navigate(-1);
    else { setMode(request.action); input.current?.focus(); input.current?.select(); }
  }, [request.sequence]);
  useEffect(() => {
    select(current);
    if (!('Highlight' in window) || !CSS.highlights) return;
    const visibleMatches = matches.slice(0, 2000);
    if (current && activeIndex >= 2000) visibleMatches.push(current);
    const root = document.querySelector('.markdown-source-highlight');
    const ranges = isRich ? visibleMatches.flatMap(match => {
      try {
        const from = rich!.view.domAtPos(match.from), to = rich!.view.domAtPos(match.to), range = document.createRange(); range.setStart(from.node, from.offset); range.setEnd(to.node, to.offset); return [range];
      } catch { return []; }
    }) : root ? sourceRanges(root, visibleMatches) : [];
    CSS.highlights.set('parsiword-find', new Highlight(...ranges));
    const active = ranges[Math.min(activeIndex, 2000)];
    CSS.highlights.set('parsiword-find-current', new Highlight(...(active ? [active] : [])));
    return () => { CSS.highlights.delete('parsiword-find'); CSS.highlights.delete('parsiword-find-current'); };
  }, [matches, index, isRich, rich]);
  const close = () => { if (current) select(current, true); else if (isRich) rich!.commands.focus(); else source.current?.focus(); onClose(); };
  const replace = (all: boolean) => {
    if (readOnly || !current) return;
    if (isRich) {
      let tr = rich!.state.tr;
      for (const match of (all ? matches : [current]).slice().reverse()) tr = tr.insertText(replacement, match.from, match.to);
      rich!.view.dispatch(tr.scrollIntoView());
    } else {
      const next = all ? markdown.replace(searchPattern(query, matchCase), () => replacement) : markdown.slice(0, current.from) + replacement + markdown.slice(current.to);
      onChange(next);
    }
    input.current?.focus();
  };
  const jump = () => {
    const parsed = /^(\d+)(?::(\d+))?$/.exec(query.trim());
    if (!parsed) return;
    const offset = linePosition(markdown, Number(parsed[1]), Number(parsed[2] ?? 1));
    if (isRich) {
      const blocks = [...rich!.view.dom.querySelectorAll<HTMLElement>('[data-source-start]')];
      const block = blocks.find(element => Number(element.dataset.sourceEnd) > offset) ?? blocks[blocks.length - 1];
      if (block) { const pos = rich!.view.posAtDOM(block, 0); rich!.commands.setTextSelection(Math.min(pos, rich!.state.doc.content.size)); rich!.commands.focus(); block.scrollIntoView({ block: 'center' }); }
    } else { source.current?.focus(); source.current?.setSelectionRange(offset, offset); document.querySelector(`[data-source-line="${markdown.slice(0, offset).split('\n').length - 1}"]`)?.scrollIntoView({ block: 'center' }); }
    onClose();
  };
  return <section className="editor-search" role="search" aria-label={fa ? 'جست‌وجوی سند' : 'Document search'} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Enter') { event.preventDefault(); if (goTo) jump(); else navigate(event.shiftKey ? -1 : 1); }
  }}>
    <FieldGroup className="editor-search-fields">
      <Field orientation="horizontal"><FieldLabel className="sr-only" htmlFor="editor-find-query">{goTo ? fa ? 'خط:ستون' : 'Line:column' : fa ? 'جست‌وجو' : 'Find'}</FieldLabel><Input ref={input} id="editor-find-query" value={query} onChange={event => setQuery(event.target.value)} placeholder={goTo ? fa ? 'خط:ستون Markdown' : 'Markdown line:column' : fa ? 'جست‌وجو در سند' : 'Find in document'} /></Field>
      {mode === 'replace' && <Field orientation="horizontal"><FieldLabel className="sr-only" htmlFor="editor-replace-text">{fa ? 'جایگزین' : 'Replace'}</FieldLabel><Input id="editor-replace-text" value={replacement} onChange={event => setReplacement(event.target.value)} disabled={readOnly} placeholder={fa ? 'جایگزین با' : 'Replace with'} /></Field>}
    </FieldGroup>
    {goTo ? <Button variant="outline" onClick={jump}>{fa ? 'رفتن' : 'Go'}</Button> : <>
      <Toggle size="sm" pressed={matchCase} onPressedChange={setMatchCase} aria-label={fa ? 'تطبیق بزرگی حروف' : 'Match case'}><CaseSensitive data-icon="inline-start" /></Toggle>
      <span className="search-count" aria-live="polite">{matches.length ? `${number(Math.min(index, matches.length - 1) + 1)} / ${number(matches.length)}` : fa ? 'نتیجه‌ای نیست' : 'No results'}</span>
      <Button variant="outline" size="icon-sm" disabled={!matches.length} aria-label={fa ? 'نتیجهٔ قبلی' : 'Previous match'} onClick={() => navigate(-1)}><ArrowUp data-icon="inline-start" /></Button>
      <Button variant="outline" size="icon-sm" disabled={!matches.length} aria-label={fa ? 'نتیجهٔ بعدی' : 'Next match'} onClick={() => navigate(1)}><ArrowDown data-icon="inline-start" /></Button>
      {mode === 'replace' && <><Button variant="outline" disabled={readOnly || !current} onClick={() => replace(false)}>{fa ? 'جایگزینی' : 'Replace'}</Button><Button variant="outline" disabled={readOnly || !current} onClick={() => replace(true)}>{fa ? 'جایگزینی همه' : 'Replace all'}</Button></>}
    </>}
    <Button variant="ghost" size="icon-sm" aria-label={fa ? 'بستن جست‌وجو' : 'Close search'} onClick={close}><X data-icon="inline-start" /></Button>
  </section>;
}
