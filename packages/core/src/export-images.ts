import type { MarkdownContext } from './markdown';
import { browserImageUrl } from './markdown-image';
import { RichContentError } from './rich-content';

/** PNG raster geometry at the browser's intrinsic 96-dpi image dimensions. */
export type ExportImage = { png: Uint8Array; width: number; height: number };
export type ExportImageResolver = (source: string) => Promise<string | null>;
/** Receives the original Markdown URL, so native hosts enforce their own roots. */
export type ExportImageReader = (source: string) => Promise<{ bytes: Uint8Array; mimeType?: string }>;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_PIXELS = 24_000_000;
const MAX_AXIS = 8192;
const MAX_IMAGES = 128;
const TIMEOUT = 20_000;
const failed = (cause?: unknown) => new RichContentError('IMAGE_EXPORT_FAILED', { cause });
const tooLarge = () => new RichContentError('IMAGE_EXPORT_TOO_LARGE');
const ascii = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
type Size = { width: number; height: number };

function checkSize({ width, height }: Size, pixels = 0) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw failed();
  if (width > MAX_AXIS || height > MAX_AXIS || width * height + pixels > MAX_PIXELS) throw tooLarge();
}

/** Metadata is checked before handing compressed raster data to a decoder. */
function rasterSize(bytes: Uint8Array): { size: Size; mimeType: string } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number, little = false) => view.getUint16(at, little);
  const u32 = (at: number, little = false) => view.getUint32(at, little);
  if (bytes.length >= 24 && ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n' && ascii(bytes, 12, 4) === 'IHDR') return { size: { width: u32(16), height: u32(20) }, mimeType: 'image/png' };
  if (bytes.length >= 10 && /^GIF8[79]a$/.test(ascii(bytes, 0, 6))) return { size: { width: u16(6, true), height: u16(8, true) }, mimeType: 'image/gif' };
  if (bytes.length >= 26 && ascii(bytes, 0, 2) === 'BM') {
    const core = u32(14, true) === 12;
    return { size: { width: core ? u16(18, true) : view.getInt32(18, true), height: core ? u16(20, true) : Math.abs(view.getInt32(22, true)) }, mimeType: 'image/bmp' };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    for (let at = 12; at + 8 <= bytes.length;) {
      const kind = ascii(bytes, at, 4), length = u32(at + 4, true), start = at + 8;
      if (start + length > bytes.length) break;
      if (kind === 'VP8X' && length >= 10) {
        const value = (offset: number) => 1 + bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
        return { size: { width: value(start + 4), height: value(start + 7) }, mimeType: 'image/webp' };
      }
      if (kind === 'VP8 ' && length >= 10 && ascii(bytes, start + 3, 3) === '\x9d\x01\x2a') return { size: { width: u16(start + 6, true) & 0x3fff, height: u16(start + 8, true) & 0x3fff }, mimeType: 'image/webp' };
      if (kind === 'VP8L' && length >= 5 && bytes[start] === 0x2f) {
        const bits = u32(start + 1, true);
        return { size: { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }, mimeType: 'image/webp' };
      }
      at = start + length + (length % 2);
    }
    throw failed();
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let at = 2; at + 3 < bytes.length;) {
      if (bytes[at++] !== 0xff) break;
      while (bytes[at] === 0xff) at++;
      const marker = bytes[at++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd8) continue;
      if (at + 2 > bytes.length) break;
      const length = u16(at);
      if (length < 2 || at + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) return { size: { width: u16(at + 5), height: u16(at + 3) }, mimeType: 'image/jpeg' };
      at += length;
    }
    throw failed();
  }
  if (bytes.length >= 16 && ascii(bytes, 4, 4) === 'ftyp' && /avif|avis/.test(ascii(bytes, 8, Math.min(32, bytes.length - 8)))) {
    let size: Size | undefined, boxes = 0;
    const walk = (start: number, end: number, depth: number) => {
      for (let at = start; at + 8 <= end && boxes++ < 4096;) {
        const length = u32(at), type = ascii(bytes, at + 4, 4);
        if (length < 8 || at + length > end) break;
        if (type === 'ispe' && length >= 20) {
          const current = { width: u32(at + 12), height: u32(at + 16) };
          checkSize(current);
          size = { width: Math.max(size?.width ?? 0, current.width), height: Math.max(size?.height ?? 0, current.height) };
        } else if (depth < 8 && ['meta', 'iprp', 'ipco', 'moov', 'trak', 'mdia', 'minf', 'stbl'].includes(type)) walk(at + (type === 'meta' ? 12 : 8), at + length, depth + 1);
        at += length;
      }
    };
    walk(0, bytes.length, 0);
    if (!size) throw failed();
    return { size, mimeType: 'image/avif' };
  }
  return null;
}

