import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ native: true, save: vi.fn(), write: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => api.native }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: api.save }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: vi.fn(), writeFile: api.write }));
import { saveDocx, saveMarkdown, savePdf } from './files';

const markdown = '# فارسی و English (React **19**)\r\n\r\n> \\*نشانه\\* و نیم‌فاصله\n\n```ts\nconst path = "C:\\\\tmp";\n```\n\n$E=mc^2$  \n';
const pdf = new TextEncoder().encode('%PDF-1.7\n% supplied PDF bytes\n%%EOF\n');

beforeEach(() => { vi.clearAllMocks(); api.native = true; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('native downloads of document formats', () => {
  it('saves exact UTF-8 Markdown with mixed text, escapes and trailing line endings', async () => {
    api.save.mockResolvedValue('content://provider/document/report.md');
    expect(await saveMarkdown(markdown, 'گزارش من.md')).toBe(true);
    expect(api.save).toHaveBeenCalledWith({ defaultPath: 'گزارش من.md', filters: [{ name: 'Markdown document', extensions: ['md'] }] });
    const [path, bytes] = api.write.mock.calls[0];
    expect(path).toBe('content://provider/document/report.md');
    expect(bytes).toEqual(new TextEncoder().encode(markdown));
    expect(new TextDecoder().decode(bytes)).toBe(markdown);
    expect(Array.from(bytes.subarray(0, 3))).not.toEqual([0xef, 0xbb, 0xbf]);
  });

  it('passes supplied PDF bytes unchanged to the native PDF picker result', async () => {
    api.save.mockResolvedValue('/chosen/گزارش.pdf');
    expect(await savePdf(pdf, 'گزارش.pdf')).toBe(true);
    expect(api.save).toHaveBeenCalledWith({ defaultPath: 'گزارش.pdf', filters: [{ name: 'PDF document', extensions: ['pdf'] }] });
    expect(api.write).toHaveBeenCalledWith('/chosen/گزارش.pdf', pdf);
    expect(new TextDecoder().decode(api.write.mock.calls[0][1].subarray(0, 5))).toBe('%PDF-');
  });

  it.each([
    ['Markdown', () => saveMarkdown(markdown, 'report.md')],
    ['PDF', () => savePdf(pdf, 'report.pdf')],
  ])('does not write a cancelled %s download', async (_format, download) => {
    api.save.mockResolvedValue(null);
    expect(await download()).toBe(false);
    expect(api.write).not.toHaveBeenCalled();
  });

  it('reports native write failures to the caller instead of reporting a saved file', async () => {
    api.save.mockResolvedValue('/read-only/report.pdf');
    api.write.mockRejectedValueOnce(new Error('permission denied'));
    await expect(savePdf(pdf, 'report.pdf')).rejects.toMatchObject({ code: 'FILE_SAVE_FAILED', cause: expect.objectContaining({ message: 'permission denied' }) });
  });
});

describe('static-browser document downloads', () => {
  it.each([
    { format: 'Markdown', filename: 'گزارش من.md', mime: 'text/markdown;charset=utf-8', bytes: new TextEncoder().encode(markdown), download: () => saveMarkdown(markdown, 'گزارش من.md') },
    { format: 'PDF', filename: 'گزارش من.pdf', mime: 'application/pdf', bytes: pdf, download: () => savePdf(pdf, 'گزارش من.pdf') },
    { format: 'Word', filename: 'گزارش من.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: new Uint8Array([80, 75, 3, 4, 255]), download: () => saveDocx(new Uint8Array([80, 75, 3, 4, 255]), 'گزارش من.docx') },
  ])('downloads $format with its MIME, filename and exact bytes', async ({ filename, mime, bytes, download }) => {
    api.native = false;
    vi.useFakeTimers();
    let blob: Blob | undefined;
    const objectUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(value => { blob = value as Blob; return 'blob:parsiword-document'; });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const anchor = { href: '', download: '', click: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) });

    expect(await download()).toBe(true);
    expect(objectUrl).toHaveBeenCalledOnce();
    expect(blob?.type).toBe(mime);
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(bytes);
    expect(anchor.download).toBe(filename);
    expect(anchor.href).toBe('blob:parsiword-document');
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(api.save).not.toHaveBeenCalled();
    expect(api.write).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(revoke).toHaveBeenCalledWith('blob:parsiword-document');
  });
});
