import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { DocumentViewMode } from './host';

type View = 'edit' | 'preview';
type Point = { source: number; top: number; start?: boolean };
const mobileQuery = '(max-width: 56.1875rem)';
const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));

// Interpolate between Markdown block boundaries, rather than percentages of
// documents whose code, tables and diagrams have very different heights.
function project(points: Point[], value: number, from: 'source' | 'top') {
  const to = from === 'source' ? 'top' : 'source';
  if (!points.length) return 0;
  if (value <= points[0][from]) return points[0][to];
  for (let i = 1; i < points.length; i++) {
    const next = points[i], previous = points[i - 1];
    if (value <= next[from]) {
      const span = next[from] - previous[from];
      return previous[to] + (span > 0 ? (value - previous[from]) / span : 0) * (next[to] - previous[to]);
    }
  }
  return points[points.length - 1][to];
}

function previewPoints(panel: HTMLElement, length: number): Point[] {
  const origin = panel.getBoundingClientRect().top - panel.scrollTop;
  const points: Point[] = [{ source: 0, top: 0 }];
  for (const block of panel.querySelectorAll<HTMLElement>('[data-source-start]')) {
    const box = block.getBoundingClientRect();
    points.push({ source: Number(block.dataset.sourceStart), top: box.top - origin, start: true });
    points.push({ source: Number(block.dataset.sourceEnd), top: box.bottom - origin });
  }
  const article = panel.querySelector('.prose');
  points.push({ source: length, top: article ? article.getBoundingClientRect().bottom - origin : 0 });
  return points.sort((a, b) => a.source - b.source);
}

function editorPoints(editor: HTMLTextAreaElement, markdown: string, offsets: number[]): Point[] {
  // A text mirror uses the browser's own wrapping and font metrics. Counting
  // newlines alone drifts badly on a narrow phone with long paragraphs.
  const style = getComputedStyle(editor);
  const mirror = document.createElement('div');
  for (const property of ['box-sizing', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'tab-size', 'padding', 'border-width', 'border-style', 'text-indent', 'word-break', 'overflow-wrap', 'direction']) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  Object.assign(mirror.style, {
    position: 'absolute', left: '-6250rem', top: '0', visibility: 'hidden',
    pointerEvents: 'none', whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
    width: `${editor.getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize)}rem`, unicodeBidi: 'plaintext',
  });
  // Read positions from a single text node. Inserting marker spans would make
  // trailing spaces wrap differently from a textarea and accumulate drift.
  const text = document.createTextNode(markdown || '\u200b');
  mirror.append(text);
  document.body.append(mirror);
  try {
    const origin = mirror.getBoundingClientRect().top;
    const range = document.createRange();
    range.setStart(text, 0); range.setEnd(text, 1);
    const inset = range.getBoundingClientRect().top - origin - parseFloat(style.paddingTop);
    return [...new Set([0, ...offsets, markdown.length])].sort((a, b) => a - b).map(source => {
      const at = Math.min(source, text.length - 1);
      range.setStart(text, at); range.setEnd(text, at + 1);
      return { source, top: range.getBoundingClientRect().top - origin - inset + (source >= text.length ? parseFloat(style.lineHeight) : 0) };
    });
  } finally { mirror.remove(); }
}

