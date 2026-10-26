import { describe, expect, it } from 'vitest';
import { browserImageUrl, markdownImage } from './markdown-image';
import { parseRichMarkdown, serializeRichBlock } from './rich-editor-markdown';
import { patchRichBlock } from './rich-source';

describe('Markdown images in the editable preview', () => {
  it('reads an escaped local URL, Persian alt text and title without rewriting source', () => {
    const source = String.raw`![شرح &amp; تصویر](<./assets/a b.svg> "عنوان")`;
    expect(markdownImage(source)).toEqual({ url: './assets/a b.svg', alt: 'شرح & تصویر', title: 'عنوان' });
    const paragraph = parseRichMarkdown(source).document.content![0];
    expect(paragraph.content![0].type).toBe('rawInline');
    expect(paragraph.content![0].attrs?.image).toEqual(markdownImage(source));
    expect(serializeRichBlock(paragraph)).toBe(source);
  });

  it.each(['![متن][diagram]', '![diagram][]', '![diagram]'])('resolves reference image notation: %s', source => {
    const definitions = new Map([['diagram', { url: './assets/diagram.svg', title: 'شرح' }]]);
    const expected = { url: './assets/diagram.svg', alt: source.startsWith('![متن]') ? 'متن' : 'diagram', title: 'شرح' };
    expect(markdownImage(source, definitions)).toEqual(expected);
    const paragraph = parseRichMarkdown(source, definitions).document.content![0];
    expect(paragraph.content![0].attrs?.image).toEqual(expected);
    expect(serializeRichBlock(paragraph)).toBe(source);
  });

  it('preserves image spelling and unrelated CRLF/escape bytes while rich text changes next to it', () => {
    const source = String.raw`before ![تصویر](<./a b.png> 'عنوان') __bold__` + '\r\nnext \\*';
    const parsed = parseRichMarkdown(source);
    const previous = parsed.document.content![0];
    const next = structuredClone(previous);
    next.content![0].text = 'Before ';
    expect(patchRichBlock(previous, next, source, parsed.definitions)).toBe(source.replace('before', 'Before'));
  });

  it('keeps unresolved references and raw HTML as source widgets', () => {
    expect(markdownImage('![image][missing]')).toBeNull();
    expect(markdownImage('<img src="javascript:alert(1)">')).toBeNull();
    expect(markdownImage('![image](./a.png) trailing')).toBeNull();
    expect(markdownImage('![image](./a.png)\n\nother')).toBeNull();
  });

  it.each(['./assets/a b.svg', '../image.png', '/image.png', 'https://example.com/a.png', '//example.com/a.png', 'data:image/png;base64,eA=='])('allows browser image URL %s', source => {
    expect(browserImageUrl(source)).toBe(source);
  });

  it.each(['javascript:alert(1)', 'file:///C:/secret.png', 'command:workbench.action.closeWindow', 'data:text/html,<script>alert(1)</script>', ' https://example.com/a.png', 'java\nscript:alert(1)', '\\\\server\\image.png', 'blob:https://example.com/private'])('rejects application or malformed image URL %s', source => {
    expect(browserImageUrl(source)).toBeNull();
  });
});
