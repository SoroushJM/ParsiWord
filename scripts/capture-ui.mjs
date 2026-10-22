// One-call development screenshot, without Playwright or an end-to-end test run.
// npm run ui:capture -- --width 393 --height 851 --output /tmp/mobile.png
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile, access } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createServer } from 'vite';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[i + 1]]);
  return pairs;
}, []));
const width = Number(args.width || 1100), height = Number(args.height || 800);
const output = resolve(args.output || 'artifacts/ui-preview.png');
if (!(width >= 320 && height >= 320)) throw new Error('Width and height must be at least 320.');
if (args.view !== undefined && !['edit', 'preview'].includes(args.view)) throw new Error('View must be edit or preview.');
let chrome = args.chrome || process.env.CHROME_BIN;
if (!chrome) {
  const cache = join(homedir(), '.cache/ms-playwright');
  for (const folder of (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium-')).reverse()) {
    for (const suffix of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
      const candidate = join(cache, folder, suffix);
      if (await access(candidate).then(() => true, () => false)) { chrome = candidate; break; }
    }
    if (chrome) break;
  }
}
if (!chrome) throw new Error('Set CHROME_BIN to an installed Chromium/Chrome executable.');

const url = 'http://127.0.0.1:1420';
let server, browser, socket;
const profile = await mkdtemp(join(tmpdir(), 'parsiword-capture-'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const available = await fetch(url, { signal: AbortSignal.timeout(1000) }).then(r => r.ok, () => false);
  if (!available) {
    server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 1420, strictPort: true } });
    await server.listen();
  }
  browser = spawn(chrome, ['--headless', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = await readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '');
    if (value) { port = value.split('\n')[0]; break; }
    await delay(100);
  }
  if (!port) throw new Error('Chromium did not expose its local capture endpoint.');
  const page = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = async event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(message.error.message)); else request?.resolve(message.result);
    } else if (message.method === 'Runtime.bindingCalled' && message.params.name === '__parsiwordCapture') {
      const { id } = JSON.parse(message.params.payload);
      try {
        const png = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
        await mkdir(dirname(output), { recursive: true });
        await writeFile(output, Buffer.from(png.data, 'base64'));
        await send('Runtime.evaluate', { expression: `window.__parsiwordCaptureDone(${id}, ${JSON.stringify(output)})` });
      } catch (error) {
        await send('Runtime.evaluate', { expression: `window.__parsiwordCaptureDone(${id}, '', ${JSON.stringify(error.message)})` });
      }
    }
  };
  await send('Runtime.enable');
  await send('Runtime.addBinding', { name: '__parsiwordCapture' });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 900 });
  await send('Page.navigate', { url });
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    const result = await send('Runtime.evaluate', { expression: 'Boolean(window.parsiwordDev)' });
    if (result.result.value) { ready = true; break; }
    await delay(100);
  }
  if (!ready) throw new Error('The development screenshot function did not load.');
  const options = {};
  if (args.markdown) options.markdown = await readFile(args.markdown, 'utf8');
  if (args.scroll !== undefined) options.scrollY = Number(args.scroll);
  if (args.view !== undefined) options.view = args.view;
  const result = await send('Runtime.evaluate', { expression: `window.parsiwordDev.screenshot(${JSON.stringify(options)})`, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Capture failed');
  const layout = await send('Runtime.evaluate', { expression: `JSON.stringify((() => {
    const editor = document.querySelector('textarea');
    const preview = document.querySelector('.preview-panel');
    const toolbar = document.querySelector('.format-toolbar');
    const richToolbar = document.querySelector('.rich-toolbar-container');
    const viewSwitch = document.querySelector('.mobile-view-switch');
    const visible = element => Boolean(element && element.getClientRects().length);
    const editorVisible = visible(editor), previewVisible = visible(preview);
    return {
      width: innerWidth, height: innerHeight,
      view: editorVisible && previewVisible ? 'both' : previewVisible ? 'preview' : 'edit',
      overflow: document.documentElement.scrollWidth > innerWidth,
      editorVisible, previewVisible,
      editorHeight: editorVisible ? editor.clientHeight : null,
      editorScrollHeight: editorVisible ? editor.scrollHeight : null,
      previewHeight: previewVisible ? preview.clientHeight : null,
      previewScrollHeight: previewVisible ? preview.scrollHeight : null,
      toolbarTop: visible(toolbar) ? toolbar.getBoundingClientRect().top : null,
      richToolbarTop: visible(richToolbar) ? richToolbar.getBoundingClientRect().top : null,
      viewSwitchTop: visible(viewSwitch) ? viewSwitch.getBoundingClientRect().top : null,
      richEditorEditable: previewVisible ? Boolean(document.querySelector('.rich-document')?.isContentEditable) : null,
      badges: document.querySelectorAll('.offline-badge, .live-label').length,
    };
  })())`, returnByValue: true });
  console.log(JSON.stringify({ screenshot: result.result.value, ...JSON.parse(layout.result.value) }));
  await send('Browser.close').catch(() => {});
} finally {
  socket?.close();
  browser?.kill('SIGTERM');
  await server?.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
