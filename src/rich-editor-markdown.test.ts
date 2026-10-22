import { describe, expect, it } from 'vitest';
import { parseRichMarkdown, serializeRichBlock } from './rich-editor-markdown';

const roundtrip = (source: string) => {
  const before = parseRichMarkdown(source).document;
  const serialized = (before.content || []).map(serializeRichBlock).join('\n\n');
  return { before, after: parseRichMarkdown(serialized).document, serialized };
};

describe('rich editor Markdown roundtrip', () => {
  it.each([
    String.raw`قیمت \$5 و \$10 است.`,
    String.raw`\# این تیتر نیست`,
    String.raw`\- این فهرست نیست`,
    String.raw`1\. شماره`,
    String.raw`[نام](https://example.com/a\)b "عنوان \"نقل\"")`,
    String.raw`[نام](<https://example.com/a b> "شرح")`,
    String.raw`**![تصویر](https://example.com/a.png)**`,
    'کد ``a`b`` در متن است.',
  ])('preserves literal syntax, links and marks: %s', source => {
    const { before, after } = roundtrip(source);
    expect(after).toEqual(before);
  });

  it('preserves source bytes, code fence metadata and multiline math', () => {
    const source = '# عنوان\n\nمتن **پررنگ** با $x^2$\n\n```typescript title="test"\nconst text = `a\\b`;\nconst dollars = "$x";\n```\n\n$$\nx % توضیح\n+ y\n$$\n\n```mermaid\nflowchart LR\nA[شروع] --> B[پایان]\n```\n\n- [x] انجام‌شده\n- [ ] باقی\n\n| نام | مقدار |\n| --- | ---: |\n| الف | یک |';
    const { before, after } = roundtrip(source);
    expect(after).toEqual(before);
  });

  it('keeps line breaks entered inside a table cell', () => {
    const table = { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'خط اول' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'خط دوم' }] },
    ] }] }] };
    const source = serializeRichBlock(table);
    expect(source).toContain('خط اول<br>خط دوم');
    const parsed = parseRichMarkdown(source).document;
    expect(parsed.content?.[0].content?.[0].content?.[0].content?.[0].content).toEqual([
      { type: 'text', text: 'خط اول' }, { type: 'hardBreak' }, { type: 'text', text: 'خط دوم' },
    ]);
  });
});
