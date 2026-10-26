import { markdownParser } from './markdown';
import type { MarkdownNode } from './rich-editor-markdown';

export type MarkdownImage = { url: string; alt: string; title: string | null };
type ImageDefinitions = ReadonlyMap<string, { url?: string; title?: string | null }>;

/** Read an existing raw atom without changing its original Markdown spelling. */
export function markdownImage(source: string, definitions?: ImageDefinitions): MarkdownImage | null {
  if (!/^!\[/.test(source)) return null;
  const recognition = definitions?.size ? '\n\n' + [...definitions.keys()].map(identifier => `[${identifier.replace(/[\\\[\]]/g, '\\$&')}]: https://parsiword.invalid/`).join('\n') : '';
  const root = markdownParser.parse(source + recognition) as unknown as MarkdownNode;
  const paragraph = root.children?.[0];
  const image = paragraph?.children?.[0];
  if (paragraph?.type !== 'paragraph' || paragraph.children?.length !== 1 || !image
    || image.position?.start.offset !== 0 || image.position?.end.offset !== source.length) return null;
  const definition = image.type === 'imageReference' ? definitions?.get(image.identifier || '') : image.type === 'image' ? image : undefined;
  return definition?.url ? { url: definition.url, alt: image.alt || '', title: definition.title || null } : null;
}

/** Browser-only fallback. Host resolvers own local-file access in VS Code. */
export function browserImageUrl(source: string): string | null {
  if (!source || source !== source.trim() || /[\u0000-\u001f\u007f]/.test(source)) return null;
  if (/^data:/i.test(source)) return /^data:image\/(?:png|gif|jpe?g|webp|avif|bmp|svg\+xml)(?:;[\w=.+-]+)*(?:;base64)?,/i.test(source) ? source : null;
  if (/^(?:https?:)?\/\//i.test(source)) return source;
  // Relative Markdown URLs remain relative to the current web page. File and
  // application schemes require an explicit, document-scoped host resolver.
  return /^[a-z][a-z\d+.-]*:/i.test(source) || /^[\\]/.test(source) ? null : source;
}
