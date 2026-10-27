import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import tauri from '../apps/parsiword/src-tauri/tauri.conf.json' with { type: 'json' };

// Each real TeX worker carries a full engine snapshot. Keep this group serial,
// while the unrelated editor suite retains its normal parallelism.
test.describe.configure({ mode: 'serial' });
const geometry = await readFile('examples/tikz-geometry.md', 'utf8');
const body = /```tikz\n([\s\S]*?)\n```/.exec(geometry)![1];
const fence = (source: string, language = 'tikz') => `\`\`\`${language}\n${source}\n\`\`\``;

test('English nested route loads its own local TikZ assets', async ({ page }) => {
  test.setTimeout(90_000);
  const failures: string[] = [];
  page.on('response', response => { if (response.url().includes('/tikz/') && !response.ok()) failures.push(response.url()); });
  await page.addInitScript(source => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: source, settings: {} })), geometry);
  await page.goto('/en/');
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('.tikz-diagram svg')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('button', { name: 'Edit TikZ drawing', exact: true })).toBeVisible();
  expect(failures).toEqual([]);
});

test('a slow cold TikZ download finishes without using the TeX compilation deadline', async ({ page }) => {
  test.setTimeout(90_000);
  let coreRequests = 0, responseReleased = false;
  let notifyRequested!: () => void;
  const requested = new Promise<void>(resolve => { notifyRequested = resolve; });
  await page.route('**/tikz/core.dump.gz.bin', async route => {
    coreRequests++;
    const response = await route.fetch();
    notifyRequested();
    // The real Pages failure was a valid engine snapshot download that crossed
    // the 20-second execution deadline. Retain the real compressed bytes and engine.
    await new Promise(resolve => setTimeout(resolve, 21_000));
    if (page.isClosed()) return;
    responseReleased = true;
    await route.fulfill({ response });
  });
  await page.addInitScript(markdown => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: {} })), geometry);
  await page.goto('/');
  await page.locator('[data-mobile-view="preview"]').click();
  await requested;
  await expect(page.getByRole('status').filter({ hasText: 'TikZ' })).toBeVisible();
  await page.locator('[data-mobile-view="edit"]').click();
  const input = page.locator('#markdown-source');
  const added = '\n\nRESPONSIVE_DURING_TIKZ_DOWNLOAD';
  await input.press('Control+End');
  await page.keyboard.insertText(added);
  await expect(input).toHaveValue(geometry + added);
  expect(responseReleased).toBe(false);
  await page.locator('[data-mobile-view="preview"]').click();
  await Promise.race([
    page.locator('.tikz-diagram svg').waitFor({ state: 'visible', timeout: 65_000 }),
    page.getByRole('alert').filter({ hasText: 'TikZ' }).first().waitFor({ state: 'visible', timeout: 65_000 }).then(async () => {
      throw new Error(`The valid delayed TikZ download failed: ${await page.getByRole('alert').filter({ hasText: 'TikZ' }).first().innerText()}`);
    }),
  ]);
  expect(responseReleased).toBe(true);
  expect(coreRequests).toBe(1);
  expect(await page.locator('.tikz-diagram svg path').count()).toBeGreaterThan(12);
  await expect(input).toHaveValue(geometry + added);
});

