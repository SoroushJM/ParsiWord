import { editorHost } from './host';
import catalogue from './data/google-fonts.json';
import { bundledFont, bundledFaces, codeFont, mathFont, isBundledFont } from './font-assets';
import { documentFontUsage } from './markdown';
import { publicAsset } from './public-assets';
export { bundledFont, isBundledFont, normalizeFontFamily } from './font-assets';

export type GoogleFont = { family: string; arabic: boolean; weights: number[]; subsets?: string[] };
export type FontBundle = { family: string; arabic: boolean; regular: Uint8Array; bold?: Uint8Array; savedAt: number };
type WebFont = GoogleFont & { faces: Record<string, string> };
type WebFontCatalogue = { updated: string; families: WebFont[] };
export const initialCatalogue = catalogue.families as GoogleFont[];
const databaseName = 'parsiword-fonts-v1';
const pending = new Map<string, Promise<FontBundle>>();
const loaded = new Map<string, FontFace[]>();
let webCatalogueRequest: Promise<WebFontCatalogue> | undefined;

async function webFontCatalogue(refresh = false): Promise<WebFontCatalogue> {
  if (!webCatalogueRequest || refresh) {
    webCatalogueRequest = (async () => {
      const response = await fetch(publicAsset('font-catalogue.json'), { cache: refresh ? 'no-cache' : 'default' });
      if (!response.ok) throw new Error('FONT_CATALOGUE');
      const data = await response.json() as WebFontCatalogue;
      if (!Array.isArray(data.families) || !data.families.length) throw new Error('FONT_CATALOGUE');
      return data;
    })();
    webCatalogueRequest.catch(() => { webCatalogueRequest = undefined; });
  }
  return webCatalogueRequest;
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('fonts', { keyPath: 'family' });
      request.result.createObjectStore('metadata');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('FONT_STORAGE'));
  });
}

async function transaction<T>(store: 'fonts' | 'metadata', mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = operation(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(new Error('FONT_STORAGE'));
      tx.onabort = () => reject(new Error('FONT_STORAGE'));
    });
  } finally { db.close(); }
}

export async function cachedFonts(): Promise<FontBundle[]> {
  return transaction('fonts', 'readonly', store => store.getAll());
}

export async function removeFont(family: string): Promise<void> {
  await transaction('fonts', 'readwrite', store => store.delete(family));
  for (const face of loaded.get(family) || []) document.fonts.delete(face);
  loaded.delete(family);
}

// Only font names are sent. Never append the document as Google's text= subset.
async function googleResource(url: string): Promise<Uint8Array> {
  if (editorHost().fontResource) return editorHost().fontResource!(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error('FONT_NETWORK');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 32 * 1024 * 1024) throw new Error('FONT_TOO_LARGE');
  return bytes;
}

export function validateFont(bytes: Uint8Array): void {
  const tag = String.fromCharCode(...bytes.slice(0, 4));
  if (bytes.length < 32 || !((bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) || tag === 'OTTO' || tag === 'true')) {
    throw new Error('FONT_FORMAT');
  }
}

