import { defaultSettings, type ExportSettings } from './document-model';
import { normalizeFontFamily } from './font-assets';

export const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const directions = ['rtl', 'ltr', 'auto'];
const fontSizes = [10, 11, 12, 14, 16, 18];

/** Shared migration for old partial drafts and host workspace settings. */
export function normalizeSettings(value: unknown, fallback: ExportSettings = defaultSettings): ExportSettings {
  const settings = isRecord(value) ? value : {};
  return {
    title: typeof settings.title === 'string' ? settings.title.slice(0, 90) : fallback.title,
    direction: typeof settings.direction === 'string' && directions.includes(settings.direction) ? settings.direction as ExportSettings['direction'] : fallback.direction,
    fontSize: fontSizes.includes(Number(settings.fontSize)) && typeof settings.fontSize === 'number' ? settings.fontSize : fallback.fontSize,
    // Retire the old comparison switch when loading persisted settings.
    // Old drafts regain real bidi output even when they stored it as true.
    alignmentOnly: false,
    fontFamily: typeof settings.fontFamily === 'string' && settings.fontFamily.trim() ? normalizeFontFamily(settings.fontFamily.slice(0, 100)) : fallback.fontFamily,
  };
}
export function isExportSettings(value: unknown): value is ExportSettings {
  return isRecord(value) && typeof value.title === 'string' && value.title.length <= 90
    && typeof value.direction === 'string' && directions.includes(value.direction)
    && typeof value.fontSize === 'number' && fontSizes.includes(value.fontSize)
    && typeof value.alignmentOnly === 'boolean'
    && typeof value.fontFamily === 'string' && value.fontFamily.length > 0 && value.fontFamily.length <= 100;
}
