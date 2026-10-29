import { useSyncExternalStore } from 'react';
import { appearanceKey, colorRoles, defaultAppearance, isAppearanceSettings, isColorValue, paletteFor, type AppearanceSettings, type PaletteMode, type Palette, type ColorRole } from './appearance';
import { editorHost } from './host';

let saved: AppearanceSettings | undefined;
let preview: { settings: AppearanceSettings; palette: PaletteMode } | undefined;
const listeners = new Set<() => void>();
let revision = 0;
const notify = () => { revision++; for (const listener of listeners) listener(); };
export function appearanceSnapshot(): AppearanceSettings {
  if (!saved) {
    saved = defaultAppearance();
    try {
      const value: unknown = JSON.parse(localStorage.getItem(appearanceKey) ?? 'null');
      if (isAppearanceSettings(value) && supportedAppearance(value)) saved = value;
      else {
        const old = localStorage.getItem('parsiword-display-theme-v1');
        if (old === 'light' || old === 'dark') saved.mode = old;
      }
    } catch { /* A blocked storage area still allows session themes. */ }
  }
  return preview?.settings ?? saved;
}
export function savedAppearance(): AppearanceSettings { appearanceSnapshot(); return saved!; }
export const subscribeAppearance = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useAppearance() {
  useSyncExternalStore(subscribeAppearance, () => revision);
  return appearanceSnapshot();
}
export function previewPalette() { return preview?.palette; }
export function previewAppearance(settings: AppearanceSettings, palette: PaletteMode) { preview = { settings, palette }; notify(); }
export function cancelAppearance() { preview = undefined; notify(); }
export function receiveAppearance(settings: AppearanceSettings) {
  if (!isAppearanceSettings(settings) || !supportedAppearance(settings)) return;
  saved = settings; notify();
}
export function saveAppearance(settings: AppearanceSettings) {
  if (!isAppearanceSettings(settings) || !supportedAppearance(settings)) return false;
  saved = settings; preview = undefined;
  try { localStorage.setItem(appearanceKey, JSON.stringify(settings)); localStorage.setItem('parsiword-display-theme-v1', settings.mode); } catch { /* Session state remains usable. */ }
  editorHost().appearanceChanged?.(settings);
  notify(); return true;
}
export function supportedColor(value: string) {
  // Assignment is restricted to color properties. No CSS text is evaluated.
  return isColorValue(value) && CSS.supports('color', value) && !/^(inherit|initial|unset|revert(?:-layer)?)$/i.test(value.trim());
}
export function supportedAppearance(settings: AppearanceSettings) {
  return settings.themes.every(theme => [theme.light, theme.dark].every(colors => Object.values(colors).every(supportedColor)));
}
const hostFallback: Partial<Record<ColorRole, string>> = {
  'source-background': 'card', 'preview-background': 'card', 'source-foreground': 'foreground',
  'markdown-strong': 'source-syntax-emphasis', 'markdown-emphasis': 'source-syntax-emphasis',
  'markdown-marker': 'muted-foreground', 'markdown-quote': 'muted-foreground', 'markdown-math': 'source-syntax-emphasis', 'markdown-table': 'source-syntax-heading',
};
export function captureAppearance(settings: AppearanceSettings, mode: PaletteMode): Palette {
  const style = getComputedStyle(document.body);
  const fallback = paletteFor(settings, mode);
  return Object.fromEntries(colorRoles.map(role => {
    const value = style.getPropertyValue(`--${role}`).trim() || style.getPropertyValue(`--${hostFallback[role] ?? role}`).trim();
    return [role, supportedColor(value) ? value : fallback[role]];
  })) as Palette;
}
const extraTokens = ['card-foreground', 'popover-foreground', 'secondary-foreground', 'accent-foreground', 'muted', 'input', 'document-caret', 'source-syntax-emphasis', 'green', 'illustration-paper', 'illustration-ink', 'illustration-gold'];
export function applyAppearance(settings: AppearanceSettings, mode: PaletteMode, hostControlled: boolean) {
  const body = document.body;
  if (hostControlled) {
    for (const role of [...colorRoles, ...extraTokens]) body.style.removeProperty(`--${role}`);
    delete body.dataset.independentTheme;
    return;
  }
  body.dataset.independentTheme = 'true';
  const palette = paletteFor(settings, mode);
  for (const [role, color] of Object.entries(palette)) body.style.setProperty(`--${role}`, color);
  const aliases: Record<string, string> = {
    'card-foreground': 'foreground', 'popover-foreground': 'foreground', 'secondary-foreground': 'foreground', 'accent-foreground': 'foreground',
    muted: 'popover', input: 'border', 'document-caret': 'source-foreground', 'source-syntax-emphasis': 'markdown-emphasis',
    green: 'primary', 'illustration-paper': 'secondary', 'illustration-ink': 'primary', 'illustration-gold': 'primary',
  };
  for (const [target, source] of Object.entries(aliases)) body.style.setProperty(`--${target}`, `var(--${source})`);
}
