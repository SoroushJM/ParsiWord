import defaultDocument from '@parsiword/core/default-document.md?raw';
import { defaultSettings, type ExportSettings } from '@parsiword/core/converter';
import { normalizeFontFamily } from '@parsiword/core/fonts';
const storageKey = 'parsiword-draft-v1';
export function loadDraft(locale: 'fa' | 'en') {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const data = JSON.parse(raw);
      if (typeof data.markdown === 'string' && data.markdown.length <= 500_000) {
        const s = data.settings || {};
        return {
          markdown: data.markdown,
          settings: {
            title: typeof s.title === 'string' ? s.title.slice(0, 90) : defaultSettings.title,
            direction: ['rtl', 'ltr', 'auto'].includes(s.direction) ? s.direction : 'rtl',
            fontSize: [10, 11, 12, 14, 16, 18].includes(s.fontSize) ? s.fontSize : 12,
            alignmentOnly: false,
            fontFamily: typeof s.fontFamily === 'string' ? normalizeFontFamily(s.fontFamily.slice(0, 100)) : defaultSettings.fontFamily,
          } as ExportSettings,
        };
      }
    }
  } catch { /* Use the starter document if no valid saved draft is available. */ }
  return { markdown: defaultDocument, settings: { ...defaultSettings, title: locale === 'en' ? 'My note' : defaultSettings.title } };
}

export function persistDraft(draft: {markdown: string; settings: ExportSettings}) { localStorage.setItem(storageKey, JSON.stringify(draft)); }
