// Loaded only by Vite development builds. The capture runner supplies a CDP
// binding, so screenshots use the browser's real pixels, including sticky UI.
type CaptureOptions = { markdown?: string; scrollY?: number; view?: 'edit' | 'preview' };
async function settlePreview() {
  await document.fonts.ready;
  const start = performance.now();
  do {
    await new Promise(resolve => setTimeout(resolve, 50));
    if (performance.now() - start > 30_000) throw new Error('Preview did not settle before capture.');
  } while (performance.now() - start < 300 || document.querySelector('[aria-busy="true"], .preview-panel [role="status"]'));
  await document.fonts.ready;
}
declare global {
  interface Window {
    parsiwordDev?: { screenshot: (options?: CaptureOptions) => Promise<string> };
    __parsiwordCapture?: (payload: string) => void;
    __parsiwordCaptureDone?: (id: number, path: string, error?: string) => void;
  }
}
export function installCapture(setMarkdown: (markdown: string) => void) {
  let nextId = 0;
  const pending = new Map<number, { resolve: (path: string) => void; reject: (error: Error) => void }>();
  window.__parsiwordCaptureDone = (id, path, error) => {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    if (error) request.reject(new Error(error)); else request.resolve(path);
  };
  window.parsiwordDev = {
    async screenshot(options = {}) {
      if (!window.__parsiwordCapture) throw new Error('Run pnpm run ui:capture to connect the screenshot bridge.');
      if (options.view !== undefined && !['edit', 'preview'].includes(options.view)) throw new Error('Capture view must be edit or preview.');
      if (options.markdown !== undefined) setMarkdown(options.markdown);
      // Wait for React, the 200 ms preview debounce and local diagram rendering.
      await settlePreview();
      if (options.view && window.matchMedia('(max-width: 899px)').matches) {
        const button = document.querySelector<HTMLButtonElement>(`[data-mobile-view="${options.view}"]`);
        if (!button) throw new Error('The mobile view selector is unavailable.');
        button.click();
        // The view switch restores the corresponding source block after React
        // reveals its panel; let that layout finish before applying scrollY.
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        await settlePreview();
      }
      if (options.scrollY !== undefined) window.scrollTo(0, options.scrollY);
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const id = ++nextId;
      return new Promise<string>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        window.__parsiwordCapture!(JSON.stringify({ id }));
      });
    },
  };
  return () => { delete window.parsiwordDev; delete window.__parsiwordCaptureDone; };
}
