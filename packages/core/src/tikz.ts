import type { Diagram } from './diagrams';
import { RichContentError } from './rich-content';
import { ParsiWordError } from './errors';
import { publicAsset } from './public-assets';
import { prepareTikzSource, requiresXeLatex } from './tikz-source';
import { outlineTikzSvg, type TikzGlyphFont } from './tikz-svg';

// Cold website downloads need their own budget; the execution limit applies
// once the engine is ready to execute the document's TeX program.
const jobTimeout = 20_000, assetTimeout = 60_000, loadTimeout = 90_000, idleTimeout = 10_000;
const sourceLimit = 50_000, cacheBudget = 8_000_000;
const cache = new Map<string, Promise<Diagram>>();
const inFlight = new Map<string, Promise<Diagram>>();
const fontCache = new Map<string, Promise<TikzGlyphFont>>();
let cacheBytes = 0, pendingJobs = 0, pendingCharacters = 0, queue: Promise<unknown> = Promise.resolve();
let active: TexWorker | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
function asset(path: string) { return new URL(publicAsset(`tikz/${path}`), document.baseURI).href; }

/** One engine only: a loaded TeX core and a job each consume about 156 MiB. */
class TexWorker {
  private worker?: Worker;
  private serial = 0;
  private pending?: { uid: number; resolve(value: unknown): void; reject(error: unknown): void; timeoutCode: 'TIKZ_TIMEOUT' | 'TIKZ_LOAD_TIMEOUT'; timer: ReturnType<typeof setTimeout> };
  private ready?: Promise<void>;
  private assets = new Map<string, string>();
  private assetRequests = new Map<number, { abort: AbortController; timer: ReturnType<typeof setTimeout> }>();
  private log = '';
  private fault = false;
  terminate() {
    this.worker?.terminate(); this.worker = undefined;
    for (const request of this.assetRequests.values()) { clearTimeout(request.timer); request.abort.abort(); }
    this.assetRequests.clear(); this.assets.clear();
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new RichContentError('TIKZ_UNAVAILABLE')); this.pending = undefined; }
  }
  private fail(error: unknown) {
    const pending = this.pending; this.pending = undefined;
    if (pending) { clearTimeout(pending.timer); pending.reject(error); }
    this.terminate();
    if (active === this) active = undefined;
  }
  async load() {
    this.ready ??= this.initialize();
    return this.ready;
  }
  private async initialize() {
    let url: string | undefined;
    const deadline = Date.now() + loadTimeout;
    const abort = new AbortController();
    const fetchTimer = setTimeout(() => abort.abort(), assetTimeout);
    try {
      const [codeResponse, manifestResponse] = await Promise.all([fetch(asset('run-tex.js'), { signal: abort.signal }), fetch(asset('manifest.json'), { signal: abort.signal })]);
      if (!codeResponse.ok || !manifestResponse.ok) throw new Error('Missing TikZ runtime');
      const [code, manifest] = await Promise.all([codeResponse.text(), manifestResponse.json() as Promise<{ files: Record<string, string> }>]);
      clearTimeout(fetchTimer);
      const root = asset('');
      const allowed = Object.keys(manifest.files).filter(name => /^(?:tex\.wasm\.gz\.bin|core\.dump\.gz\.bin|tex_files\/[\w.-]+\.gz\.bin)$/.test(name)).map(name => [new URL(name.replace(/\.bin$/, ''), root).href, new URL(name, root).href]);
      this.assets = new Map(allowed.map(([virtual, actual]) => [virtual, actual]));
      // TeX's VFS tries a second fetch on a missing \input. Keep both attempts
      // inside the pinned asset manifest, including when the document is hostile.
      // VS Code's local-resource service worker cannot associate a blob worker
      // with its owning webview. Fetch on the owning window and transfer only
      // compressed bytes; the real TeX heap remains entirely in this worker.
      const guard = `const __allowed=new Set(${JSON.stringify(allowed.map(([virtual]) => virtual))}),__requests=new Map();let __requestId=0;self.addEventListener('message',event=>{const d=event.data;if(d?.type!=='parsiword-asset-response')return;event.stopImmediatePropagation();const p=__requests.get(d.id);if(!p)return;__requests.delete(d.id);p.resolve(new Response(d.bytes,{status:d.status}))});self.fetch=(input,init)=>{let u;try{u=new URL(typeof input==='string'?input:input.url,${JSON.stringify(root)}).href}catch{return Promise.reject(new Error('Invalid TeX resource'))}if(!__allowed.has(u)||init?.method&&init.method!=='GET')return Promise.reject(new Error('TeX resource is not bundled'));return new Promise((resolve,reject)=>{const id=++__requestId;__requests.set(id,{resolve,reject});self.postMessage({type:'parsiword-asset-request',id,url:u})})};\n`;
      url = URL.createObjectURL(new Blob([guard, code], { type: 'text/javascript' }));
      this.worker = new Worker(url);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { reject(new RichContentError('TIKZ_LOAD_TIMEOUT')); this.terminate(); }, Math.min(jobTimeout, Math.max(1, deadline - Date.now())));
        this.worker!.onerror = () => { clearTimeout(timer); reject(new RichContentError('TIKZ_UNAVAILABLE')); this.fail(new RichContentError('TIKZ_UNAVAILABLE')); };
        this.worker!.onmessage = event => {
          if (event.data?.type === 'init') { clearTimeout(timer); resolve(); }
          else this.receive(event.data);
        };
      });
      await this.call('load', [root.replace(/\/$/, '')], Math.max(1, deadline - Date.now()));
    } catch (cause) {
      this.terminate(); if (active === this) active = undefined;
      if (cause instanceof RichContentError) throw cause;
      if (abort.signal.aborted) throw new RichContentError('TIKZ_LOAD_TIMEOUT', { cause });
      throw new RichContentError('TIKZ_UNAVAILABLE', { cause });
    } finally { clearTimeout(fetchTimer); abort.abort(); if (url) URL.revokeObjectURL(url); }
  }
  private receive(message: unknown) {
    if (typeof message === 'string') {
      if (/^!|LaTeX Error|Fatal error|Runaway argument/m.test(message)) this.fault = true;
      this.log = (this.log + '\n' + message).slice(-4096); return;
    }
    if (!message || typeof message !== 'object') return;
    if ('type' in message && message.type === 'parsiword-asset-request') {
      const request = message as { id?: unknown; url?: unknown };
      if (Number.isSafeInteger(request.id) && Number(request.id) > 0 && Number(request.id) <= 1_000_000) void this.serveAsset(Number(request.id), request.url);
      return;
    }
    const data = message as { type?: string; uid?: number; complete?: boolean; payload?: unknown };
    if (data.type === 'uncaughtError') { this.fail(new RichContentError('TIKZ_RENDER_FAILED')); return; }
    if (!this.pending || data.uid !== this.pending.uid) return;
    if (data.type === 'error') { this.fail(new RichContentError('TIKZ_RENDER_FAILED', { cause: new Error(this.log) })); return; }
    if (data.type === 'result' && data.complete) {
      const pending = this.pending; this.pending = undefined; clearTimeout(pending.timer);
      if (this.fault) { pending.reject(new RichContentError('TIKZ_RENDER_FAILED', { cause: new Error(this.log) })); this.terminate(); if (active === this) active = undefined; }
      else pending.resolve(data.payload);
    }
  }
  private async serveAsset(id: number, url: unknown) {
    const worker = this.worker;
    if (!worker) return;
    const actual = typeof url === 'string' ? this.assets.get(url) : undefined;
    if (!actual || this.assetRequests.has(id) || this.assetRequests.size >= 8) {
      worker.postMessage({ type: 'parsiword-asset-response', id, status: 403, bytes: new Uint8Array() }); return;
    }
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), assetTimeout);
    this.assetRequests.set(id, { abort, timer });
    try {
      const response = await fetch(actual, { signal: abort.signal });
      let bytes = new Uint8Array();
      if (response.ok) {
        if (!response.body || Number(response.headers.get('content-length')) > 4_000_000) throw new Error('TikZ runtime asset is too large');
        const reader = response.body.getReader(), parts: Uint8Array[] = []; let length = 0;
        try {
          while (true) {
            const item = await reader.read(); if (item.done) break;
            length += item.value.byteLength;
            if (length > 4_000_000) throw new Error('TikZ runtime asset is too large');
            parts.push(item.value);
          }
        } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
        bytes = new Uint8Array(length); let offset = 0;
        for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
      }
      if (this.worker === worker && !abort.signal.aborted) worker.postMessage({ type: 'parsiword-asset-response', id, status: response.ok ? 200 : 404, bytes }, [bytes.buffer]);
    } catch {
      if (this.worker === worker) {
        if (abort.signal.aborted) this.fail(new RichContentError(this.pending?.timeoutCode ?? 'TIKZ_UNAVAILABLE'));
        else worker.postMessage({ type: 'parsiword-asset-response', id, status: 502, bytes: new Uint8Array() });
      }
    } finally { clearTimeout(timer); this.assetRequests.delete(id); }
  }
  private call(method: 'load' | 'texify', args: unknown[], timeout = jobTimeout): Promise<unknown> {
    this.log = ''; this.fault = false;
    return new Promise((resolve, reject) => {
      const uid = ++this.serial;
      const timeoutCode = method === 'load' ? 'TIKZ_LOAD_TIMEOUT' : 'TIKZ_TIMEOUT';
      this.pending = { uid, resolve, reject, timeoutCode, timer: setTimeout(() => this.fail(new RichContentError(timeoutCode)), timeout) };
      this.worker!.postMessage({ type: 'run', uid, method, args });
    });
  }
  async compile(source: string) {
    const prepared = prepareTikzSource(source);
    await this.load();
    const svg = await this.call('texify', [prepared.source, { ...prepared.options, showConsole: true }]);
    if (typeof svg !== 'string') throw new RichContentError('TIKZ_RENDER_FAILED');
    return svg;
  }
}

