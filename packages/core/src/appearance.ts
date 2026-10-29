/** Appearance is device state, never part of Markdown or export settings. */
export type PaletteMode = 'light' | 'dark';
export type AppearanceMode = PaletteMode | 'system';
export const appearanceKey = 'parsiword-appearance-v1';
export const presetIds = ['neutral', 'navy', 'paper', 'purple'] as const;
export type PresetId = typeof presetIds[number];
export const presetNames: Record<PresetId, string> = { neutral: 'خنثی', navy: 'سرمه‌ای', paper: 'کاغذی', purple: 'بنفش ملایم' };
export const colorGroups = {
  environment: {
    background: 'پس‌زمینهٔ برنامه', foreground: 'متن رابط', card: 'سطح کنترل‌ها', popover: 'پس‌زمینهٔ پنل‌ها',
    'source-background': 'پس‌زمینهٔ Markdown', 'source-foreground': 'متن Markdown', 'preview-background': 'پس‌زمینهٔ پیش‌نمایش',
    'document-foreground': 'متن پیش‌نمایش', 'document-code-background': 'پس‌زمینهٔ بلوک کد', 'document-code-header': 'سربرگ کد',
    'document-code-foreground': 'متن کد', primary: 'رنگ اصلی دکمه‌ها', 'primary-foreground': 'متن دکمهٔ اصلی',
    border: 'حاشیه‌ها', 'muted-foreground': 'متن کم‌رنگ', secondary: 'سطح فرعی', accent: 'سطح فعال', ring: 'نشانگر فوکوس',
  },
  markdown: {
    'document-heading': 'عنوان در پیش‌نمایش', 'source-syntax-heading': 'عنوان در Markdown', 'document-link': 'لینک',
    'markdown-strong': 'متن پررنگ', 'markdown-emphasis': 'متن مورب', 'markdown-marker': 'نشانه‌های Markdown',
    'markdown-quote': 'نقل‌قول', 'markdown-math': 'فرمول', 'source-syntax-code': 'کد در Markdown',
    'document-inline-code': 'کد درون متن', 'source-syntax-list': 'فهرست و HTML', 'markdown-table': 'جدول',
  },
  syntax: {
    'syntax-keyword': 'کلیدواژه', 'syntax-literal': 'عدد و مقدار ثابت', 'syntax-string': 'رشته', 'syntax-comment': 'توضیح کد',
    'syntax-title': 'نام تابع', 'syntax-name': 'نام و ویژگی', 'syntax-type': 'نوع داده', 'syntax-deletion': 'حذف در نمونهٔ کد',
  },
} as const;
export type ColorRole = keyof typeof colorGroups.environment | keyof typeof colorGroups.markdown | keyof typeof colorGroups.syntax;
export const colorRoles = Object.values(colorGroups).flatMap(group => Object.keys(group)) as ColorRole[];
export type ColorOverrides = Partial<Record<ColorRole, string>>;
export type Palette = Record<ColorRole, string>;
export type ThemeProfile = { id: string; name: string; base: PresetId; light: ColorOverrides; dark: ColorOverrides };
export type AppearanceSettings = { version: 1; selected: string; mode: AppearanceMode; followHost: boolean; themes: ThemeProfile[] };

