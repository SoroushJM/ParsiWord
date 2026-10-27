import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import { expect, type Browser, type Frame, type Locator } from '@playwright/test';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';

const markdown = `*تصویر ۶ — انتخاب روز در تقویم، مقدار فرم را تغییر می‌دهد؛ ثبت نهایی با دکمهٔ ذخیره انجام می‌شود.*

<a id="sarir-folders"></a>

## ۴. در صورت نیاز، پوشه‌های مقصد در سریر را انتخاب کنید

این قسمت برای مشخص کردن پوشه‌های مقصد مرتبط با کاربر در سریر است. اگر کار شما به این تنظیم نیاز دارد، مسیر پوشه را از مسئول مربوط دریافت کنید.

1. در بخش **«پوشه‌های مقصد در سریر»** روی **«مدیریت پوشه‌ها»** بزنید.
2. در پنجرهٔ بازشده، نام پوشه را در **«جستجوی نام پوشه»** بنویسید یا شاخه‌ها را با پیکان کنار پوشه باز کنید. دکمهٔ **«گسترش همه»** همهٔ شاخه‌ها را باز می‌کند.
3. مربع کنار پوشهٔ مورد نظر را انتخاب کنید. امکان انتخاب چند پوشه وجود دارد.
4. تعداد انتخاب‌ها را روی دکمهٔ **«تایید انتخاب‌ها»** بررسی کنید و دکمه را بزنید.
5. پس از برگشت به فرم، فهرست پوشه‌های انتخاب‌شده را بررسی کنید.
`;

async function listMetrics(list: Locator) {
  await expect(list).toHaveAttribute('dir', 'rtl');
  const metrics = await list.evaluate(element => {
    const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
    const root = element.closest('.rich-document')!.getBoundingClientRect();
    const parent = element.closest('.preview-panel')!.getBoundingClientRect();
    const items = [...element.querySelectorAll(':scope > li')].map(item => {
      const rect = item.getBoundingClientRect(), css = getComputedStyle(item);
      return { direction: css.direction, right: rect.right, left: rect.left, display: css.display };
    });
    return { direction: style.direction, paddingStart: parseFloat(style.paddingInlineStart), root: { left: root.left, right: root.right }, parent: { left: parent.left, right: parent.right }, list: { left: bounds.left, right: bounds.right }, items, horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.equal(metrics.direction, 'rtl');
  assert.ok(metrics.paddingStart >= 20, 'List reserves room on its actual RTL marker side');
  assert.equal(metrics.horizontalOverflow, false);
  for (const item of metrics.items) {
    assert.equal(item.direction, 'rtl'); assert.equal(item.display, 'list-item');
    assert.ok(metrics.root.right - item.right >= 20, 'Every number has visible room inside the reading surface');
    assert.ok(item.left >= metrics.parent.left && item.right <= metrics.parent.right, 'Text stays inside its pane');
  }
  return metrics;
}

async function findFrame(browser: Browser, selector: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    for (const page of browser.contexts().flatMap(context => context.pages())) for (const candidate of page.frames()) {
      try { if (await candidate.locator(selector).first().isVisible()) return candidate; } catch { /* Provider mounts asynchronously. */ }
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error(`Actual VS Code view did not appear: ${selector}`);
}

export async function testRtlLists(browser: Browser, artifact: string, record: (text: string) => void) {
  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'rtl-lists.md');
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(markdown));
  const nativeDocument = await vscode.workspace.openTextDocument(uri);
  await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown.rendered');
  let frame: Frame = await findFrame(browser, '.rich-document ol');
  await frame.evaluate(() => document.fonts.ready);
  const results = [];
  for (const language of ['fa', 'en']) {
    const languageLink = frame.getByRole('link', { name: language === 'fa' ? 'فارسی' : 'English', exact: true });
    if (await languageLink.count()) await languageLink.click();
    await expect(frame.locator('.rich-document ol > li')).toHaveCount(5);
    const metrics = await listMetrics(frame.locator('.rich-document ol'));
    assert.equal(nativeDocument.getText(), markdown, 'Direction decoration must not rewrite source');
    results.push({ language, ...metrics });
  }
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  const git = await vscode.extensions.getExtension<{ getAPI(version: number): { getRepository(uri: vscode.Uri): { add(paths: string[]): Promise<void>; commit(message: string): Promise<void>; status(): Promise<void> } | null } }>('vscode.git')!.activate();
  const repository = git.getAPI(1).getRepository(uri);
  assert.ok(repository, 'The isolated fixture Git repository is registered');
  await repository.add([uri.fsPath]); await repository.commit('RTL list fixture');
  const changed = markdown + '\nمتن افزوده.\n';
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(changed));
  await expect.poll(() => nativeDocument.getText()).toBe(changed);
  await repository.status();
  await vscode.commands.executeCommand('parsiword.gitDiff', uri);
  frame = await findFrame(browser, '.comparison-workspace');
  const page = browser.contexts().flatMap(context => context.pages())[0];
  const viewport = page.viewportSize() ?? await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  await page.setViewportSize({ width: 1050, height: 850 });
  for (const language of ['en', 'fa']) {
    const switcher = frame.getByRole('button', { name: language === 'fa' ? 'فارسی' : 'English', exact: true });
    if (await switcher.count()) await switcher.click();
    await frame.locator('.comparison-toolbar').getByLabel('Rendered result', { exact: true }).click();
    await frame.locator('.comparison-toolbar').getByLabel('Side by side', { exact: true }).click();
    for (const side of ['original', 'modified']) {
      const list = frame.locator(`[data-comparison-side=${side}] .rich-document ol`);
      await expect(list.locator(':scope > li')).toHaveCount(5);
      results.push({ language, side, ...await listMetrics(list) });
    }
    assert.equal(nativeDocument.getText(), changed);
  }
  await page.screenshot({ path: join(artifact, 'rtl-list-comparison.png') });
  await page.setViewportSize(viewport);
  record('Narrow side-by-side rendered revisions retain all five Persian list markers in both interface languages');

  // Mixed-language items keep a stable marker side; their paragraph text can
  // still resolve its own direction independently of the list's indentation.
  const mixed = '1. متن فارسی\n2. English item\n   1. nested English\n   2. متن تو در تو\n3. مورد آخر\n';
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(mixed));
  await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown.rendered');
  frame = await findFrame(browser, '.rich-document ol');
  await listMetrics(frame.locator('.rich-document > ol'));
  await expect(frame.locator('.rich-document > ol > li').nth(1).locator(':scope > p')).toHaveAttribute('dir', 'ltr');
  await expect(frame.locator('.rich-document ol ol')).toHaveAttribute('dir', 'ltr');
  for (const item of await frame.locator('.rich-document ol ol > li').all()) await expect(item).toHaveAttribute('dir', 'ltr');
  await expect.poll(() => nativeDocument.getText()).toBe(mixed);
  record('Mixed and nested list items preserve marker indentation while Persian and English paragraphs retain their reading direction');
  await writeFile(join(artifact, 'rtl-list-metrics.json'), JSON.stringify(results, null, 2));
  record('The exact Persian numbered-list example reserves its RTL markers in both interface languages without changing Markdown');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
