import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalImageBase, localImagePath, type ImageDirectory } from './local-image-base';

afterEach(() => vi.restoreAllMocks());

describe('local browser image base', () => {
  it.each([
    ['./assets/a%20b.svg', '', 'assets/a b.svg'],
    ['../assets/تصویر.png', 'docs/notes', 'docs/assets/تصویر.png'],
    ['../../assets/a.png', 'docs/notes', 'assets/a.png'],
    ['/assets/a.png?size=2#image', 'docs', 'assets/a.png'],
    ['.\\assets\\a.png', '', 'assets/a.png'],
    ['../100%25.png', 'docs', '100%.png'],
  ])('resolves %s inside %s', (source, base, expected) => expect(localImagePath(source, base)).toBe(expected));

  it.each(['../outside.png', '%2e%2e/outside.png', 'a/%2foutside.png', 'a/%5coutside.png', 'https://example.com/a.png', 'file:///C:/a.png', 'C:\\a.png', '//server/a.png', '\\\\server\\a.png', 'a/\u0000.png', ' x.png', 'x.png '])('rejects ungranted or malformed path %s', source => expect(localImagePath(source)).toBeNull());

  it('indexes selected FileList paths, decodes Markdown URLs once and revokes cached URLs', async () => {
    const file = new File(['image'], 'a b.svg', { type: 'image/svg+xml' });
    const percent = new File(['image'], '100%.png', { type: 'image/png' });
    Object.defineProperty(file, 'webkitRelativePath', { value: 'project/assets/a b.svg' });
    Object.defineProperty(percent, 'webkitRelativePath', { value: 'project/100%.png' });
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(value => value === file ? 'blob:test-a' : 'blob:test-percent');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const base = new LocalImageBase([file, percent]);
    expect(base.name).toBe('project');
    expect(await base.resolve('../assets/a%20b.svg', 'docs')).toBe('blob:test-a');
    expect(await base.resolve('assets/a%20b.svg')).toBe('blob:test-a');
    expect(await base.resolve('100%25.png')).toBe('blob:test-percent');
    expect(await base.resolve('missing.svg')).toBeNull();
    expect(create).toHaveBeenCalledTimes(2);
    base.dispose();
    expect(revoke.mock.calls).toEqual([['blob:test-a'], ['blob:test-percent']]);
    expect(await base.resolve('assets/a%20b.svg')).toBeNull();
  });

  it('reads directory handles lazily without enumerating or uploading other files', async () => {
    const file = new File(['image'], 'image.png');
    const getFile = vi.fn(async () => file);
    const getFileHandle = vi.fn(async () => ({ getFile }));
    const child: ImageDirectory = { name: 'assets', getDirectoryHandle: vi.fn(), getFileHandle };
    const directory: ImageDirectory = { name: 'project', getDirectoryHandle: vi.fn(async () => child), getFileHandle: vi.fn() };
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:lazy');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const base = new LocalImageBase(directory);
    expect(directory.getDirectoryHandle).not.toHaveBeenCalled();
    expect(await base.resolve('assets/image.png')).toBe('blob:lazy');
    expect(directory.getDirectoryHandle).toHaveBeenCalledWith('assets');
    expect(getFileHandle).toHaveBeenCalledWith('image.png');
    expect(getFile).toHaveBeenCalledTimes(1);
    base.dispose();
  });

  it('does not retain or create object URLs after a pending read is disposed', async () => {
    let release!: (file: File) => void;
    const read = new Promise<File>(resolve => { release = resolve; });
    const directory: ImageDirectory = { name: 'root', getDirectoryHandle: vi.fn(), getFileHandle: vi.fn(async () => ({ getFile: () => read })) };
    const create = vi.spyOn(URL, 'createObjectURL');
    const base = new LocalImageBase(directory);
    const pending = base.resolve('image.png');
    base.dispose();
    release(new File(['image'], 'image.png'));
    expect(await pending).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});