function svgBlob(bytes: Uint8Array): { blob: Blob; size: Size } {
  const source = new TextDecoder().decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source) || typeof DOMParser === 'undefined') throw failed();
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml'), root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror, script, iframe, foreignObject')) throw failed();
  for (const element of doc.querySelectorAll('*')) for (const attribute of element.attributes) {
    if (/^on/i.test(attribute.name) || /href$/i.test(attribute.name) && !attribute.value.startsWith('#')) throw failed();
  }
  if (/@import/i.test(source) || [...source.matchAll(/url\(([^)]*)\)/gi)].some(match => !match[1].trim().replace(/^["']|["']$/g, '').startsWith('#'))) throw failed();
  const dimension = (value: string | null) => {
    const match = value?.trim().match(/^([\d.]+)(px|pt|pc|in|cm|mm|q)?$/i);
    const units: Record<string, number> = { px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6 };
    return match ? Number(match[1]) * units[match[2]?.toLowerCase() || 'px'] : 0;
  };
  const box = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const validBox = box?.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0 ? box : undefined;
  let width = dimension(root.getAttribute('width')), height = dimension(root.getAttribute('height'));
  if (validBox) { width ||= height ? height * validBox[2] / validBox[3] : validBox[2]; height ||= width * validBox[3] / validBox[2]; }
  width ||= 300; height ||= 150;
  checkSize({ width, height });
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute('width', String(width)); root.setAttribute('height', String(height));
  return { blob: new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' }), size: { width, height } };
}

async function readUrl(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal, credentials: 'omit', mode: 'cors' });
  if (!response.ok) { await response.body?.cancel(); throw failed(); }
  if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw tooLarge(); }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw tooLarge();
    return bytes;
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > MAX_BYTES) { await reader.cancel(); throw tooLarge(); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return bytes;
}

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

async function rasterize(bytes: Uint8Array, signal: AbortSignal, pixels: number): Promise<ExportImage> {
  if (!bytes.length) throw failed();
  if (bytes.length > MAX_BYTES) throw tooLarge();
  const raster = rasterSize(bytes);
  const prepared = raster ? { size: raster.size, blob: new Blob([new Uint8Array(bytes).buffer], { type: raster.mimeType }) } : svgBlob(bytes);
  checkSize(prepared.size, pixels);
  if (typeof Image === 'undefined' || typeof document === 'undefined') throw failed();
  const url = URL.createObjectURL(prepared.blob), image = new Image();
  let canvas: HTMLCanvasElement | undefined;
  try {
    await abortable(new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(failed()); image.src = url; }), signal);
    signal.throwIfAborted();
    const width = image.naturalWidth, height = image.naturalHeight;
    checkSize({ width, height }, pixels);
    canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw failed();
    context.drawImage(image, 0, 0, width, height);
    const blob = await abortable(new Promise<Blob>((resolve, reject) => canvas!.toBlob(value => value ? resolve(value) : reject(failed()), 'image/png')), signal);
    if (blob.size > MAX_TOTAL_BYTES) throw tooLarge();
    return { png: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally {
    image.onload = null; image.onerror = null; image.src = '';
    URL.revokeObjectURL(url);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

/** Prepare once from the export snapshot; never mutate source or omit an image. */
export async function prepareExportImages(context: MarkdownContext, resolveImage?: ExportImageResolver, readImage?: ExportImageReader): Promise<ReadonlyMap<string, ExportImage>> {
  const urls = new Set<string>();
  const visit = (node: { type: string; url?: string; identifier?: string; children?: readonly unknown[] }) => {
    if (node.type === 'image' || node.type === 'imageReference') {
      const url = node.type === 'image' ? node.url : context.definitions.get(node.identifier?.toLowerCase() || '')?.url;
      if (!url) throw failed();
      urls.add(url);
    }
    node.children?.forEach(child => visit(child as Parameters<typeof visit>[0]));
  };
  visit(context.root);
  if (urls.size > MAX_IMAGES) throw tooLarge();
  const images = new Map<string, ExportImage>();
  let pixels = 0, totalBytes = 0;
  for (const source of urls) {
    const controller = new AbortController(), signal = controller.signal;
    const timer = setTimeout(() => controller.abort(failed(new Error('Image preparation timed out'))), TIMEOUT);
    try {
      const bytes = await abortable((async () => {
        if (readImage && !/^data:/i.test(source)) return (await readImage(source)).bytes;
        const url = /^data:/i.test(source) ? browserImageUrl(source) : resolveImage ? await resolveImage(source) : browserImageUrl(source);
        signal.throwIfAborted();
        if (!url) throw failed();
        return readUrl(url, signal);
      })(), signal);
      signal.throwIfAborted();
      const image = await rasterize(bytes, signal, pixels);
      pixels += image.width * image.height; totalBytes += image.png.length;
      if (totalBytes > MAX_TOTAL_BYTES) throw tooLarge();
      images.set(source, image);
    } catch (cause) {
      if (cause instanceof RichContentError) throw cause;
      throw failed(cause);
    } finally { clearTimeout(timer); controller.abort(); }
  }
  return images;
}
