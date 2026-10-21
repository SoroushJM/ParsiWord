import bidiFactory from 'bidi-js';
// Unicode 18 BidiBrackets.txt (license: public/licenses/Unicode.txt).
// Prefer bidi-js's API and supply pairs absent from its older Unicode database.
import unicodePairs from './data/bracket-pairs.json';

const bidi = bidiFactory();
type Direction = 'rtl' | 'ltr';
export type DirectionSpan = {
  start: number; end: number; direction: Direction; needsBoundaryMarks: boolean;
  startRtlEmbedding?: boolean; endRtlEmbedding?: boolean;
};
const quotes: Record<string, string> = { '<': '>', '«': '»', '‹': '›', '“': '”', '‘': '’', '"': '"', "'": "'" };
const pairFallback = new Map(unicodePairs.map(([open, close]) => [open, close]));
const pairedCharacters = new Set(unicodePairs.flat());
const closingFallback = new Set(unicodePairs.map(([, close]) => close));
const charType = (character: string) => pairedCharacters.has(character) ? 'ON' : bidi.getBidiCharTypeName(character);
const closingKey = (character: string) => bidi.getCanonicalBracket(character) || character;
const isNumber = (type: string) => type === 'EN' || type === 'AN';

export function paragraphBaseDirection(text: string): Direction {
  // Older bidi-js data treats newly assigned brackets as strong L letters.
  // Paired punctuation cannot be the first strong script of a paragraph.
  const neutralized = Array.from(text, c => pairedCharacters.has(c) ? ' ' : c).join('');
  const paragraph = bidi.getEmbeddingLevels(neutralized).paragraphs[0];
  return paragraph && paragraph.level % 2 ? 'rtl' : 'ltr';
}

/** Word needs contextual runs, not the final visual levels of the bidi algorithm.
 * Keep spaces/punctuation in their phrase; never reorder or replace source text.
 * Offsets are UTF-16, like Markdown leaves. All boundaries remain code points.
 */
