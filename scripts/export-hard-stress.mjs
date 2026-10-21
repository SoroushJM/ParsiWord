// Build native text with the real converter; append independent raster references.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { Packer, Paragraph, TextRun, ImageRun, AlignmentType } from 'docx';
import JSZip from 'jszip';

const out = new URL(process.argv[2] || '../artifacts/hard-stress/', import.meta.url);
await mkdir(out, { recursive: true });
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const browser = await chromium.launch();
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function toHtml(test) {
  if (test.reference) return test.reference;
  let html = '';
  for (let i = 0; i < test.parts.length;) {
    const direction = test.parts[i].dir || test.base;
    let value = '';
    while (i < test.parts.length && (test.parts[i].dir || test.base) === direction) {
      const p = test.parts[i++];
      let part = p.break ? '<br>' : escape(p.text);
      if (p.bold) part = '<b>' + part + '</b>';
      if (p.italic) part = '<i>' + part + '</i>';
      if (p.code) part = '<code>' + part + '</code>';
      if (p.href) part = '<u>' + part + '</u>';
      value += part;
    }
    html += direction === test.base ? value : `<bdi dir="${direction}">${value}</bdi>`;
  }
  return html;
}
try {
  const { createWord, defaultSettings } = await server.ssrLoadModule('/src/converter.ts');
  const { hardCases, hardMarkdown, catalogPairs } = await server.ssrLoadModule('/tests/fixtures/rtl-stress.ts');
  await writeFile(new URL('ParsiWord-hard-stress.md', out), hardMarkdown);
  const document = createWord(hardMarkdown, { ...defaultSettings, title: 'آزمون سخت علامت‌های جفت', fontFamily: 'Arial', fontSize: 11 });
  const regular = (await readFile('public/fonts/Vazirmatn-Regular.ttf')).toString('base64');
  const bold = (await readFile('public/fonts/Vazirmatn-Bold.ttf')).toString('base64');
  const cases = hardCases.filter(test => !test.malformed);
  const page = await browser.newPage({ viewport: { width: 1100, height: 1600 }, deviceScaleFactor: 1 });
  let references = 0;
  for (let i = 0; i < cases.length; i += 7) {
    const group = cases.slice(i, i + 7);
    await page.setContent(`<!doctype html><html lang="fa"><meta charset="utf-8"><style>
      @font-face{font-family:Reference;src:url(data:font/ttf;base64,${regular})}
      @font-face{font-family:Reference;src:url(data:font/ttf;base64,${bold});font-weight:700}
      *{box-sizing:border-box}body{margin:0;background:white;color:#111}
      #reference{width:1000px;padding:22px 28px;font:24px/1.65 Reference,Arial,sans-serif;border:2px solid #b7d6ce}
      .case{margin:0 0 18px}.case:last-child{margin-bottom:0}
      .id{font:700 22px Arial;color:#087F74;direction:ltr;text-align:left;margin-bottom:5px}
      p{margin:0}code{font-family:monospace;background:#f1f5f4}
    </style><div id="reference">${group.map(test => `<div class="case"><div class="id">${test.id}</div><p dir="${test.base}">${toHtml(test)}</p></div>`).join('')}</div></html>`);
    await page.evaluate(() => document.fonts.ready);
    const box = await page.locator('#reference').boundingBox();
    const png = await page.locator('#reference').screenshot({ path: new URL(`reference-${++references}.png`, out).pathname });
    const width = 650, height = Math.round(box.height * width / box.width);
    assert(height < 900, 'Reference image would not fit an A4 page');
    document.Document.View.add(new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: `IMAGE REFERENCE ${group[0].id}–${group.at(-1).id}`, bold: true, color: '087F74', size: 26 })] }));
    document.Document.View.add(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: png, transformation: { width, height } })] }));
  }
  const bytes = await Packer.toBuffer(document);
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml').async('string');
  assert(!xml.includes('<w:dir') && !zip.file('word/vbaProject.bin'));
  assert(zip.file(/word\/media\/.*\.png$/).length === references);
  await writeFile(new URL('ParsiWord-hard-stress.docx', out), bytes);
  await writeFile(new URL('manifest.json', out), JSON.stringify({ unicodeVersion: '18.0.0', canonicalPairs: 65, totalPairs: catalogPairs.length, hardCases: hardCases.length, references, bytes: bytes.length, source: 'actual app converter; independent hand-authored reference direction', deviceResult: 'pending' }, null, 2) + '\n');
  console.log(JSON.stringify({ bytes: bytes.length, pairs: catalogPairs.length, cases: hardCases.length, referencePages: references }));
} finally {
  await browser.close();
  await server.close();
}
