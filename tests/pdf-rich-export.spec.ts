import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import tauri from '../apps/parsiword/src-tauri/tauri.conf.json' with { type: 'json' };
import JSZip from 'jszip';

test('offline PDF contains visible local formula and Mermaid images alongside searchable text', async ({ page }) => {
  test.setTimeout(90_000);
  const markdown = '# بررسی فارسی (React 19)\n\nمتن فارسی SEARCHABLEPDFGRAPHICS با فرمول $E=mc^2$ و $\\frac{\\alpha+\\beta}{2}$.\n\n$$\n\\int_0^\\infty e^{-x^2}dx=\\frac{\\sqrt{\\pi}}{2}\n$$\n\n```mermaid\nflowchart LR\n  A[شروع فارسی] --> B[React 19]\n```\n';
  await page.addInitScript(markdown => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: { title: 'rich PDF', direction: 'auto' } })), markdown);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  await page.goto('/');
  await page.getByRole('textbox', { name: 'متن Markdown', exact: true }).waitFor();
  // Apply the native policy before loading any PDF/image dependencies. CDP's
  // test evaluation is not page script; dynamic imports/font fetches still are.
  await page.evaluate(csp => { const policy = document.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy'; policy.content = csp; document.head.append(policy); }, tauri.app.security.csp);
  await page.getByRole('button', { name: 'قالب‌های دیگر خروجی', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'ذخیرهٔ فایل PDF', exact: true }).click();
  const download = await pending;
  const pdf = await getDocument({ data: new Uint8Array(await readFile((await download.path())!)), useSystemFonts: false, disableFontFace: true, isEvalSupported: false }).promise;
  try {
    const first = await pdf.getPage(1);
    expect((await first.getTextContent()).items.filter(item => 'str' in item).map(item => item.str).join(' ')).toContain('SEARCHABLEPDFGRAPHICS');
    const operators = await first.getOperatorList();
    const images = operators.fnArray.flatMap((operator, index) => operator === OPS.paintImageXObject ? [operators.argsArray[index][0] as string] : []);
    expect(images).toHaveLength(4);
    for (const name of images) {
      const image = await new Promise<{ width: number; height: number; data: Uint8Array }>(resolve => first.objs.get(name, resolve));
      expect(image.width).toBeGreaterThan(10);
      expect(image.height).toBeGreaterThan(10);
      // Decode the actual embedded image, not its PDF metadata: the first
      // implementation accidentally generated completely white formula PNGs.
      let dark = 0;
      const channels = image.data.length / (image.width * image.height);
      for (let offset = 0; offset < image.data.length; offset += channels) if (image.data[offset] < 180) dark++;
      expect(dark).toBeGreaterThan(30);
    }
  } finally { await pdf.destroy(); }
});

test('fresh light and dark contexts export the same real local math, Mermaid, styles and fonts', async ({ browser }) => {
  test.setTimeout(150_000);
  const markdown = '# خروجی مستقل از ظاهر\n\nمتن فارسی THEMEEXPORT با $\\frac{x^2+1}{2}$ و **پررنگ**.\n\n```typescript\nconst value = 42; // ثابت\n```\n\n```mermaid\nflowchart LR\n A[شروع فارسی] --> B[React 19]\n```';
  const outputs = [];
  for (const theme of ['light', 'dark']) {
    // Separate realms isolate renderer/module/font caches: a light render
    // cannot hide a dark-theme dependency in the second export.
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: theme as 'light' | 'dark' });
    try {
      const page = await context.newPage();
      await page.addInitScript(({ markdown, theme }) => {
        localStorage.setItem('parsiword-display-theme-v1', theme);
        localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: { title: 'Theme export', direction: 'auto' } }));
      }, { markdown, theme });
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-display-theme', theme);
      await expect(page.locator('.rich-document .katex')).toHaveCount(1);
      await expect(page.locator('.mermaid-diagram svg')).toHaveCount(1, { timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready);
      let pending = page.waitForEvent('download');
      await page.getByRole('button', { name: /ذخیرهٔ فایل Word/ }).click();
      const zip = await JSZip.loadAsync(await readFile((await (await pending).path())!));
      const documentXml = (await zip.file('word/document.xml')!.async('string')).replace(/r:embed="[^"]+"/g, 'r:embed="IMAGE"').replace(/<wp:docPr id="\d+"/g, '<wp:docPr id="IMAGE"');
      const styles = await zip.file('word/styles.xml')!.async('string');
      const media = await Promise.all(zip.file(/^word\/media\/.*\.png$/).map(file => file.async('base64')));
      const embeddedFonts = zip.file(/^word\/fonts\/.*\.odttf$/);
      expect(documentXml).toContain('<m:oMath '); expect(media).toHaveLength(1); expect(embeddedFonts.length).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'قالب‌های دیگر خروجی', exact: true }).click();
      pending = page.waitForEvent('download');
      await page.getByRole('menuitem', { name: 'ذخیرهٔ فایل PDF', exact: true }).click();
      const bytes = await readFile((await (await pending).path())!);
      expect(bytes.toString('latin1')).toContain('/FontFile2');
      const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true, isEvalSupported: false }).promise;
      try {
        const first = await pdf.getPage(1), operators = await first.getOperatorList();
        const text = (await first.getTextContent()).items.filter(item => 'str' in item).map(item => item.str).join(' ');
        const images = [...bytes.toString('latin1').matchAll(/\d+ \d+ obj([\s\S]*?)endobj/g)].filter(match => /\/Subtype\s*\/Image/.test(match[1])).map(match => match[1]);
        expect(text).toContain('THEMEEXPORT'); expect(images.length).toBeGreaterThanOrEqual(2);
        outputs.push({ documentXml, styles, media, fontCount: embeddedFonts.length, text, functions: operators.fnArray, arguments: JSON.stringify(operators.argsArray).replace(/g_d\d+_f/g, 'g_DOCUMENT_f'), images });
      } finally { await pdf.destroy(); }
    } finally { await context.close(); }
  }
  expect(outputs[0]).toEqual(outputs[1]);
});
