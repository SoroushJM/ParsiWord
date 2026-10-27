import type { Diagram, DiagramPage } from './diagrams';
import { RichContentError } from './rich-content';
import { publicAsset } from './public-assets';
import { isErrorCode } from './errors';
import { prepareXeLatexSource } from './tikz-source';

type RuntimeManifest = { files: Record<string, { sha256: string; bytes: number }> };
const loadTimeout = 120_000, compileTimeout = 45_000;
const asset = (name: string) => new URL(publicAsset(`xetex/${name}`), document.baseURI).href;

async function download(name: string, maximum: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(asset(name), { signal });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > maximum) throw new Error(`Missing XeLaTeX runtime: ${name}`);
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > maximum) throw new Error('XeLaTeX resource exceeds its size limit');
      parts.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

/** The owning window fetches every asset: a blob worker cannot fetch VS Code
 * webview resources. No CDN, remote compiler, credentials or shell is used. */
export async function compileXeLatex(source: string): Promise<Uint8Array<ArrayBuffer>> {
  if (source.length > 50_000) throw new RichContentError('TIKZ_TOO_LARGE');
  source = prepareXeLatexSource(source);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), loadTimeout);
  let worker: Worker | undefined, url: string | undefined;
  try {
    const manifest = JSON.parse(new TextDecoder().decode(await download('manifest.json', 30_000, controller.signal))) as RuntimeManifest;
    const names = ['busytex.js', 'busytex.wasm.gz.bin', 'tex.data.gz.bin', 'files.json'] as const;
    const loaded = await Promise.all(names.map(async name => {
      const info = manifest.files[name];
      if (!info || !Number.isSafeInteger(info.bytes) || info.bytes <= 0 || info.bytes > 35_000_000 || !/^[a-f0-9]{64}$/.test(info.sha256)) throw new Error('Invalid XeLaTeX manifest');
      const bytes = await download(name, info.bytes, controller.signal);
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(n => n.toString(16).padStart(2, '0')).join('');
      if (digest !== info.sha256) throw new Error('XeLaTeX runtime integrity mismatch');
      return bytes;
    }));
    const runner = await download('worker.js', 20_000, controller.signal);
    clearTimeout(timer);
    const [code, wasm, tex, index] = loaded;
    const entries: unknown = JSON.parse(new TextDecoder().decode(index));
    if (!Array.isArray(entries) || entries.length > 10_000) throw new Error('Invalid XeLaTeX file index');
    url = URL.createObjectURL(new Blob([code, '\n', runner], { type: 'text/javascript' }));
    worker = new Worker(url);
    return await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
      const execution = setTimeout(() => { worker?.terminate(); reject(new RichContentError('XETEX_TIMEOUT')); }, compileTimeout);
      worker!.onerror = () => { clearTimeout(execution); reject(new RichContentError('XETEX_COMPILE_FAILED')); };
      worker!.onmessage = event => {
        const data = event.data;
        if (data?.type !== 'result' && data?.type !== 'error') return;
        clearTimeout(execution);
        if (data.type === 'result' && data.pdf instanceof Uint8Array && data.pdf.length > 4 && data.pdf.length <= 16_000_000 && new TextDecoder().decode(data.pdf.slice(0, 5)) === '%PDF-') resolve(data.pdf);
        else reject(new RichContentError(data.code === 'XETEX_FONT_MISSING' ? data.code : 'XETEX_COMPILE_FAILED', { cause: new Error(typeof data.log === 'string' ? data.log.slice(-48_000) : '') }));
      };
      worker!.postMessage({ source, wasm, tex, entries }, [wasm.buffer, tex.buffer]);
    });
  } catch (cause) {
    if (cause instanceof RichContentError && isErrorCode(cause.code)) throw cause;
    throw new RichContentError(controller.signal.aborted ? 'XETEX_LOAD_TIMEOUT' : 'XETEX_UNAVAILABLE', { cause });
  } finally { clearTimeout(timer); controller.abort(); worker?.terminate(); if (url) URL.revokeObjectURL(url); }
}

async function pdfPages(pdf: Uint8Array<ArrayBuffer>): Promise<DiagramPage[]> {
  // Use PDF.js' in-process message handler. Its parsing/painting is asynchronous;
  // the expensive TeX execution remains in the separately terminated worker.
  // This also avoids an unowned PDF worker trying to read VS Code local assets.
  const [pdfjs, handler] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs')]);
  (globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = handler;
  const task = pdfjs.getDocument({ data: pdf.slice(), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  try {
    const doc = await task.promise;
    if (doc.numPages > 12) throw new RichContentError('XETEX_TOO_LARGE');
    const result: DiagramPage[] = []; let pixels = 0, bytes = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n), view = page.getViewport({ scale: 96 / 72 });
      const scale = Math.min(2, 2400 / view.width, 3400 / view.height);
      const raster = page.getViewport({ scale: 96 / 72 * scale });
      pixels += Math.ceil(raster.width) * Math.ceil(raster.height);
      if (pixels > 32_000_000) throw new RichContentError('XETEX_TOO_LARGE');
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(raster.width); canvas.height = Math.ceil(raster.height);
      const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas unavailable');
      try {
        await page.render({ canvas, canvasContext: context, viewport: raster, background: '#fff' }).promise;
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG encoding failed')), 'image/png'));
        const png = new Uint8Array(await blob.arrayBuffer()); bytes += png.length;
        if (bytes > 16_000_000) throw new RichContentError('XETEX_TOO_LARGE');
        result.push({ png, width: view.width, height: view.height, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view.width} ${view.height}"><image width="${view.width}" height="${view.height}" href="${canvas.toDataURL('image/png')}"/></svg>` });
      } finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
    }
    return result;
  } finally { await task.destroy(); }
}

export async function renderXeLatex(source: string): Promise<Diagram> {
  const pdf = await compileXeLatex(source);
  try {
    const pages = await pdfPages(pdf), width = Math.max(...pages.map(page => page.width));
    let height = 0;
    const content = pages.map(page => { const y = height; height += page.height; return `<g transform="translate(0 ${y})">${page.svg}</g>`; }).join('');
    return { ...pages[0], width, height, pages, pdf, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${content}</svg>` };
  } catch (cause) {
    if (cause instanceof RichContentError) throw cause;
    throw new RichContentError('XETEX_PREVIEW_FAILED', { cause });
  }
}