export function usePreviewScroll(
  editor: RefObject<HTMLTextAreaElement | null>,
  preview: RefObject<HTMLDivElement | null>,
  markdown: string,
  previewMarkdown: string,
  mode: DocumentViewMode = 'combined',
) {
  const [mobileView, setMobileView] = useState<View>(mode === 'rendered' ? 'preview' : 'edit');
  const [mobile, setMobile] = useState(() => matchMedia(mobileQuery).matches);
  const editorMap = useRef<Point[]>([]);
  const previewMap = useRef<Point[]>([]);
  const measured = useRef({ text: '', width: 0, metrics: '' });
  const position = useRef<{ source: number; withinContent: boolean; anchor?: { source: number; gap: number } }>({ source: 0, withinContent: false });
  const driver = useRef<View>('edit');
  const expectedWindow = useRef<number | null>(null);
  const expectedPreview = useRef<number | null>(null);
  const restore = useRef(false);
  const viewport = useRef({ width: innerWidth, height: innerHeight });
  const reflowing = useRef(false);
  const measuredLayout = useRef('');
  const sources = useRef({ markdown, previewMarkdown });
  sources.current = { markdown, previewMarkdown };
  const dirty = useRef(true);
  const scheduleUpdate = useRef<((reflow?: boolean) => void) | null>(null);

  const routePageScroll = useCallback(() => {
    const panel = preview.current;
    if (!panel) return false;
    if (matchMedia(mobileQuery).matches) {
      delete panel.dataset.scrollRoute;
      return false;
    }
    const pane = panel.closest('.preview-pane');
    // Until the preview reaches its sticky position, both columns still move
    // with the page. Scrolling it internally and aligning the source to the
    // viewport would skip the entire area above the editor in one wheel tick.
    // At the page bottom, allow inner scrolling even for a short source whose
    // workspace cannot reach the top of the viewport.
    const pageFirst = !!pane && pane.getBoundingClientRect().top > 1
      && document.documentElement.scrollHeight - innerHeight - scrollY > 1;
    const route = pageFirst ? 'page' : 'preview';
    if (panel.dataset.scrollRoute !== route) panel.dataset.scrollRoute = route;
    return pageFirst;
  }, [preview]);

  const layoutSize = useCallback(() => {
    const input = editor.current, panel = preview.current;
    const article = panel?.querySelector<HTMLElement>('.prose');
    return `${input?.clientWidth}:${input?.scrollHeight}:${panel?.clientWidth}:${panel?.clientHeight}:${article?.clientWidth}:${article?.scrollHeight}`;
  }, [editor, preview]);

  const readingTop = useCallback((view: View) => {
    const selector = document.querySelector<HTMLElement>('.mobile-view-switch');
    const switchHeight = matchMedia(mobileQuery).matches && selector ? selector.offsetHeight + (parseFloat(getComputedStyle(selector).top) || 0) : 0;
    if (view === 'preview') return switchHeight + (preview.current?.querySelector<HTMLElement>('.rich-editor-toolbar')?.offsetHeight || 0);
    const toolbar = document.querySelector<HTMLElement>('.format-toolbar');
    return toolbar ? (parseFloat(getComputedStyle(toolbar).top) || 0) + toolbar.offsetHeight : switchHeight;
  }, [preview]);

  const measure = useCallback(() => {
    const input = editor.current, panel = preview.current;
    const { markdown, previewMarkdown } = sources.current;
    if (!input || !panel || markdown !== previewMarkdown) return;
    if (!dirty.current) return;
    const blocks = [...panel.querySelectorAll<HTMLElement>('[data-source-start]')];
    const offsets = blocks.flatMap(block => [Number(block.dataset.sourceStart), Number(block.dataset.sourceEnd)]);
    if (input.clientWidth) {
      const width = input.getBoundingClientRect().width;
      const style = getComputedStyle(input);
      const metrics = `${style.font}:${style.lineHeight}:${style.padding}:${style.direction}:${style.tabSize}:${style.letterSpacing}:${input.scrollHeight}:${offsets.join(',')}`;
      if (measured.current.text !== markdown || measured.current.width !== width || measured.current.metrics !== metrics) {
        editorMap.current = editorPoints(input, markdown, offsets);
        measured.current = { text: markdown, width, metrics };
      }
    }
    if (panel.clientWidth) previewMap.current = previewPoints(panel, markdown.length);
    measuredLayout.current = layoutSize();
    dirty.current = false;
  }, [editor, preview, layoutSize]);

  const read = useCallback((view: View) => {
    const element = view === 'edit' ? editor.current : preview.current;
    if (!element?.clientWidth) return;
    const internal = view === 'preview' && !matchMedia(mobileQuery).matches;
    const top = internal ? element.scrollTop + readingTop('preview') : readingTop(view) - element.getBoundingClientRect().top;
    const nextBlock = view === 'preview' ? previewMap.current.find(point => point.start && point.top >= top && point.top - top < Math.max(80, (innerHeight - readingTop(view)) / 2)) : undefined;
    position.current = {
      source: project(view === 'edit' ? editorMap.current : previewMap.current, top, 'top'),
      withinContent: internal || top > 0,
      anchor: nextBlock ? { source: nextBlock.source, gap: nextBlock.top - top } : undefined,
    };
  }, [editor, preview, readingTop]);

  const write = useCallback((view: View, preserveVisual = false) => {
    const element = view === 'edit' ? editor.current : preview.current;
    if (!element?.clientWidth) return;
    if (view === 'edit' && driver.current === 'preview' && routePageScroll()) return;
    const anchor = preserveVisual && view === 'preview' ? position.current.anchor : undefined;
    const anchoredBlock = anchor && previewMap.current.find(point => point.start && point.source === anchor.source);
    const top = anchoredBlock ? anchoredBlock.top - anchor!.gap : project(view === 'edit' ? editorMap.current : previewMap.current, position.current.source, 'source');
    if (view === 'preview' && !matchMedia(mobileQuery).matches) {
      const target = clamp(top - readingTop('preview'), element.scrollHeight - element.clientHeight);
      if (Math.abs(element.scrollTop - target) > 1) {
        element.scrollTop = target;
        expectedPreview.current = element.scrollTop;
      }
    } else if (position.current.withinContent) {
      const target = clamp(window.scrollY + element.getBoundingClientRect().top + top - readingTop(view), document.documentElement.scrollHeight - innerHeight);
      if (Math.abs(window.scrollY - target) > 1) {
        // Window scroll positions can round fractional layout measurements up.
        // Round down so the restored first line stays below the sticky toolbar.
        window.scrollTo({ top: Math.floor(target), behavior: 'instant' });
        expectedWindow.current = window.scrollY;
      }
    }
  }, [editor, preview, readingTop, routePageScroll]);

  const selectView = useCallback((view: View) => {
    if (mode !== 'combined') return;
    if (view === mobileView) return;
    measure();
    read(matchMedia(mobileQuery).matches ? mobileView : driver.current);
    restore.current = true;
    driver.current = view;
    setMobileView(view);
  }, [mobileView, measure, read, mode]);

  const activateView = useCallback((view: View) => {
    if (mode !== 'combined') { driver.current = view; return; }
    if (driver.current === view) return;
    driver.current = view;
    measure();
    read(view);
  }, [measure, read, mode]);

  useLayoutEffect(() => {
    if (mode !== 'combined') return;
    const media = matchMedia(mobileQuery);
    const onChange = () => {
      // The last logical source position survives a responsive layout change.
      restore.current = true;
      setMobile(media.matches);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [mode]);

  useLayoutEffect(() => {
    // Source text remains current immediately. Expensive DOM maps are needed
    // for scrolling, not for painting each character in the rich editor.
    dirty.current = true;
    scheduleUpdate.current?.();
  }, [markdown, previewMarkdown]);

  useLayoutEffect(() => {
    if (mode !== 'combined') return;
    const input = editor.current, panel = preview.current;
    if (!input || !panel) return;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pendingReflow = false;
    const update = (reflow = false) => {
      routePageScroll();
      measure();
      const { markdown, previewMarkdown } = sources.current;
      if (markdown !== previewMarkdown) return;
      const activeView = mobile ? mobileView : driver.current;
      if (restore.current && markdown === previewMarkdown) {
        restore.current = false;
        write(mobile ? mobileView : 'edit');
      } else if (reflow && !document.activeElement?.matches('input, textarea, [contenteditable="true"]')) {
        // Late diagram/font layout must keep the same logical block in view.
        write(activeView, true);
      } else {
        // A user can scroll or move the caret during the preview debounce.
        // Read the live position again once the new source map is available.
        read(activeView);
      }
      if (!mobile && markdown === previewMarkdown) write(driver.current === 'edit' ? 'preview' : 'edit');
    };
    const schedule = (reflow = false) => {
      pendingReflow ||= reflow;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      const run = () => {
        frame = requestAnimationFrame(() => {
          const changedLayout = pendingReflow;
          pendingReflow = false;
          update(changedLayout);
        });
      };
      // Keep layout reads and the hidden source mirror out of active input.
      // A scroll or view change below still measures synchronously on demand.
      if (document.activeElement?.matches('input, textarea, [contenteditable="true"]')) timer = setTimeout(run, 180);
      else run();
    };
    scheduleUpdate.current = schedule;
    dirty.current = true;
    update();
    const sizes = new WeakMap<Element, string>();
    const observer = new ResizeObserver(entries => {
      let changed = false;
      for (const entry of entries) {
        const size = `${entry.contentRect.width}:${entry.contentRect.height}`;
        if (sizes.has(entry.target) && sizes.get(entry.target) !== size) changed = true;
        sizes.set(entry.target, size);
      }
      if (changed) { dirty.current = true; schedule(true); }
    });
    observer.observe(input);
    observer.observe(panel);
    const article = panel.querySelector('.prose');
    if (article) observer.observe(article);
    // Rich editor node views annotate their source positions after mounting.
    // Rebuild the map when those anchors or async diagram contents arrive.
    const mutations = new MutationObserver(() => {
      const content = panel.querySelector('.prose');
      if (content) observer.observe(content);
      dirty.current = true;
      schedule(true);
    });
    mutations.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-source-start', 'data-source-end'] });
    const onResize = () => {
      viewport.current = { width: innerWidth, height: innerHeight };
      reflowing.current = true;
      dirty.current = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      frame = requestAnimationFrame(() => { update(true); reflowing.current = false; });
    };
    const onWindowScroll = () => {
      routePageScroll();
      if (viewport.current.width !== innerWidth || viewport.current.height !== innerHeight) { onResize(); return; }
      if (measuredLayout.current !== layoutSize()) { onResize(); return; }
      if (reflowing.current) return;
      if (expectedWindow.current !== null && Math.abs(window.scrollY - expectedWindow.current) < 2) { expectedWindow.current = null; return; }
      expectedWindow.current = null;
      const { markdown, previewMarkdown } = sources.current;
      if (markdown !== previewMarkdown) return;
      measure();
      driver.current = mobile ? mobileView : 'edit';
      read(driver.current);
      if (!mobile) write('preview');
    };
    const onPreviewScroll = () => {
      if (mobile) return;
      if (routePageScroll()) return;
      if (measuredLayout.current !== layoutSize()) { onResize(); return; }
      if (expectedPreview.current !== null && Math.abs(panel.scrollTop - expectedPreview.current) < 2) { expectedPreview.current = null; return; }
      expectedPreview.current = null;
      const { markdown, previewMarkdown } = sources.current;
      if (markdown !== previewMarkdown) return;
      measure();
      driver.current = 'preview';
      read('preview');
      write('edit');
    };
    window.addEventListener('scroll', onWindowScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    const onFontsLoaded = () => { measured.current.metrics = ''; onResize(); };
    document.fonts.addEventListener('loadingdone', onFontsLoaded);
    panel.addEventListener('scroll', onPreviewScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      scheduleUpdate.current = null;
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener('scroll', onWindowScroll);
      window.removeEventListener('resize', onResize);
      document.fonts.removeEventListener('loadingdone', onFontsLoaded);
      panel.removeEventListener('scroll', onPreviewScroll);
      delete panel.dataset.scrollRoute;
    };
  }, [mobile, mobileView, editor, preview, measure, read, write, layoutSize, routePageScroll, mode]);

  return { mobileView: mode === 'rendered' ? 'preview' as const : mode === 'source' ? 'edit' as const : mobileView, selectView, activateView };
}
