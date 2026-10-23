import defaultDocument from '@parsiword/core/default-document.md?raw';
import { defaultSettings, normalizeSettings, MAX_MARKDOWN_LENGTH, type ExportSettings } from '@parsiword/core/document';
const storageKey = 'parsiword-draft-v1';
export function loadDraft(locale: 'fa' | 'en') {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const data = JSON.parse(raw);
      if (typeof data.markdown === 'string') {
        return {
          markdown: data.markdown,
          settings: normalizeSettings(data.settings),
          ...(data.markdown.length > MAX_MARKDOWN_LENGTH ? { recovery: 'oversize' as const } : {}),
        };
      }
    }
  } catch { /* Use the starter document if no valid saved draft is available. */ }
  return { markdown: defaultDocument, settings: { ...defaultSettings, title: locale === 'en' ? 'My note' : defaultSettings.title } };
}

export function persistDraft(draft: {markdown: string; settings: ExportSettings}) { localStorage.setItem(storageKey, JSON.stringify(draft)); }
