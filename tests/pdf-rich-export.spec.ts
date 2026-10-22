import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import tauri from '../src-tauri/tauri.conf.json' with { type: 'json' };

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
