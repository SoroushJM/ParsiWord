import { runTests } from '@vscode/test-electron';
import { build } from 'esbuild';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const root = fileURLToPath(new URL('../../../', import.meta.url));
// test-electron 2.x launches through cmd.exe on Windows, so paths with spaces
// need quoting before that shell forwards them to Code.exe.
const cliPath = path => process.platform === 'win32' ? `"${path}"` : path;
const artifact = resolve(root, 'artifacts/vscode-test');
const runDirectory = resolve(artifact, `run-${Date.now()}`);
const fixture = resolve(runDirectory, 'workspace');
await mkdir(resolve(fixture, 'nested folder'), { recursive: true });
await mkdir(resolve(fixture, 'nested folder/assets'), { recursive: true });
await mkdir(resolve(fixture, 'image export/assets'), { recursive: true });
await mkdir(resolve(runDirectory, 'profile/User'), { recursive: true });
await mkdir(resolve(runDirectory, 'extensions'), { recursive: true });
await writeFile(resolve(runDirectory, 'profile/User/settings.json'), JSON.stringify({ 'files.simpleDialog.enable': true, 'files.autoSave': 'off', 'workbench.colorTheme': 'Default Light Modern', 'window.titleBarStyle': 'custom', 'window.restoreWindows': 'none', 'workbench.startupEditor': 'none', 'security.workspace.trust.enabled': false, 'update.mode': 'none', 'git.autofetch': false, 'extensions.autoUpdate': false, 'window.commandCenter': false, 'telemetry.telemetryLevel': 'off' }));
const markdown = '# عنوان فارسی\n\nمتن فارسی و English SEARCHABLE_EXTENSION.\n\n## فصل دوم\n\n[Next](./other.md)\n\n- [x] کار انجام‌شده\n\n| نام | عدد |\n| --- | --- |\n| تست | 42 |\n\nفرمول $E=mc^2$\n\n```mermaid\nflowchart LR\nA[شروع] --> B[End]\n```\n\n```typescript\nconst answer = 42;\n```\n';
await writeFile(resolve(fixture, 'sample.md'), markdown);
await writeFile(resolve(fixture, 'other.md'), '# Other\n\nLinked document.\n');
await writeFile(resolve(fixture, 'crlf.md'), '# Windows\r\n\r\nمتن اصلی\r\n');
await writeFile(resolve(fixture, 'tikz.md'), 'TIKZ_NATIVE_SEARCHABLE متن فارسی با $x^2$.\n\n' + await readFile(resolve(root, 'examples/tikz-geometry.md'), 'utf8'));
await writeFile(resolve(fixture, 'nested folder/assets/diagram.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><circle cx="80" cy="50" r="40" fill="none" stroke="green"/><path d="M80 50L120 50M80 50L80 10" stroke="blue"/></svg>');
await writeFile(resolve(fixture, 'image export/assets/circle.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><circle cx="80" cy="50" r="40" fill="none" stroke="green"/><path d="M80 50L120 50M80 50L80 10" stroke="blue"/></svg>');
await writeFile(resolve(fixture, 'image export/assets/sample image.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAYAAAChS3wfAAAAYElEQVR4nO3QMQEAIAgAMOIYw9PABKIJxuBgxwos6r6edG6NCgECBAgQIECAAAECBAgQIECAAAECBAgQIGBTQL6edLJGCRAgQIAAAQIECBAgQIAAAQIECBAgQIAAAYsCPgHNzcMN6g4/AAAAAElFTkSuQmCC', 'base64'));
await writeFile(resolve(fixture, 'image export/image-export.md'), '# تصویرهای محلی\n\nSEARCHABLE_IMAGE_EXPORT متن قابل ویرایش.\n\n![بردار SVG](./assets/circle.svg)\n\n![نگاره PNG][raster]\n\n[raster]: <./assets/sample image.png> "Raster"\n');
const diagram = '\n![شرح تصویر](./assets/diagram.svg)\n';
const scrollContent = '\n' + Array.from({ length: 24 }, (_, index) => `## بخش اسکرول ${index + 1}\n\nمتن مشترک فارسی و English paragraph ${index + 1} برای آزمایش اسکرول هماهنگ در دو سوی مقایسه. این پاراگراف بلند است تا با تغییر عرض ستون‌ها در چند خط بشکند و موقعیت یکسان محتوا را مستقل از درصد اسکرول بررسی کنیم.\n`).join('\n');
await writeFile(resolve(fixture, 'nested folder/nested.md'), '# مقایسه فارسی و English\n\nمتن ORIGINAL برای مقایسه.\n\nاین بخش ثابت است و تغییری ندارد.\n' + diagram + scrollContent);
const git = args => { const result = spawnSync('git', args, { cwd: fixture, encoding: 'utf8' }); if (result.status) throw Error(result.stderr); };
git(['init','-b','main']); git(['add','.']);
git(['-c','user.name=ParsiWord Test','-c','user.email=parsiword-test@example.invalid','commit','--allow-empty','-m','Integration fixture']);
await writeFile(resolve(fixture, 'nested folder/nested.md'), '# مقایسه فارسی و English\n\nمتن STAGED برای مقایسه.\n\nاین بخش ثابت است و تغییری ندارد.\n' + diagram + scrollContent);
git(['add','nested folder/nested.md']);
const insertedLines = '\n' + Array.from({ length: 12 }, (_, index) => `خط افزودهٔ مستقل ${index + 1} فقط در نسخهٔ فعلی.`).join('\n') + '\n';
await writeFile(resolve(fixture, 'nested folder/nested.md'), '# مقایسه فارسی و English\n\nمتن WORKING برای مقایسه.\n\nاین بخش ثابت است و تغییری ندارد.\n\nخط افزوده در فایل فعلی.\n' + diagram + insertedLines + scrollContent);
await build({ entryPoints: [resolve(root,'apps/vscode/test/runner.ts')], outfile: resolve(root,'apps/vscode/dist/test.cjs'), platform: 'node', format: 'cjs', bundle: true, external: ['vscode','@playwright/test','jszip','pdfjs-dist/*'] });
const server = createServer(); await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const port = server.address().port; await new Promise(resolve => server.close(resolve));
await runTests({
  vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH || (process.platform === 'win32' && await access('C:/Program Files/Microsoft VS Code/Code.exe').then(()=>true,()=>false) ? 'C:/Program Files/Microsoft VS Code/Code.exe' : undefined),
  extensionDevelopmentPath: cliPath(resolve(root,'apps/vscode')), extensionTestsPath: cliPath(resolve(root,'apps/vscode/dist/test.cjs')),
  launchArgs: [cliPath(fixture), '--new-window', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', '--disable-updates', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-extension=github.copilot-chat', '--disable-extension=github.copilot', `--user-data-dir=${cliPath(resolve(runDirectory,'profile'))}`, `--extensions-dir=${cliPath(resolve(runDirectory,'extensions'))}`, `--remote-debugging-port=${port}`],
  extensionTestsEnv: { PARSIWORD_TEST_CDP: String(port), PARSIWORD_TEST_ARTIFACT: artifact, ...(process.env.PARSIWORD_TEST_FOCUS ? { PARSIWORD_TEST_FOCUS: process.env.PARSIWORD_TEST_FOCUS } : {}), ...(process.env.PARSIWORD_TEST_THEME_WITNESS ? { PARSIWORD_TEST_THEME_WITNESS: process.env.PARSIWORD_TEST_THEME_WITNESS } : {}) },
});
// Parse the actual exported PDF in Node, outside Electron's extension host,
// where PDF.js can load its optional canvas bindings normally.
if (!process.env.PARSIWORD_TEST_THEME_WITNESS) {
const reportPath=resolve(artifact,'results.json');
const report=JSON.parse(await readFile(reportPath,'utf8'));
if (process.env.PARSIWORD_TEST_FOCUS && !['image-export', 'tikz'].includes(process.env.PARSIWORD_TEST_FOCUS)) process.exit(0);
const { getDocument, OPS }=await import('pdfjs-dist/legacy/build/pdf.mjs');
if (report.tikzExports) {
  const tikzPdf = await getDocument({ data: new Uint8Array(await readFile(report.tikzExports.pdf)), useSystemFonts: false, disableFontFace: true, isEvalSupported: false }).promise;
  let imageCount = 0, text = '', structure = '';
  try {
    for (let number = 1; number <= tikzPdf.numPages; number++) {
      const page = await tikzPdf.getPage(number), operators = await page.getOperatorList();
      imageCount += operators.fnArray.filter(value => value === OPS.paintImageXObject).length;
      text += (await page.getTextContent()).items.filter(item => 'str' in item).map(item => item.str).join(' ');
      structure += JSON.stringify(await page.getStructTree());
    }
    if (imageCount !== 5) throw Error(`Expected TikZ drawing and four formula images in native PDF, got ${imageCount}`);
    if (!text.includes('TIKZ_NATIVE_SEARCHABLE') || !structure.includes('coordinate')) throw Error('TikZ PDF lost searchable text or original drawing source alt metadata');
  } finally { await tikzPdf.destroy(); }
  report.results.push('Actual TikZ PDF parsed outside Electron: five real image operations, source alt structure and searchable text are present');
  report.tikzPdf = { imageCount, searchableText: true, sourceAlt: true };
  console.log('PASS Actual exported TikZ PDF contains geometry, formulas, source alt metadata and searchable text');
}
if (report.imageExports) {
  const imagesPdf=await getDocument({data:new Uint8Array(await readFile(report.imageExports.pdf)),useSystemFonts:false,disableFontFace:true,isEvalSupported:false}).promise;
  const imageOperators=new Set([OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageXObjectRepeat]);
  let imageCount=0, text='';
  try {
    for(let number=1;number<=imagesPdf.numPages;number++) {
      const page=await imagesPdf.getPage(number);
      const operators=await page.getOperatorList();
      imageCount+=operators.fnArray.filter(value=>imageOperators.has(value)).length;
      const content=await page.getTextContent();
      text+=content.items.filter(item=>'str' in item).map(item=>item.str).join(' ');
    }
    if(imageCount!==2) throw Error(`Expected both actual Markdown images in exported PDF, got ${imageCount} image paint operations`);
    if(!text.includes('SEARCHABLE_IMAGE_EXPORT')) throw Error('Image export lost searchable surrounding PDF text');
  } finally { await imagesPdf.destroy(); }
  report.results.push('Actual local-image PDF parsed outside Electron: both SVG/PNG image paint operations and searchable text are present');
  report.imageExportPdf={imageCount,searchableText:true};
  console.log('PASS Actual exported local-image PDF contains both image paint operations and searchable text');
}
if (['image-export', 'tikz'].includes(process.env.PARSIWORD_TEST_FOCUS)) {
  await writeFile(reportPath,JSON.stringify(report,null,2));
  process.exit(0);
}
const pdf=await getDocument({data:new Uint8Array(await readFile(report.exports.pdf)),useSystemFonts:false,disableFontFace:true,isEvalSupported:false}).promise;
const content=await (await pdf.getPage(1)).getTextContent();
if(!content.items.filter(item=>'str' in item).map(item=>item.str).join(' ').includes('SEARCHABLE_EXTENSION')) throw Error('Exported PDF text is not searchable');
await pdf.destroy();
report.results.push('Actual exported PDF parsed outside Electron: text remains searchable');
await writeFile(reportPath,JSON.stringify(report,null,2));
console.log('PASS Actual exported PDF contains searchable text');
}