const light: Palette = {
  background: '#f0f5f2', foreground: '#173e35', card: '#ffffff', popover: '#ffffff',
  'source-background': '#ffffff', 'source-foreground': '#173e35', 'preview-background': '#ffffff',
  'document-foreground': '#506458', 'document-heading': '#254a3b', 'document-link': '#137763',
  'document-inline-code': '#26745a', 'document-code-background': '#f1f4f5', 'document-code-header': '#e7edeb', 'document-code-foreground': '#24292f',
  primary: '#137763', 'primary-foreground': '#ffffff', secondary: '#e3eee7', accent: '#e3eee7', border: '#d5e2d9', 'muted-foreground': '#5d7468', ring: '#6b9f87',
  'source-syntax-heading': '#0550ae', 'source-syntax-code': '#953800', 'source-syntax-list': '#cf222e',
  'markdown-strong': '#8250df', 'markdown-emphasis': '#8250df', 'markdown-marker': '#5d7468', 'markdown-quote': '#5d7468', 'markdown-math': '#506458', 'markdown-table': '#0550ae',
  'syntax-keyword': '#cf222e', 'syntax-literal': '#0550ae', 'syntax-string': '#0a3069', 'syntax-comment': '#57606a', 'syntax-title': '#8250df', 'syntax-name': '#116329', 'syntax-type': '#953800', 'syntax-deletion': '#82071e',
};
const dark: Palette = {
  background: '#101b18', foreground: '#deebe4', card: '#17241f', popover: '#1d2d25',
  'source-background': '#17241f', 'source-foreground': '#deebe4', 'preview-background': '#17241f',
  'document-foreground': '#d5e4db', 'document-heading': '#e2f3e8', 'document-link': '#8fd6b5',
  'document-inline-code': '#8fd6b5', 'document-code-background': '#111d1a', 'document-code-header': '#24372e', 'document-code-foreground': '#e6edf3',
  primary: '#8fd6b5', 'primary-foreground': '#10241a', secondary: '#273d32', accent: '#304b3d', border: '#3a5145', 'muted-foreground': '#aec2b4', ring: '#94cbb0',
  'source-syntax-heading': '#8abbff', 'source-syntax-code': '#f3b887', 'source-syntax-list': '#ffacb3',
  'markdown-strong': '#d4b4ff', 'markdown-emphasis': '#d4b4ff', 'markdown-marker': '#aec2b4', 'markdown-quote': '#aec2b4', 'markdown-math': '#d5e4db', 'markdown-table': '#8abbff',
  'syntax-keyword': '#ffacb3', 'syntax-literal': '#8abbff', 'syntax-string': '#a7d6ff', 'syntax-comment': '#a2b3ac', 'syntax-title': '#d4b4ff', 'syntax-name': '#a4dfb0', 'syntax-type': '#f3b887', 'syntax-deletion': '#ffc1c8',
};
function family(mode: PaletteMode, bg: string, surface: string, ink: string, accent: string, muted: string, border: string, code: string): Palette {
  return { ...(mode === 'light' ? light : dark), background: bg, card: surface, popover: surface, foreground: ink,
    'source-background': surface, 'preview-background': surface, 'source-foreground': ink, 'document-foreground': ink, 'document-heading': ink, 'markdown-math': ink,
    primary: accent, 'primary-foreground': mode === 'light' ? '#ffffff' : bg, 'document-link': accent, 'document-inline-code': accent,
    secondary: code, accent: code, ring: accent, border, 'muted-foreground': muted, 'markdown-marker': muted, 'markdown-quote': muted,
    'document-code-background': code, 'document-code-header': bg };
}
export const presets: Record<PresetId, Record<PaletteMode, Palette>> = {
  neutral: { light, dark },
  navy: {
    light: family('light', '#eaf0f8', '#f8fbff', '#20344e', '#225da8', '#596d87', '#c7d4e6', '#e8eef7'),
    dark: family('dark', '#101b2d', '#17263d', '#dce9fb', '#7db8ff', '#a6b9d4', '#354b68', '#122035'),
  },
  paper: {
    light: family('light', '#efe7d8', '#fff9ee', '#4c3c2c', '#855b27', '#796a58', '#d8cbb8', '#f1e8d8'),
    dark: family('dark', '#24201a', '#302920', '#eee0ca', '#e8bf7e', '#c1af95', '#5a4d3c', '#272119'),
  },
  purple: {
    light: family('light', '#f0ecf7', '#fcfaff', '#40314e', '#7750a4', '#7b6a8d', '#d8cce6', '#eee7f5'),
    dark: family('dark', '#201b2c', '#2a2338', '#ece1fa', '#ceb5ff', '#b6a4ce', '#4f4164', '#231c30'),
  },
};
export function defaultAppearance(mode: AppearanceMode = 'system'): AppearanceSettings {
  return { version: 1, selected: 'neutral', mode, followHost: true, themes: [] };
}
export function selectedProfile(settings: AppearanceSettings): ThemeProfile {
  return settings.themes.find(theme => theme.id === settings.selected) ?? { id: settings.selected, name: presetNames[settings.selected as PresetId] ?? presetNames.neutral, base: presetIds.includes(settings.selected as PresetId) ? settings.selected as PresetId : 'neutral', light: {}, dark: {} };
}
export function paletteFor(settings: AppearanceSettings, mode: PaletteMode): Palette {
  const profile = selectedProfile(settings);
  return { ...presets[profile.base][mode], ...profile[mode] };
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
/** Bounds protect persisted/imported data; color syntax is validated by the browser. */
export function isColorValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 1024 && !/[;{}\u0000-\u001f]/.test(value);
}
export function isAppearanceSettings(value: unknown): value is AppearanceSettings {
  if (!record(value) || value.version !== 1 || !['light', 'dark', 'system'].includes(String(value.mode)) || typeof value.followHost !== 'boolean'
    || typeof value.selected !== 'string' || !Array.isArray(value.themes) || value.themes.length > 32) return false;
  const ids = new Set<string>(presetIds);
  for (const theme of value.themes) {
    if (!record(theme) || typeof theme.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(theme.id) || ids.has(theme.id)
      || typeof theme.name !== 'string' || !theme.name.trim() || theme.name.length > 80 || !presetIds.includes(theme.base as PresetId)) return false;
    ids.add(theme.id);
    for (const mode of ['light', 'dark']) {
      const colors = theme[mode];
      if (!record(colors) || Object.entries(colors).some(([role, color]) => !colorRoles.includes(role as ColorRole) || !isColorValue(color))) return false;
    }
  }
  return ids.has(value.selected);
}
export function exportAppearance(settings: AppearanceSettings): string {
  return JSON.stringify({ format: 'parsiword-themes', ...settings }, null, 2);
}
export function importAppearance(text: string): AppearanceSettings {
  if (text.length > 1_000_000) throw new Error('INVALID_THEME');
  const value: unknown = JSON.parse(text);
  if (!record(value) || value.format !== 'parsiword-themes' || !isAppearanceSettings(value)) throw new Error('INVALID_THEME');
  return value;
}
