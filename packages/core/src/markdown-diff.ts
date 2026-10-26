import { diffArrays, type ArrayChange } from 'diff';
export type DocumentComparison = { side: 'original' | 'modified'; other: string; staged: boolean };

export type DiffRange = { start: number; end: number };
export type DiffLine = { kind: 'insert' | 'delete'; words: DiffRange[] };
export type DiffSide = { kind: DiffLine['kind']; lines: ReadonlyMap<number, DiffLine>; ranges: DiffRange[]; anchors: number[]; count: number };
export type MarkdownDiff = { original: DiffSide; modified: DiffSide; coarse: boolean };
const normalize = (text: string) => text.replace(/\r\n?/g, '\n');
const wordTokens = (text: string) => text.match(/\s+|[\p{L}\p{N}\p{M}\u200c]+|[^\s]/gu) ?? [];

/** Source offsets only; decorations never enter the Markdown or undo history. */
export function compareMarkdown(before: string, after: string, maxEditLength = 2048): MarkdownDiff {
  const oldText = normalize(before), newText = normalize(after);
  const oldLines = oldText ? oldText.split('\n') : [], newLines = newText ? newText.split('\n') : [];
  const side = (kind: DiffLine['kind']): DiffSide => ({ kind, lines: new Map(), ranges: [], anchors: [], count: 0 });
  const original = side('delete'), modified = side('insert');
  const offsets = (lines: string[]) => { let offset = 0; return lines.map(line => { const start = offset; offset += line.length + 1; return start; }); };
  const oldOffsets = offsets(oldLines), newOffsets = offsets(newLines);
  let changes = diffArrays(oldLines, newLines, { timeout: 40, maxEditLength });
  const coarse = !changes;
  if (!changes) {
    // Bound worst-case comparisons. Keep common prefix/suffix untouched and
    // identify the remaining region honestly as a coarse block comparison.
    let start = 0, oldEnd = oldLines.length, newEnd = newLines.length;
    while (start < oldEnd && start < newEnd && oldLines[start] === newLines[start]) start++;
    while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) { oldEnd--; newEnd--; }
    const part = (value: string[], added = false, removed = false): ArrayChange<string> => ({ value, count: value.length, added, removed });
    changes = [part(oldLines.slice(0, start)), part(oldLines.slice(start, oldEnd), false, true), part(newLines.slice(start, newEnd), true), part(oldLines.slice(oldEnd))].filter(change => change.count);
  }
  let oldAt = 0, newAt = 0, budget = 100_000;
  for (let index = 0; index < changes.length; index++) {
    const change = changes[index];
    if (!change.added && !change.removed) { oldAt += change.count; newAt += change.count; continue; }
    const removed: string[] = [], inserted: string[] = [];
    while (index < changes.length && (changes[index].added || changes[index].removed)) {
      const item = changes[index++];
      const target = item.removed ? removed : inserted;
      for (const line of item.value) target.push(line);
    }
    index--;
    original.anchors.push(Math.min(oldOffsets[oldAt] ?? oldText.length, oldText.length));
    modified.anchors.push(Math.min(newOffsets[newAt] ?? newText.length, newText.length));
    const add = (target: DiffSide, lines: string[], at: number, starts: number[], length: number) => {
      if (!lines.length) return;
      target.count += lines.length;
      const start = starts[at];
      target.ranges.push({ start, end: Math.min(starts[at + lines.length] ?? length, length) });
      // Matches the source mirror's existing DOM limit. Rich blocks use the
      // compact ranges even when a very large source stays in plain mode.
      for (let line = 0; line < lines.length && at + line < 6000; line++) (target.lines as Map<number, DiffLine>).set(at + line, { kind: target.kind, words: [{ start: 0, end: lines[line].length }] });
    };
    add(original, removed, oldAt, oldOffsets, oldText.length);
    add(modified, inserted, newAt, newOffsets, newText.length);
    for (let line = 0; line < Math.min(removed.length, inserted.length); line++) {
      const oldLine = original.lines.get(oldAt + line), newLine = modified.lines.get(newAt + line);
      const cost = removed[line].length + inserted[line].length;
      if (!oldLine || !newLine || cost > 10_000 || cost > budget) continue;
      budget -= cost;
      const words = diffArrays(wordTokens(removed[line]), wordTokens(inserted[line]), { timeout: 5, maxEditLength: 256 });
      if (!words) continue;
      oldLine.words = []; newLine.words = [];
      let oldOffset = 0, newOffset = 0;
      for (const word of words) {
        const size = word.value.join('').length;
        if (word.removed) oldLine.words.push({ start: oldOffset, end: oldOffset + size });
        if (word.added) newLine.words.push({ start: newOffset, end: newOffset + size });
        if (!word.added) oldOffset += size;
        if (!word.removed) newOffset += size;
      }
    }
    oldAt += removed.length; newAt += inserted.length;
  }
  return { original, modified, coarse };
}

export function changedBlock(diff: DiffSide | undefined, start: number, end: number) {
  return diff?.ranges.some(range => start < range.end && end > range.start) ? diff.kind : undefined;
}