async function font(name: string): Promise<TikzGlyphFont> {
  let result = fontCache.get(name);
  if (!result) {
    result = (async () => {
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), assetTimeout);
      try {
        const response = await fetch(asset(`glyphs/${name}.json.gz.bin`), { signal: abort.signal });
        if (!response.ok || !response.body) throw new Error('Missing TikZ glyph font');
        const reader = response.body.pipeThrough(new DecompressionStream('gzip')).getReader();
        const parts: Uint8Array[] = []; let length = 0;
        try {
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            length += value.byteLength;
            if (length > 1_000_000) throw new Error('TikZ glyph font is too large');
            parts.push(value);
          }
        } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
        const bytes = new Uint8Array(length); let offset = 0;
        for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
        return JSON.parse(new TextDecoder().decode(bytes)) as TikzGlyphFont;
      } catch (cause) {
        if (abort.signal.aborted) throw new RichContentError('TIKZ_LOAD_TIMEOUT', { cause });
        throw cause;
      } finally { clearTimeout(timer); }
    })();
    fontCache.set(name, result);
    if (fontCache.size > 16) fontCache.delete(fontCache.keys().next().value!);
    result.catch(() => fontCache.delete(name));
  }
  return result;
}

async function render(source: string): Promise<Diagram> {
  if (idle) clearTimeout(idle);
  if (requiresXeLatex(source)) {
    active?.terminate(); active = undefined; fontCache.clear();
    const { renderXeLatex } = await import('./xetex');
    return renderXeLatex(source);
  }
  active ??= new TexWorker();
  try {
    const raw = await active.compile(source);
    const outlined = await outlineTikzSvg(raw, font);
    const url = URL.createObjectURL(new Blob([outlined.svg], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { image.src = ''; reject(new RichContentError('TIKZ_TIMEOUT')); }, jobTimeout);
        image.onload = () => { clearTimeout(timer); resolve(); }; image.onerror = () => { clearTimeout(timer); reject(new Error('TikZ SVG decode failed')); }; image.src = url;
      });
      const scale = Math.min(2, 4096 / outlined.width, 4096 / outlined.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(outlined.width * scale)); canvas.height = Math.max(1, Math.ceil(outlined.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        const timer = setTimeout(() => reject(new RichContentError('TIKZ_TIMEOUT')), jobTimeout);
        canvas.toBlob(blob => { clearTimeout(timer); blob ? resolve(blob) : reject(new Error('TikZ PNG encode failed')); }, 'image/png');
      });
      return { ...outlined, png: new Uint8Array(await blob.arrayBuffer()) };
    } finally { URL.revokeObjectURL(url); }
  } catch (cause) {
    active?.terminate(); active = undefined;
    if (cause instanceof RichContentError) throw cause;
    if (cause instanceof ParsiWordError) throw new RichContentError(cause.code, { cause });
    throw new RichContentError('TIKZ_RENDER_FAILED', { cause });
  } finally {
    idle = setTimeout(() => { active?.terminate(); active = undefined; fontCache.clear(); }, idleTimeout);
  }
}

