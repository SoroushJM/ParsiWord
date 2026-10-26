import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { compareMarkdown, type MarkdownDiff } from './markdown-diff';

type Side = 'original' | 'modified';
type View = 'source' | 'rendered';
type Anchor = { original: number; modified: number };
type Point = { source: number; top: number; start?: boolean };
type Surface = { side: HTMLElement; owner: HTMLElement; content: HTMLElement; points: Point[] };
type Reading = { side: Side; source: number; gap: number; view: View };
const other = (side: Side): Side => side === 'original' ? 'modified' : 'original';
const normalize = (text: string) => text.replace(/\r\n?/g, '\n');
const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));

/** Both ends of every change are paired; unchanged text keeps exact offsets.
 * Duplicate coordinates describe an insertion/deletion, rather than spreading
 * that change over the rest of the document like percentage scrolling would. */
export function comparisonScrollAnchors(original: string, modified: string, diff: MarkdownDiff): Anchor[] {
  const ends = (side: Side) => new Map(diff[side].ranges.map(range => [range.start, range.end]));
  const oldEnds = ends('original'), newEnds = ends('modified');
  const anchors: Anchor[] = [{ original: 0, modified: 0 }];
  const unchangedUntil = (original: number, modified: number) => {
    const previous = anchors[anchors.length - 1];
    const common = Math.min(original - previous.original, modified - previous.modified);
    // A line diff treats the last line as unchanged when adding/removing a
    // following line also adds/removes its terminating LF. Keep that lone LF
    // at the change boundary instead of smearing it over all unchanged text.
    if (common > 0) anchors.push({ original: previous.original + common, modified: previous.modified + common });
    anchors.push({ original, modified });
  };
  diff.original.anchors.forEach((start, index) => {
    const next = diff.modified.anchors[index];
    unchangedUntil(start, next);
    anchors.push({ original: oldEnds.get(start) ?? start, modified: newEnds.get(next) ?? next });
  });
  unchangedUntil(normalize(original).length, normalize(modified).length);
  return anchors;
}

export function mapComparisonSource(anchors: readonly Anchor[], source: number, side: Side): number {
  const target = other(side);
  let previous = anchors[0];
  for (let index = 1; index < anchors.length; index++) {
    const next = anchors[index];
    if (source < next[side]) {
      const span = next[side] - previous[side];
      return previous[target] + (span > 0 ? clamp((source - previous[side]) / span, 1) : 0) * (next[target] - previous[target]);
    }
    previous = next;
  }
  return previous[target];
}

// The same block-boundary interpolation used by usePreviewScroll, applied to
// two separate documents and their own scroll containers instead of window.
function project(points: Point[], value: number, from: 'source' | 'top') {
  const to = from === 'source' ? 'top' : 'source';
  let previous = points[0];
  if (!previous) return 0;
  if (value < previous[from]) return previous[to];
  for (let index = 1; index < points.length; index++) {
    const next = points[index];
    if (value < next[from]) {
      const span = next[from] - previous[from];
      return previous[to] + (span > 0 ? (value - previous[from]) / span : 0) * (next[to] - previous[to]);
    }
    previous = next;
  }
  return previous[to];
}

function lineOffsets(text: string) {
  const offsets = [0];
  for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1)) offsets.push(at + 1);
  return offsets;
}

function scrollOwner(content: HTMLElement, side: HTMLElement): HTMLElement {
  for (let node: HTMLElement | null = content; node && node !== side; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1 && /^(auto|scroll)$/.test(getComputedStyle(node).overflowY)) return node;
  }
  return side;
}

/** A native textarea can omit syntax decoration for a large/plain document.
 * Measure its actual font/wrapping in one invisible text node, without ever
 * assigning its value, moving its selection, or replacing its input surface. */
function textareaPoints(input: HTMLTextAreaElement, text: string, owner: HTMLElement, offsets: number[]): Point[] {
  const style = getComputedStyle(input), mirror = document.createElement('div');
  for (const property of ['box-sizing', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-variant', 'font-feature-settings', 'font-kerning', 'font-variation-settings', 'font-optical-sizing', 'line-height', 'letter-spacing', 'word-spacing', 'tab-size', 'padding', 'border-width', 'border-style', 'text-indent', 'text-align', 'text-transform', 'word-break', 'overflow-wrap', 'line-break', 'direction', 'unicode-bidi']) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  Object.assign(mirror.style, {
    position: 'absolute', left: '-6250rem', top: '0', visibility: 'hidden', pointerEvents: 'none',
    whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
    width: `${input.getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize)}rem`,
  });
  const node = document.createTextNode(text || '\u200b');
  mirror.append(node); document.body.append(mirror);
  try {
    const origin = mirror.getBoundingClientRect().top;
    const base = owner === input ? -input.clientTop : input.getBoundingClientRect().top - owner.getBoundingClientRect().top - owner.clientTop + owner.scrollTop;
    const range = document.createRange();
    const step = Math.max(1, Math.ceil(offsets.length / 4000));
    const samples = [...new Set([...offsets.filter((_, index) => index % step === 0), text.length])].sort((a, b) => a - b);
    return samples.map(source => {
      const at = Math.min(source, node.length - 1);
      range.setStart(node, at); range.setEnd(node, at + 1);
      const top = range.getBoundingClientRect().top - origin;
      return { source, top: base + top + (source >= node.length ? parseFloat(style.lineHeight) || 0 : 0), start: source < text.length };
    });
  } finally { mirror.remove(); }
}

