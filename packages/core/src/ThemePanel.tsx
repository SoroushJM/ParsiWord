import { useEffect, useId, useRef, useState } from 'react';
import { Download, Palette as PaletteIcon, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useLocale } from './locale';
import { editorHost } from './host';
import { colorGroups, exportAppearance, importAppearance, paletteFor, presetIds, presetNames, presets, selectedProfile, type AppearanceSettings, type ColorRole, type PaletteMode, type ThemeProfile } from './appearance';
import { cancelAppearance, captureAppearance, previewAppearance, saveAppearance, savedAppearance, supportedAppearance, supportedColor } from './appearance-store';

function hexSwatch(value: string) {
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) return '#000000';
  context.fillStyle = value; context.fillRect(0, 0, 1, 1);
  return '#' + Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(n => n.toString(16).padStart(2, '0')).join('');
}

export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const { t, dir } = useLocale();
  const [open, setOpen] = useState(false);
  return <><Button variant="outline" size={compact ? 'xs' : 'default'} className="theme-open-button" aria-label={t('تم')} title={t('تم')} onClick={() => setOpen(true)}><PaletteIcon data-icon="inline-start" />{t('تم')}</Button>
    {open && <ThemePanel dir={dir} onClose={() => setOpen(false)} />}</>;
}

function ThemePanel({ dir, onClose }: { dir: 'rtl' | 'ltr'; onClose: () => void }) {
  const { t } = useLocale();
  const id = useId();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelAppearance(); }; }, []);
  const [draft, setDraft] = useState<AppearanceSettings>(() => structuredClone(savedAppearance()));
  const [palette, setPalette] = useState<PaletteMode>(() => document.documentElement.dataset.displayTheme === 'dark' ? 'dark' : 'light');
  const [raw, setRaw] = useState<Partial<Record<ColorRole, string>>>({});
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const host = editorHost().kind === 'vscode';
  const following = host && draft.followHost;
  const colors = following ? captureAppearance(draft, palette) : paletteFor(draft, palette);
  const profile = selectedProfile(draft);
  const invalidName = draft.themes.some(theme => !theme.name.trim());
  const invalid = invalidName || Object.values(raw).some(value => !supportedColor(value));
  const update = (next: AppearanceSettings, nextPalette = palette) => {
    setDraft(next); previewAppearance(next, nextPalette); setMessage('');
  };
  const clearInputs = () => { setRaw({}); setMessage(''); };
  const close = () => { cancelAppearance(); onClose(); };
  const mutableProfile = (settings: AppearanceSettings): ThemeProfile => {
    const current = selectedProfile(settings);
    if (settings.themes.some(theme => theme.id === current.id)) return structuredClone(current);
    return { ...current, id: `custom-${crypto.randomUUID()}`, name: `${t(presetNames[current.base])} · ${t('شخصی')}`, light: {}, dark: {} };
  };
  const replaceProfile = (settings: AppearanceSettings, next: ThemeProfile): AppearanceSettings => ({
    ...settings, selected: next.id, followHost: false,
    themes: [...settings.themes.filter(theme => theme.id !== next.id), next],
  });
  const colorChange = (role: ColorRole, value: string) => {
    setRaw(previous => ({ ...previous, [role]: value }));
    if (!supportedColor(value)) return;
    if (draft.themes.length >= 32 && !draft.themes.some(theme => theme.id === draft.selected)) { setMessage(t('حداکثر ۳۲ تم شخصی می‌توان ذخیره کرد.')); return; }
    const next = mutableProfile(draft);
    if (following) { next[palette] = captureAppearance(draft, palette); next.name = t('ظاهر فعلی VS Code'); }
    next[palette][role] = value;
    update(replaceProfile(draft, next));
  };
  const selectPalette = (value: string) => {
    if (value !== 'light' && value !== 'dark') return;
    setPalette(value); clearInputs(); previewAppearance(draft, value);
  };
  const saveNamed = () => {
    if (!name.trim() || draft.themes.length >= 32) return;
    const next = { ...structuredClone(profile), id: `custom-${crypto.randomUUID()}`, name: name.trim() };
    if (following) next[palette] = captureAppearance(draft, palette);
    update(replaceProfile(draft, next)); setName('');
  };
  const importFile = async (input: File | undefined) => {
    if (!input) return;
    try {
      if (input.size > 1_000_000) throw new Error('size');
      const imported = importAppearance(await input.text());
      if (!mounted.current) return;
      if (!supportedAppearance(imported)) throw new Error('color');
      // Merge named themes without overwriting local ones, including an imported
      // file from another device which happens to use the same IDs.
      if (draft.themes.length + imported.themes.length > 32) throw new Error('count');
      const renamed = new Map(imported.themes.map(theme => [theme.id, `custom-${crypto.randomUUID()}`]));
      const themes = imported.themes.map(theme => ({ ...theme, id: renamed.get(theme.id)! }));
      clearInputs(); update({ ...imported, followHost: false, selected: renamed.get(imported.selected) ?? imported.selected, themes: [...draft.themes, ...themes] });
      setMessage(t('تم‌ها وارد شدند؛ برای نگهداری تغییرات، ذخیره کن.'));
    } catch { if (mounted.current) setMessage(t('فایل تم معتبر نیست، رنگی پشتیبانی نمی‌شود یا تعداد تم‌ها بیش از حد مجاز است.')); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportAppearance(draft)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'parsiword-themes.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const renderColors = (group: 'environment' | 'markdown' | 'syntax') => <FieldGroup className="theme-color-fields">{Object.entries(colorGroups[group]).map(([key, label]) => {
    const role = key as ColorRole;
    const value = raw[role] ?? colors[role];
    const valid = supportedColor(value);
    return <Field key={role} className="theme-color-field" data-invalid={!valid || undefined}>
      <FieldLabel htmlFor={`${id}-${role}`}>{t(label)}</FieldLabel>
      <div className="theme-color-inputs">
        <input type="color" className="theme-color-picker" aria-label={`${t('انتخاب رنگ')}: ${t(label)}`} value={hexSwatch(colors[role])} onChange={event => colorChange(role, event.target.value)} />
        <Input id={`${id}-${role}`} data-color-role={role} dir="ltr" value={value} spellCheck={false} autoComplete="off" maxLength={1024}
          aria-invalid={!valid} aria-describedby={!valid ? `${id}-${role}-error` : undefined} onChange={event => colorChange(role, event.target.value)} />
      </div>
      {!valid && <p id={`${id}-${role}-error`} className="text-destructive text-xs" role="alert">{t('یک رنگ CSS معتبر وارد کن.')}</p>}
    </Field>;
  })}</FieldGroup>;
  return <Dialog open onOpenChange={isOpen => { if (!isOpen) close(); }}>
    <DialogContent dir={dir} className="theme-panel" overlayClassName="theme-panel-overlay" sidePanel showCloseButton>
      <DialogHeader className="theme-panel-header">
        <DialogTitle>{t('تم و رنگ‌ها')}</DialogTitle>
        <DialogDescription>{t('رنگ‌های محیط، Markdown و کد را جدا تنظیم کن. تغییرات را روی سند فعلی می‌بینی.')}</DialogDescription>
      </DialogHeader>
      <div className="theme-panel-mode">
        {host && <Field><FieldLabel>{t('ظاهر افزونه')}</FieldLabel><ToggleGroup type="single" variant="outline" dir={dir} value={following ? 'host' : 'independent'} aria-label={t('ظاهر افزونه')} onValueChange={value => { if (value) { clearInputs(); update({ ...draft, followHost: value === 'host' }); } }}>
          <ToggleGroupItem value="host">{t('پیروی از VS Code')}</ToggleGroupItem><ToggleGroupItem value="independent">{t('تم مستقل ParsiWord')}</ToggleGroupItem>
        </ToggleGroup></Field>}
        <Field><FieldLabel>{t('حالت نمایش')}</FieldLabel><ToggleGroup type="single" variant="outline" dir={dir} value={draft.mode} disabled={following} aria-label={t('حالت نمایش')} onValueChange={value => { if (value === 'light' || value === 'dark' || value === 'system') update({ ...draft, mode: value }); }}>
          <ToggleGroupItem value="light">{t('روشن')}</ToggleGroupItem><ToggleGroupItem value="dark">{t('تیره')}</ToggleGroupItem><ToggleGroupItem value="system">{t('سیستم')}</ToggleGroupItem>
        </ToggleGroup></Field>
        <Field><FieldLabel>{t('ویرایش پالت')}</FieldLabel><ToggleGroup type="single" variant="outline" dir={dir} value={palette} aria-label={t('ویرایش پالت')} onValueChange={selectPalette}>
          <ToggleGroupItem value="light">{t('پالت روشن')}</ToggleGroupItem><ToggleGroupItem value="dark">{t('پالت تیره')}</ToggleGroupItem>
        </ToggleGroup><FieldDescription>{following ? t('اولین ویرایش رنگ، ظاهر فعلی VS Code را به یک تم مستقل تبدیل می‌کند.') : t('پالت انتخاب‌شده زنده نمایش داده می‌شود؛ پس از ذخیره، حالت نمایش اعمال می‌شود.')}</FieldDescription></Field>
      </div>
      <Tabs defaultValue="presets" dir={dir} className="theme-tabs">
        <TabsList className="theme-tab-list" aria-label={t('بخش‌های تم')}>
          <TabsTrigger value="presets">{t('تم‌های آماده')}</TabsTrigger><TabsTrigger value="environment">{t('محیط و پس‌زمینه')}</TabsTrigger><TabsTrigger value="markdown">Markdown</TabsTrigger><TabsTrigger value="syntax">{t('سینتکس کد')}</TabsTrigger>
        </TabsList>
        <div className="theme-panel-scroll">
          <TabsContent value="presets">
            <ToggleGroup type="single" variant="outline" dir={dir} value={draft.selected} onValueChange={value => { if (value) { clearInputs(); update({ ...draft, selected: value, followHost: false }); } }} aria-label={t('خانوادهٔ تم')} className="theme-presets">
              {presetIds.map(preset => <ToggleGroupItem value={preset} key={preset} className="theme-preset">
                <span className="theme-preset-colors" aria-hidden="true">{['background', 'source-background', 'primary', 'syntax-keyword', 'syntax-string'].map(role => <span key={role} style={{ backgroundColor: presets[preset][palette][role as ColorRole] }} />)}</span><span>{t(presetNames[preset])}</span>
              </ToggleGroupItem>)}
            </ToggleGroup>
            <div className="theme-sample" dir="ltr" aria-hidden="true" style={{ backgroundColor: colors['document-code-background'], color: colors['document-code-foreground'] }}>
              <span style={{ color: colors['source-syntax-heading'] }}>## ParsiWord · پارسی‌ورد</span><br /><span style={{ color: colors['syntax-keyword'] }}>const</span>{' theme = '}<span style={{ color: colors['syntax-string'] }}>"رنگ‌های من"</span>{';'}<br /><span style={{ color: colors['syntax-comment'] }}>{'// Markdown + code'}</span>
            </div>
            <FieldGroup className="theme-saved-fields">
              <Field><FieldLabel htmlFor={`${id}-saved`}>{t('تم‌های من')}</FieldLabel>
                <Select dir={dir} value={draft.themes.some(theme => theme.id === draft.selected) ? draft.selected : ''} onValueChange={value => { clearInputs(); update({ ...draft, selected: value, followHost: false }); }}>
                  <SelectTrigger id={`${id}-saved`} className="w-full"><SelectValue placeholder={t('انتخاب تم ذخیره‌شده')} /></SelectTrigger>
                  <SelectContent><SelectGroup>{draft.themes.map(theme => <SelectItem key={theme.id} value={theme.id}>{theme.name}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                {draft.themes.some(theme => theme.id === draft.selected) && <div className="theme-profile-actions"><Input aria-label={t('نام تم')} maxLength={80} value={profile.name} onChange={event => { update(replaceProfile(draft, { ...profile, name: event.target.value })); }} /><Button size="icon" variant="outline" aria-label={t('حذف تم')} onClick={() => { clearInputs(); update({ ...draft, selected: profile.base, themes: draft.themes.filter(theme => theme.id !== profile.id) }); }}><Trash2 data-icon="inline-start" /></Button></div>}
              </Field>
              <Field><FieldLabel htmlFor={`${id}-name`}>{t('ذخیرهٔ یک نسخهٔ نام‌دار')}</FieldLabel><div className="theme-profile-actions"><Input id={`${id}-name`} value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder={t('نام تم تازه')} /><Button variant="outline" size="icon" aria-label={t('ساخت تم نام‌دار')} disabled={!name.trim() || draft.themes.length >= 32 || invalid} onClick={saveNamed}><Plus data-icon="inline-start" /></Button></div></Field>
            </FieldGroup>
            <div className="theme-file-actions"><Button variant="outline" onClick={() => file.current?.click()}><Upload data-icon="inline-start" />{t('ورود تم')}</Button><Button variant="outline" disabled={invalid} onClick={download}><Download data-icon="inline-start" />{t('خروجی تم‌ها')}</Button><input ref={file} type="file" accept="application/json,.json" hidden aria-label={t('فایل تم')} onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }} /></div>
          </TabsContent>
          <TabsContent value="environment">{renderColors('environment')}</TabsContent>
          <TabsContent value="markdown">{renderColors('markdown')}</TabsContent>
          <TabsContent value="syntax">{renderColors('syntax')}</TabsContent>
        </div>
      </Tabs>
      <div className="theme-panel-footer">
        <p className="theme-panel-status" role="status">{message || (invalidName ? t('نام تم نمی‌تواند خالی باشد.') : invalid ? t('رنگ نامعتبر را اصلاح کن تا ذخیره فعال شود.') : following ? t('هماهنگ با VS Code') : `${t('تم مستقل')}: ${t(profile.name)}`)}</p>
        <div className="theme-footer-actions"><Button variant="ghost" onClick={() => { const next = { ...profile, [palette]: {} }; clearInputs(); update(draft.themes.some(theme => theme.id === profile.id) ? replaceProfile(draft, next) : draft); }}><RotateCcw data-icon="inline-start" />{t('بازگردانی پالت')}</Button><Button variant="outline" onClick={close}>{t('انصراف')}</Button><Button disabled={invalid} onClick={() => { if (saveAppearance(draft)) onClose(); }}>{t('ذخیره')}</Button></div>
        <p className="theme-panel-note">{t('فقط ظاهر این دستگاه تغییر می‌کند؛ خروجی Word و PDF رنگ‌های سند را حفظ می‌کنند.')}</p>
      </div>
    </DialogContent>
  </Dialog>;
}
