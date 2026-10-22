import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

test('language aliases highlight safely, preserve code and export actual Word colors offline', async ({ page }, testInfo) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  const source = '/* first\nsecond */\n\n\tconst title = "<img src=x onerror=alert(1)>"; // فارسی (توضیح)';
  const literal = '<script>window.__codeExecuted = true</script>\n\t[]{}';
  const markdown = `متن فارسی (React 19)\n\n\`\`\`ts\n${source}\n\`\`\`\n\n\`\`\`unknown-language\n${literal}\n\`\`\`\n\n\`\`\`\n${literal}\n\`\`\`\n\nکد درون متن: \`const n = 19;\``;
  await page.goto('/');
  await page.getByRole('textbox', { name: 'متن Markdown' }).fill(markdown);
  await page.getByRole('tab', { name: 'پیش‌نمایش' }).click();
  const blocks = page.locator('.code-block');
  await expect(blocks).toHaveCount(3);
  await expect(blocks.first().locator('figcaption')).toHaveText('TypeScript');
  expect(await blocks.first().locator('code').textContent()).toBe(source);
  await expect(blocks.first().locator('[data-scope="keyword"]').first()).toHaveCSS('color', 'rgb(207, 34, 46)');
  for (const index of [1, 2]) {
    expect(await blocks.nth(index).locator('code').textContent()).toBe(literal);
    await expect(blocks.nth(index).locator('[data-scope]')).toHaveCount(0);
  }
  await expect(page.locator('.prose img, .prose script')).toHaveCount(0);
  expect(await page.evaluate(() => '__codeExecuted' in window)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.preview-panel').evaluate(panel => { panel.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('highlight-preview.png'), fullPage: true });
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /ذخیرهٔ فایل Word/ }).click();
  const zip = await JSZip.loadAsync(await readFile((await (await downloading).path())!));
  const xml = await zip.file('word/document.xml')!.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
  const text = (p: (typeof paragraphs)[number]) => Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join('');
  const start = paragraphs.findIndex(p => text(p) === 'TypeScript') + 1;
  const lines = source.split('\n');
  expect(paragraphs.slice(start, start + lines.length).map(text).join('\n')).toBe(source);
  for (const p of paragraphs.slice(start, start + lines.length)) {
    expect(p.getElementsByTagName('w:bidi')[0].getAttribute('w:val')).toBe('false');
  }
  for (const color of ['CF222E', '0A3069', '57606A']) expect(xml).toContain(`w:color w:val="${color}"`);
  expect(zip.file(/word\/fonts\/.*\.odttf$/)).toHaveLength(4);
  expect(zip.file(/word\/media\//)).toHaveLength(0);
});
