import { describe, expect, it } from 'vitest';
import { paragraphBaseDirection, wordDirectionSpans } from './word-direction';
import pairs from '../tests/fixtures/unicode/bracket-pairs.json';

const extra = [
  { open: '<', close: '>', code: 'ASCII angles' },
  { open: '«', close: '»', code: 'guillemets' },
  { open: '‹', close: '›', code: 'single guillemets' },
  { open: '“', close: '”', code: 'double quotes' },
  { open: '‘', close: '’', code: 'single quotes' },
  { open: '"', close: '"', code: 'straight double quotes' },
  { open: "'", close: "'", code: 'straight single quotes' },
];

function at(text: string, index: number, base: 'rtl' | 'ltr') {
  return wordDirectionSpans(text, base).find(s => s.start <= index && s.end > index)!.direction;
}

describe('all Unicode 18 bidi bracket pairs plus ASCII angles and common quotes', () => {
  it('uses the complete 65-pair official Unicode fixture', () => expect(pairs).toHaveLength(65));
  it.each(pairs)('ignores $code when detecting the first strong paragraph script', pair => {
    expect(paragraphBaseDirection(pair.open + 'متن فارسی' + pair.close)).toBe('rtl');
    expect(paragraphBaseDirection(pair.open + 'React 19' + pair.close)).toBe('ltr');
  });
  for (const base of ['rtl', 'ltr'] as const) {
    for (const [payload, direction] of [
      ['توضیح فارسی ۱۲۳', 'rtl'], ['React version 19', 'ltr'],
      ['React و TypeScript', base], ['توضیح React 19', 'rtl'],
    ] as const) {
      it.each([...pairs, ...extra])(`${base}: $code wraps ${payload} as a complete ${direction} phrase`, pair => {
        const text = `پیش ${pair.open}${payload}${pair.close} پس`;
        const openIndex = 'پیش '.length, closeIndex = openIndex + pair.open.length + payload.length;
        expect(at(text, openIndex, base)).toBe(direction);
        expect(at(text, closeIndex, base)).toBe(direction);
        const spans = wordDirectionSpans(text, base);
        expect(spans.map(s => text.slice(s.start, s.end)).join('')).toBe(text);
        for (const span of spans) {
          const value = text.slice(span.start, span.end);
          if (span.direction === 'rtl') expect(value).not.toMatch(/[A-Za-z]/u);
          else expect(value).not.toMatch(/[آ-ی]/u);
        }
      });
    }
  }
  it('matches parentheses across line breaks in the same paragraph', () => {
    const text = 'متن <React\n(version 19)> پایان';
    expect(at(text, text.indexOf('<'), 'rtl')).toBe('ltr');
    expect(at(text, text.indexOf('>'), 'rtl')).toBe('ltr');
  });
  it('keeps an inner quote from breaking the enclosing bracket pair', () => {
    const text = 'متن {React "stable" (version 19)} پایان';
    for (const char of ['{', '}', '(', ')']) expect(at(text, text.indexOf(char), 'rtl')).toBe('ltr');
  });
  it('does not let a comparison sign poison an enclosing pair', () => {
    const text = 'متن {x < y} و [a > b] پایان';
    for (const char of ['{', '}', '[', ']']) expect(at(text, text.indexOf(char), 'rtl')).toBe('ltr');
  });
  it('matches canonically equivalent angle brackets without normalizing source text', () => {
    const text = 'متن 〈React〉 و 〈TypeScript〉 پایان';
    const spans = wordDirectionSpans(text, 'rtl');
    expect(spans.map(s => text.slice(s.start, s.end)).join('')).toBe(text);
    for (const char of ['〈', '〉', '〈', '〉']) expect(at(text, text.indexOf(char), 'rtl')).toBe('ltr');
  });
  it('preserves unmatched and crossed delimiters without dropping or replacing characters', () => {
    for (const text of ['متن ([React)] پایان', 'متن <React پایان', 'متن } React { فارسی', 'متن "don\'t" و «نقل‌قول»']) {
      const spans = wordDirectionSpans(text, 'rtl');
      expect(spans.map(s => text.slice(s.start, s.end)).join('')).toBe(text);
    }
  });
  it('processes 4,000 nested pairs and preserves astral characters at span boundaries', () => {
    const text = `متن ${'('.repeat(4000)}React 🙂 𝑥${')'.repeat(4000)} پایان`;
    const spans = wordDirectionSpans(text, 'rtl');
    expect(spans.map(s => text.slice(s.start, s.end)).join('')).toBe(text);
    for (const span of spans) {
      expect(text.charCodeAt(span.start)).not.toBe(0xde42);
      expect(text.charCodeAt(span.start)).not.toBe(0xdc65);
    }
  });
  it.each([...pairs, ...extra])('keeps $code in LTR context when the mixed cell starts with React', pair => {
    const text = pair.open + 'React و فارسی' + pair.close;
    const spans = wordDirectionSpans(text, 'ltr');
    expect(at(text, 0, 'ltr')).toBe('ltr');
    expect(at(text, text.length - pair.close.length, 'ltr')).toBe('ltr');
    expect(spans.some(s => s.startRtlEmbedding || s.endRtlEmbedding)).toBe(false);
  });
  it('bounds the full nested Persian phrase inside English with one balanced embedding', () => {
    const text = 'Read [مرحلهٔ اول (React 19)] then continue.';
    const spans = wordDirectionSpans(text, 'ltr');
    expect(spans.filter(s => s.startRtlEmbedding).map(s => s.start)).toEqual([text.indexOf('[')]);
    expect(spans.filter(s => s.endRtlEmbedding).map(s => s.end)).toEqual([text.indexOf(']') + 1]);
    expect(spans.map(s => text.slice(s.start, s.end)).join('')).toBe(text);
  });
  it('does not overflow embedding depth for 4,000 nested RTL groups', () => {
    const text = 'Read ' + '['.repeat(4000) + 'مرحله React' + ']'.repeat(4000) + ' next.';
    const spans = wordDirectionSpans(text, 'ltr');
    expect(spans.filter(s => s.startRtlEmbedding)).toHaveLength(1);
    expect(spans.filter(s => s.endRtlEmbedding)).toHaveLength(1);
  });
  it('respects existing explicit direction scopes', () => {
    const spans = wordDirectionSpans('Read \u202b[مرحله (React 19)]\u202c next.', 'ltr');
    expect(spans.some(s => s.startRtlEmbedding || s.endRtlEmbedding)).toBe(false);
  });
  it('retains the device-confirmed S09 path without embeddings', () => {
    const spans = wordDirectionSpans('متن <React\n(version 19)> تمام شد.', 'rtl');
    expect(spans.some(s => s.startRtlEmbedding || s.endRtlEmbedding)).toBe(false);
  });
});
