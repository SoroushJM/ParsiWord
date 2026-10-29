import { describe, expect, it } from 'vitest';
import { externalLinkUrl, isMarkdownLink } from './markdown-link';

describe('Markdown link destinations', () => {
  it('keeps web URLs, encoded queries and normal application links', () => {
    for (const href of ['https://example.com/path?q=%D9%85#part', 'http://example.com/', 'mailto:hi@example.com', 'tel:+1234']) {
      expect(isMarkdownLink(href)).toBe(true);
      expect(externalLinkUrl(href)).toBe(href);
    }
  });
  it('resolves relative web links under the deployment directory', () => {
    const base = 'https://example.com/ParsiWord/en/';
    expect(externalLinkUrl('../guide?q=1#part', base)).toBe('https://example.com/ParsiWord/guide?q=1#part');
    expect(externalLinkUrl('//example.org/path', base)).toBe('https://example.org/path');
    expect(isMarkdownLink('./other%20file.md#part')).toBe(true);
    expect(externalLinkUrl('./other.md')).toBeNull();
    expect(externalLinkUrl('./other.md', 'file:///workspace/readme.md')).toBeNull();
  });
  it('rejects executable schemes, control characters, malformed URLs and unbounded requests', () => {
    for (const href of [undefined, null, true, [], {}, '', ' https://example.com', 'https://example.com ',
      'java\nscript:alert(1)', 'javascript:alert(1)', 'data:text/html,hi', 'command:workbench.action.closeAllEditors',
      'vscode:extension/command', 'file:///etc/passwd', 'https://', 'https://example.com\u0000', '\\server\\share', 'a'.repeat(8193)]) {
      expect(isMarkdownLink(href), String(href)).toBe(false);
      if (typeof href === 'string') expect(externalLinkUrl(href, 'https://example.com')).toBeNull();
    }
  });
});
