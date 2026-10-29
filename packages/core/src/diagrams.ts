import { RichContentError } from './rich-content';

export type DiagramPage = { png: Uint8Array; width: number; height: number; svg: string };
export type Diagram = DiagramPage & { pages?: readonly DiagramPage[]; pdf?: Uint8Array };
export type DiagramRenderer = (source: string) => Promise<Diagram>;
const cache = new Map<string, Promise<Diagram>>();
let queue = Promise.resolve();
let counter = 0;

// Render geometry at one font size; preview scales the whole SVG with the text.
export const diagramFontSize = 16;

function fontSizeKeys(config: unknown): string[] {
  if (!config || typeof config !== 'object') return [];
  return Object.entries(config).flatMap(([key, value]) => [
    ...(/fontSize$/i.test(key) ? [key] : []), ...fontSizeKeys(value),
  ]);
}

async function render(source: string, mode: 'light' | 'dark'): Promise<Diagram> {
  if (source.length > 50_000) throw new RichContentError('DIAGRAM_TOO_LARGE');
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false, securityLevel: 'strict', theme: mode === 'dark' ? 'dark' : 'default',
    fontFamily: 'Arial, sans-serif', fontSize: diagramFontSize,
    themeVariables: { fontSize: `${diagramFontSize / 16}rem` }, htmlLabels: false,
    flowchart: { htmlLabels: false }, maxTextSize: 50_000,
    suppressErrorRendering: true,
    // Mermaid applies these keys recursively, including init/frontmatter options.
    // Keep labels at document scale even when a source requests huge font sizes.
    secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'htmlLabels', 'flowchart', 'fontFamily', 'fontSize', 'themeCSS', 'theme', ...new Set(fontSizeKeys(mermaid.mermaidAPI.defaultConfig))],
  });
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-1250rem;top:0;visibility:hidden;width:75rem;font:${diagramFontSize / 16}rem Arial,sans-serif;line-height:normal`;
  document.body.append(host);
  try {
    const { svg } = await mermaid.render(`parsiword-diagram-${++counter}`, source, host);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    if (doc.querySelector('parsererror, script, iframe, foreignObject')) throw new Error('Unsafe SVG');
    for (const element of doc.querySelectorAll('*')) for (const attribute of element.attributes) {
      const value = attribute.value;
      if (/^on/i.test(attribute.name) || (/href$/i.test(attribute.name) && !value.startsWith('#'))) throw new Error('External SVG resource');
    }
    if (/@import/i.test(svg) || Array.from(svg.matchAll(/url\(([^)]*)\)/gi)).some(match => !match[1].trim().replace(/^["']|["']$/g, '').startsWith('#'))) throw new Error('External SVG style');
    const root = doc.documentElement;
    const box = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) throw new Error('Invalid SVG bounds');
    const [, , width, height] = box;
    root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    root.setAttribute('width', String(width)); root.setAttribute('height', String(height));
    root.style.maxWidth = 'none';
    const cleanSvg = new XMLSerializer().serializeToString(root);
    const url = URL.createObjectURL(new Blob([cleanSvg], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('SVG decode failed')); image.src = url; });
      const scale = Math.min(2, 4096 / width, 4096 / height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(width * scale)); canvas.height = Math.max(1, Math.ceil(height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.fillStyle = mode === 'dark' ? '#1f2020' : '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG encode failed')), 'image/png'));
      return { svg: cleanSvg, png: new Uint8Array(await blob.arrayBuffer()), width, height };
    } finally { URL.revokeObjectURL(url); }
  } finally { host.remove(); }
}
export function renderMermaid(source: string, mode: 'light' | 'dark' = 'light'): Promise<Diagram> {
  const key = `${mode}:${source}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const result = queue.then(() => render(source, mode)).catch(cause => {
    cache.delete(key);
    if (cause instanceof RichContentError) throw cause;
    throw new RichContentError('DIAGRAM_RENDER_FAILED', { cause });
  });
  queue = result.then(() => undefined, () => undefined);
  cache.set(key, result);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return result;
}
