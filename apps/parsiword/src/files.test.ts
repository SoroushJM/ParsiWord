import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ native: true, open: vi.fn(), save: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => api.native }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: api.open, save: api.save }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: api.read, writeFile: api.write }));
import { openMarkdown, saveDocx } from './files';

beforeEach(() => { vi.clearAllMocks(); api.native = true; });
describe('native file operations across desktop and mobile', () => {
  it.each([
    ['C:\\Users\\writer\\Documents\\sample.md', 'sample'],
    ['/home/writer/Documents/یادداشت.markdown', 'یادداشت'],
    ['file:///private/var/mobile/Documents/hello%20world.txt', 'hello world'],
    ['content://provider/document/419', 'یادداشت واردشده'],
  ])('reads the selected document and a usable title: %s', async (path, name) => {
    api.open.mockResolvedValue(path); api.read.mockResolvedValue('سلام React (19)');
    expect(await openMarkdown()).toEqual({ name, text: 'سلام React (19)' });
    expect(api.read).toHaveBeenCalledWith(path);
    expect(api.open).toHaveBeenCalledWith(expect.objectContaining({ fileAccessMode: 'copy' }));
  });
  it('does not write when the user cancels saving', async () => {
    api.save.mockResolvedValue(null);
    expect(await saveDocx(new Uint8Array([1, 2, 3]), 'test.docx')).toBe(false);
    expect(api.write).not.toHaveBeenCalled();
  });
  it('writes exact binary bytes to the selected path', async () => {
    api.save.mockResolvedValue('/chosen/test.docx');
    const bytes = new Uint8Array([80, 75, 3, 4, 0, 255]);
    expect(await saveDocx(bytes, 'test.docx')).toBe(true);
    expect(api.write).toHaveBeenCalledWith('/chosen/test.docx', bytes);
  });
  it('does not read a cancelled picker', async () => {
    api.open.mockResolvedValue(null); expect(await openMarkdown()).toBeNull();
    expect(api.read).not.toHaveBeenCalled();
  });
  it('rejects oversized drafts without importing them', async () => {
    api.open.mockResolvedValue('/sample.md'); api.read.mockResolvedValue('x'.repeat(500001));
    await expect(openMarkdown()).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });
  it('classifies failed native reads and writes without matching error messages', async () => {
    api.open.mockResolvedValue('/sample.md'); api.read.mockRejectedValue(new Error('FILE_TOO_LARGE is just provider text'));
    await expect(openMarkdown()).rejects.toMatchObject({ code: 'FILE_OPEN_FAILED' });
    api.save.mockResolvedValue('/sample.docx'); api.write.mockRejectedValue(new Error('permission denied'));
    await expect(saveDocx(new Uint8Array([1]), 'sample.docx')).rejects.toMatchObject({ code: 'FILE_SAVE_FAILED' });
  });
});
