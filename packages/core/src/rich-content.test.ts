import { describe, expect, it, vi } from 'vitest';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { createWord, defaultSettings, exportWord } from './converter';
import { wordMath } from './math';

async function document(markdown: string) {
  const zip = await JSZip.loadAsync(await exportWord(markdown, defaultSettings));
  const xml = await zip.file('word/document.xml')!.async('string');
  return { xml, doc: new DOMParser().parseFromString(xml, 'application/xml') };
}
describe('editable Word equations', () => {
  it.each([
    ['\\frac{a}{b}', 'm:f'], ['\\sqrt{x}', 'm:rad'], ['x^2', 'm:sSup'],
    ['x_i', 'm:sSub'], ['\\sum_{i=0}^{n}i', 'm:nary'],
    ['\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', 'm:m'],
  ])('preserves native equation structure for %s', async (source, tag) => {
    const { xml, doc } = await document(`$$\n${source}\n$$`);
    expect(doc.getElementsByTagName('m:oMath')).toHaveLength(1);
    expect(doc.getElementsByTagName(tag).length).toBeGreaterThan(0);
    expect(xml).not.toContain('undefined');
    expect(doc.getElementsByTagName('m:oMath')[0].parentNode?.nodeName).toBe('w:p');
    expect(doc.getElementsByTagName('w:rtl')).toHaveLength(0);
  });
  it('attaches a structured integrand so a complete integral has no empty operand placeholder', async () => {
    const { doc } = await document('$$\n\\int_0^1 x^2\\,dx=\\frac{1}{3}\n$$');
    const nary = doc.getElementsByTagName('m:nary')[0];
    const operand = Array.from(nary.childNodes).find(n => n.nodeName === 'm:e')!;
    expect(operand.textContent).toBe('x2');
    expect((operand as unknown as Element).getElementsByTagName('m:sSup')).toHaveLength(1);
  });
  it.each([
    ['\\left\\{\\sum_{k=1}^{n} k\\right\\}=1', 'k', '}=1'],
    ['\\left(\\sum_{i=1}^{n} x+1\\right)', 'x', '+1)'],
    ['\\sum_{i=1}^{n} i=10', 'i', '=10'],
  ])('preserves the operand and following punctuation for %s', async (source, body, tail) => {
    const { doc } = await document(`$$\n${source}\n$$`);
    const nary = doc.getElementsByTagName('m:nary')[0];
    const operand = Array.from(nary.childNodes).find(n => n.nodeName === 'm:e')!;
    expect(operand.textContent).toBe(body);
    expect(Array.from(operand.childNodes).every(n => n.nodeType === 1)).toBe(true);
    const following = [];
    for (let next = nary.nextSibling; next; next = next.nextSibling) following.push(next.textContent);
    expect(following.join('')).toBe(tail);
  });
  it('names the embedded math font on native runs and in document settings', async () => {
    const { doc, xml } = await document('$x^2+1$');
    for (const run of Array.from(doc.getElementsByTagName('m:r'))) {
      expect(run.getElementsByTagName('w:rFonts')[0].getAttribute('w:ascii')).toBe('STIX Two Math');
    }
    expect(xml).not.toContain('Cambria Math');
  });
  it('isolates inline equations from Persian direction and keeps styled text and links', async () => {
    const { doc } = await document('رابطهٔ **$x^2$** و [فرمول $a+b$](https://example.com) برقرار است.');
    expect(doc.getElementsByTagName('m:oMath')).toHaveLength(2);
    expect(doc.getElementsByTagName('w:bidi')).toHaveLength(1);
    expect(doc.getElementsByTagName('w:hyperlink')[0].getElementsByTagName('m:oMath')).toHaveLength(1);
    expect(Array.from(doc.getElementsByTagName('w:t')).map(e => e.textContent).join('')).toContain('رابطهٔ ');
  });
  it('supports math fences and keeps ordinary code literal', async () => {
    const { doc } = await document('```latex\nx^2\n```\n\n```js\n$x^2$\n```');
    expect(doc.getElementsByTagName('m:oMath')).toHaveLength(1);
    expect(Array.from(doc.getElementsByTagName('w:t')).map(e => e.textContent).join('')).toContain('$x^2$');
  });
  it('escapes XML-sensitive equation text', async () => {
    const { xml, doc } = await document('$a<b$');
    expect(Array.from(doc.getElementsByTagName('m:t')).map(t => t.textContent).join('')).toBe('a<b');
    expect(xml).toContain('&lt;');
  });
  it('refuses invalid and unsupported formulas rather than dropping their structure', () => {
    expect(() => wordMath('\\thisIsNotLaTeX{x}')).toThrow(/فرمول/);
    expect(() => wordMath('\\phantom{x}')).toThrow(/فرمول/);
    expect(() => wordMath('x'.repeat(20_001))).toThrow(/طولانی/);
  });
});
describe('Word diagrams', () => {
  const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9V0AAAAASUVORK5CYII=', 'base64'));
  const source = 'flowchart LR\nA --> B';
  it('prepares nested diagrams once and embeds actual PNG with source alt text, fitted to the page', async () => {
    const renderer = vi.fn(async () => ({ png, svg: '', width: 2000, height: 1000 }));
    const markdown = `> \`\`\`mermaid\n> ${source.replace(/\n/g, '\n> ')}\n> \`\`\`\n\n\`\`\`mermaid\n${source}\n\`\`\``;
    const zip = await JSZip.loadAsync(await exportWord(markdown, defaultSettings, [], renderer));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(xml).toContain('wp:docPr'); expect(xml).toContain('flowchart LR');
    expect(xml).toContain('cx="5905500"'); // 620 px * 9525 EMU
    const media = zip.file(/word\/media\/.*\.png$/);
    expect(media).toHaveLength(1);
    expect(await media[0].async('uint8array')).toEqual(png);
  });
  it('refuses an unprepared or failed diagram rather than silently exporting code', async () => {
    const markdown = `\`\`\`mermaid\n${source}\n\`\`\``;
    expect(() => createWord(markdown, defaultSettings)).toThrow(/نمودار/);
    await expect(exportWord(markdown, defaultSettings, [], async () => { throw new Error('invalid diagram'); })).rejects.toThrow('invalid diagram');
    // The synchronous builder still accepts ordinary documents for existing tools.
    expect(await Packer.toArrayBuffer(createWord('متن', defaultSettings))).toBeTruthy();
  });
});
