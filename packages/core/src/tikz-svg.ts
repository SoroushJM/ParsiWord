/** Static SVG only: TeX specials may emit arbitrary markup and are untrusted. */
export type TikzGlyphFont = { unitsPerEm: number; glyphs: Record<string, [advance: number, path: string]> };
export type TikzFontLoader = (name: string) => Promise<TikzGlyphFont>;
const namespace = 'http://www.w3.org/2000/svg';
const elements = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'clipPath', 'linearGradient', 'radialGradient', 'stop', 'pattern', 'use', 'mask', 'text', 'title', 'desc']);
const attributes = new Set(['xmlns', 'xmlns:xlink', 'version', 'id', 'viewBox', 'preserveAspectRatio', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'clip-path', 'clip-rule', 'clipPathUnits', 'mask', 'maskUnits', 'maskContentUnits', 'patternUnits', 'patternContentUnits', 'patternTransform', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'stop-color', 'stop-opacity', 'href', 'xlink:href', 'font-family', 'font-size', 'alignment-baseline', 'text-anchor', 'color']);
let serial = 0;

export async function outlineTikzSvg(svg: string, loadFont: TikzFontLoader): Promise<{ svg: string; width: number; height: number }> {
  if (svg.length > 4_000_000 || /<!DOCTYPE|<!ENTITY/i.test(svg)) throw new Error('Invalid TikZ SVG');
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = document.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== namespace || document.querySelector('parsererror')) throw new Error('Invalid TikZ SVG');
  if (root.querySelectorAll('*').length > 20_000) throw new Error('TikZ SVG is too complex');
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (element.namespaceURI !== namespace || !elements.has(element.localName)) throw new Error('Unsafe TikZ SVG element');
    for (const attribute of Array.from(element.attributes)) {
      const value = attribute.value;
      if (!attributes.has(attribute.name)) throw new Error('Unsafe TikZ SVG attribute');
      if (/^on/i.test(attribute.name) || /^(?:src|xml:base)$/i.test(attribute.name) || (/href$/i.test(attribute.name) && !/^#[a-zA-Z_][\w:.-]*$/.test(value))) throw new Error('External TikZ SVG resource');
      if (/@|\\/.test(value) || /url\s*\(/i.test(value) && Array.from(value.matchAll(/url\s*\(([^)]*)\)/gi)).some(match => !/^#[a-zA-Z_][\w:.-]*$/.test(match[1].trim().replace(/^["']|["']$/g, '')))) throw new Error('External TikZ SVG style');
    }
  }
  // PGF reuses names such as pgfpat0 across unrelated pictures. Keep every
  // definition and its references local to this rendering when inserted inline.
  const prefix = `parsiword-tikz-${++serial}-`, ids = new Map<string, string>(), definitions = new Map<string, Element>();
  for (const element of [root, ...root.querySelectorAll('*')]) {
    const id = element.getAttribute('id');
    if (id) { if (!/^[a-zA-Z_][\w:.-]*$/.test(id) || ids.has(id)) throw new Error('Invalid TikZ SVG id'); ids.set(id, prefix + id); definitions.set(prefix + id, element); element.setAttribute('id', prefix + id); }
  }
  // Small SVG text can otherwise encode an exponentially expanding <use> tree
  // or recursive paint server. Bound the expanded drawing, before image decode.
  const visiting = new Set<Element>(), costs = new Map<Element, number>();
  function complexity(element: Element, depth: number): number {
    if (visiting.has(element) || depth > 128) throw new Error('Recursive TikZ SVG');
    const cached = costs.get(element); if (cached !== undefined) return cached;
    visiting.add(element);
    let cost = 1;
    for (const child of Array.from(element.children)) cost += complexity(child, depth + 1);
    for (const attribute of Array.from(element.attributes)) {
      const references = /href$/i.test(attribute.name) ? [attribute.value.slice(1)] : Array.from(attribute.value.matchAll(/url\(#([^)]*)\)/g), match => match[1]);
      for (const id of references) cost += complexity(definitions.get(id)!, depth + 1);
    }
    visiting.delete(element);
    if (cost > 200_000) throw new Error('TikZ SVG is too complex');
    costs.set(element, cost); return cost;
  }
  for (const element of [root, ...root.querySelectorAll('*')]) for (const attribute of Array.from(element.attributes)) {
    if (/href$/i.test(attribute.name)) { const id = ids.get(attribute.value.slice(1)); if (!id) throw new Error('Unknown TikZ SVG reference'); element.setAttribute(attribute.name, '#' + id); }
    else if (/url\s*\(/i.test(attribute.value)) element.setAttribute(attribute.name, attribute.value.replace(/url\s*\(([^)]*)\)/gi, (_, raw: string) => {
      const id = ids.get(raw.trim().replace(/^["']|["']$/g, '').slice(1));
      if (!id) throw new Error('Unknown TikZ SVG reference'); return `url(#${id})`;
    }));
  }
  complexity(root, 0);
  const bounds = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (!bounds || bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[2] <= 0 || bounds[3] <= 0 || bounds[2] > 20_000 || bounds[3] > 20_000) throw new Error('Invalid TikZ SVG bounds');
  const texts = Array.from(root.querySelectorAll('text'));
  if (texts.reduce((sum, text) => sum + (text.textContent || '').length, 0) > 12_000) throw new Error('TikZ labels are too complex');
  let outlineBytes = 0, outlineNodes = root.querySelectorAll('*').length;
  for (const text of texts) {
    if (text.children.length) throw new Error('Unsupported nested TikZ text');
    const name = text.getAttribute('font-family') || '';
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new Error('Unknown TikZ font');
    const font = await loadFont(name);
    const x = Number(text.getAttribute('x') || 0), y = Number(text.getAttribute('y') || 0), size = Number(text.getAttribute('font-size'));
    if (![x, y, size, font.unitsPerEm].every(Number.isFinite) || size <= 0 || size > 1000 || font.unitsPerEm <= 0) throw new Error('Invalid TikZ text metrics');
    const group = document.createElementNS(namespace, 'g');
    for (const attribute of Array.from(text.attributes)) if (!['x', 'y', 'font-family', 'font-size', 'alignment-baseline'].includes(attribute.name)) group.setAttribute(attribute.name, attribute.value);
    const scale = size / font.unitsPerEm;
    let advance = 0;
    for (const character of text.textContent || '') {
      const glyph = font.glyphs[String(character.codePointAt(0))];
      if (!glyph || !Number.isFinite(glyph[0]) || typeof glyph[1] !== 'string' || !/^[\d\s.,+eEmMzZlLhHvVcCsSqQtTaA-]*$/.test(glyph[1])) throw new Error('Missing TikZ font glyph');
      if (glyph[1]) {
        outlineBytes += glyph[1].length;
        if (++outlineNodes > 20_000 || outlineBytes > 4_000_000) throw new Error('TikZ labels are too complex');
        const path = document.createElementNS(namespace, 'path');
        path.setAttribute('d', glyph[1]);
        path.setAttribute('transform', `translate(${x + advance * scale},${y}) scale(${scale},${-scale})`);
        group.append(path);
      }
      advance += glyph[0];
    }
    text.replaceWith(group);
  }
  // SVG pt are CSS points (72/in), while Diagram dimensions are CSS pixels
  // (96/in). Preserve the TeX viewBox and the original physical drawing size.
  const physicalPoints = /^[-+\d.eE]+pt$/.test(root.getAttribute('width') || '') && /^[-+\d.eE]+pt$/.test(root.getAttribute('height') || '');
  const scale = physicalPoints ? 96 / 72 : 1;
  const width = bounds[2] * scale, height = bounds[3] * scale;
  root.setAttribute('xmlns', namespace);
  root.setAttribute('width', String(width)); root.setAttribute('height', String(height));
  const outlined = new XMLSerializer().serializeToString(root);
  if (outlined.length > 6_000_000) throw new Error('TikZ outlined SVG is too complex');
  return { svg: outlined, width, height };
}
