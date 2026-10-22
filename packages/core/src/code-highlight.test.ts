import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { highlightCode, supportedCodeLanguages } from './code-highlight';
import { exportWord, defaultSettings } from './converter';
import { samples } from './data/code-samples.json';

const original = (result: ReturnType<typeof highlightCode>) => result.lines.map(line => line.map(t => t.text).join('')).join('\n');
describe('offline syntax highlighting shared by preview and Word', () => {
  it('loads exactly the requested 36 common grammars and their aliases', () => {
    expect(supportedCodeLanguages).toHaveLength(36);
    expect(samples.map(s => s.language).sort()).toEqual(supportedCodeLanguages.map(l => l.id).sort());
    expect(highlightCode('const n = 19;', 'JS').language).toBe('javascript');
    expect(highlightCode('const n: number = 19;', 'ts').language).toBe('typescript');
    expect(highlightCode('<p>Hello</p>', 'html').language).toBe('xml');
    expect(highlightCode('void main() {}', 'dart').language).toBeUndefined();
  });
  it.each(samples)('preserves every character and produces scopes for $language', sample => {
    const result = highlightCode(sample.source, sample.language);
    expect(original(result)).toBe(sample.source);
    expect(result.language).toBe(sample.language);
    if (sample.language !== 'plaintext') expect(result.lines.flat().some(token => token.scope)).toBe(true);
  });
  it('keeps tabs, blank lines, trailing newlines, multiline styles and HTML-like strings', () => {
    const source = '/* first\nsecond */\n\n\tconst html = "<tag>&\\\"</tag>"; // فارسی (توضیح)\n';
    const result = highlightCode(source, 'typescript');
    expect(original(result)).toBe(source);
    expect(result.lines[0][0]).toMatchObject({ scope: 'comment', italic: true });
    expect(result.lines[1][0]).toMatchObject({ scope: 'comment', italic: true });
    expect(result.lines[2]).toEqual([]);
    expect(result.lines[3].some(token => token.text.includes('<tag>'))).toBe(true);
    expect(result.lines[4]).toEqual([]);
  });
  it.each([undefined, 'unknown-language', 'plaintext'])('keeps %s blocks literal without guessing another language', language => {
    const source = '<script>alert("(فارسی)")</script>\n\t[]{}';
    const result = highlightCode(source, language);
    expect(original(result)).toBe(source);
    expect(result.lines.flat().every(t => !t.scope)).toBe(true);
  });
  it('preserves enormous blocks without running the syntax grammar', () => {
    const source = 'const x = 19;\n'.repeat(4000);
    const result = highlightCode(source, 'js');
    expect(original(result)).toBe(source);
    expect(result.lines.flat().every(t => !t.scope)).toBe(true);
  });
  it('exports real editable colors, labels, blank lines and LTR code without changing the source', async () => {
    const source = 'const n = 19;\n\n\tconst title = "<React (version 19)>"; // فارسی';
    const zip = await JSZip.loadAsync(await exportWord(`متن فارسی\n\n\`\`\`typescript\n${source}\n\`\`\``, defaultSettings));
    const xml = await zip.file('word/document.xml')!.async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
    const text = (p: (typeof paragraphs)[number]) => Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join('');
    const header = paragraphs.findIndex(p => text(p) === 'TypeScript');
    expect(header).toBeGreaterThan(0);
    const code = paragraphs.slice(header + 1);
    expect(code.map(text).join('\n')).toBe(source);
    for (const p of code) {
      expect(p.getElementsByTagName('w:bidi')[0].getAttribute('w:val')).toBe('false');
      expect(p.getElementsByTagName('w:rtl')).toHaveLength(0);
      for (const font of Array.from(p.getElementsByTagName('w:rFonts'))) {
        expect(font.getAttribute('w:ascii')).toBe('Noto Sans Mono');
        expect(font.getAttribute('w:cs')).toBe('Vazirmatn');
      }
    }
    for (const color of ['CF222E', '0550AE', '0A3069', '57606A']) expect(xml).toContain(`w:color w:val="${color}"`);
    expect(code[2].getElementsByTagName('w:i').length).toBeGreaterThan(0);
    expect(zip.file(/word\/media\//)).toHaveLength(0);
  });
});