export async function downloadFace(family: string, weight: number): Promise<Uint8Array> {
  if (!editorHost().nativeFonts) {
    // Browsers receive WOFF2 from Google's CSS API. The checked-in snapshot
    // contains its full static TTF URLs, fetched directly with gstatic CORS.
    const font = (await webFontCatalogue()).families.find(font => font.family === family);
    if (!font) throw new Error('FONT_MISSING');
    const nearest = Object.keys(font.faces).map(Number).sort((a, b) => Math.abs(a - weight) - Math.abs(b - weight))[0];
    const url = font.faces[nearest];
    if (!/^https:\/\/fonts\.gstatic\.com\/s\//.test(url || '')) throw new Error('FONT_FORMAT');
    const bytes = await googleResource(url);
    validateFont(bytes);
    return bytes;
  }
  const record = (await fontCatalogue()).find(f => f.family === family);
  const subsets = (record?.subsets || ['latin', ...(record?.arabic ? ['arabic'] : [])]).join(',');
  const css = new TextDecoder().decode(await googleResource(`https://fonts.googleapis.com/css?family=${encodeURIComponent(family)}:${weight}&subset=${encodeURIComponent(subsets)}&display=swap`));
  const urls = [...css.matchAll(/url\(\s*['"]?(https:\/\/fonts\.gstatic\.com\/[^\s)'";]+)['"]?\s*\)\s*format\(['"](?:truetype|opentype)['"]\)/g)].map(m => m[1]);
  // The native downloader identifies as a non-browser and receives a full TTF,
  // not browser-specific WOFF2 subsets, which cannot be embedded into DOCX.
  if (urls.length !== 1) throw new Error('FONT_FORMAT');
  const bytes = await googleResource(urls[0]);
  validateFont(bytes);
  return bytes;
}

export async function ensureFont(font: GoogleFont, transport = downloadFace): Promise<FontBundle> {
  if (pending.has(font.family)) return pending.get(font.family)!;
  const task = (async () => {
    if (isBundledFont(font.family)) {
      const asset = bundledFaces[font.family];
      const read = async (name: string) => {
        const response = await fetch(publicAsset(`fonts/${name}.ttf`));
        if (!response.ok) throw new Error('FONT_FORMAT');
        const bytes = new Uint8Array(await response.arrayBuffer()); validateFont(bytes); return bytes;
      };
      const [regular, bold] = await Promise.all([read(asset.regular), asset.bold ? read(asset.bold) : undefined]);
      return { family: font.family, arabic: asset.arabic, regular, bold, savedAt: 0 };
    }
    const cached = await transaction<FontBundle | undefined>('fonts', 'readonly', store => store.get(font.family));
    if (cached) return cached;
    const weights = !editorHost().nativeFonts && transport === downloadFace
      ? (await webFontCatalogue()).families.find(candidate => candidate.family === font.family)?.weights || font.weights
      : font.weights;
    const nearest = (target: number) => [...weights].sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
    const regularWeight = nearest(400); const boldWeight = nearest(700);
    const regular = await transport(font.family, regularWeight);
    const bold = regularWeight !== boldWeight ? await transport(font.family, boldWeight) : undefined;
    validateFont(regular); if (bold) validateFont(bold);
    const bundle: FontBundle = { family: font.family, arabic: font.arabic, regular, bold, savedAt: Date.now() };
    // Commit only complete downloads. A failed download cannot poison the cache.
    await transaction('fonts', 'readwrite', store => store.put(bundle));
    return bundle;
  })();
  pending.set(font.family, task);
  try { return await task; } finally { pending.delete(font.family); }
}

export async function activateFont(bundle: FontBundle): Promise<void> {
  if (loaded.has(bundle.family)) return;
  const regular = new FontFace(bundle.family, bundle.regular.slice().buffer, { weight: '400' });
  const faces = [regular];
  if (bundle.bold) faces.push(new FontFace(bundle.family, bundle.bold.slice().buffer, { weight: '700' }));
  await Promise.all(faces.map(face => face.load()));
  for (const face of faces) document.fonts.add(face);
  loaded.set(bundle.family, faces);
}

export async function fontCatalogue(): Promise<GoogleFont[]> {
  try { return (await transaction<GoogleFont[] | undefined>('metadata', 'readonly', store => store.get('catalogue'))) || initialCatalogue; }
  catch { return initialCatalogue; }
}

export async function refreshCatalogue(): Promise<GoogleFont[]> {
  if (!editorHost().nativeFonts) {
    // A static deployment supplies its latest public snapshot, with no CORS
    // proxy or runtime API key. Native apps keep Google's live metadata API.
    const list = (await webFontCatalogue(true)).families.map(({ faces: _faces, ...font }) => font);
    await transaction('metadata', 'readwrite', store => store.put(list, 'catalogue'));
    return list;
  }
  const text = new TextDecoder().decode(await googleResource('https://fonts.google.com/metadata/fonts'));
  const data = JSON.parse(text.slice(text.indexOf('{')));
  const list: GoogleFont[] = (data.familyMetadataList || data.familyMetadata || []).filter((f: { isOpenSource?: boolean }) => f.isOpenSource !== false).map((f: { family: string; subsets: string[]; fonts: Record<string, unknown> }) => ({
    family: f.family, arabic: f.subsets.includes('arabic'), subsets: f.subsets.filter(s => s !== 'menu'), weights: Object.keys(f.fonts).filter(w => /^\d+$/.test(w)).map(Number),
  })).filter((f: GoogleFont) => f.family && f.weights.length);
  if (list.length < 100) throw new Error('FONT_CATALOGUE');
  await transaction('metadata', 'readwrite', store => store.put(list, 'catalogue'));
  return list;
}

export async function documentFonts(family: string, markdown = ''): Promise<FontBundle[]> {
  const catalogue = await fontCatalogue();
  const font = catalogue.find(f => f.family === family);
  if (!font) throw new Error('FONT_MISSING');
  const usage = documentFontUsage(markdown);
  const families = new Set([family]);
  if (!font.arabic || usage.code || usage.math) families.add(bundledFont);
  if (usage.code) families.add(codeFont);
  if (usage.math) families.add(mathFont);
  return Promise.all(Array.from(families, name => ensureFont(catalogue.find(f => f.family === name) || initialCatalogue.find(f => f.family === name)!)));
}

export function fontError(error: unknown): string {
  const message = String(error);
  if (message.includes('FONT_MISSING')) return 'این فونت در دسترس نیست. یک فونت دیگر انتخاب کن.';
  if (message.includes('FONT_STORAGE')) return 'فضای نگهداری فونت در دسترس نیست. فضای خالی گوشی را بررسی کن.';
  if (message.includes('FONT_TOO_LARGE')) return 'فایل این فونت برای این نسخه بیش از حد بزرگ است؛ فونت دیگری انتخاب کن.';
  if (message.includes('FONT_FORMAT')) return 'نسخهٔ قابل استفاده در Word برای این فونت دریافت نشد. فونت دیگری انتخاب کن.';
  return 'فونت دانلود نشد. اتصال اینترنت را بررسی کن و دوباره امتحان کن؛ فونت قبلی حفظ شده است.';
}
