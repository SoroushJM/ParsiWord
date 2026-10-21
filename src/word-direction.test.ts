import { describe, expect, it } from 'vitest';
import { wordDirectionSpans } from './word-direction';

function groups(text: string, base: 'rtl' | 'ltr' = 'rtl') {
  return wordDirectionSpans(text, base).map(s => ({ text: text.slice(s.start, s.end), dir: s.direction, marks: s.needsBoundaryMarks }));
}

describe('Word phrase context, independent from Markdown styling', () => {
  it('keeps ordinary Persian as a single contextual phrase', () => {
    expect(groups('این متن (توضیح تکمیلی) درست است.')).toEqual([
      { text: 'این متن (توضیح تکمیلی) درست است.', dir: 'rtl', marks: false },
    ]);
  });
  it('groups Latin words with their own brackets, keeping boundary spaces Persian', () => {
    expect(groups('کتابخانهٔ React (version 19) را نصب کنید.')).toEqual([
      { text: 'کتابخانهٔ ', dir: 'rtl', marks: false },
      { text: 'React (version 19)', dir: 'ltr', marks: false },
      { text: ' را نصب کنید.', dir: 'rtl', marks: false },
    ]);
  });
  it('keeps mixed-language outer brackets in Persian context', () => {
    expect(groups('این پروژه (React و TypeScript) اجرا می‌شود.')).toEqual([
      { text: 'این پروژه (', dir: 'rtl', marks: false },
      { text: 'React', dir: 'ltr', marks: false },
      { text: ' و ', dir: 'rtl', marks: false },
      { text: 'TypeScript', dir: 'ltr', marks: false },
      { text: ') اجرا می‌شود.', dir: 'rtl', marks: false },
    ]);
  });
  it.each([
    '(250 USD)', '123_456', '+98-21-12345678', '2026/10/21', '25%', '۲۵٪', '$250',
  ])('keeps a numeric identifier or amount in LTR order: %s', value => {
    const output = groups(`مقدار ${value} ثبت شد.`);
    expect(output.find(s => s.text === value)).toEqual({ text: value, dir: 'ltr', marks: true });
  });
  it.each([
    'https://example.com/docs?q=React#v19', 'user@example.com', 'C:\\src\\index.ts',
    '«Hello, world!»', "'don't'", '[React (version 19)]', 'مرحله (توضیح (React 19))',
  ])('preserves links, paths, quotes and nesting without substitutions: %s', value => {
    const text = `متن ${value} پایان`;
    const output = groups(text);
    expect(output.map(s => s.text).join('')).toBe(text);
    for (const span of output) if (span.dir === 'rtl') expect(span.text).not.toMatch(/[A-Za-z]/u);
    if (!value.startsWith('مرحله')) expect(output.some(s => s.text === value && s.dir === 'ltr')).toBe(true);
  });
  it('supports strong LTR scripts beyond ASCII, while keeping emoji intact', () => {
    const output = groups('سلام Ελληνικά и 中文 🙂 پایان');
    expect(output.map(s => s.text).join('')).toBe('سلام Ελληνικά и 中文 🙂 پایان');
    expect(output.find(s => s.dir === 'ltr')!.text).toBe('Ελληνικά и 中文');
  });
  it('uses LTR paragraph context around embedded Persian phrases', () => {
    expect(groups('Read (توضیح فارسی) here.', 'ltr')).toEqual([
      { text: 'Read ', dir: 'ltr', marks: false },
      { text: '(توضیح فارسی)', dir: 'rtl', marks: false },
      { text: ' here.', dir: 'ltr', marks: true },
    ]);
  });
  it.each(['C++', 'Hello!', '«Hello, world!»', 'fn(12);'])('anchors boundary punctuation in %s', value => {
    expect(groups(`متن ${value} پایان`).find(s => s.text === value)?.marks).toBe(true);
  });
  it('does not add marks to plain numbers, ordinary English, or existing explicit marks', () => {
    for (const text of ['شماره ۱۲۳ ثبت شد.', 'نسخه React 19 آماده است.', 'مبلغ \u200e250 USD\u200e ثبت شد.']) {
      expect(groups(text).some(s => s.marks)).toBe(false);
    }
  });
  it('anchors English punctuation in a forced RTL paragraph, without changing normal LTR text', () => {
    expect(groups('English (version 19).', 'rtl')[0].marks).toBe(true);
    expect(groups('English (version 19).', 'ltr')[0].marks).toBe(false);
    expect(groups('(250 USD)', 'rtl')[0].marks).toBe(true);
  });
});
