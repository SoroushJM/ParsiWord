import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { compileXeLatex } from './xetex';
vi.mock('./public-assets', () => ({ publicAsset: (path: string) => `https://parsiword.test/${path}` }));
const source = String.raw`\documentclass{article}\begin{document}سؤال\end{document}`;
const content: Record<string, string> = { 'busytex.js': '/* engine */', 'busytex.wasm.gz.bin': 'wasm', 'tex.data.gz.bin': 'tex', 'files.json': '[]', 'worker.js': '/* runner */' };
const manifest = { files: Object.fromEntries(Object.entries(content).filter(([name]) => name !== 'worker.js').map(([name, bytes]) => [name, { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }])) };
beforeEach(() => { vi.stubGlobal('document', { baseURI: 'https://parsiword.test/en/' }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function resources(corrupt = false) {
  const fetch = vi.fn(async (url: string) => { const name = url.split('/').pop()!; return new Response(name === 'manifest.json' ? JSON.stringify(manifest) : corrupt && name === 'busytex.js' ? 'BROKEN' : content[name]); });
  vi.stubGlobal('fetch', fetch); return fetch;
}
function worker(reply?: unknown) {
  const instances: { terminate: ReturnType<typeof vi.fn>; messages: unknown[] }[] = [];
  vi.stubGlobal('Worker', class {
    onmessage?: (event: { data: unknown }) => void;
    terminate = vi.fn(); messages: unknown[] = [];
    constructor() { instances.push(this); }
    postMessage(message: unknown) { this.messages.push(message); if (reply) queueMicrotask(() => this.onmessage?.({ data: reply })); }
  });
  return instances;
}
describe('isolated bounded XeLaTeX compilation', () => {
  it('returns the real worker PDF, preserves source and always releases the worker', async () => {
    const fetch = resources(), pdf = new TextEncoder().encode('%PDF-1.7\nbytes');
    const instances = worker({ type: 'result', pdf });
    await expect(compileXeLatex(source)).resolves.toEqual(pdf);
    expect(instances[0].messages[0]).toMatchObject({ source }); expect(instances[0].terminate).toHaveBeenCalledOnce();
    expect(fetch.mock.calls.every(([url]) => url.startsWith('https://parsiword.test/xetex/'))).toBe(true);
  });
  it('rejects an altered pinned runtime before allocating a TeX heap', async () => {
    resources(true); const instances = worker();
    await expect(compileXeLatex(source)).rejects.toMatchObject({ code: 'XETEX_UNAVAILABLE' }); expect(instances).toHaveLength(0);
  });
  it('keeps the actual font diagnostic and permits a clean retry after an error', async () => {
    resources(); const failed = worker({ type: 'error', code: 'XETEX_FONT_MISSING', log: '! Package fontspec Error: MissingFont.ttf' });
    await expect(compileXeLatex(source)).rejects.toMatchObject({ code: 'XETEX_FONT_MISSING', cause: { message: '! Package fontspec Error: MissingFont.ttf' } });
    expect(failed[0].terminate).toHaveBeenCalled();
    const retry = worker({ type: 'result', pdf: new TextEncoder().encode('%PDF-1.7\nretry') });
    await expect(compileXeLatex(source)).resolves.toBeInstanceOf(Uint8Array); expect(retry).toHaveLength(1);
  });
  it('does not accept an empty or non-PDF worker result', async () => {
    resources(); const instances = worker({ type: 'result', pdf: new TextEncoder().encode('not a PDF') });
    await expect(compileXeLatex(source)).rejects.toMatchObject({ code: 'XETEX_COMPILE_FAILED' }); expect(instances[0].terminate).toHaveBeenCalled();
  });
  it('bounds runtime downloads independently of execution and aborts stalled requests', async () => {
    vi.useFakeTimers(); const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => { signals.push(options.signal!); options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); })));
    const result = expect(compileXeLatex(source)).rejects.toMatchObject({ code: 'XETEX_LOAD_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(120_000); await result; expect(signals.every(signal => signal.aborted)).toBe(true);
  });
  it('terminates a runaway engine and releases the next attempt', async () => {
    vi.useFakeTimers(); resources(); const instances = worker();
    const result = expect(compileXeLatex(source)).rejects.toMatchObject({ code: 'XETEX_TIMEOUT' });
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(45_000); await result; expect(instances[0].terminate).toHaveBeenCalled();
  });
  it('rejects excessive source and incomplete documents before any asset request', async () => {
    const fetch = resources(); worker();
    await expect(compileXeLatex('x'.repeat(50_001))).rejects.toMatchObject({ code: 'TIKZ_TOO_LARGE' });
    await expect(compileXeLatex('\\documentclass{article}')).rejects.toMatchObject({ code: 'XETEX_DOCUMENT_INVALID' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