test('source and rich insertion controls preserve the selected prose and create a real drawing', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: 'SELECTED_PROSE', settings: {} })));
  await page.goto('/');
  const input = page.locator('#markdown-source');
  await input.selectText();
  await page.locator('.format-toolbar').getByRole('button', { name: 'درج شکل TikZ', exact: true }).click();
  expect(await input.inputValue()).toMatch(/```tikz\n[\s\S]*?\n```\n\nSELECTED_PROSE/);
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('.tikz-diagram svg')).toBeVisible({ timeout: 45_000 });
  await page.locator('.tiptap p').filter({ hasText: 'SELECTED_PROSE' }).click();
  await page.locator('.rich-editor-toolbar').getByRole('button', { name: 'درج شکل TikZ', exact: true }).click();
  await expect(page.locator('.tikz-diagram svg')).toHaveCount(2, { timeout: 45_000 });
  expect((await input.inputValue()).match(/```tikz\n/g)).toHaveLength(2);
  expect((await input.inputValue()).match(/SELECTED_PROSE/g)).toHaveLength(1);
});

test('real offline TikZ renders geometry, libraries and pgfplots under the native CSP', async ({ page }) => {
  test.setTimeout(120_000);
  const requested: string[] = [];
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => { requested.push(route.request().url()); return route.abort(); });
  await page.addInitScript(({ source, csp }) => {
    localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: source, settings: {} }));
    // Install the real native policy before React mounts or creates its worker.
    document.addEventListener('DOMContentLoaded', () => { const policy = document.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy'; policy.content = csp; document.head.append(policy); }, { once: true });
  }, { source: geometry, csp: tauri.app.security.csp });
  await page.goto('/');
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('.tikz-diagram svg')).toHaveCount(1, { timeout: 45_000 });
  const figure = page.locator('.tikz-diagram svg');
  expect(await figure.locator('path').count()).toBeGreaterThan(12);
  // Export images must retain labels without browser-installed Computer Modern.
  expect(await figure.locator('text, script, foreignObject, image, style').count()).toBe(0);
  expect(await figure.innerHTML()).not.toMatch(/(?:https?:|@font-face|onload=)/);
  const geometrySvg = await figure.innerHTML();
  const original = await page.locator('#markdown-source').inputValue();
  expect(original).toBe(geometry);
  await page.locator('[data-mobile-view="edit"]').click();
  const plots = String.raw`\usepackage{pgfplots}
\pgfplotsset{compat=1.18}
\begin{tikzpicture}
\begin{axis}[width=6cm,height=4cm,xlabel={$x$},ylabel={$y$}]
\addplot[blue,domain=-2:2,samples=15] {x^2};
\end{axis}
\end{tikzpicture}`;
  await page.locator('#markdown-source').fill(fence(plots, 'TiKzPicture'));
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('.tikz-diagram')).toHaveAttribute('aria-busy', 'false', { timeout: 45_000 });
  await expect.poll(async () => await page.locator('.tikz-diagram svg').innerHTML() !== geometrySvg, { timeout: 45_000 }).toBe(true);
  expect(await page.locator('.tikz-diagram svg path').count()).toBeGreaterThan(10);
  expect(await page.locator('.tikz-diagram svg').innerHTML()).toContain('stroke="#00f"');
  expect(requested).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('TikZ draft editing applies once, cancels cleanly and preserves the source fence and other blocks', async ({ page }) => {
  test.setTimeout(90_000);
  const prefix = '# سؤال\n\nمتن فارسی و **English**.\n\n';
  const source = `${prefix}~~~TiKz title="geometry"\n${body}\n~~~\n\n[ref]: ./other.md\n`;
  await page.addInitScript(source => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: source, settings: {} })), source);
  await page.goto('/'); await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('.tikz-diagram svg')).toHaveCount(1, { timeout: 45_000 });
  await page.getByRole('button', { name: 'ویرایش نمودار TikZ', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'کد TikZ', exact: true });
  await expect(input).toHaveValue(body);
  await input.fill(body.replace('blue,thick', 'green,thick'));
  await expect(page.locator('#markdown-source')).toHaveValue(source);
  await page.getByRole('button', { name: 'انصراف', exact: true }).click();
  await expect(page.locator('#markdown-source')).toHaveValue(source);
  await page.getByRole('button', { name: 'ویرایش نمودار TikZ', exact: true }).click();
  const changed = body.replace('blue,thick', 'green,thick');
  await input.fill(changed); await page.getByRole('button', { name: 'تأیید', exact: true }).click();
  await expect(page.locator('#markdown-source')).toHaveValue(source.replace(body, changed));
  await expect(page.locator('.tikz-diagram')).toHaveAttribute('aria-busy', 'false', { timeout: 45_000 });
  await page.getByRole('button', { name: 'واگرد', exact: true }).click();
  await expect(page.locator('#markdown-source')).toHaveValue(source);
  await page.getByRole('button', { name: 'انجام دوباره', exact: true }).click();
  await expect(page.locator('#markdown-source')).toHaveValue(source.replace(body, changed));
});

test('real TeX output survives Word and PDF export with labels, editable text and original source metadata', async ({ page }, info) => {
  test.setTimeout(120_000);
  const markdown = `TIKZ_SEARCHABLE_TEXT متن فارسی با فرمول $x^2$.\n\n${fence(body)}`;
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  await page.addInitScript(markdown => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: { title: 'TikZ geometry' } })), markdown);
  await page.goto('/'); await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('.tikz-diagram svg')).toHaveCount(1, { timeout: 45_000 });
  const pendingWord = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ذخیرهٔ فایل Word', exact: true }).click();
  const word = await pendingWord; await word.saveAs(info.outputPath('tikz.docx'));
  const zip = await JSZip.loadAsync(await readFile((await word.path())!));
  const xml = await zip.file('word/document.xml')!.async('string');
  expect(xml).toContain('TIKZ_SEARCHABLE_TEXT'); expect(xml).toContain('<m:oMath ');
  expect(xml).toContain('TikZ diagram'); expect(xml).toContain('coordinate');
  const media = zip.file(/^word\/media\/.*\.png$/); expect(media).toHaveLength(1);
  const bytes = await media[0].async('nodebuffer');
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(100); expect(bytes.readUInt32BE(20)).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'قالب‌های دیگر خروجی', exact: true }).click();
  const pendingPdf = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'ذخیرهٔ فایل PDF', exact: true }).click();
  const download = await pendingPdf; await download.saveAs(info.outputPath('tikz.pdf'));
  const pdf = await getDocument({ data: new Uint8Array(await readFile((await download.path())!)), disableFontFace: true, useSystemFonts: false, isEvalSupported: false }).promise;
  try {
    const pageOne = await pdf.getPage(1), operations = await pageOne.getOperatorList();
    const text = (await pageOne.getTextContent()).items.filter(item => 'str' in item).map(item => item.str).join(' ');
    expect(text).toContain('TIKZ_SEARCHABLE_TEXT');
    expect(operations.fnArray.filter(value => value === OPS.paintImageXObject)).toHaveLength(2);
    const structure = await pageOne.getStructTree();
    expect(JSON.stringify(structure)).toContain(JSON.stringify(body).slice(1, -1));
    // Decode the large actual TikZ image, checking geometry and math glyphs
    // are colored/nonempty rather than asserting only a media relationship.
    for (const [index, operator] of operations.fnArray.entries()) if (operator === OPS.paintImageXObject) {
      const image = await new Promise<{ width: number; height: number; data: Uint8Array }>(resolve => pageOne.objs.get(operations.argsArray[index][0] as string, resolve));
      expect(image.data.some(value => value < 120)).toBe(true);
    }
  } finally { await pdf.destroy(); }
  await expect(page.locator('#markdown-source')).toHaveValue(markdown);
});

test('invalid TikZ fails explicitly and a corrected drawing renders without reloading the editor', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: '```tikz\n\\thisCommandDoesNotExist\n```', settings: {} })));
  await page.goto('/'); await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.getByRole('alert').filter({ hasText: 'TikZ' }).first()).toBeVisible({ timeout: 45_000 });
  await page.locator('[data-mobile-view="edit"]').click();
  await page.locator('#markdown-source').fill(fence(body));
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('.tikz-diagram svg')).toHaveCount(1, { timeout: 45_000 });
});

test('a nonterminating real TeX job leaves editing responsive, times out and allows a fresh worker', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: '```tikz\n\\loop\\iftrue\\repeat\n```', settings: {} })));
  await page.goto('/'); await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.getByRole('status').filter({ hasText: 'TikZ' })).toBeVisible();
  // This is a real infinite TeX loop in the worker, rather than a fake timer.
  // The main-thread editor must still accept input during that job.
  await page.locator('[data-mobile-view="edit"]').click();
  await page.locator('#markdown-source').press('Control+End');
  await page.locator('#markdown-source').press('End');
  await page.locator('#markdown-source').press('Enter');
  await page.locator('#markdown-source').pressSequentially('RESPONSIVE_DURING_TEX');
  await expect(page.locator('#markdown-source')).toHaveValue(/RESPONSIVE_DURING_TEX/);
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.getByRole('alert').filter({ hasText: 'بیش از حد طول کشید' })).toBeVisible({ timeout: 45_000 });
  await page.locator('[data-mobile-view="edit"]').click();
  await page.locator('#markdown-source').fill(fence(body));
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('.tikz-diagram svg')).toHaveCount(1, { timeout: 45_000 });
});
