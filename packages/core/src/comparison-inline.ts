import { diffArrays, type ArrayChange } from 'diff';

export type ComparisonPart = { kind: 'same' | 'delete' | 'insert'; text: string; change: number };
/** A bounded, ordered review stream. The result is never an editable draft. */
export function inlineParts(original: string[], modified: string[], maxEditLength = 2048): ComparisonPart[] {
  let changes = diffArrays(original, modified, { timeout: 40, maxEditLength });
  if (!changes || changes.length > 160) {
    let start = 0, oldEnd = original.length, newEnd = modified.length;
    while (start < oldEnd && start < newEnd && original[start] === modified[start]) start++;
    while (oldEnd > start && newEnd > start && original[oldEnd - 1] === modified[newEnd - 1]) { oldEnd--; newEnd--; }
    const part = (value: string[], added = false, removed = false): ArrayChange<string> => ({ value, count: value.length, added, removed });
    changes = [part(original.slice(0, start)), part(original.slice(start, oldEnd), false, true), part(modified.slice(start, newEnd), true), part(original.slice(oldEnd))].filter(item => item.count);
  }
  let change = -1, changing = false;
  return changes.map(item => {
    if (item.added || item.removed) { if (!changing) change++; changing = true; } else changing = false;
    return { kind: item.removed ? 'delete' : item.added ? 'insert' : 'same', text: item.value.join(''), change: item.added || item.removed ? change : -1 };
  });
}
export const sourceUnits = (text: string): string[] => text.replace(/\r\n?/g, '\n').match(/[^\n]*\n|[^\n]+$/g) ?? [];
