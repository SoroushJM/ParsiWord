import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const content = '# سند قابل ارسال\n\nاین متن **پررنگ** و *مورب* با React (version 19) و ⹕نشانه‌های کمیاب⹖ است.\n\nکد `calculate(12, 34)` باید چپ‌به‌راست باشد.\n\n```ts\nconst result = calculate(12, 34);\n```\n\n$$\n\\int_0^1 x^2\\,dx=\\frac{1}{3}\n$$';

test('offline Word carries the complete selected, Persian fallback, code, math and delimiter font files', async ({ page }, testInfo) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  await page.goto('/');
  await page.getByRole('textbox', { name: 'متن Markdown' }).fill(content);
  await page.getByRole('button', { name: 'تنظیمات خروجی' }).click();
  await page.getByRole('button', { name: 'انتخاب فونت خروجی' }).click();
  await page.getByRole('radio', { name: 'همه', exact: true }).click();
  await page.getByLabel('جست‌وجو در Google Fonts').fill('Noto Sans Mono');
  await page.getByRole('button', { name: 'انتخاب فونت Noto Sans Mono', exact: true }).click();
  await page.getByRole('button', { name: 'آماده است' }).click();
  await expect(page.locator('.katex')).toHaveCount(1);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /ذخیرهٔ فایل Word/ }).click();
  const bytes = await readFile((await (await downloading).path())!);
  const zip = await JSZip.loadAsync(bytes);
  const parser = new DOMParser();
  const table = parser.parseFromString(await zip.file('word/fontTable.xml')!.async('string'), 'application/xml');
  const rels = parser.parseFromString(await zip.file('word/_rels/fontTable.xml.rels')!.async('string'), 'application/xml');
  const expected: Record<string, Record<string, string>> = {
    'Vazirmatn': { embedRegular: 'Vazirmatn-Regular.ttf', embedBold: 'Vazirmatn-Bold.ttf' },
    'Noto Sans Mono': { embedRegular: 'NotoSansMono-Regular.ttf', embedBold: 'NotoSansMono-Bold.ttf' },
    'STIX Two Math': { embedRegular: 'STIXTwoMath-Regular.ttf' },
    'ParsiWord Symbols': { embedRegular: 'ParsiWordSymbols-Regular.ttf' },
  };
  for (const [family, faces] of Object.entries(expected)) {
    const entry = Array.from(table.getElementsByTagName('w:font')).find(f => f.getAttribute('w:name') === family)!;
    expect(entry, family).toBeTruthy();
    for (const [style, filename] of Object.entries(faces)) {
      const embedded = entry.getElementsByTagName(`w:${style}`)[0];
      expect(embedded, `${family} ${style}`).toBeTruthy();
      const id = embedded.getAttribute('r:id');
      const relationship = Array.from(rels.getElementsByTagName('Relationship')).find(r => r.getAttribute('Id') === id)!;
      const stored = await zip.file('word/' + relationship.getAttribute('Target'))!.async('nodebuffer');
      // ECMA-376 font obfuscation: only the first 32 bytes are XORed against
      // the reversed GUID bytes. Compare the entire restored font, including header.
      const key = Buffer.from(embedded.getAttribute('w:fontKey')!.replace(/[{}-]/g, ''), 'hex').reverse();
      for (let i = 0; i < 32; i++) stored[i] ^= key[i % 16];
      expect(stored.equals(await readFile('packages/core/public/fonts/' + filename)), filename).toBe(true);
    }
  }
  const settings = await zip.file('word/settings.xml')!.async('string');
  expect(settings).toContain('w:embedTrueTypeFonts');
  expect(settings).toContain('m:mathFont m:val="STIX Two Math"');
  expect(await zip.file('word/document.xml')!.async('string')).not.toMatch(/Courier New|Cambria Math/);
  await mkdir('artifacts', { recursive: true });
  await writeFile(`artifacts/ParsiWord-0.4.4-portable-${testInfo.project.name}.docx`, bytes);
  await page.screenshot({ path: testInfo.outputPath('clean-ui.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