function measure(side: HTMLElement, view: View, text: string): Surface | undefined {
  const content = side.querySelector<HTMLElement>(view === 'source' ? 'textarea.markdown-editor' : '.preview-panel .prose');
  if (!content?.getClientRects().length) return;
  const owner = scrollOwner(content, side);
  const origin = owner.getBoundingClientRect().top + owner.clientTop - owner.scrollTop;
  const points: Point[] = [];
  if (view === 'source') {
    const offsets = lineOffsets(text);
    const lines = side.querySelectorAll<HTMLElement>('.markdown-source-highlight [data-source-line]');
    const highlighted = side.querySelector<HTMLElement>('.markdown-source-editor')?.dataset.highlighted === 'true';
    if (highlighted && lines.length && owner !== content) {
      for (const line of lines) {
        const index = Number(line.dataset.sourceLine), source = offsets[index];
        if (source === undefined) continue;
        const box = line.getBoundingClientRect();
        points.push({ source, top: box.top - origin, start: true });
        points.push({ source: offsets[index + 1] ?? text.length, top: box.bottom - origin });
      }
    } else points.push(...textareaPoints(content as HTMLTextAreaElement, text, owner, offsets));
  } else {
    for (const block of content.querySelectorAll<HTMLElement>('[data-source-start]')) {
      const start = Number(block.dataset.sourceStart), end = Number(block.dataset.sourceEnd);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const box = block.getBoundingClientRect();
      points.push({ source: start, top: box.top - origin, start: true }, { source: end, top: box.bottom - origin });
    }
    const box = content.getBoundingClientRect();
    if (!points.length) points.push({ source: 0, top: box.top - origin, start: true });
    points.push({ source: text.length, top: box.bottom - origin });
  }
  points.sort((a, b) => a.source - b.source || a.top - b.top);
  // A definition or empty terminal block may share an offset. Keep maps
  // monotone even when the renderer has no visual node for that Markdown.
  for (let index = 1; index < points.length; index++) points[index].top = Math.max(points[index - 1].top, points[index].top);
  return { side, owner, content, points };
}

function readingInset(surface: Surface) {
  const owner = surface.owner.getBoundingClientRect(), side = surface.side.getBoundingClientRect();
  let top = Math.max(owner.top + surface.owner.clientTop, side.top + surface.side.clientTop);
  for (const header of surface.side.querySelectorAll<HTMLElement>('.comparison-revision, .format-toolbar, .rich-toolbar-container, .editor-search')) {
    if (!header.getClientRects().length || getComputedStyle(header).position !== 'sticky') continue;
    const box = header.getBoundingClientRect();
    // Only headers actually covering the reading edge, not normal controls
    // farther down the document, count as an occlusion.
    if (box.top <= top + 1 && box.bottom > top) top = box.bottom;
  }
  return Math.max(0, top - owner.top - surface.owner.clientTop);
}

type Options = {
  containerRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  original: string;
  modified: string;
  view: View;
  revision?: string;
  diff?: MarkdownDiff;
};

