import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export type SearchMatch = { from: number; to: number };
export function searchPattern(query: string, matchCase = false) {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'gu' : 'giu');
}
export function findText(text: string, query: string, matchCase = false): SearchMatch[] {
  if (!query) return [];
  return Array.from(text.matchAll(searchPattern(query, matchCase)), match => ({ from: match.index, to: match.index + match[0].length }));
}
/** Inline marks do not split a match; block boundaries and atoms do. */
export function findRich(doc: ProseMirrorNode, query: string, matchCase = false): SearchMatch[] {
  const matches: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const text = node.textBetween(0, node.content.size, '', '\uFFFC');
    for (const match of findText(text, query, matchCase)) matches.push({ from: pos + 1 + match.from, to: pos + 1 + match.to });
    return false;
  });
  return matches;
}
export function linePosition(text: string, line: number, column = 1) {
  const lines = text.split('\n'), index = Math.max(0, Math.min(Math.trunc(line) - 1, lines.length - 1));
  let offset = 0;
  for (let at = 0; at < index; at++) offset += lines[at].length + 1;
  return offset + Math.max(0, Math.min(Math.trunc(column) - 1, lines[index].length));
}

/** Ranges over the decorative mirror only; never edits the source input. */
export function sourceRanges(root: Node, matches: SearchMatch[]) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: { node: Node; start: number; end: number }[] = [];
  let offset = 0, node: Node | null;
  while ((node = walker.nextNode())) {
    const end = offset + (node.textContent?.length ?? 0);
    nodes.push({ node, start: offset, end });
    offset = end;
  }
  const locate = (position: number) => {
    let low = 0, high = nodes.length - 1;
    while (low < high) { const mid = (low + high) >>> 1; if (nodes[mid].end < position) low = mid + 1; else high = mid; }
    return nodes[low];
  };
  return matches.flatMap(match => {
    const from = locate(match.from), to = locate(match.to);
    if (!from || !to || match.to > to.end) return [];
    const range = document.createRange(); range.setStart(from.node, match.from - from.start); range.setEnd(to.node, match.to - to.start);
    return [range];
  });
}
