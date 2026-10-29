import { useLayoutEffect, type RefObject } from 'react';

/** Keyboard access only for table frames that actually overflow. */
export function useTableScroll(ref: RefObject<HTMLElement | null>, label: string) {
  useLayoutEffect(() => {
    const article = ref.current;
    if (!article) return;
    let frame = 0;
    const wrappers = new Map<HTMLElement, Element | null>();
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    const measure = () => {
      for (const [wrapper, table] of wrappers) if (!article.contains(wrapper)) {
        resize.unobserve(wrapper); if (table) resize.unobserve(table); wrappers.delete(wrapper);
      }
      for (const wrapper of article.querySelectorAll<HTMLElement>('.tableWrapper')) {
        if (!wrappers.has(wrapper)) {
          wrappers.set(wrapper, wrapper.firstElementChild); resize.observe(wrapper);
          if (wrapper.firstElementChild) resize.observe(wrapper.firstElementChild);
        }
        if (wrapper.clientWidth > 0 && wrapper.scrollWidth > wrapper.clientWidth + 1) {
          wrapper.tabIndex = 0; wrapper.setAttribute('role', 'region'); wrapper.setAttribute('aria-label', label);
        } else { wrapper.removeAttribute('tabindex'); wrapper.removeAttribute('role'); wrapper.removeAttribute('aria-label'); }
      }
    };
    const mutation = new MutationObserver(schedule);
    mutation.observe(article, { childList: true, subtree: true });
    measure();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); };
  }, [ref, label]);
}
