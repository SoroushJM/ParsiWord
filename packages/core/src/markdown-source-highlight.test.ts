import { describe, expect, it } from 'vitest';
import { MarkdownSourceHighlighter } from './markdown-source-highlight';

const text = (source: string) => new MarkdownSourceHighlighter().highlight(source).map(line => line.tokens.map(token => token.text).join('') + line.newline).join('');
const kinds = (source: string) => new MarkdownSourceHighlighter().highlight(source).flatMap(line => line.tokens.map(token => token.kind));

describe('incremental Markdown source colors', () => {
  it.each(['', '\n', '\r\n', 'الف\r\nReact 19\n\tآخر\r', '# عنوان\n\n**متن** با \\* و $x^2$\n', '<script>literal & safe</script>\n', 'نام\u200cها و 👩🏽‍💻 (React)\n'])('preserves every source character: %j', source => expect(text(source)).toBe(source));

  it('colors structural and inline Markdown without replacing its markers', () => {
    const source = '# عنوان\n\n> - [x] **پررنگ** و *مورب* و ~~حذف~~ با `code` و $x$\n\n[نام](https://example.com/a)\n\n| نام | مقدار |\n| --- | --- |\n\\* نشان';
    expect(kinds(source)).toEqual(expect.arrayContaining(['heading', 'marker', 'quote', 'list', 'strong', 'emphasis', 'strike', 'code', 'math', 'link', 'url', 'table', 'escape']));
    expect(text(source)).toBe(source);
  });

  it('keeps fence length/type, display math and HTML comments across lines', () => {
    const highlighter = new MarkdownSourceHighlighter();
    const lines = highlighter.highlight('````ts\n# still code\n```\n````\n# heading\n$$\n# math\n$$\n<!-- comment\n# html\n-->\n# last');
    expect(lines[1].tokens[0].kind).toBe('code');
    expect(lines[2].tokens[0].kind).toBe('code');
    expect(lines[4].tokens.some(token => token.kind === 'heading')).toBe(true);
    expect(lines[6].tokens[0].kind).toBe('math');
    expect(lines[9].tokens[0].kind).toBe('html');
    expect(lines[11].tokens.some(token => token.kind === 'heading')).toBe(true);
  });

  it('reuses unchanged line objects and tokens after an ordinary edit or inserted line', () => {
    const highlighter = new MarkdownSourceHighlighter();
    const before = highlighter.highlight('# عنوان\n\nیک\n\nدو\n\nسه');
    const after = highlighter.highlight('# عنوان\n\nیک تازه\n\nدو\n\nسه');
    expect(after[0]).toBe(before[0]);
    expect(after[4]).toBe(before[4]);
    expect(after[4].tokens).toBe(before[4].tokens);
    expect(after[2].id).toBe(before[2].id);
    const inserted = highlighter.highlight('# عنوان\n\nیک تازه\nافزوده\n\nدو\n\nسه');
    expect(inserted[5]).toBe(after[4]);
  });

  it('invalidates following lines when a fence changes and stops once context matches', () => {
    const highlighter = new MarkdownSourceHighlighter();
    const before = highlighter.highlight('```\n# code\n```\n\n# unchanged');
    const after = highlighter.highlight('~~~\n# code\n```\n\n# unchanged');
    expect(after[4]).not.toBe(before[4]);
    expect(after[4].tokens[0].kind).toBe('code');
    const restored = highlighter.highlight('```\n# code\n```\n\n# unchanged');
    expect(restored[4].tokens.some(token => token.kind === 'heading')).toBe(true);
  });

  it('updates the preceding line when a setext underline is added or removed', () => {
    const highlighter = new MarkdownSourceHighlighter();
    highlighter.highlight('عنوان\nعادی\nبعد');
    const heading = highlighter.highlight('عنوان\n---\nبعد');
    expect(heading[0].tokens[0].kind).toBe('heading');
    const plain = highlighter.highlight('عنوان\nعادی\nبعد');
    expect(plain[0].tokens[0].kind).toBeUndefined();
  });

  it('treats escaped and incomplete delimiters as literal text', () => {
    const source = '\\**not bold\\** and `unfinished and [link and $math';
    expect(text(source)).toBe(source);
    expect(kinds(source)).not.toContain('strong');
    expect(kinds(source)).not.toContain('math');
  });

  it('bounds pathological single lines while preserving comment state and normal large documents', () => {
    const long = 'x'.repeat(25_000) + '<!--';
    const highlighter = new MarkdownSourceHighlighter();
    const lines = highlighter.highlight(long + '\n# comment\n-->\n# normal');
    expect(lines[0].tokens).toEqual([{ text: long }]);
    expect(lines[1].tokens[0].kind).toBe('html');
    expect(lines[3].tokens.some(token => token.kind === 'heading')).toBe(true);
    const large = '# عنوان\nمتن **پررنگ**\n'.repeat(20_000);
    expect(text(large)).toBe(large);
    expect(highlighter.highlight(large)[0].tokens.some(token => token.kind === 'heading')).toBe(true);
  });

  it('reuses a large newline-only suffix without exceeding the engine argument limit', () => {
    const highlighter = new MarkdownSourceHighlighter();
    const source = '\n'.repeat(150_000);
    const before = highlighter.highlight(source);
    const after = highlighter.highlight('متن' + source);
    expect(after).toHaveLength(before.length);
    expect(after[after.length - 1]).toBe(before[before.length - 1]);
    expect(after.map(line => line.tokens.map(token => token.text).join('') + line.newline).join('')).toBe('متن' + source);
  });
});
