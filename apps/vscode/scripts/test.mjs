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
await mkdir(resolve(runDirectory, 'profile/User'), { recursive: true });
await mkdir(resolve(runDirectory, 'extensions'), { recursive: true });
await writeFile(resolve(runDirectory, 'profile/User/settings.json'), JSON.stringify({ 'files.simpleDialog.enable': true, 'files.autoSave': 'off', 'workbench.colorTheme': 'Default Light Modern', 'window.titleBarStyle': 'custom', 'window.restoreWindows': 'none', 'workbench.startupEditor': 'none', 'security.workspace.trust.enabled': false, 'update.mode': 'none', 'git.autofetch': false, 'extensions.autoUpdate': false, 'window.commandCenter': false, 'telemetry.telemetryLevel': 'off' }));
const markdown = '# عنوان فارسی\n\nمتن فارسی و English SEARCHABLE_EXTENSION.\n\n## فصل دوم\n\n[Next](./other.md)\n\n- [x] کار انجام‌شده\n\n| نام | عدد |\n| --- | --- |\n| تست | 42 |\n\nفرمول $E=mc^2$\n\n```mermaid\nflowchart LR\nA[شروع] --> B[End]\n```\n\n```typescript\nconst answer = 42;\n```\n';
await writeFile(resolve(fixture, 'sample.md'), markdown);
await writeFile(resolve(fixture, 'other.md'), '# Other\n\nLinked document.\n');
await writeFile(resolve(fixture, 'crlf.md'), '# Windows\r\n\r\nمتن اصلی\r\n');
await writeFile(resolve(fixture, 'nested folder/nested.md'), '# Nested\n');
const git = args => { const result = spawnSync('git', args, { cwd: fixture, encoding: 'utf8' }); if (result.status) throw Error(result.stderr); };
git(['init','-b','main']); git(['add','.']);
git(['-c','user.name=ParsiWord Test','-c','user.email=parsiword-test@example.invalid','commit','--allow-empty','-m','Integration fixture']);
await writeFile(resolve(fixture, 'nested folder/nested.md'), '# Nested\n\nWorking tree edit.\n');
git(['add','nested folder/nested.md']);
await writeFile(resolve(fixture, 'nested folder/nested.md'), '# Nested\n\nWorking tree edit.\n\nUnstaged.\n');
await build({ entryPoints: [resolve(root,'apps/vscode/test/runner.ts')], outfile: resolve(root,'apps/vscode/dist/test.cjs'), platform: 'node', format: 'cjs', bundle: true, external: ['vscode','@playwright/test','jszip','pdfjs-dist/*'] });
const server = createServer(); await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const port = server.address().port; await new Promise(resolve => server.close(resolve));
await runTests({
  vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH || (process.platform === 'win32' && await access('C:/Program Files/Microsoft VS Code/Code.exe').then(()=>true,()=>false) ? 'C:/Program Files/Microsoft VS Code/Code.exe' : undefined),
  extensionDevelopmentPath: cliPath(resolve(root,'apps/vscode')), extensionTestsPath: cliPath(resolve(root,'apps/vscode/dist/test.cjs')),
  launchArgs: [cliPath(fixture), '--new-window', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', '--disable-updates', '--disable-extension=github.copilot-chat', '--disable-extension=github.copilot', `--user-data-dir=${cliPath(resolve(runDirectory,'profile'))}`, `--extensions-dir=${cliPath(resolve(runDirectory,'extensions'))}`, `--remote-debugging-port=${port}`],
  extensionTestsEnv: { PARSIWORD_TEST_CDP: String(port), PARSIWORD_TEST_ARTIFACT: artifact },
});
// Parse the actual exported PDF in Node, outside Electron's extension host,
// where PDF.js can load its optional canvas bindings normally.
const reportPath=resolve(artifact,'results.json');
const report=JSON.parse(await readFile(reportPath,'utf8'));
const { getDocument }=await import('pdfjs-dist/legacy/build/pdf.mjs');
const pdf=await getDocument({data:new Uint8Array(await readFile(report.exports.pdf)),useSystemFonts:false,disableFontFace:true,isEvalSupported:false}).promise;
const content=await (await pdf.getPage(1)).getTextContent();
if(!content.items.filter(item=>'str' in item).map(item=>item.str).join(' ').includes('SEARCHABLE_EXTENSION')) throw Error('Exported PDF text is not searchable');
await pdf.destroy();
report.results.push('Actual exported PDF parsed outside Electron: text remains searchable');
await writeFile(reportPath,JSON.stringify(report,null,2));
console.log('PASS Actual exported PDF contains searchable text');
