import { editorHost } from './host';
/** Resolve files copied from public/ against Vite's configured deployment path. */
export function publicAsset(path: string): string {
  return editorHost().asset?.(path) ?? `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}