export function wordDirectionSpans(text: string, base: Direction, codeRanges: { start: number; end: number }[] = []): DirectionSpan[] {
  let offset = 0, codeIndex = 0;
  const chars = Array.from(text, character => {
    const type = charType(character);
    const start = offset;
    offset += character.length;
    while (codeIndex < codeRanges.length && codeRanges[codeIndex].end <= start) codeIndex++;
    const code = codeIndex < codeRanges.length && codeRanges[codeIndex].start <= start;
    return {
      character, type, start, end: offset, code,
      embeddingEnd: 0,
      direction: (type === 'R' || type === 'AL' ? 'rtl'
        : type === 'L' || isNumber(type) || code ? 'ltr' : undefined) as Direction | undefined,
    };
  });
  const needsLtrContext = base === 'rtl' || chars.some(c => c.type === 'R' || c.type === 'AL');
  const stack: { index: number; close: string }[] = [];
  const byClose = new Map<string, number[]>();
  // Prefix counts keep deeply nested brackets linear rather than rescanning them.
  const rtlCount = [0], ltrCount = [0];
  for (const c of chars) {
    rtlCount.push(rtlCount[rtlCount.length - 1] + Number(c.direction === 'rtl'));
    ltrCount.push(ltrCount[ltrCount.length - 1] + Number(c.direction === 'ltr'));
  }
  // A bracket group in LTR prose follows its first strong script. Merely
  // containing Persian must not turn (React و فارسی) into RTL punctuation.
  const nextStrong: number[] = Array(chars.length + 1).fill(chars.length);
  for (let i = chars.length - 1; i >= 0; i--) {
    nextStrong[i] = ['L', 'R', 'AL'].includes(chars[i].type) ? i : nextStrong[i + 1];
  }
  const explicitScopes = /[\u202a-\u202e\u2066-\u2069]/u.test(text);
  chars.forEach((c, index) => {
    if (c.character === "'" && chars[index - 1]?.type === 'L' && chars[index + 1]?.type === 'L') return;
    const matches = byClose.get(closingKey(c.character));
    if (matches?.length) {
      const matchingIndex = matches[matches.length - 1];
      const top = stack[matchingIndex];
      // An unmatched inner delimiter must not poison a valid enclosing pair,
      // e.g. {x < y}. Each frame is pushed/popped once, including malformed text.
      while (stack.length > matchingIndex) {
        const frame = stack.pop()!;
        byClose.get(frame.close)!.pop();
      }
      const hasRtl = rtlCount[index] > rtlCount[top.index + 1];
      const hasLtr = ltrCount[index] > ltrCount[top.index + 1];
      const first = nextStrong[top.index + 1];
      const firstDirection = first < index && chars[first].type === 'L' ? 'ltr' : 'rtl';
      const direction = c.code && chars[top.index].code ? 'ltr'
        : hasRtl && hasLtr ? (base === 'rtl' ? 'rtl' : firstDirection)
        : hasRtl ? 'rtl' : hasLtr ? 'ltr' : base;
      chars[top.index].direction = c.direction = direction;
      // Flat run properties cannot keep [فارسی (React 19)] together inside
      // English prose. Bound only that mixed RTL group with RLE/PDF. Word
      // already handles the established RTL-paragraph path without this.
      if (base === 'ltr' && hasRtl && hasLtr && direction === 'rtl' && !explicitScopes) {
        chars[top.index].embeddingEnd = c.end;
      }
    } else {
      const close = quotes[c.character] || bidi.openingToClosingBracket(c.character) || pairFallback.get(c.character);
      if (close) {
        const key = closingKey(close);
        if (!byClose.has(key)) byClose.set(key, []);
        byClose.get(key)!.push(stack.length);
        stack.push({ index, close: key });
      }
    }
  });
  // Attached signs belong to a number; terminal punctuation belongs to its word.
  chars.forEach((c, index) => {
    if (/^[+\-−$£€¥]$/u.test(c.character) && isNumber(chars[index + 1]?.type)) c.direction = 'ltr';
    if (/^[%٪]$/u.test(c.character) && isNumber(chars[index - 1]?.type)) c.direction = 'ltr';
    if (c.character === '+' && chars[index - 1]?.direction === 'ltr') c.direction = 'ltr';
    if (!c.direction && /^[.!?:;,…]$/u.test(c.character) && !isNumber(chars[index - 1]?.type)) c.direction = chars[index - 1]?.direction;
    if (c.type === 'NSM' || c.type === 'BN') c.direction = chars[index - 1]?.direction;
  });
  // Resolve a whole neutral gap once. Spaces between Latin words stay Latin;
  // at an RTL/LTR boundary they stay with the enclosing paragraph context.
  for (let i = 0; i < chars.length;) {
    if (chars[i].direction) { i++; continue; }
    const start = i;
    while (i < chars.length && !chars[i].direction) i++;
    const before = chars[start - 1]?.direction ?? base;
    const after = chars[i]?.direction ?? base;
    const direction = before === after ? before : base;
    for (let j = start; j < i; j++) chars[j].direction = direction;
  }
  const embeddingStarts = new Set<number>(), embeddingEnds = new Set<number>();
  let outerEnd = -1;
  for (const c of chars) {
    if (c.embeddingEnd && c.start >= outerEnd) {
      embeddingStarts.add(c.start); embeddingEnds.add(c.embeddingEnd);
      outerEnd = c.embeddingEnd;
    }
  }
  const spans: DirectionSpan[] = [];
  for (const c of chars) {
    const last = spans[spans.length - 1];
    if (last?.direction === c.direction && !embeddingStarts.has(c.start) && !embeddingEnds.has(c.start)) last.end = c.end;
    else spans.push({ start: c.start, end: c.end, direction: c.direction!, needsBoundaryMarks: false });
  }
  for (const span of spans) {
    if (embeddingStarts.has(span.start)) span.startRtlEmbedding = true;
    if (embeddingEnds.has(span.end)) span.endRtlEmbedding = true;
    const value = text.slice(span.start, span.end);
    const first = Array.from(value).map(charType).find(t => t === 'L' || isNumber(t));
    // Numeric identifiers and boundary punctuation (C++, quoted text, fn();)
    // need an LTR anchor in readers that resolve neutrals across run boundaries.
    // Paired closing brackets already have context; normal prose/plain digits
    // need no inserted marks. Existing explicit controls are preserved as-is.
    const characters = Array.from(value);
    const last = characters[characters.length - 1];
    const numeric = !!first && isNumber(first) && /[^\p{N}\p{M}]/u.test(value);
    const neutralEdge = (character: string) => {
      const type = charType(character);
      return type !== 'L' && !isNumber(type) && !/\s/u.test(character);
    };
    const punctuation = neutralEdge(characters[0]) || neutralEdge(last) && !bidi.closingToOpeningBracket(last) && !closingFallback.has(last);
    span.needsBoundaryMarks = needsLtrContext && span.direction === 'ltr' && (numeric || punctuation)
      && !/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value);
  }
  return spans;
}
