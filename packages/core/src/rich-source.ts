import type { JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state';
import { isHistoryTransaction } from '@tiptap/pm/history';
import { markdownParser, collectDefinitions } from './markdown';
import { parseRichMarkdown, serializeRichBlock, type MarkdownNode, type SourcePosition } from './rich-editor-markdown';

type Definitions = ReadonlyMap<string, { url?: string; title?: string | null }>;
type Unit = { text: string; kind: string; marks: string; start: number; end: number };
type Wrapper = { key: string; from: number; to: number; start: number; end: number; innerStart: number; innerEnd: number };
type InlineMap = { units: Unit[]; wrappers: Wrapper[]; start: number; end: number; tableCell?: boolean };
type BlockSourceMap = { originals: MarkdownNode[]; maps: (InlineMap | undefined)[] };
const shiftInlineMap = (map: InlineMap, delta: number): InlineMap => ({ ...map, start: map.start + delta, end: map.end + delta,
  units: map.units.map(unit => ({ ...unit, start: unit.start + delta, end: unit.end + delta })),
  wrappers: map.wrappers.map(wrapper => ({ ...wrapper, start: wrapper.start + delta, end: wrapper.end + delta, innerStart: wrapper.innerStart + delta, innerEnd: wrapper.innerEnd + delta })) });
type Edit = { start: number; end: number; text: string };
export type RichMutation = { from: number; to: number; nextFrom: number; nextTo: number };
const span = (node: MarkdownNode) => ({ start: node.position?.start.offset || 0, end: node.position?.end.offset || 0 });
const markKey = (type: string, attrs?: Record<string, unknown>) => type === 'link'
  ? `link:${JSON.stringify([attrs?.href || '', attrs?.title || null])}` : type;
const marksKey = (marks: string[]) => [...marks].sort().join('|');
const signature = (unit: Unit, marks = true) => JSON.stringify([unit.text, unit.kind, marks ? unit.marks : '']);
const entities = new Map<string, string>();

/** UTF-16 source spans are indivisible; one decoded astral/entity unit may cover
 * multiple code units or an entire escape. Never put a patch inside that span. */
function decodedUnits(source: string, start: number, end: number, value: string, syntax = true, flow = true): Unit[] {
  const atoms: Unit[] = [];
  for (let at = start; at < end;) {
    const begin = at;
    let text: string;
    if (syntax && source[at] === '\\' && /[!-/:-@[-`{-~]/.test(source[at + 1] || '')) { text = source[at + 1]; at += 2; }
    else if (syntax && source[at] === '&' && /^&(?:#[xX][\da-fA-F]+|#\d+|[A-Za-z][\dA-Za-z]+);/.test(source.slice(at, end))) {
      const entity = /^&[^;]+;/.exec(source.slice(at, end))![0];
      let decoded = entities.get(entity);
      if (decoded === undefined) {
        const root = markdownParser.parse(entity) as unknown as MarkdownNode;
        decoded = root.children?.[0]?.children?.[0]?.value || entity;
        if (entities.size >= 256) entities.delete(entities.keys().next().value!);
        entities.set(entity, decoded);
      }
      if (decoded === entity) { text = '&'; at++; }
      else { text = decoded; at += entity.length; }
    } else if (source[at] === '\r' || source[at] === '\n') {
      at += source[at] === '\r' && source[at + 1] === '\n' ? 2 : 1;
      text = flow ? ' ' : '\n';
      if (flow) at += /^(?:[ \t]*> ?)*[ \t]*/.exec(source.slice(at, end))![0].length;
    } else { text = String.fromCodePoint(source.codePointAt(at)!); at += text.length; }
    for (const character of text) atoms.push({ text: character, kind: 'text', marks: '', start: begin, end: at });
  }
  const output: Unit[] = [];
  let cursor = 0;
  for (const character of value) {
    // Markdown removes continuation indentation and inline-code padding. Only
    // skip whitespace, never search ahead past visible punctuation/text.
    while (cursor < atoms.length && atoms[cursor].text !== character && /\s/u.test(atoms[cursor].text)) cursor++;
    if (atoms[cursor]?.text !== character) throw new Error('RICH_SOURCE_MAP_MISMATCH');
    output.push(atoms[cursor++]);
  }
  return output;
}

function inlineMap(source: string, node: MarkdownNode, definitions: Definitions): InlineMap {
  const units: Unit[] = [], wrappers: Wrapper[] = [];
  const walk = (item: MarkdownNode, marks: string[]) => {
    const range = span(item), before = units.length;
    let mark: string | undefined;
    if (item.type === 'text') {
      for (const unit of decodedUnits(source, range.start, range.end, (item.value || '').replace(/\r\n?|\n/g, ' '))) units.push({ ...unit, marks: marksKey(marks) });
    } else if (item.type === 'inlineCode') {
      const raw = source.slice(range.start, range.end), fence = /^`+/.exec(raw)?.[0].length || 1;
      const code = decodedUnits(source, range.start + fence, range.end - fence, item.value || '', false);
      for (const unit of code) units.push({ ...unit, kind: 'code', marks: marksKey([...marks, 'code']) });
      wrappers.push({ key: 'code', from: before, to: units.length, ...range, innerStart: range.start + fence, innerEnd: range.end - fence });
    } else if (item.type === 'break' || item.type === 'html' && /^<br\s*\/?\s*>$/i.test(item.value || '')) {
      units.push({ text: '\n', kind: 'hardBreak', marks: '', ...range });
    } else if (['strong', 'emphasis', 'delete', 'link', 'linkReference'].includes(item.type)) {
      mark = { strong: 'bold', emphasis: 'italic', delete: 'strike' }[item.type];
      if (item.type === 'link' || item.type === 'linkReference') {
        const definition = item.type === 'linkReference' ? definitions.get(item.identifier || '') : item;
        if (definition) mark = markKey('link', { href: definition.url, title: definition.title, reference: item.type === 'linkReference' ? item.identifier : undefined });
      }
      for (const child of item.children || []) walk(child, mark ? [...marks, mark] : marks);
      const first = item.children?.[0], last = item.children?.[item.children.length - 1];
      if (mark && first && last) wrappers.push({ key: mark, from: before, to: units.length, ...range, innerStart: span(first).start, innerEnd: span(last).end });
    } else {
      const raw = source.slice(range.start, range.end);
      units.push({ text: item.type === 'inlineMath' ? item.value || '' : raw, kind: item.type === 'inlineMath' ? 'mathInline' : 'rawInline', marks: marksKey(marks), ...range });
    }
  };
  for (const child of node.children || []) walk(child, []);
  return { units, wrappers, tableCell: node.type === 'tableCell', start: node.children?.length ? span(node.children[0]).start : span(node).start, end: node.children?.length ? span(node.children[node.children.length - 1]).end : span(node).end };
}

function modelUnits(node: JSONContent): Unit[] {
  return (node.content || []).flatMap(child => {
    const marks = marksKey((child.marks || []).map(mark => markKey(mark.type, mark.attrs)));
    if (child.type === 'text') return Array.from(child.text || '', text => ({ text, kind: node.type === 'codeBlock' || child.marks?.some(mark => mark.type === 'code') ? 'code' : 'text', marks, start: 0, end: 0 }));
    return [{ text: child.type === 'hardBreak' ? '\n' : child.attrs?.source || '', kind: child.type || '', marks: child.type === 'hardBreak' ? '' : marks, start: 0, end: 0 }];
  });
}
function difference(before: Unit[], after: Unit[], includeMarks = true) {
  let start = 0, end = before.length, nextEnd = after.length;
  while (start < end && start < nextEnd && signature(before[start], includeMarks) === signature(after[start], includeMarks)) start++;
  while (end > start && nextEnd > start && signature(before[end - 1], includeMarks) === signature(after[nextEnd - 1], includeMarks)) { end--; nextEnd--; }
  return { start, end, nextEnd };
}
function edits(source: string, changes: Edit[]) {
  let at = 0;
  const pieces: string[] = [];
  for (const change of changes.sort((a, b) => a.start - b.start || a.end - b.end)) {
    if (change.start < at) throw new Error('RICH_SOURCE_OVERLAP');
    pieces.push(source.slice(at, change.start), change.text); at = change.end;
  }
  pieces.push(source.slice(at));
  return pieces.join('');
}
const escapeText = (text: string) => text.replace(/[!-/:-@[-`{-~]/g, '\\$&');

function unitIndex(units: Unit[], offset: number) {
  let size = 0, index = 0;
  while (index < units.length && size < offset) { size += ['text', 'code'].includes(units[index].kind) ? units[index].text.length : 1; index++; }
  return index;
}
function anchoredDifference(before: Unit[], after: Unit[], mutation?: RichMutation, marks = true) {
  if (!mutation) return difference(before, after, marks);
  return { start: unitIndex(before, mutation.from), end: unitIndex(before, mutation.to), nextEnd: unitIndex(after, mutation.nextTo) };
}
function updatedInlineMap(before: InlineMap, change: { start: number; end: number; nextEnd: number }, inserted: Unit[], start: number, end: number, encode = (unit: Unit) => escapeText(unit.text)): InlineMap {
  const encoded = inserted.map(encode);
  const delta = encoded.join('').length - (end - start), unitDelta = inserted.length - (change.end - change.start);
  let offset = start;
  const additions = inserted.map((unit, index) => { const result = { ...unit, start: offset, end: offset + encoded[index].length }; offset = result.end; return result; });
  const point = (value: number, bias = -1) => value < start || value === start && bias < 0 ? value : value >= end ? value + delta : bias < 0 ? start : start + encoded.join('').length;
  const index = (value: number, bias: number) => value < change.start || value === change.start && bias < 0 ? value : value >= change.end ? value + unitDelta : bias < 0 ? change.start : change.nextEnd;
  return {
    tableCell: before.tableCell,
    start: point(before.start), end: point(before.end, 1),
    units: [...before.units.slice(0, change.start), ...additions, ...before.units.slice(change.end).map(unit => ({ ...unit, start: unit.start + delta, end: unit.end + delta }))],
    wrappers: before.wrappers.map(wrapper => ({ ...wrapper, from: index(wrapper.from, -1), to: index(wrapper.to, 1), start: point(wrapper.start), end: point(wrapper.end, 1), innerStart: point(wrapper.innerStart), innerEnd: point(wrapper.innerEnd, 1) })),
  };
}
function patchInline(source: string, ast: MarkdownNode | InlineMap, next: JSONContent, definitions: Definitions, mutation?: RichMutation, update?: (map: InlineMap) => void) {
  const before = 'units' in ast ? ast : inlineMap(source, ast, definitions), after = modelUnits(next);
  const change = anchoredDifference(before.units, after, mutation);
  if (change.start === change.end && change.start === change.nextEnd) return source.slice(before.start, before.end);
  while (change.start > 0 && before.units[change.start]?.start === before.units[change.start - 1]?.start) change.start--;
  while (change.end < before.units.length && before.units[change.end]?.start === before.units[change.end - 1]?.start) { change.end++; change.nextEnd++; }
  const removed = before.units.slice(change.start, change.end), inserted = after.slice(change.start, change.nextEnd);
  const contexts = new Set([...removed, ...inserted].map(unit => unit.marks));
  const left = before.units[change.start - 1], right = before.units[change.end];
  const context = contexts.values().next().value ?? '';
  const start = removed[0]?.start ?? (right?.marks === context ? right.start : left?.end ?? before.start);
  const end = removed[removed.length - 1]?.end ?? start;
  const contiguous = removed.every((unit, index) => !index || unit.start === removed[index - 1].end);
  if (removed.length === 1 && inserted.length === 1 && removed[0].kind === inserted[0].kind && ['rawInline', 'mathInline'].includes(removed[0].kind) && removed[0].marks === inserted[0].marks) {
    let encoded = inserted[0].text;
    if (inserted[0].kind === 'mathInline') {
      const delimiter = /^\$+/.exec(source.slice(start, end))?.[0] || '$';
      const runs = inserted[0].text.match(/\$+/g) || [];
      const fence = '$'.repeat(runs.reduce((length, run) => Math.max(length, run.length + 1), delimiter.length));
      encoded = fence + inserted[0].text + fence;
    }
    update?.(updatedInlineMap(before, change, inserted, start, end, () => encoded));
    return source.slice(before.start, start) + encoded + source.slice(end, before.end);
  }
  const implicitLinkChanged = before.wrappers.some(wrapper => wrapper.key.startsWith('link:')
    && (wrapper.start === wrapper.innerStart && wrapper.end === wrapper.innerEnd || source.slice(wrapper.start, wrapper.innerStart) === '<')
    && change.start <= wrapper.to && change.end >= wrapper.from);
  // The common typing path changes only the exact encoded character range.
  // Escaping all ASCII Markdown punctuation keeps input literal in any inline
  // context, including dollars and line-leading list/heading punctuation.
  const exposesBreak = after[0]?.kind === 'hardBreak' || after[after.length - 1]?.kind === 'hardBreak';
  if (!exposesBreak && !implicitLinkChanged && contexts.size <= 1 && contiguous && [...removed, ...inserted].every(unit => unit.kind === 'text' && !/[\r\n]/.test(unit.text))
    && (removed.length > 0 || left?.marks === context || right?.marks === context || !before.units.length)) {
    const insertedText = escapeText(inserted.map(unit => unit.text).join(''));
    const candidate = source.slice(before.start, start) + insertedText + source.slice(end, before.end);
    // Removing whitespace can activate an old delimiter/entity or autolink.
    // Verify that affected inline structure only when joining syntax-bearing
    // neighbours. Ordinary word typing never invokes the Markdown parser.
    const boundary = source.slice(Math.max(before.start, start - 2), Math.min(before.end, end + 2));
    if (!/[!-/:-@[-`{-~]/.test(boundary)) { update?.(updatedInlineMap(before, change, inserted, start, end)); return candidate; }
    const parsed = parseRichMarkdown(candidate, definitions).document.content?.[0];
    if (parsed?.type === 'paragraph' && JSON.stringify(modelUnits(parsed).map(unit => signature(unit))) === JSON.stringify(after.map(unit => signature(unit)))) { update?.(updatedInlineMap(before, change, inserted, start, end)); return candidate; }
    // Protect only literal source characters beside this edit. Existing mark
    // delimiters are outside their decoded units and remain untouched.
    const neighbours = [left, right].filter(neighbour => neighbour?.kind === 'text' && /[!-/:-@[-`{-~]/.test(neighbour.text) && source.slice(neighbour.start, neighbour.end) === neighbour.text);
    for (const selected of [...neighbours.map(neighbour => [neighbour]), neighbours]) {
      const repairs: Edit[] = [{ start, end, text: insertedText }, ...selected.map(neighbour => ({ start: neighbour.start, end: neighbour.end, text: escapeText(neighbour.text) }))];
      const repaired = edits(source, repairs).slice(before.start, before.end + repairs.reduce((delta, edit) => delta + edit.text.length - (edit.end - edit.start), 0));
      const verified = parseRichMarkdown(repaired, definitions).document.content?.[0];
      if (verified?.type === 'paragraph' && JSON.stringify(modelUnits(verified).map(unit => signature(unit))) === JSON.stringify(after.map(unit => signature(unit)))) return repaired;
    }
  }

  // Formatting and mixed inline edits use a local writer. Restore original
  // encoded characters and unchanged wrapper syntax into its valid structure;
  // this retains entities, escapes, soft EOLs and reference-link notation.
  const tableCell = 'units' in ast ? ast.tableCell : ast.type === 'tableCell';
  const canonical = tableCell
    ? serializeRichBlock({ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [next] }] }] })
    : serializeRichBlock({ type: 'paragraph', content: next.content });
  const parsed = parseRichMarkdown(canonical, definitions);
  const paragraph = tableCell ? parsed.root.children?.[0]?.children?.[0]?.children?.[0] : parsed.root.children?.[0];
  if (!paragraph || !['paragraph', 'tableCell'].includes(paragraph.type)) return canonical;
  const mapped = inlineMap(canonical, paragraph, definitions);
  if (mapped.units.length !== after.length || mapped.units.some((unit, index) => signature(unit) !== signature(after[index]))) throw new Error('RICH_SOURCE_SERIALIZATION_MISMATCH');
  const textChange = anchoredDifference(before.units, mapped.units, mutation, false);
  const oldIndex = (index: number) => index < textChange.start ? index
    : index >= textChange.nextEnd ? index + textChange.end - textChange.nextEnd : -1;
  const groups: Edit[][] = [];
  for (let index = 0; index < mapped.units.length; index++) {
    const unit = mapped.units[index], previousIndex = oldIndex(index), original = before.units[previousIndex];
    if (original && signature(original, false) === signature(unit, false)) {
      // Named entities can decode to multiple Unicode characters. Preserve an
      // unchanged encoded token once, spanning all of its decoded units.
      let groupEnd = previousIndex + 1;
      while (before.units[groupEnd]?.start === original.start && before.units[groupEnd]?.end === original.end) groupEnd++;
      const length = groupEnd - previousIndex;
      if (before.units[previousIndex - 1]?.start === original.start) continue;
      if (length > 1) {
        if (index + length <= mapped.units.length && Array.from({ length }, (_, offset) => oldIndex(index + offset) === previousIndex + offset && signature(before.units[previousIndex + offset], false) === signature(mapped.units[index + offset], false)).every(Boolean)) {
          groups.push([{ start: unit.start, end: mapped.units[index + length - 1].end, text: source.slice(original.start, original.end) }]); index += length - 1;
        }
        continue;
      }
      const raw = source.slice(original.start, original.end);
      if (raw !== canonical.slice(unit.start, unit.end)) groups.push([{ start: unit.start, end: unit.end, text: raw }]);
    }
  }
  const translate = (position: number, end: boolean) => position <= textChange.start ? position
    : position >= textChange.end ? position + textChange.nextEnd - textChange.end
      : end ? textChange.nextEnd : textChange.start;
  for (const wrapper of mapped.wrappers) {
    const original = before.wrappers.find(candidate => candidate.key === wrapper.key
      && translate(candidate.from, false) === wrapper.from && translate(candidate.to, true) === wrapper.to);
    if (!original) continue;
    const opening = source.slice(original.start, original.innerStart), closing = source.slice(original.innerEnd, original.end);
    // Editing the visible label of a bare/angle autolink must preserve its
    // destination with explicit link syntax. Its old implicit delimiters no
    // longer express the rich model's label+href pair.
    const implicit = original.key.startsWith('link:') && (opening === '' && closing === '' || opening === '<' && closing === '>');
    if (implicit && textChange.start <= original.to && textChange.end >= original.from && (textChange.start !== textChange.end || textChange.start !== textChange.nextEnd)) continue;
    groups.push([{ start: wrapper.start, end: wrapper.innerStart, text: opening }, { start: wrapper.innerEnd, end: wrapper.end, text: closing }]);
  }
  const render = (selected: Edit[][]) => edits(canonical.slice(0, mapped.end), selected.flat()).slice(mapped.start);
  const expected = after.map(unit => signature(unit));
  const valid = (value: string) => {
    const block = parseRichMarkdown(value, definitions).document.content?.[0];
    return block?.type === 'paragraph' && JSON.stringify(modelUnits(block).map(unit => signature(unit))) === JSON.stringify(expected);
  };
  const restored = render(groups);
  if (valid(restored)) return restored;
  // Changed neighbours can invalidate an old delimiter spelling (`__` inside
  // a word, or literal punctuation at a newly exposed block boundary). Keep
  // every original fragment that still expresses the requested model; only
  // the syntax made significant by this operation needs the writer's repair.
  let accepted: Edit[][] = [];
  for (const group of groups) if (valid(render([...accepted, group]))) accepted = [...accepted, group];
  return render(accepted);
}

const textblocks = (node: JSONContent): JSONContent[] => ['paragraph', 'heading', 'codeBlock'].includes(node.type || '') ? [node] : (node.content || []).flatMap(textblocks);
function astTextblocks(node: MarkdownNode): MarkdownNode[] {
  if (['paragraph', 'heading', 'code', 'tableCell'].includes(node.type)) return [node];
  return (node.children || []).flatMap(astTextblocks);
}
function codeMap(source: string, ast: MarkdownNode): { units: Unit[]; prefix: string; fenced: boolean; emptyStart?: number; emptyLead?: string; emptyTail?: string } {
  const range = span(ast), raw = source.slice(range.start, range.end);
  const lines: { text: string; start: number; end: number }[] = [];
  const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  for (const match of raw.matchAll(pattern)) {
    if (!match[0] && match.index === raw.length) break;
    lines.push({ text: match[1], start: range.start + match.index!, end: range.start + match.index! + match[1].length });
  }
  const fenced = /^\s*(?:`{3,}|~{3,})/.test(lines[0]?.text || '');
  const content = fenced ? lines.slice(1) : lines;
  if (fenced && !ast.value) {
    const eol = /\r\n|\r|\n/.exec(raw)?.[0] || '\n';
    const closing = /^((?:[ \t]*> ?)*[ \t]*)(?:`{3,}|~{3,})/.exec(content[0]?.text || '');
    const prefix = closing?.[1] ?? content[0]?.text ?? '';
    return { units: [], prefix, fenced, emptyStart: content[0] ? content[0].start + prefix.length : range.end, emptyLead: content[0] ? '' : eol, emptyTail: closing ? eol + prefix : '' };
  }
  const values = (ast.value || '').replace(/\r\n?/g, '\n').split('\n');
  const units: Unit[] = [];
  let prefix = '';
  values.forEach((value, index) => {
    const line = content[index];
    if (!line || !line.text.endsWith(value)) throw new Error('RICH_CODE_MAP_MISMATCH');
    const start = line.end - value.length;
    if (!index) prefix = source.slice(line.start, start);
    if (index) units.push({ text: '\n', kind: 'code', marks: 'code', start: content[index - 1].end, end: start });
    let offset = start;
    for (const character of value) { units.push({ text: character, kind: 'code', marks: 'code', start: offset, end: offset + character.length }); offset += character.length; }
  });
  return { units, prefix, fenced };
}
function structure(node: JSONContent): unknown {
  if (['paragraph', 'heading', 'codeBlock'].includes(node.type || '')) return [node.type, node.attrs];
  return [node.type, node.attrs, node.content?.map(structure)];
}
function patchStructure(previous: JSONContent, next: JSONContent, source: string, definitions: Definitions): string {
  const ast = parseRichMarkdown(source, definitions).root.children?.[0];
  if (!ast) return serializeRichBlock(next);
  const changes: Edit[] = [];
  const walk = (before: JSONContent, after: JSONContent, original: MarkdownNode, parent?: JSONContent, childIndex = 0) => {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const range = span(original);
    if (JSON.stringify(structure(before)) === JSON.stringify(structure(after))) {
      changes.push({ ...range, text: patchRichBlock(before, after, source.slice(range.start, range.end), definitions) }); return;
    }
    // Splitting/joining list items changes the parent's child count. Retain
    // byte-identical siblings on either side and rewrite only the affected
    // item interval, including its own markers/continuation indentation.
    if (['orderedList', 'bulletList'].includes(before.type || '') && before.type === after.type
      && JSON.stringify(before.attrs) === JSON.stringify(after.attrs) && before.content?.length === original.children?.length) {
      const left = before.content || [], right = after.content || [];
      let prefix = 0, end = left.length, nextEnd = right.length;
      while (prefix < end && prefix < nextEnd && JSON.stringify(left[prefix]) === JSON.stringify(right[prefix])) prefix++;
      while (end > prefix && nextEnd > prefix && JSON.stringify(left[end - 1]) === JSON.stringify(right[nextEnd - 1])) { end--; nextEnd--; }
      if (prefix < end && (prefix || end < left.length)) {
        const start = span(original.children![prefix]).start, finish = span(original.children![end - 1]).end;
        const text = serializeRichBlock({ ...after, attrs: { ...after.attrs, start: Number(after.attrs?.start || 1) + prefix }, content: right.slice(prefix, nextEnd) });
        const lineStart = Math.max(source.lastIndexOf('\n', start - 1), source.lastIndexOf('\r', start - 1)) + 1;
        const indentation = source.slice(lineStart, start).replace(/[^\t >]/g, ' ');
        const eol = source.includes('\r\n') ? '\r\n' : '\n';
        changes.push({ start, end: finish, text: text.replace(/\n/g, eol + indentation) }); return;
      }
    }
    // GFM rows are not standalone Markdown blocks: changing a column must
    // rewrite the owning table, including its header separator. Descending
    // into rows here serialized them as empty paragraphs and left the source
    // ledger describing a different document from the visible table.
    if (before.type === after.type && JSON.stringify(before.attrs) === JSON.stringify(after.attrs) && before.content?.length === after.content?.length && !['paragraph', 'heading', 'codeBlock', 'table'].includes(before.type || '')) {
      let cursor = 0;
      const originals = (before.content || []).map(child => {
        const count = child.type === 'rawBlock' ? parseRichMarkdown(String(child.attrs?.source || ''), definitions).document.content?.length || 1 : 1;
        const first = original.children?.[cursor], last = original.children?.[cursor + count - 1]; cursor += count;
        return first && last ? { ...first, position: first.position && last.position ? { start: first.position.start, end: last.position.end } : first.position } : undefined;
      });
      if (cursor === original.children?.length && originals.every(Boolean)) {
        before.content?.forEach((child, index) => walk(child, after.content![index], originals[index]!, before, index)); return;
      }
    }
    let text: string;
    if (['tableCell', 'tableHeader'].includes(after.type || '')) {
      const rendered = serializeRichBlock({ type: 'table', content: [{ type: 'tableRow', content: [{ ...after, type: 'tableHeader' }] }] });
      const cell = parseRichMarkdown(rendered).root.children?.[0]?.children?.[0]?.children?.[0];
      if (!cell) throw new Error('RICH_TABLE_MAP_MISMATCH');
      const mapped = inlineMap(rendered, cell, definitions), originalMap = inlineMap(source, original, definitions);
      changes.push({ start: originalMap.start, end: originalMap.end, text: rendered.slice(mapped.start, mapped.end) }); return;
    }
    if (after.type === 'listItem' && parent && ['orderedList', 'bulletList'].includes(parent.type || '')) {
      text = serializeRichBlock({ ...parent, attrs: { ...parent.attrs, start: Number(parent.attrs?.start || 1) + childIndex }, content: [after] });
    } else text = serializeRichBlock(after);
    const lineStart = Math.max(source.lastIndexOf('\n', range.start - 1), source.lastIndexOf('\r', range.start - 1)) + 1;
    const prefix = source.slice(lineStart, range.start).replace(/[^\t >]/g, ' ');
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    changes.push({ ...range, text: text.replace(/\n/g, eol + prefix) });
  };
  walk(previous, next, ast);
  return edits(source, changes);
}

/** A structural operation may rewrite its smallest block. Text/mark operations
 * retain every unrelated encoded range inside its existing text blocks. */
export function patchRichBlock(previous: JSONContent, next: JSONContent, source: string, definitions: Definitions = new Map(), mutation?: RichMutation): string {
  return patchMappedBlock(previous, next, source, definitions, mutation);
}
function patchMappedBlock(previous: JSONContent, next: JSONContent, source: string, definitions: Definitions, mutation?: RichMutation, cached?: BlockSourceMap, update?: (map: BlockSourceMap) => void): string {
  if (JSON.stringify(previous) === JSON.stringify(next)) return source;
  if (next.type === 'rawBlock' && previous.type === 'rawBlock') return String(next.attrs?.source || '');
  if (JSON.stringify(structure(previous)) !== JSON.stringify(structure(next))) return patchStructure(previous, next, source, definitions);
  const oldBlocks = textblocks(previous), newBlocks = textblocks(next);
  const offsets = (root: JSONContent) => {
    const result: number[] = [];
    const size = (node: JSONContent): number => node.type === 'text' ? (node.text || '').length : node.content ? 2 + node.content.reduce((sum, child) => sum + size(child), 0) : 1;
    const walk = (node: JSONContent, position: number) => {
      if (['paragraph', 'heading', 'codeBlock'].includes(node.type || '')) { result.push(position + 1); return; }
      let childPosition = position + 1;
      for (const child of node.content || []) { walk(child, childPosition); childPosition += size(child); }
    };
    walk(root, -1); return result;
  };
  const oldOffsets = offsets(previous), newOffsets = offsets(next);
  const originals = cached?.originals || astTextblocks(parseRichMarkdown(source, definitions).root);
  const maps = cached?.maps || originals.map(original => original.type === 'code' ? undefined : inlineMap(source, original, definitions));
  if (oldBlocks.length !== newBlocks.length || oldBlocks.length !== originals.length || !oldBlocks.length) return serializeRichBlock(next);
  const changes: Edit[] = [];
  const nextMaps = [...maps];
  for (let index = 0; index < oldBlocks.length; index++) {
    if (JSON.stringify(oldBlocks[index]) === JSON.stringify(newBlocks[index])) continue;
    const original = originals[index];
    const local = mutation && mutation.from >= oldOffsets[index] && mutation.to <= oldOffsets[index] + (oldBlocks[index].content || []).reduce((sum, child) => sum + (child.type === 'text' ? (child.text || '').length : 1), 0)
      ? { from: mutation.from - oldOffsets[index], to: mutation.to - oldOffsets[index], nextFrom: mutation.nextFrom - newOffsets[index], nextTo: mutation.nextTo - newOffsets[index] } : undefined;
    if (original.type === 'code') {
      const mapped = codeMap(source, original);
      const after = modelUnits(newBlocks[index]);
      const { start: from, end: to, nextEnd: nextTo } = anchoredDifference(mapped.units, after, local, false);
      const range = span(original), raw = source.slice(range.start, range.end);
      if (!mapped.fenced && !after.length) { changes.push({ ...range, text: serializeRichBlock(newBlocks[index]) }); continue; }
      const fence = /^\s*(`{3,}|~{3,})/.exec(raw)?.[1];
      const start = mapped.units[from]?.start ?? mapped.units[mapped.units.length - 1]?.end ?? mapped.emptyStart ?? range.start + (raw.indexOf('\n') + 1 || mapped.prefix.length);
      const end = to > from ? mapped.units[to - 1].end : start;
      const eol = /\r\n|\r|\n/.exec(raw)?.[0] || '\n';
      const physicalStart = Math.max(source.lastIndexOf('\n', start - 1), source.lastIndexOf('\r', start - 1)) + 1;
      const currentLine = source.slice(physicalStart, start);
      const prefix = /^(?:[ \t]*> ?)*[ \t]*/.exec(currentLine)?.[0] || mapped.prefix;
      const inserted = after.slice(from, nextTo).map(unit => unit.text).join('').replace(/\n/g, eol + prefix);
      changes.push({ start, end, text: !mapped.units.length && inserted ? (mapped.emptyLead || '') + inserted + (mapped.emptyTail || '') : inserted });
      if (fence) {
        const runs = (after.map(unit => unit.text).join('').match(new RegExp(fence[0] === '`' ? '`{3,}' : '~{3,}', 'g')) || []).map(run => run.length);
        const length = runs.reduce((maximum, length) => Math.max(maximum, length + 1), fence.length);
        if (length > fence.length) {
          const opening = range.start + raw.indexOf(fence);
          changes.push({ start: opening, end: opening + fence.length, text: fence[0].repeat(length) });
          const closing = raw.lastIndexOf(fence);
          if (closing > raw.indexOf(fence)) changes.push({ start: range.start + closing, end: range.start + closing + fence.length, text: fence[0].repeat(length) });
        }
      }
    } else {
      const map = maps[index]!;
      let updated: InlineMap | undefined;
      const text = patchInline(source, map, newBlocks[index], definitions, local, value => { updated = value; });
      if (!updated) {
        // Complex formatting repairs are already local. Rebuild just that
        // textblock's mapping; ordinary typing and raw-widget edits deliver
        // their updated spans directly, including temporarily invalid source.
        const isolated = map.tableCell ? `| ${text} |\n| --- |` : text;
        const original = astTextblocks(parseRichMarkdown(isolated, definitions).root)[0];
        if (original) {
          const fresh = inlineMap(isolated, original, definitions);
          updated = shiftInlineMap(fresh, map.start - fresh.start);
        }
      }
      nextMaps[index] = updated;
      changes.push({ start: map.start, end: map.end, text });
    }
  }
  const result = edits(source, changes);
  if (update && nextMaps.every((map, index) => map || originals[index].type === 'code')) {
    const shiftPoint = (point: number, bias: number) => {
      let delta = 0;
      for (const change of changes) {
        if (point < change.start || point === change.start && bias < 0) break;
        if (point >= change.end) delta += change.text.length - (change.end - change.start);
        else return change.start + delta + (bias > 0 ? change.text.length : 0);
      }
      return point + delta;
    };
    update({
      originals: originals.map((original, index) => ({ ...original, ...(original.type === 'code' ? { value: (newBlocks[index].content || []).map(child => child.text || '').join('') } : {}), position: original.position ? { ...original.position, start: { ...original.position.start, offset: shiftPoint(span(original).start, -1) }, end: { ...original.position.end, offset: shiftPoint(span(original).end, 1) } } : undefined })),
      maps: nextMaps.map((map, index) => map ? shiftInlineMap(map, changes.filter(change => change.end <= (maps[index]?.start ?? 0) && change.start !== maps[index]?.start).reduce((sum, change) => sum + change.text.length - (change.end - change.start), 0)) : undefined),
    });
  }
  return result;
}

export type RichSourceSnapshot = { doc: ProseMirrorNode; text: string; positions: SourcePosition[]; nodes: ProseMirrorNode[]; definitions: Definitions };
export type LinkedRichRange = { from: number; to: number };
type SelectionSpan = LinkedRichRange & SourcePosition;
type HistoryBranch = { items: { forEach: (callback: (item: { selection?: object }) => void) => void } };
type HistoryState = { done: HistoryBranch; undone: HistoryBranch };
const historyPlugin = (state?: EditorState) => state?.plugins.find(plugin => {
  const value = plugin.getState(state) as Partial<HistoryState> | undefined;
  return value?.done?.items && value?.undone?.items;
});
const latestHistoryEvent = (branch: HistoryBranch): object | undefined => {
  let event: object | undefined; branch.items.forEach(item => { if (item.selection) event = item.selection; }); return event;
};
/** External logical replacements start a fresh rich-only history. Source and
 * native-host undo remain owned by their respective editing surfaces. */
export function replaceRichSourceState(state: EditorState, document: JSONContent) {
  const doc = state.schema.nodeFromJSON(document);
  const anchor = doc.resolve(Math.min(state.selection.anchor, doc.content.size));
  const head = doc.resolve(Math.min(state.selection.head, doc.content.size));
  return EditorState.create({ schema: state.schema, doc, plugins: state.plugins, selection: TextSelection.between(anchor, head) });
}
/** Node identity anchors source provenance, even for duplicate visible blocks.
 * A speculative filterTransaction snapshot never advances the committed source. */
export class RichSourceDocument {
  private current!: RichSourceSnapshot;
  private snapshots = new WeakMap<ProseMirrorNode, RichSourceSnapshot>();
  private sources = new WeakMap<ProseMirrorNode, string>();
  private blockMaps = new WeakMap<ProseMirrorNode, BlockSourceMap>();
  private selectionMaps = new WeakMap<ProseMirrorNode, { text: string; definitions: Definitions; spans: SelectionSpan[]; wrappers: SelectionSpan[] }>();
  private rawDefinitions = new WeakMap<ProseMirrorNode, Definitions>();
  private historySources = new WeakMap<object, RichSourceSnapshot>();
  private pendingHistory = new WeakMap<ProseMirrorNode, RichSourceSnapshot>();
  reset(doc: ProseMirrorNode, text: string, positions: SourcePosition[], definitions: Definitions = new Map()) {
    const nodes: ProseMirrorNode[] = [];
    doc.forEach(node => nodes.push(node));
    this.sources = new WeakMap();
    this.blockMaps = new WeakMap();
    this.selectionMaps = new WeakMap();
    nodes.forEach((node, index) => { const position = positions[index]; this.sources.set(node, position ? text.slice(position.start, position.end) : ''); });
    this.rawDefinitions = new WeakMap();
    this.current = { doc, text, positions: positions.length ? positions : [{ start: 0, end: 0 }], nodes, definitions };
    this.snapshots = new WeakMap([[doc, this.current]]);
    this.historySources = new WeakMap();
    this.pendingHistory = new WeakMap();
  }
  /** Build provenance only for touched blocks, and retain it across selection
   * changes. Reuse the writer's encoded units for entities, escapes and edits. */
  private selectionMap(node: ProseMirrorNode, text: string, definitions: Definitions) {
    const cached = this.selectionMaps.get(node);
    if (cached?.text === text && cached.definitions === definitions) return cached;
    const spans: SelectionSpan[] = [], wrappers: SelectionSpan[] = [];
    try {
      const mapped = this.blockMaps.get(node);
      const originals = mapped?.originals ?? astTextblocks(parseRichMarkdown(text, definitions).root);
      const blocks: { node: ProseMirrorNode; from: number }[] = [];
      if (node.isTextblock) blocks.push({ node, from: 1 });
      else node.descendants((child, pos) => {
        if (child.isTextblock) { blocks.push({ node: child, from: pos + 2 }); return false; }
      });
      if (blocks.length === originals.length) blocks.forEach((block, index) => {
        const original = originals[index];
        const map = original.type === 'code' ? codeMap(text, original) : mapped?.maps[index] ?? inlineMap(text, original, definitions);
        let at = block.from;
        const boundaries = [at];
        for (const unit of map.units) {
          const to = at + (['text', 'code'].includes(unit.kind) ? unit.text.length : 1);
          spans.push({ from: at, to, start: unit.start, end: unit.end });
          boundaries.push(to); at = to;
        }
        if ('wrappers' in map) for (const wrapper of map.wrappers) wrappers.push({
          from: boundaries[wrapper.from], to: boundaries[wrapper.to], start: wrapper.start, end: wrapper.end,
        });
        // Markers, fences and indentation still identify their rendered block.
        wrappers.push({ ...span(original), from: block.from, to: block.from + block.node.content.size });
      });
    } catch { /* Unsupported raw syntax falls back to its owning block. */ }
    if (!spans.length) spans.push({ from: 0, to: node.nodeSize, start: 0, end: text.length });
    const result = { text, definitions, spans, wrappers };
    this.selectionMaps.set(node, result);
    return result;
  }
  sourceRange(doc: ProseMirrorNode, from: number, to: number): SourcePosition | null {
    if (from >= to) return null;
    const snapshot = this.snapshot(doc);
    let result: SourcePosition | null = null;
    doc.forEach((node, pos, index) => {
      if (pos >= to || pos + node.nodeSize <= from) return;
      const block = snapshot.positions[index];
      if (!block) return;
      const map = this.selectionMap(node, snapshot.text.slice(block.start, block.end), snapshot.definitions);
      const touched = map.spans.filter(unit => pos + unit.from < to && pos + unit.to > from);
      for (const unit of touched) {
        const start = block.start + unit.start, end = block.start + unit.end;
        result = result ? { start: Math.min(result.start, start), end: Math.max(result.end, end) } : { start, end };
      }
    });
    return result;
  }
  richRanges(doc: ProseMirrorNode, selection: SourcePosition): LinkedRichRange[] {
    if (selection.start >= selection.end) return [];
    const snapshot = this.snapshot(doc), ranges: LinkedRichRange[] = [];
    doc.forEach((node, pos, index) => {
      const block = snapshot.positions[index];
      if (!block || block.start >= selection.end || block.end <= selection.start) return;
      const map = this.selectionMap(node, snapshot.text.slice(block.start, block.end), snapshot.definitions);
      const overlaps = (unit: SelectionSpan) => block.start + unit.start < selection.end && block.start + unit.end > selection.start;
      const touched = map.spans.filter(overlaps);
      // A URL/delimiter without visible characters belongs to its smallest
      // inline wrapper. Never search for another occurrence of its label.
      if (!touched.length) {
        const wrapper = map.wrappers.filter(overlaps).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
        if (wrapper) touched.push(wrapper);
      }
      for (const unit of touched) {
        const from = pos + unit.from, to = pos + unit.to, last = ranges[ranges.length - 1];
        if (last && from <= last.to) last.to = Math.max(last.to, to);
        else ranges.push({ from, to });
      }
    });
    return ranges;
  }
  prepare(transaction: Transaction, state?: EditorState): RichSourceSnapshot {
    if (!this.current) throw new Error('RICH_SOURCE_NOT_INITIALIZED');
    const derived = transaction.getMeta('richSourceDerived') as { text: string; positions: SourcePosition[]; definitions: Definitions } | undefined;
    if (derived) {
      this.pendingHistory.set(transaction.doc, this.pendingHistory.get(transaction.before) || this.current);
      const nodes: ProseMirrorNode[] = []; transaction.doc.forEach(node => nodes.push(node));
      nodes.forEach((node, index) => this.sources.set(node, derived.text.slice(derived.positions[index]?.start || 0, derived.positions[index]?.end || 0)));
      const snapshot = { ...derived, doc: transaction.doc, nodes }; this.snapshots.set(transaction.doc, snapshot); return snapshot;
    }
    // ProseMirror 1.x groups history by SelectionBookmark objects in its
    // branch items. Key source provenance weakly by those actual event keys:
    // its configured depth/compression/redo clearing controls our retention.
    // No per-keystroke parent chain or independent, divergent undo stack.
    const plugin = historyPlugin(state);
    const previousHistory = plugin?.getState(state!) as HistoryState | undefined;
    const history = plugin && isHistoryTransaction(transaction) ? transaction.getMeta(plugin) as { redo: boolean; historyState: HistoryState } : undefined;
    if (history && previousHistory) {
      const event = latestHistoryEvent(history.redo ? previousHistory.undone : previousHistory.done);
      const inverse = latestHistoryEvent(history.redo ? history.historyState.done : history.historyState.undone);
      if (inverse) this.historySources.set(inverse, this.current);
      const restored = event && this.historySources.get(event);
      if (restored && restored.doc.eq(transaction.doc)) {
        const nodes: ProseMirrorNode[] = []; transaction.doc.forEach(node => nodes.push(node));
        nodes.forEach((node, index) => this.sources.set(node, restored.text.slice(restored.positions[index].start, restored.positions[index].end)));
        const snapshot = { ...restored, doc: transaction.doc, nodes }; this.snapshots.set(transaction.doc, snapshot); return snapshot;
      }
    } else this.pendingHistory.set(transaction.doc, this.current);
    let old = this.snapshots.get(transaction.before) || this.current;
    transaction.steps.forEach((_step, index) => {
      const doc = transaction.docs[index + 1] || transaction.doc;
      const ranges: RichMutation[] = [];
      transaction.mapping.maps[index].forEach((from, to, nextFrom, nextTo) => ranges.push({ from, to, nextFrom, nextTo }));
      old = this.snapshot(doc, old, ranges.length === 1 ? ranges[0] : undefined);
    });
    return old;
  }
  snapshot(doc: ProseMirrorNode, old = this.current, mutation?: RichMutation): RichSourceSnapshot {
    const cached = this.snapshots.get(doc);
    if (cached) return cached;
    const nodes: ProseMirrorNode[] = [], oldOffsets: number[] = [], nextOffsets: number[] = [];
    const definitions = new Map<string, { url?: string; title?: string | null }>();
    doc.descendants(node => {
      if (node.type.name !== 'rawBlock') return;
      let found = this.rawDefinitions.get(node);
      if (!found) { found = collectDefinitions(markdownParser.parse(String(node.attrs.source || ''))); this.rawDefinitions.set(node, found); }
      found.forEach((definition, identifier) => { if (!definitions.has(identifier)) definitions.set(identifier, definition); });
      return false;
    });
    doc.forEach(node => nodes.push(node));
    old.doc.forEach((_node, offset) => oldOffsets.push(offset + 1));
    doc.forEach((_node, offset) => nextOffsets.push(offset + 1));
    let prefix = 0, end = old.nodes.length, nextEnd = nodes.length;
    while (prefix < end && prefix < nextEnd && old.nodes[prefix] === nodes[prefix]) prefix++;
    while (end > prefix && nextEnd > prefix && old.nodes[end - 1] === nodes[nextEnd - 1]) { end--; nextEnd--; }
    const sameCount = end - prefix === nextEnd - prefix;
    const eol = old.text.includes('\r\n') ? '\r\n' : '\n';
    const oldIndices = new Map(old.nodes.map((node, index) => [node, index]));
    const blocks = nodes.map((node, index) => {
      const preserved = this.sources.get(node);
      if (preserved !== undefined) return preserved;
      const previous = sameCount && index >= prefix && index < nextEnd ? old.nodes[index] : undefined;
      const local = mutation && previous && mutation.from >= oldOffsets[index] && mutation.to <= oldOffsets[index] + previous.content.size
        ? { from: mutation.from - oldOffsets[index], to: mutation.to - oldOffsets[index], nextFrom: mutation.nextFrom - nextOffsets[index], nextTo: mutation.nextTo - nextOffsets[index] } : undefined;
      let value: string;
      value = previous ? patchMappedBlock(previous.toJSON(), node.toJSON(), this.sources.get(previous) || '', definitions, local, this.blockMaps.get(previous), map => this.blockMaps.set(node, map)) : serializeRichBlock(node.toJSON()).replace(/\n/g, eol);
      this.sources.set(node, value);
      return value;
    });
    const positions: SourcePosition[] = [];
    const pieces: string[] = [];
    let offset = 0;
    const append = (value: string) => { pieces.push(value); offset += value.length; };
    append(old.text.slice(0, old.positions[0]?.start || 0));
    blocks.forEach((block, index) => {
      if (index) {
        const oldLeft = oldIndices.get(nodes[index - 1]) ?? -1, oldRight = oldIndices.get(nodes[index]) ?? -1;
        if (sameCount || oldLeft >= 0 && oldRight === oldLeft + 1) {
          const left = sameCount ? index - 1 : oldLeft, right = sameCount ? index : oldRight;
          append(old.text.slice(old.positions[left]?.end || 0, old.positions[right]?.start || 0));
        } else append(eol + eol);
      }
      positions.push({ start: offset, end: offset + block.length }); append(block);
    });
    append(old.text.slice(old.positions[old.positions.length - 1]?.end || 0));
    const result = { doc, text: pieces.join(''), positions, nodes, definitions };
    this.snapshots.set(doc, result);
    return result;
  }
  refreshReferences(state: EditorState) {
    const snapshot = this.snapshot(state.doc);
    const key = (definitions: Definitions) => JSON.stringify([...definitions].map(([id, value]) => [id, value.url, value.title || null]));
    if (key(snapshot.definitions) === key(this.current.definitions)) return null;
    const parsed = parseRichMarkdown(snapshot.text);
    const desired = state.schema.nodeFromJSON(parsed.document);
    if (desired.eq(state.doc)) return null;
    const transaction = state.tr;
    const oldNodes: { node: ProseMirrorNode; offset: number }[] = [], nextNodes: ProseMirrorNode[] = [];
    state.doc.forEach((node, offset) => oldNodes.push({ node, offset })); desired.forEach(node => nextNodes.push(node));
    const refresh = (node: ProseMirrorNode, next: ProseMirrorNode, offset: number) => {
      // A raw widget remains the user's editing surface while its definition
      // is temporarily incomplete. Refresh dependent labels/links, never
      // replace the widget itself with the partial source's parsed paragraph.
      if (node.type.name === 'rawBlock' || node.eq(next)) return;
      if (node.sameMarkup(next) && !node.isLeaf) {
        if (!node.isTextblock) {
          const children: { node: ProseMirrorNode; offset: number }[] = [];
          node.forEach((child, childOffset) => children.push({ node: child, offset: offset + 1 + childOffset }));
          refreshChildren(children, Array.from({ length: next.childCount }, (_, index) => next.child(index)));
          return;
        }
        const start = node.content.findDiffStart(next.content), end = node.content.findDiffEnd(next.content);
        if (start !== null && end) {
          const overlap = start - Math.min(end.a, end.b);
          transaction.replaceWith(offset + 1 + start, offset + 1 + end.a + Math.max(0, overlap), next.content.cut(start, end.b + Math.max(0, overlap)));
        }
      } else transaction.replaceWith(offset, offset + node.nodeSize, next);
    };
    const refreshChildren = (children: { node: ProseMirrorNode; offset: number }[], desired: ProseMirrorNode[]) => {
      const paired: { node: ProseMirrorNode; next: ProseMirrorNode; offset: number }[] = [];
      let cursor = 0;
      for (const child of children) {
        // A raw editing surface can temporarily spell several Markdown
        // blocks. Consume that parsed interval without replacing the atom,
        // then align and refresh the actual dependent siblings after it.
        if (child.node.type.name === 'rawBlock') {
          cursor += parseRichMarkdown(String(child.node.attrs.source || ''), snapshot.definitions).document.content?.length || 1;
        } else {
          const next = desired[cursor++];
          if (next) paired.push({ ...child, next });
        }
      }
      for (let index = paired.length - 1; index >= 0; index--) refresh(paired[index].node, paired[index].next, paired[index].offset);
    };
    refreshChildren(oldNodes, nextNodes);
    return transaction.docChanged ? transaction.setMeta('richSourceDerived', { text: snapshot.text, positions: snapshot.positions, definitions: parsed.definitions }) : null;
  }
  commit(doc: ProseMirrorNode, state?: EditorState) {
    const before = this.pendingHistory.get(doc);
    const plugin = historyPlugin(state);
    const history = plugin?.getState(state!) as HistoryState | undefined;
    const event = history && latestHistoryEvent(history.done);
    if (before && event && !this.historySources.has(event)) this.historySources.set(event, before);
    this.pendingHistory.delete(doc);
    this.current = this.snapshot(doc); return this.current;
  }
}
