import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markdownContext } from './markdown';
import { prepareExportImages, type ExportImageReader } from './export-images';

function png(width = 40, height = 20) {
  const bytes = new Uint8Array(24), view = new DataView(bytes.buffer);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12); view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}

describe('bounded export image preparation', () => {
  let dimensions: { width: number; height: number }, decode: boolean;
  let canvases: { width: number; height: number }[];
  let draw: ReturnType<typeof vi.fn>, encode: ReturnType<typeof vi.fn>;
  let createUrl: ReturnType<typeof vi.spyOn>, revoke: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    dimensions = { width: 40, height: 20 }; decode = true; canvases = [];
    draw = vi.fn(); encode = vi.fn((callback: (value: Blob | null) => void) => callback(new Blob([png().buffer], { type: 'image/png' })));
    vi.stubGlobal('Image', class {
      naturalWidth = dimensions.width; naturalHeight = dimensions.height;
      onload?: () => void; onerror?: () => void;
      set src(value: string) { if (value && decode) queueMicrotask(() => this.onload?.()); }
    });
    vi.stubGlobal('document', { createElement: vi.fn((tag: string) => {
      expect(tag).toBe('canvas');
      const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: draw }), toBlob: encode };
      canvases.push(canvas); return canvas;
    }) });
    createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export-test');
    revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(png().buffer, { headers: { 'content-type': 'image/png' } })));
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('does not read assets or require a DOM for a document without images', async () => {
    vi.stubGlobal('document', undefined);
    const reader = vi.fn();
    expect((await prepareExportImages(markdownContext('# Plain text'), undefined, reader)).size).toBe(0);
    expect(reader).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it('deduplicates nested inline/reference images by the first canonical definition and preserves source bytes', async () => {
    const source = '# Mixed\r\n\r\n> ![inline](./a.png)\r\n\r\n| A |\r\n|---|\r\n| ![ref][asset] |\r\n\r\n[asset]: ./a.png\r\n[asset]: ignored.png\r\n';
    const context = markdownContext(source), reader = vi.fn(async () => ({ bytes: png() }));
    const images = await prepareExportImages(context, undefined, reader);
    expect([...images.keys()]).toEqual(['./a.png']);
    expect(reader).toHaveBeenCalledExactlyOnceWith('./a.png');
    expect(images.get('./a.png')).toMatchObject({ width: 40, height: 20 });
    expect(images.get('./a.png')!.png).toEqual(png());
    expect(context.source).toBe(source); expect(draw).toHaveBeenCalledOnce();
    expect(canvases[0]).toMatchObject({ width: 0, height: 0 }); expect(revoke).toHaveBeenCalledWith('blob:export-test');
  });

  it('resolves local base URLs before CORS-aware bounded fetch', async () => {
    const resolver = vi.fn(async () => 'blob:selected-file');
    const images = await prepareExportImages(markdownContext('![x](assets/a.png)'), resolver);
    expect(resolver).toHaveBeenCalledExactlyOnceWith('assets/a.png');
    expect(fetch).toHaveBeenCalledWith('blob:selected-file', expect.objectContaining({ mode: 'cors', credentials: 'omit', signal: expect.any(AbortSignal) }));
    expect(images.has('assets/a.png')).toBe(true);
  });

  it('gives native readers the original URL and bypasses the preview resource resolver', async () => {
    const resolver = vi.fn(), reader = vi.fn(async () => ({ bytes: png(), mimeType: 'image/png' }));
    await prepareExportImages(markdownContext('![x](../assets/صورة%20a.png)'), resolver, reader);
    expect(reader).toHaveBeenCalledExactlyOnceWith('../assets/صورة%20a.png');
    expect(resolver).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it('prepares data images locally without sending their potentially long URL through IPC', async () => {
    const reader = vi.fn(), resolver = vi.fn();
    await prepareExportImages(markdownContext('![x](data:image/png;base64,eA==)'), resolver, reader);
    expect(reader).not.toHaveBeenCalled(); expect(resolver).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledWith('data:image/png;base64,eA==', expect.any(Object));
  });

  it('loads unique images sequentially and stops on a missing image instead of dropping it', async () => {
    const calls: string[] = []; let active = 0, maximum = 0;
    const reader: ExportImageReader = async source => { calls.push(source); maximum = Math.max(maximum, ++active); await Promise.resolve(); active--; if (source === 'missing') throw new Error('not found'); return { bytes: png() }; };
    await expect(prepareExportImages(markdownContext('![a](a) ![missing](missing) ![later](later)'), undefined, reader)).rejects.toMatchObject({ code: 'IMAGE_EXPORT_FAILED' });
    expect(calls).toEqual(['a', 'missing']); expect(maximum).toBe(1);
  });

  it.each([null, ''])('fails an unresolved image URL (%s) explicitly', async result => {
    await expect(prepareExportImages(markdownContext('![x](missing.png)'), async () => result)).rejects.toMatchObject({ code: 'IMAGE_EXPORT_FAILED' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects unsupported direct schemes before fetching', async () => {
    await expect(prepareExportImages(markdownContext('![x](javascript:bad)'))).rejects.toMatchObject({ code: 'IMAGE_EXPORT_FAILED' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports CORS/network and non-success responses as image export errors', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('CORS blocked'));
    await expect(prepareExportImages(markdownContext('![x](https://blocked.example/a.png)'))).rejects.toMatchObject({ code: 'IMAGE_EXPORT_FAILED' });
    const cancel = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { status: 404 }));
    await expect(prepareExportImages(markdownContext('![x](missing.png)'))).rejects.toMatchObject({ code: 'IMAGE_EXPORT_FAILED' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('bounds advertised and streamed input bytes before allocating a bitmap', async () => {
    const cancel = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { headers: { 'content-length': String(8 * 1024 * 1024 + 1) } }));
    await expect(prepareExportImages(markdownContext('![x](large.png)'))).rejects.toMatchObject({ code: 'IMAGE_EXPORT_TOO_LARGE' });
    expect(cancel).toHaveBeenCalledOnce();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8 * 1024 * 1024)); controller.enqueue(new Uint8Array(1)); controller.close(); } })));
    await expect(prepareExportImages(markdownContext('![x](stream.png)'))).rejects.toMatchObject({ code: 'IMAGE_EXPORT_TOO_LARGE' });
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('checks native byte length and raster header geometry before decoding', async () => {
    await expect(prepareExportImages(markdownContext('![x](large.png)'), undefined, async () => ({ bytes: new Uint8Array(8 * 1024 * 1024 + 1) }))).rejects.toMatchObject({ code: 'IMAGE_EXPORT_TOO_LARGE' });
    await expect(prepareExportImages(markdownContext('![x](wide.png)'), undefined, async () => ({ bytes: png(8193, 1) }))).rejects.toMatchObject({ code: 'IMAGE_EXPORT_TOO_LARGE' });
    await expect(prepareExportImages(markdownContext('![x](pixels.png)'), undefined, async () => ({ bytes: png(6000, 4001) }))).rejects.toMatchObject({ code: 'IMAGE_EXPORT_TOO_LARGE' });
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('bounds total decoded pixels across unique assets', async () => {
    dimensions = { width: 4000, height: 3000 };
    await expect(prepareExportImages(markdownContext('![a](a) ![b](b) ![c](c)'), undefined, async () => ({ bytes: png(4000, 3000) }))).rejects.toMatchObject({ code: 'IMAGE_EXPORT_TOO_LARGE' });
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('checks actual decoder dimensions and releases assets when canvas fails', async () => {
    dimensions = { width: 9000, height: 1 };
    await expect(prepareExportImages(markdownContext('![x](a)'), undefined, async () => ({ bytes: png() }))).rejects.toMatchObject({ code: 'IMAGE_EXPORT_TOO_LARGE' });
    expect(draw).not.toHaveBeenCalled(); expect(revoke).toHaveBeenCalledOnce();
    dimensions = { width: 40, height: 20 }; draw.mockImplementation(() => { throw new DOMException('Tainted canvas', 'SecurityError'); });
    await expect(prepareExportImages(markdownContext('![x](a)'), undefined, async () => ({ bytes: png() }))).rejects.toMatchObject({ code: 'IMAGE_EXPORT_FAILED' });
    expect(canvases[0]).toMatchObject({ width: 0, height: 0 }); expect(revoke).toHaveBeenCalledTimes(2);
  });

  it('bounds encoded output size and rejects failed PNG encoding', async () => {
    encode.mockImplementationOnce((callback: (value: Blob | null) => void) => callback({ size: 32 * 1024 * 1024 + 1 } as Blob));
    await expect(prepareExportImages(markdownContext('![x](a)'), undefined, async () => ({ bytes: png() }))).rejects.toMatchObject({ code: 'IMAGE_EXPORT_TOO_LARGE' });
    encode.mockImplementationOnce((callback: (value: Blob | null) => void) => callback(null));
    await expect(prepareExportImages(markdownContext('![x](a)'), undefined, async () => ({ bytes: png() }))).rejects.toMatchObject({ code: 'IMAGE_EXPORT_FAILED' });
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it('bounds unique image count before any reader request', async () => {
    const reader = vi.fn();
    await expect(prepareExportImages(markdownContext(Array.from({ length: 129 }, (_, index) => `![${index}](${index})`).join(' ')), undefined, reader)).rejects.toMatchObject({ code: 'IMAGE_EXPORT_TOO_LARGE' });
    expect(reader).not.toHaveBeenCalled();
  });

  it('times out a stuck resolver and never fetches a URL that resolves afterward', async () => {
    vi.useFakeTimers(); let resolve!: (value: string) => void;
    const pending = prepareExportImages(markdownContext('![x](a)'), () => new Promise<string>(done => { resolve = done; }));
    const rejected = expect(pending).rejects.toMatchObject({ code: 'IMAGE_EXPORT_FAILED' });
    await vi.advanceTimersByTimeAsync(20_000); await rejected;
    resolve('https://late.example/a.png'); await Promise.resolve(); await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled(); expect(createUrl).not.toHaveBeenCalled();
  });

  it('times out a stuck decoder and revokes its object URL', async () => {
    vi.useFakeTimers(); decode = false;
    const pending = prepareExportImages(markdownContext('![x](a)'), undefined, async () => ({ bytes: png() }));
    const rejected = expect(pending).rejects.toMatchObject({ code: 'IMAGE_EXPORT_FAILED' });
    await vi.advanceTimersByTimeAsync(20_000); await rejected;
    expect(revoke).toHaveBeenCalledWith('blob:export-test'); expect(draw).not.toHaveBeenCalled();
  });
});
