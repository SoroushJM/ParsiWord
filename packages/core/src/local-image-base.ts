/** The browser only grants access to files/folders explicitly chosen by the user. */
export type ImageDirectory = {
  name: string;
  getDirectoryHandle(name: string): Promise<ImageDirectory>;
  getFileHandle(name: string): Promise<{ getFile(): Promise<File> }>;
};

/** Resolve inside a selected root, retaining query/fragment in Markdown only. */
export function localImagePath(source: string, base = ''): string | null {
  if (!source || source !== source.trim() || /^[a-z][a-z\d+.-]*:/i.test(source) || source.startsWith('//') || /^[\\]{2}/.test(source)) return null;
  const path = source.split(/[?#]/, 1)[0].replace(/\\/g, '/');
  const segments: string[] = [];
  const add = (value: string) => {
    for (const encoded of value.split('/')) {
      let part: string;
      try { part = decodeURIComponent(encoded); } catch { return false; }
      if (/[\u0000-\u001f\u007f/\\:]/.test(part)) return false;
      if (!part || part === '.') continue;
      if (part === '..') { if (!segments.length) return false; segments.pop(); }
      else segments.push(part);
    }
    return true;
  };
  if (!path.startsWith('/') && !add(base.replace(/\\/g, '/'))) return null;
  return add(path) && segments.length ? segments.join('/') : null;
}

export class LocalImageBase {
  readonly name: string;
  private readonly files?: Map<string, File>;
  private readonly directory?: ImageDirectory;
  private readonly cache = new Map<string, Promise<string | null>>();
  private readonly urls = new Set<string>();
  private disposed = false;

  constructor(source: ImageDirectory | readonly File[]) {
    if (Array.isArray(source)) {
      const files = source as readonly File[];
      this.files = new Map();
      this.name = files[0]?.webkitRelativePath.split('/')[0] || '';
      for (const file of files) {
        const relative = file.webkitRelativePath;
        if (!relative) continue;
        // FileList names are already decoded filesystem names; decoding them
        // again would corrupt literal percent signs such as "100%.png".
        const path = relative.slice(relative.indexOf('/') + 1);
        if (path && !path.split('/').some(part => part === '.' || part === '..')) this.files.set(path, file);
      }
    } else {
      this.directory = source as ImageDirectory;
      this.name = this.directory.name;
    }
  }

  resolve(source: string, base = ''): Promise<string | null> {
    const path = localImagePath(source, base);
    if (!path || this.disposed) return Promise.resolve(null);
    const previous = this.cache.get(path);
    if (previous) return previous;
    const pending = (async () => {
      try {
        let file = this.files?.get(path);
        if (!file && this.directory) {
          const parts = path.split('/');
          let directory = this.directory;
          for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
          file = await (await directory.getFileHandle(parts[parts.length - 1])).getFile();
        }
        if (!file || this.disposed) return null;
        const url = URL.createObjectURL(file);
        this.urls.add(url);
        return url;
      } catch { return null; }
    })();
    this.cache.set(path, pending);
    return pending;
  }

  dispose() {
    this.disposed = true;
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    this.cache.clear();
  }
}
