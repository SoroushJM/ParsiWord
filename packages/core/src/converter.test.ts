import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { defaultSettings, exportWord, exportPreparedWord, paragraphDirection, safeFilename, type ExportSettings } from './converter';
import { markdownContext, markdownParser, documentFontUsage } from './markdown';
import { samples } from './samples';
import { readFile } from 'node:fs/promises';

async function readDocument(markdown: string, options: Partial<ExportSettings> = {}) {
  const zip = await JSZip.loadAsync(await exportWord(markdown, { ...defaultSettings, ...options }));
  const xml = await zip.file('word/document.xml')!.async('string');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  return { zip, xml, document };
}
const elements = (el: ReturnType<DOMParser['parseFromString']>, tag: string) => Array.from(el.getElementsByTagName(tag));

describe('Word export preserves the document, with independent alignment and reading direction', () => {
  it('flows ordinary softlines and retains explicit hard breaks and code lines in actual OOXML', async () => {
    const { document } = await readDocument('one\r\ntwo   three\n\nfirst  \r\nsecond\\\nthird\n\n```txt\na\nb\n```');
    const paragraphs = elements(document, 'w:p');
    expect(paragraphs[0].textContent).toBe('one two   three');
    expect(paragraphs[0].getElementsByTagName('w:br')).toHaveLength(0);
    expect(paragraphs[1].textContent).toBe('firstsecondthird');
    expect(paragraphs[1].getElementsByTagName('w:br')).toHaveLength(2);
    expect(paragraphs.slice(-2).map(paragraph => paragraph.textContent)).toEqual(['a', 'b']);
  });
  it('exports a first nested reference definition as a real permitted hyperlink', async () => {
    const { document, zip } = await readDocument('> [REF]: https://first.example "first"\n\n[ref]: https://second.example\n\n[x][ReF] and [bad][unsafe]\n\n[unsafe]: javascript:alert');
    expect(elements(document, 'w:hyperlink')).toHaveLength(1);
    expect(elements(document, 'w:t').map(node => node.textContent).join('')).toBe('x and bad');
    const relationships = await zip.file('word/_rels/document.xml.rels')!.async('string');
    expect(relationships).toContain('https://first.example'); expect(relationships).not.toContain('https://second.example'); expect(relationships).not.toContain('javascript:');
  });
  it('shares one prepared parse across font discovery, diagrams and Word output', async () => {
    const parse = vi.spyOn(markdownParser, 'parse');
    try {
      const context = markdownContext('code `literal` and [x](https://example.com)');
      expect(documentFontUsage(context.root)).toEqual({ code: true, math: false });
      await exportPreparedWord(context, defaultSettings);
      expect(parse).toHaveBeenCalledTimes(1);
    } finally { parse.mockRestore(); }
  });
  it('captures output settings before asynchronous diagram work', async () => {
    const settings = { ...defaultSettings, title: 'Original title', direction: 'ltr' as const, fontSize: 12 };
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64'));
    const pending = exportWord('```mermaid\ngraph LR; A-->B\n```\n\nEnglish', settings, [], async () => { await ready; return { png, width: 10, height: 10, svg: '<svg/>' }; });
    settings.title = 'Mutated title'; settings.fontSize = 24; release();
    const zip = await JSZip.loadAsync(await pending);
    expect(await zip.file('docProps/core.xml')!.async('string')).toContain('Original title');
    expect(await zip.file('word/styles.xml')!.async('string')).toContain('w:sz w:val="24"');
    expect(await zip.file('word/styles.xml')!.async('string')).not.toContain('w:sz w:val="48"');
  });
  it('keeps actual Word text, styles, math and image assets independent of display theme', async () => {
    const source = '**Text** $x^2$\n\n```js\nconst value = 42;\n```\n\n```mermaid\ngraph LR; A-->B\n```';
    const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64'));
    const outputs = [];
    try {
      for (const theme of ['light', 'dark']) {
        vi.stubGlobal('document', { documentElement: { dataset: { theme } } });
        const zip = await JSZip.loadAsync(await exportWord(source, defaultSettings, [], async () => ({ png, width: 30, height: 20, svg: '<svg/>' })));
        outputs.push({ document: (await zip.file('word/document.xml')!.async('string')).replace(/r:embed="[^"]+"/g, 'r:embed="IMAGE"').replace(/<wp:docPr id="\d+"/g, '<wp:docPr id="IMAGE"'), styles: await zip.file('word/styles.xml')!.async('string'), images: await Promise.all(zip.file(/^word\/media\/.*\.png$/).map(file => file.async('base64'))) });
      }
    } finally { vi.unstubAllGlobals(); }
    expect(outputs[0]).toEqual(outputs[1]);
    expect(outputs[0].document).toContain('<m:oMath '); expect(outputs[0].images).toHaveLength(1);
  });
  it.each([
    'کتابخانهٔ React (version 19) را نصب کنید.',
    'قیمت محصول (250 USD) ثبت شد.',
    'این پروژه (React و TypeScript) روی اندروید اجرا می‌شود.',
    'این نسخه (شمارهٔ ۱۲۳) آماده است.',
    'نتیجه (مرحلهٔ اول (نسخهٔ آزمایشی)) تأیید شد.',
  ])('retains logical text and never applies RTL to strong Latin text: %s', async source => {
    const { document } = await readDocument(source);
    const runs = elements(document, 'w:r');
    expect(elements(document, 'w:t').map(el => el.textContent).join('').replace(/\u200e/g, '')).toBe(source);
    for (const run of runs) {
      if (run.getElementsByTagName('w:rtl').length) {
        expect(run.textContent).not.toMatch(/[A-Za-z]/u);
      }
    }
    expect(elements(document, 'w:dir')).toHaveLength(0);
    expect(elements(document, 'w:bdo')).toHaveLength(0);
  });

  it('keeps Persian words, spaces and brackets together, as in the device-tested A method', async () => {
    const source = 'این یک متن فارسی (توضیح تکمیلی) است.';
    const { document } = await readDocument(source);
    const runs = elements(document, 'w:r');
    expect(runs).toHaveLength(1);
    expect(runs[0].textContent).toBe(source);
    expect(runs[0].getElementsByTagName('w:rtl')).toHaveLength(1);
  });

  it('keeps an entire Latin phrase LTR across bold, italic and hyperlink boundaries', async () => {
    const { document, zip } = await readDocument('متن React (version **19** *stable* [docs](https://react.dev/)) ادامه');
    expect(elements(document, 'w:t').map(t => t.textContent).join('')).toBe('متن React (version 19 stable docs) ادامه');
    const latin = elements(document, 'w:r').filter(r => /React|19|stable|docs/u.test(r.textContent || ''));
    expect(latin).toHaveLength(4);
    for (const run of latin) expect(run.getElementsByTagName('w:rtl')).toHaveLength(0);
    expect(latin[1].getElementsByTagName('w:b')).toHaveLength(1);
    expect(latin[2].getElementsByTagName('w:i')).toHaveLength(1);
    expect(await zip.file('word/_rels/document.xml.rels')!.async('string')).toContain('https://react.dev/');
  });

  it('anchors only ambiguous numeric phrases, across styling, without changing the stored source', async () => {
    const source = 'مبلغ (**250** USD) و شماره ۱۲۳ ثبت شد.';
    const { document } = await readDocument(source);
    const texts = elements(document, 'w:t').map(t => t.textContent);
    expect(texts.join('')).toBe('مبلغ \u200e(250 USD)\u200e و شماره ۱۲۳ ثبت شد.');
    expect(texts.filter(t => t === '\u200e')).toHaveLength(2);
    expect(elements(document, 'w:r').find(r => r.textContent === '250')!.getElementsByTagName('w:b')).toHaveLength(1);
    expect(source).toBe('مبلغ (**250** USD) و شماره ۱۲۳ ثبت شد.');
  });

  it('keeps inline code punctuation LTR, preserves hard breaks and astral characters', async () => {
    const { document } = await readDocument('متن `fn(12);` و 🙂 **𝑥**  \nادامه (فارسی)');
    const texts = elements(document, 'w:t').map(t => t.textContent).join('');
    expect(texts).toBe('متن \u200efn(12);\u200e و 🙂 𝑥ادامه (فارسی)');
    expect(elements(document, 'w:br')).toHaveLength(1);
    const code = elements(document, 'w:r').find(r => r.textContent === 'fn(12);')!;
    expect(code).toBeTruthy();
    expect(code.getElementsByTagName('w:rtl')).toHaveLength(0);
  });

  it('embeds the selected regular and bold faces and sets all Word font script slots', async () => {
    const regular = new Uint8Array(await readFile('packages/core/public/fonts/Vazirmatn-Regular.ttf'));
    const bold = new Uint8Array(await readFile('packages/core/public/fonts/Vazirmatn-Bold.ttf'));
    const bytes = await exportWord('# عنوان فارسی\n\n**متن پررنگ**', defaultSettings, [{ family: 'Vazirmatn', arabic: true, regular, bold, savedAt: 0 }]);
    const zip = await JSZip.loadAsync(bytes);
    const fontTable = await zip.file('word/fontTable.xml')!.async('string');
    expect(fontTable).toContain('w:embedRegular'); expect(fontTable).toContain('w:embedBold');
    expect(fontTable).toContain('Vazirmatn');
    expect(zip.file(/word\/fonts\/.*\.odttf$/)).toHaveLength(2);
    const embedded = await zip.file('word/fonts/font1.odttf')!.async('uint8array');
    expect(Array.from(embedded.slice(32))).toEqual(Array.from(regular.slice(32)));
    const styles = await zip.file('word/styles.xml')!.async('string');
    expect(styles).toContain('w:cs="Vazirmatn"');
    expect(styles).toContain('w:ascii="Vazirmatn"');
  });
  it('preserves Persian, Latin, digits, nested brackets, emoji, and logical character order', async () => {
    const source = 'این متن (React 19) و (توضیح (شمارهٔ ۱۲۳)) درست است 🙂.';
    const { document } = await readDocument(source);
    const exported = elements(document, 'w:t').map(el => el.textContent).join('');
    expect(exported.replace(/\u200e/g, '')).toBe(source);
    expect(elements(document, 'w:bidi')[0].getAttribute('w:val')).not.toBe('false');
    const runs = elements(document, 'w:r');
    expect(runs.some(r => r.textContent?.includes('React') && r.getElementsByTagName('w:rtl').length === 0)).toBe(true);
    expect(runs.some(r => r.textContent?.includes('این') && r.getElementsByTagName('w:rtl').length > 0)).toBe(true);
  });

  it('retains formatting across a parenthetical phrase without reversing or replacing brackets', async () => {
    const { document } = await readDocument('متن **(React version 19)** ادامه');
    expect(elements(document, 'w:t').map(t => t.textContent).join('').replace(/\u200e/g, '')).toBe('متن (React version 19) ادامه');
    const english = elements(document, 'w:r').find(r => r.textContent?.includes('React'))!;
    expect(english.getElementsByTagName('w:rtl')).toHaveLength(0);
    expect(english.getElementsByTagName('w:b')).toHaveLength(1);
  });

  it('provides a distinct alignment-only comparison file', async () => {
    const { document } = await readDocument('متن (English) فارسی', { alignmentOnly: true });
    expect(elements(document, 'w:bidi')[0].getAttribute('w:val')).toBe('false');
    expect(elements(document, 'w:jc')[0].getAttribute('w:val')).toBe('right');
    expect(elements(document, 'w:rtl')).toHaveLength(0);
  });

  it('detects direction per paragraph, ignoring neutral punctuation and numbers', async () => {
    expect(paragraphDirection('(123) سلام', 'auto')).toBe('rtl');
    expect(paragraphDirection('(123) Hello', 'auto')).toBe('ltr');
    const { document } = await readDocument('متن فارسی\n\nEnglish paragraph (123)', { direction: 'auto' });
    const paragraphs = elements(document, 'w:p');
    expect(paragraphs[0].getElementsByTagName('w:bidi')[0].getAttribute('w:val')).not.toBe('false');
    expect(paragraphs[1].getElementsByTagName('w:bidi')[0].getAttribute('w:val')).toBe('false');
  });

  it('keeps code LTR while surrounding paragraphs are RTL', async () => {
    const { document } = await readDocument('متن فارسی\n\n```js\ncalculate(12, 34);\n```');
    const codeParagraph = elements(document, 'w:p').find(p => p.textContent?.includes('calculate'))!;
    expect(codeParagraph.textContent).toContain('calculate(12, 34);');
    expect(codeParagraph.getElementsByTagName('w:bidi')[0].getAttribute('w:val')).toBe('false');
    expect(codeParagraph.getElementsByTagName('w:jc')[0].getAttribute('w:val')).toBe('left');
  });

  it('exports actual table, numbering, nested list, checkbox, bold and hyperlink structures', async () => {
    const { document, zip } = await readDocument(samples[2].markdown + '\n\n**متن پررنگ**');
    expect(elements(document, 'w:tbl')).toHaveLength(1);
    expect(elements(document, 'w:bidiVisual')).toHaveLength(1);
    expect(elements(document, 'w:numPr').length).toBeGreaterThanOrEqual(7);
    expect(elements(document, 'w:t').map(t => t.textContent).join('')).toContain('☑');
    expect(elements(document, 'w:hyperlink')).toHaveLength(1);
    expect(elements(document, 'w:bCs').length).toBeGreaterThan(0);
    expect(await zip.file('word/numbering.xml')!.async('string')).toContain('w:lvl');
  });

  it('does not produce an active unsafe hyperlink or embed executable HTML', async () => {
    const { document, xml } = await readDocument('[متن](javascript:alert)\n\n<script>alert(1)</script>');
    expect(elements(document, 'w:hyperlink')).toHaveLength(0);
    expect(xml).not.toContain('<script>');
    expect(elements(document, 'w:t').map(t => t.textContent).join('')).toContain('<script>alert(1)</script>');
  });

  it('creates a usable blank document and safe file names', async () => {
    const { zip } = await readDocument('');
    expect(zip.file('[Content_Types].xml')).toBeTruthy();
    expect(safeFilename('../bad:name.docx')).toBe('-bad-name.docx');
    expect(safeFilename('یادداشت من')).toBe('یادداشت من.docx');
    expect(safeFilename('')).toBe('document.docx');
  });
  it('preserves a nested RTL phrase across styles and hyperlinks in an LTR paragraph', async () => {
    const { document, zip } = await readDocument('Read \\[مرحلهٔ اول (**React** [19](https://react.dev/))\\] then continue.');
    const value = elements(document, 'w:t').map(el => el.textContent).join('');
    expect(value.replace(/\u200e/g, '')).toBe('Read \u202b[مرحلهٔ اول (React 19)]\u202c then continue.');
    expect(elements(document, 'w:r').find(r => r.textContent === 'React')!.getElementsByTagName('w:b')).toHaveLength(1);
    expect(await zip.file('word/_rels/document.xml.rels')!.async('string')).toContain('https://react.dev/');
    expect(elements(document, 'w:dir')).toHaveLength(0);
  });
  it('keeps the comparison mode free of inserted scope controls', async () => {
    const { document } = await readDocument('Read \\[مرحلهٔ اول (React 19)\\] then continue.', { alignmentOnly: true });
    expect(elements(document, 'w:t').map(el => el.textContent).join('')).toBe('Read [مرحلهٔ اول (React 19)] then continue.');
  });
  it('embeds the rare-delimiter fallback and retains all original characters and styles', async () => {
    const { document, zip } = await readDocument('Read **⹕React و فارسی⹖** and ༺متن༻.', { fontFamily: 'Arial' });
    const text = elements(document, 'w:t').map(t => t.textContent).join('').replace(/[\u200e\u202b\u202c]/g, '');
    expect(text).toBe('Read ⹕React و فارسی⹖ and ༺متن༻.');
    const fallbackRuns = elements(document, 'w:r').filter(r => /[⹕⹖༺༻]/u.test(r.textContent || ''));
    expect(fallbackRuns).toHaveLength(4);
    for (const run of fallbackRuns) {
      const face = run.getElementsByTagName('w:rFonts')[0];
      for (const slot of ['ascii', 'hAnsi', 'eastAsia', 'cs']) expect(face.getAttribute(`w:${slot}`)).toBe('ParsiWord Symbols');
    }
    expect(fallbackRuns[0].getElementsByTagName('w:b')).toHaveLength(1);
    const latin = elements(document, 'w:r').find(r => r.textContent?.includes('React'))!;
    expect(latin.getElementsByTagName('w:rFonts')).toHaveLength(0);
    expect(await zip.file('word/fontTable.xml')!.async('string')).toContain('ParsiWord Symbols');
    expect(zip.file(/word\/fonts\/.*\.odttf$/)).toHaveLength(1);
  });
});
