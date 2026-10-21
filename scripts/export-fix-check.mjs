// Short device check: actual converter output plus an independent image.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { Paragraph, TextRun, ImageRun, Packer } from 'docx';

const out = new URL('../artifacts/0.2.3/', import.meta.url);
await mkdir(out, { recursive: true });
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const browser = await chromium.launch();
try {
  const { createWord, defaultSettings } = await server.ssrLoadModule('/src/converter.ts');
  const { hardCases, caseMarkdown, escapeMarkdown } = await server.ssrLoadModule('/tests/fixtures/rtl-stress.ts');
  const glyphs = '༺ ༻   ༼ ༽   ⹕ ⹖   ⹗ ⹘   ⹙ ⹚   ⹛ ⹜   ⹢ ⹣';
  const cases = [
    { id: 'S09', dir: 'rtl', markdown: caseMarkdown(hardCases.find(t => t.id === 'S09').parts), html: 'متن <bdi dir="ltr">&lt;React<br>(version <b>19</b>)&gt;</bdi> تمام شد.' },
    { id: 'S11', dir: 'ltr', markdown: caseMarkdown(hardCases.find(t => t.id === 'S11').parts), html: hardCases.find(t => t.id === 'S11').reference },
    { id: 'P01', dir: 'ltr', markdown: escapeMarkdown('(React و فارسی)'), html: '(React <bdi dir="rtl">و فارسی</bdi>)' },
    { id: 'P02', dir: 'ltr', markdown: escapeMarkdown('[React و فارسی]'), html: '[React <bdi dir="rtl">و فارسی</bdi>]' },
    { id: 'FONT', dir: 'ltr', markdown: glyphs, html: `<span class="symbols">${glyphs}</span>` },
  ];
  const markdown = ['# بررسی اصلاحات ۰.۲.۳', 'جای علامت‌ها و ترتیب عبارت‌ها را با تصویر مرجع در صفحهٔ بعد مقایسه کنید. در FONT باید هر ۱۴ علامت دیده شوند.', ...cases.flatMap(c => [`###### ${c.id}`, c.markdown])].join('\n\n');
  const doc = createWord(markdown, { ...defaultSettings, title: 'بررسی اصلاحات ۰.۲.۳', fontFamily: 'Arial', fontSize: 11 });
  const regular = (await readFile('public/fonts/Vazirmatn-Regular.ttf')).toString('base64');
  const symbols = (await readFile('public/fonts/ParsiWordSymbols-Regular.ttf')).toString('base64');
  const page = await browser.newPage({ viewport: { width: 1100, height: 1500 } });
  await page.setContent(`<!doctype html><html lang="fa"><meta charset="utf-8"><style>
    @font-face{font-family:Reference;src:url(data:font/ttf;base64,${regular})}
    @font-face{font-family:Symbols;src:url(data:font/ttf;base64,${symbols})}
    *{box-sizing:border-box}body{margin:0;background:white;color:#111}
    #ref{width:1000px;padding:24px 30px;border:2px solid #b7d6ce;font:26px/1.7 Reference,Arial,sans-serif}
    .case{margin-bottom:25px}.case:last-child{margin-bottom:0}.id{font:700 24px Arial;color:#087F74;margin-bottom:8px}p{margin:0}.symbols{font-family:Symbols}
  </style><div id="ref">${cases.map(c => `<div class="case"><div class="id">${c.id}</div><p dir="${c.dir}">${c.html}</p></div>`).join('')}</div></html>`);
  await page.evaluate(() => document.fonts.ready);
  const box = await page.locator('#ref').boundingBox();
  const png = await page.locator('#ref').screenshot({ path: new URL('fix-check-reference.png', out).pathname });
  const width = 650, height = Math.round(box.height * width / box.width);
  doc.Document.View.add(new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: 'IMAGE REFERENCE', bold: true, color: '087F74' })] }));
  doc.Document.View.add(new Paragraph({ children: [new ImageRun({ type: 'png', data: png, transformation: { width, height } })] }));
  const bytes = await Packer.toBuffer(doc);
  await writeFile(new URL('ParsiWord-0.2.3-fix-check.docx', out), bytes);
  await writeFile(new URL('ParsiWord-0.2.3-fix-check.md', out), markdown);
  console.log(JSON.stringify({ bytes: bytes.length, cases: cases.map(c => c.id), referenceSize: { width, height } }));
} finally {
  await browser.close();
  await server.close();
}