/** Synchronize the visible Markdown position, never the edited text/history. */
export function useComparisonScroll({ containerRef, enabled, original, modified, view, revision, diff }: Options) {
  const comparison = useMemo(() => diff ?? compareMarkdown(original, modified), [diff, original, modified]);
  const anchors = useMemo(() => comparisonScrollAnchors(original, modified, comparison), [original, modified, comparison]);
  const current = useRef({ original: normalize(original), modified: normalize(modified), anchors });
  current.current = { original: normalize(original), modified: normalize(modified), anchors };
  const dirty = useRef(true);
  const driver = useRef<Side>('modified');
  const reading = useRef<Reading | null>(null);
  const schedule = useRef<((immediate?: boolean) => void) | null>(null);
  useLayoutEffect(() => { dirty.current = true; schedule.current?.(); }, [original, modified, anchors, revision]);

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!enabled || !root) return;
    const panes = {
      original: root.querySelector<HTMLElement>('.comparison-side[data-comparison-side="original"]'),
      modified: root.querySelector<HTMLElement>('.comparison-side[data-comparison-side="modified"]'),
    };
    if (!panes.original || !panes.modified) return;
    const expected = new WeakMap<HTMLElement, number>();
    let surfaces: Partial<Record<Side, Surface>> = {}, frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observed = new Set<Element>();
    const observe = (node: Element) => { if (!observed.has(node)) { observed.add(node); sizes.observe(node); } };
    const write = (surface: Surface, source: number, gap: number) => {
      const target = clamp(project(surface.points, source, 'source') - readingInset(surface) - gap, surface.owner.scrollHeight - surface.owner.clientHeight);
      if (Math.abs(surface.owner.scrollTop - target) < 0.5) return;
      surface.owner.scrollTo({ top: target, behavior: 'instant' });
      expected.set(surface.owner, surface.owner.scrollTop);
    };
    const update = () => {
      frame = 0;
      if (dirty.current) {
        // Search controls and editor surfaces can be replaced while this
        // comparison stays open; release their detached DOM immediately.
        for (const node of observed) if (!root.contains(node)) { sizes.unobserve(node); observed.delete(node); }
        surfaces = {};
        for (const side of ['original', 'modified'] as const) {
          const pane = panes[side]!;
          const measured = measure(pane, view, current.current[side]);
          if (measured) {
            surfaces[side] = measured; observe(measured.content); observe(measured.owner);
            for (const header of pane.querySelectorAll('.comparison-revision, .format-toolbar, .rich-toolbar-container, .editor-search')) observe(header);
          }
        }
        dirty.current = false;
      }
      const from = surfaces[driver.current], to = surfaces[other(driver.current)];
      if (!from || !to || !from.points.length || !to.points.length) return;
      if (reading.current && reading.current.view !== view) {
        const saved = reading.current;
        const source = saved.side === driver.current ? saved.source : mapComparisonSource(current.current.anchors, saved.source, saved.side);
        write(from, source, saved.gap);
      }
      const top = from.owner.scrollTop + readingInset(from);
      // Preserve the next visible block's gap. This aligns shared headings
      // exactly even when preceding paragraphs wrap into different row counts.
      const next = from.points.find(point => point.start && point.top >= top && point.top - top < from.owner.clientHeight / 2);
      const source = next?.source ?? project(from.points, top, 'top');
      const gap = next ? next.top - top : Math.max(0, from.points[0].top - top);
      reading.current = { side: driver.current, source, gap, view };
      write(to, mapComparisonSource(current.current.anchors, source, driver.current), gap);
    };
    const enqueue = (immediate = false) => {
      clearTimeout(timer);
      const run = () => { if (!frame) frame = requestAnimationFrame(update); };
      // Keep full DOM/mirror measurement out of active typing/IME. A real
      // scroll still measures immediately; idle text/layout refresh is cheap
      // to postpone until the input has paused.
      if (!immediate && root.contains(document.activeElement) && document.activeElement?.matches('input, textarea, [contenteditable="true"]')) timer = setTimeout(run, 180);
      else run();
    };
    schedule.current = enqueue;
    const invalidate = () => { dirty.current = true; enqueue(); };
    const sizes = new ResizeObserver(invalidate);
    observe(root); observe(panes.original); observe(panes.modified);
    const mutations = new MutationObserver(invalidate);
    mutations.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-source-start', 'data-source-end', 'data-highlighted'] });
    const sideOf = (target: EventTarget | null): Side | undefined => {
      const element = target instanceof Element ? target : null;
      const pane = element?.closest<HTMLElement>('.comparison-side');
      return pane === panes.original ? 'original' : pane === panes.modified ? 'modified' : undefined;
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const side = sideOf(target);
      if (!side) return;
      const wanted = expected.get(target);
      if (wanted !== undefined && Math.abs(target.scrollTop - wanted) < 1) { expected.delete(target); return; }
      expected.delete(target);
      const surface = surfaces[side];
      if (surface && target !== surface.owner && target !== surface.side) return;
      driver.current = side;
      enqueue(true);
    };
    const onIntent = (event: Event) => {
      const side = sideOf(event.target);
      if (!side) return;
      driver.current = side;
      const surface = surfaces[side];
      if (surface) expected.delete(surface.owner);
    };
    root.addEventListener('scroll', onScroll, true);
    for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) root.addEventListener(event, onIntent, { capture: true, passive: true });
    root.addEventListener('load', invalidate, true);
    document.fonts.addEventListener('loadingdone', invalidate);
    window.addEventListener('resize', invalidate, { passive: true });
    dirty.current = true; enqueue(true);
    return () => {
      cancelAnimationFrame(frame); clearTimeout(timer); schedule.current = null; sizes.disconnect(); mutations.disconnect();
      root.removeEventListener('scroll', onScroll, true);
      for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) root.removeEventListener(event, onIntent, true);
      root.removeEventListener('load', invalidate, true);
      document.fonts.removeEventListener('loadingdone', invalidate);
      window.removeEventListener('resize', invalidate);
    };
  }, [containerRef, enabled, view]);
}