/** Compile with real e-TeX/PGF in an isolated, bounded, entirely local worker. */
export function renderTikz(source: string): Promise<Diagram> {
  if (source.length > sourceLimit) return Promise.reject(new RichContentError('TIKZ_TOO_LARGE'));
  const hit = inFlight.get(source) ?? cache.get(source); if (hit) return hit;
  if (pendingJobs >= 256 || pendingCharacters + source.length > 1_000_000) return Promise.reject(new RichContentError('TIKZ_TOO_LARGE'));
  pendingJobs++; pendingCharacters += source.length;
  const result = queue.then(() => render(source)).then(diagram => {
    cacheBytes += (diagram.pages?.reduce((sum, page) => sum + page.png.byteLength, 0) ?? diagram.png.byteLength) + diagram.svg.length * 2 + (diagram.pdf?.byteLength ?? 0);
    // Cached renderings stay small; the large TeX heap is released independently.
    if (cacheBytes > cacheBudget) { cache.clear(); cacheBytes = 0; }
    return diagram;
  }).catch(error => { cache.delete(source); throw error; }).finally(() => { pendingJobs--; pendingCharacters -= source.length; inFlight.delete(source); });
  queue = result.then(() => undefined, () => undefined);
  cache.set(source, result);
  inFlight.set(source, result);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return result;
}
