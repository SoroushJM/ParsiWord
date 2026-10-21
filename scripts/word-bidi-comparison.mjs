// Device diagnostic, not the production converter. Run with:
// node scripts/word-bidi-comparison.mjs
// All three pages contain the same logical text and formatting. Only the
// direction markup changes. An independent Chromium image provides a stable
// visual reference even when the Word reader interprets the native text badly.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import {
  AlignmentType, BuilderElement, Document, ImageRun, Packer, Paragraph, TextRun,
} from 'docx';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

const out = new URL('../artifacts/bidi-comparison/', import.meta.url);
await mkdir(out, { recursive: true });
const part = (text, dir = 'rtl', style = {}) => ({ text, dir, style });
const rows = [
  [part('این یک متن فارسی (توضیح تکمیلی) است.')],
  [part('این نسخه (شمارهٔ ۱۲۳) آماده است.')],
  [part('کتابخانهٔ '), part('React (version 19)', 'ltr'), part(' را نصب کنید.')],
  [part('این پروژه ('), part('React', 'ltr'), part(' و '), part('TypeScript', 'ltr'), part(') روی اندروید اجرا می‌شود.')],
  [part('قیمت محصول '), part('(250 USD)', 'ltr'), part(' ثبت شد.')],
  [part('نتیجه (مرحلهٔ اول (نسخهٔ آزمایشی)) تأیید شد.')],
  [part('توضیح '), part('(متن پررنگ)', 'rtl', { bold: true }), part(' و '), part('متن مورب (تکمیلی)', 'rtl', { italics: true }), part(' را ببینید.')],
  [part('این عبارت طولانی است تا در نمایش گوشی بشکند: کتابخانهٔ '), part('React (version ', 'ltr'), part('19', 'ltr', { bold: true }), part(')', 'ltr'), part(' را نصب کنید و نتیجه (مرحلهٔ اول (نسخهٔ آزمایشی)) را دوباره ببینید.')],
];
const english = 'This is an English sentence (with parentheses) and number 123.';
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const font = await readFile(new URL('../public/fonts/Vazirmatn-Regular.ttf', import.meta.url));
const boldFont = await readFile(new URL('../public/fonts/Vazirmatn-Bold.ttf', import.meta.url));
const toHtml = row => {
  let result = '';
  for (let i = 0; i < row.length;) {
    const direction = row[i].dir;
    let content = '';
    while (i < row.length && row[i].dir === direction) {
      const p = row[i++];
      const value = escape(p.text);
      content += p.style.bold ? `<b>${value}</b>` : p.style.italics ? `<i>${value}</i>` : value;
    }
    result += direction === 'ltr' ? `<bdi dir="ltr">${content}</bdi>` : content;
  }
  return result;
};
const browser = await chromium.launch();
let reference, referenceSize;
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html lang="fa"><meta charset="utf-8"><style>
    @font-face{font-family:Reference;src:url(data:font/ttf;base64,${font.toString('base64')})}
    @font-face{font-family:Reference;font-weight:700;src:url(data:font/ttf;base64,${boldFont.toString('base64')})}
    *{box-sizing:border-box}body{margin:0;background:white;color:#151515}
    #reference{padding:18px 26px;width:1000px;font:24px/1.7 Reference,sans-serif;border:2px solid #b7d6ce}
    p{direction:rtl;margin:0 0 9px}p:last-child{margin-bottom:0}
  </style><div id="reference">${rows.map(row => `<p dir="rtl">${toHtml(row)}</p>`).join('')}<p dir="ltr" style="direction:ltr;font-family:Arial,sans-serif">${english}</p></div></html>`);
  await page.evaluate(() => document.fonts.ready);
  const box = await page.locator('#reference').boundingBox();
  referenceSize = { width: 650, height: Math.round(box.height * 650 / box.width) };
  reference = await page.locator('#reference').screenshot({ path: new URL('reference.png', out).pathname });
} finally {
  await browser.close();
}

const embed = (direction, children) => new BuilderElement({
  name: 'w:dir', attributes: { direction: { key: 'w:val', value: direction } }, children,
});
const run = p => new TextRun({
  text: p.text, rightToLeft: p.dir === 'rtl' ? true : undefined,
  bold: p.style.bold, boldComplexScript: p.style.bold,
  italics: p.style.italics, italicsComplexScript: p.style.italics,
  language: { value: p.dir === 'rtl' ? 'fa-IR' : 'en-US', bidirectional: 'fa-IR' },
});
function nativeParagraph(row, method) {
  const children = [];
  for (let i = 0; i < row.length;) {
    const dir = row[i].dir;
    const group = [];
    while (i < row.length && row[i].dir === dir) group.push(run(row[i++]));
    if (dir === 'ltr' && method === 'B') children.push(embed('ltr', group));
    else if (dir === 'ltr' && method === 'C') children.push(new TextRun('\u200e'), ...group, new TextRun('\u200e'));
    else children.push(...group);
  }
  return new Paragraph({
    children: method === 'B' ? [embed('rtl', children)] : children,
    bidirectional: true, alignment: AlignmentType.RIGHT,
    spacing: { after: 110, line: 320 }, keepLines: true,
  });
}
const sections = ['A', 'B', 'C'].map(method => ({
  properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 650, bottom: 650, left: 900, right: 900 } } },
  children: [
    new Paragraph({ children: [new TextRun({ text: `METHOD ${method}`, bold: true, size: 32, color: '087F74' })], spacing: { after: 120 } }),
    ...rows.map(row => nativeParagraph(row, method)),
    new Paragraph({ children: [new TextRun(english)], bidirectional: false, spacing: { after: 160, line: 300 } }),
    new Paragraph({ children: [new TextRun({ text: 'IMAGE REFERENCE (same on every page)', size: 19, color: '087F74' })], spacing: { after: 60 } }),
    new Paragraph({ children: [new ImageRun({ type: 'png', data: reference, transformation: referenceSize })], alignment: AlignmentType.CENTER }),
  ],
}));
const document = new Document({
  title: 'ParsiWord — Word Android direction comparison A B C', creator: 'ParsiWord',
  description: 'A: contextual runs; B: OOXML directional embeddings; C: Unicode LRM boundaries. Device confirmation required.',
  styles: { default: { document: { run: { font: { ascii: 'Arial', hAnsi: 'Arial', cs: 'Arial', eastAsia: 'Arial' }, size: 24, sizeComplexScript: 24 } } } },
  sections,
});
const bytes = await Packer.toBuffer(document);
const zip = await JSZip.loadAsync(bytes);
const xml = await zip.file('word/document.xml').async('string');
// This check only verifies that the diagnostic alternatives actually differ;
// it is not evidence of correct rendering in Microsoft Word for Android.
if (!xml.includes('<w:dir w:val="ltr">') || !xml.includes('\u200e')) throw new Error('Missing comparison markup');
const parsed = new DOMParser().parseFromString(xml, 'application/xml');
const nativePages = [];
for (const paragraph of Array.from(parsed.getElementsByTagName('w:p'))) {
  const text = Array.from(paragraph.getElementsByTagName('w:t')).map(t => t.textContent).join('');
  if (text.startsWith('METHOD ')) nativePages.push([]);
  else if (text && !text.startsWith('IMAGE ')) nativePages.at(-1).push(text.replaceAll('\u200e', ''));
}
assert.equal(nativePages.length, 3);
assert.deepEqual(nativePages[0], [...rows.map(row => row.map(p => p.text).join('')), english]);
assert.deepEqual(nativePages[1], nativePages[0]);
assert.deepEqual(nativePages[2], nativePages[0]);
assert.equal(parsed.getElementsByTagName('w:drawing').length, 3);
await writeFile(new URL('ParsiWord-Word-Android-ABC.docx', out), bytes);
await writeFile(new URL('README.txt', out), [
  'Open ParsiWord-Word-Android-ABC.docx in Microsoft Word for Android.',
  'Each of the three pages has the same text, METHOD A/B/C, then a stable reference image.',
  'Compare parentheses and the order of React (version 19), (250 USD), and the bold multi-run 19.',
  'Report which page matches its image, including any failure after line wrapping.',
  '',
  'A: Contextual RTL runs for Persian punctuation and spaces; contiguous Latin groups without an explicit RTL property.',
  'B: A plus outer RTL and inner LTR OOXML w:dir embeddings. Text content unchanged.',
  'C: A plus Unicode LRM on both boundaries of each entire LTR phrase, across formatting runs. Marks deliberately inserted in this diagnostic only.',
  'None of the methods reverses text or replaces parenthesis characters.',
  'Historical v0.2 investigation. The v0.2.1 converter now uses contextual runs and bounded LRM marks; see docs/adr/0003-contextual-word-runs.md.',
].join('\n'));
console.log(JSON.stringify({ path: new URL('ParsiWord-Word-Android-ABC.docx', out).pathname, bytes: bytes.length, referenceSize }));
