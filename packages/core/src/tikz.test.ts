import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./public-assets', () => ({ publicAsset: (path: string) => `https://parsiword.test/assets/${path}` }));
beforeEach(() => { vi.resetModules(); vi.stubGlobal('document', { baseURI: 'https://parsiword.test/documents/a' }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('bounded real TikZ worker lifecycle', () => {
  it.each([
    [String.raw`\documentclass{article}\usepackage{xepersian}\begin{document}سؤال\end{document}`, 'TIKZ_ENGINE_UNSUPPORTED'],
    [String.raw`\documentclass{exam}\begin{document}Question\end{document}`, 'TIKZ_DOCUMENT_UNSUPPORTED'],
  ])('preserves an actionable incompatibility error without downloading or starting TeX: %s', async (source, code) => {
    const fetch = vi.fn(), Worker = vi.fn(); vi.stubGlobal('fetch', fetch); vi.stubGlobal('Worker', Worker);
    const { renderTikz } = await import('./tikz');
    await expect(renderTikz(source)).rejects.toMatchObject({ code });
    expect(fetch).not.toHaveBeenCalled(); expect(Worker).not.toHaveBeenCalled();
  });
  it('rejects excessive source before fetching or allocating a worker', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { renderTikz } = await import('./tikz');
    await expect(renderTikz('x'.repeat(50_001))).rejects.toMatchObject({ code: 'TIKZ_TOO_LARGE' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('deduplicates pending jobs even after completed-cache capacity is exceeded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const { renderTikz } = await import('./tikz');
    const jobs = Array.from({ length: 20 }, (_, index) => renderTikz(`\\draw (0,0)--(${index},1);`));
    expect(renderTikz('\\draw (0,0)--(0,1);')).toBe(jobs[0]);
    const results = await Promise.allSettled(jobs);
    expect(results.every(result => result.status === 'rejected' && result.reason.code === 'TIKZ_UNAVAILABLE')).toBe(true);
  });
  it('bounds pending job count and releases capacity after failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const { renderTikz } = await import('./tikz');
    const jobs = Array.from({ length: 256 }, (_, index) => renderTikz(`\\draw (0,0)--(${index},2);`));
    await expect(renderTikz('\\draw (0,0)--(999,2);')).rejects.toMatchObject({ code: 'TIKZ_TOO_LARGE' });
    await Promise.allSettled(jobs);
    await expect(renderTikz('\\draw (0,0)--(999,2);')).rejects.toMatchObject({ code: 'TIKZ_UNAVAILABLE' });
  });
  it('bounds aggregate queued source independently of job count and deduplication', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const { renderTikz } = await import('./tikz');
    const sources = Array.from({ length: 20 }, (_, index) => String(index).padStart(2, '0') + 'x'.repeat(49_998));
    const jobs = sources.map(renderTikz);
    expect(renderTikz(sources[0])).toBe(jobs[0]);
    await expect(renderTikz('y')).rejects.toMatchObject({ code: 'TIKZ_TOO_LARGE' });
    await Promise.allSettled(jobs);
    await expect(renderTikz('y')).rejects.toMatchObject({ code: 'TIKZ_UNAVAILABLE' });
  });
  it('bounds worker initialization at twenty seconds and creates a fresh worker for retry', async () => {
    vi.useFakeTimers();
    const workers: { terminate: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('Worker', class { terminate = vi.fn(); constructor() { workers.push(this); } });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(url.endsWith('manifest.json') ? JSON.stringify({ files: { 'tex.wasm.gz.bin': '', 'core.dump.gz.bin': '' } }) : '/* pinned worker */')));
    const { renderTikz } = await import('./tikz');
    const first = renderTikz('\\draw (0,0)--(1,1);');
    const rejection = expect(first).rejects.toMatchObject({ code: 'TIKZ_LOAD_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(20_010); await rejection;
    expect(workers).toHaveLength(1); expect(workers[0].terminate).toHaveBeenCalled();
    const second = renderTikz('\\draw (0,0)--(1,1);');
    const retry = expect(second).rejects.toMatchObject({ code: 'TIKZ_LOAD_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(20_010); await retry;
    expect(workers).toHaveLength(2); expect(workers[1].terminate).toHaveBeenCalled();
  });
  it('aborts stalled bootstrap downloads after sixty seconds before creating a worker', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [], Worker = vi.fn();
    vi.stubGlobal('Worker', Worker);
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => {
      const signal = options.signal!; signals.push(signal);
      return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    }));
    const { renderTikz } = await import('./tikz');
    const result = expect(renderTikz('\\draw (0,0)--(1,1);')).rejects.toMatchObject({ code: 'TIKZ_LOAD_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(signals).toHaveLength(2); expect(signals.every(signal => !signal.aborted)).toBe(true);
    await vi.advanceTimersByTimeAsync(1); await result;
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(Worker).not.toHaveBeenCalled();
  });
  it('counts bootstrap time toward one ninety-second engine-load deadline', async () => {
    vi.useFakeTimers();
    const fixture = waitingWorker(false);
    vi.stubGlobal('fetch', vi.fn((url: string) => new Promise<Response>(resolve => setTimeout(() => resolve(new Response(url.endsWith('manifest.json') ? JSON.stringify({ files: {} }) : '/* pinned worker */')), 50_000))));
    const { renderTikz } = await import('./tikz');
    const result = expect(renderTikz('\\draw (0,0)--(1,1);')).rejects.toMatchObject({ code: 'TIKZ_LOAD_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(50_000);
    expect(fixture.calls.map(call => call.method)).toEqual(['load']);
    await vi.advanceTimersByTimeAsync(39_999);
    expect(fixture.workers[0].terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await result;
    expect(fixture.workers[0].terminate).toHaveBeenCalled();
  });
  it('retains the twenty-second program deadline after the engine has initialized', async () => {
    vi.useFakeTimers();
    const fixture = waitingWorker(true);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(url.endsWith('manifest.json') ? JSON.stringify({ files: {} }) : '/* pinned worker */')));
    const { renderTikz } = await import('./tikz');
    const result = expect(renderTikz('\\draw (0,0)--(1,1);')).rejects.toMatchObject({ code: 'TIKZ_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.calls.map(call => call.method)).toEqual(['load', 'texify']);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(fixture.workers[0].terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await result;
    expect(fixture.workers[0].terminate).toHaveBeenCalled();
  });
});

type BridgeMessage = { type: string; uid?: number; method?: string; id?: number; status?: number; bytes?: Uint8Array };
/** A real lifecycle handshake, then a deliberately unresponsive load or program. */
function waitingWorker(completeLoad: boolean) {
  const calls: BridgeMessage[] = [], workers: { terminate: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal('Worker', class {
    onmessage?: (event: { data: unknown }) => void;
    terminate = vi.fn();
    constructor() { workers.push(this); queueMicrotask(() => this.onmessage?.({ data: { type: 'init' } })); }
    postMessage(message: BridgeMessage) {
      calls.push(message);
      if (completeLoad && message.type === 'run' && message.method === 'load') queueMicrotask(() => this.onmessage?.({ data: { type: 'result', uid: message.uid, complete: true } }));
    }
  });
  return { calls, workers };
}
function bridgeWorker(requestUrl: string | { id: number; url: string }[], read: (signal: AbortSignal) => Promise<Response>) {
  const replies: { message: BridgeMessage; transfer?: Transferable[] }[] = [];
  const workers: { terminate: ReturnType<typeof vi.fn> }[] = [];
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/manifest.json')) return new Response(JSON.stringify({ files: { 'tex.wasm.gz.bin': '', 'core.dump.gz.bin': '' } }));
    if (url.endsWith('/run-tex.js')) return new Response('/* pinned worker */');
    return read(options!.signal!);
  });
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('Worker', class {
    onmessage?: (event: { data: unknown }) => void;
    terminate = vi.fn();
    private uid?: number;
    constructor() { workers.push(this); queueMicrotask(() => this.onmessage?.({ data: { type: 'init' } })); }
    postMessage(message: BridgeMessage, transfer?: Transferable[]) {
      if (message.type === 'run' && message.method === 'load') {
        this.uid = message.uid;
        const requests = typeof requestUrl === 'string' ? [{ id: 1, url: requestUrl }] : requestUrl;
        for (const request of requests) queueMicrotask(() => this.onmessage?.({ data: { type: 'parsiword-asset-request', ...request } }));
      } else if (message.type === 'parsiword-asset-response') {
        replies.push({ message, transfer });
        // End before SVG decoding: these tests exercise the actual asset bridge.
        queueMicrotask(() => this.onmessage?.({ data: { type: 'error', uid: this.uid } }));
      }
    }
  });
  return { fetch, replies, workers };
}
describe('window-to-worker local resource bridge', () => {
  it('fetches only the mapped local binary and transfers its compressed bytes intact', async () => {
    const compressed = new Uint8Array([0x1f, 0x8b, 8, 0, 10, 20]);
    const fixture = bridgeWorker('https://parsiword.test/assets/tikz/core.dump.gz', async () => new Response(compressed));
    const { renderTikz } = await import('./tikz');
    await expect(renderTikz('\\draw (0,0)--(1,1);')).rejects.toMatchObject({ code: 'TIKZ_RENDER_FAILED' });
    expect(fixture.fetch.mock.calls.map(call => call[0])).toEqual([
      'https://parsiword.test/assets/tikz/run-tex.js',
      'https://parsiword.test/assets/tikz/manifest.json',
      'https://parsiword.test/assets/tikz/core.dump.gz.bin',
    ]);
    expect(fixture.replies).toHaveLength(1);
    const { message, transfer } = fixture.replies[0];
    expect(message).toMatchObject({ id: 1, status: 200, bytes: compressed });
    expect(transfer).toEqual([message.bytes!.buffer]);
  });
  it.each(['https://external.test/core.dump.gz', 'https://parsiword.test/assets/tikz/../core.dump.gz', 'https://parsiword.test/assets/tikz/core.dump.gz.bin'])('rejects an unlisted worker URL without fetching: %s', async url => {
    const read = vi.fn(async () => new Response('unexpected'));
    const fixture = bridgeWorker(url, read);
    const { renderTikz } = await import('./tikz');
    await expect(renderTikz('\\draw (0,0)--(1,1);')).rejects.toMatchObject({ code: 'TIKZ_RENDER_FAILED' });
    expect(read).not.toHaveBeenCalled();
    expect(fixture.replies[0].message).toMatchObject({ id: 1, status: 403 });
  });
  it('bounds streamed bytes even without a content-length header and cancels the reader', async () => {
    const cancel = vi.fn();
    const fixture = bridgeWorker('https://parsiword.test/assets/tikz/tex.wasm.gz', async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(4_000_001)); }, cancel,
    })));
    const { renderTikz } = await import('./tikz');
    await expect(renderTikz('\\draw (0,0)--(1,1);')).rejects.toMatchObject({ code: 'TIKZ_RENDER_FAILED' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(fixture.replies[0].message).toMatchObject({ id: 1, status: 502 });
    expect(fixture.replies[0].message.bytes).toHaveLength(0);
  });
  it.each([
    { name: 'duplicate request ID', ids: [1, 1], allowed: 1 },
    { name: 'ninth simultaneous request', ids: [1, 2, 3, 4, 5, 6, 7, 8, 9], allowed: 8 },
  ])('does not fetch a $name, and aborts prior requests when the worker fails', async ({ ids, allowed }) => {
    const signals: AbortSignal[] = [];
    const fixture = bridgeWorker(ids.map(id => ({ id, url: 'https://parsiword.test/assets/tikz/core.dump.gz' })), signal => {
      signals.push(signal);
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    });
    const { renderTikz } = await import('./tikz');
    await expect(renderTikz('\\draw (0,0)--(1,1);')).rejects.toMatchObject({ code: 'TIKZ_RENDER_FAILED' });
    expect(signals).toHaveLength(allowed);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(fixture.replies).toHaveLength(1);
    expect(fixture.replies[0].message).toMatchObject({ id: ids[ids.length - 1], status: 403 });
    expect(fixture.workers[0].terminate).toHaveBeenCalled();
  });
  it('aborts stalled engine assets after sixty seconds and suppresses late worker replies', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fixture = bridgeWorker('https://parsiword.test/assets/tikz/core.dump.gz', signal => {
      requestSignal = signal;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    });
    const { renderTikz } = await import('./tikz');
    const result = expect(renderTikz('\\draw (0,0)--(1,1);')).rejects.toMatchObject({ code: 'TIKZ_LOAD_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(0);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await result;
    expect(requestSignal?.aborted).toBe(true);
    expect(fixture.workers[0].terminate).toHaveBeenCalled();
    expect(fixture.replies).toHaveLength(0);
  });
});
