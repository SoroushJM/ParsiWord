import { createContext, useLayoutEffect, useState, type RefObject } from 'react';

export const PreviewBounds = createContext(0);

/** Measure the containing panel, never the overflowing table or the document. */
export function usePreviewBounds(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width ?? 0;
      if (!next) return; // Hidden mobile panels retain their last useful bound.
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      element.style.setProperty('--preview-inline-size', `${next / root}rem`);
      setWidth(previous => previous === next ? previous : next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
