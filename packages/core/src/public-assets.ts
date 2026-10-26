import { editorHost } from './host';
/** Resolve files copied from public/ against Vite's configured deployment path. */
export function publicAsset(path: string): string {
  const hosted = editorHost().asset?.(path);
  if (hosted) return hosted;
  const relative = path.replace(/^\/+/, '');
  // Relative Vite builds also have /en/index.html. Resolve from the module
  // entry (src/ in dev, assets/ in production), rather than that page's folder.
  if (import.meta.env.BASE_URL === './' && typeof document !== 'undefined') {
    const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
    if (entry) return new URL(`../${relative}`, entry.src).href;
  }
  return `${import.meta.env.BASE_URL}${relative}`;
}
