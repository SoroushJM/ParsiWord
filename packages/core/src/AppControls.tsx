import { languagePath, useLocale } from './locale';
import { memo } from 'react';
import { ArrowDownToLine, Bold, BookOpen, Check, ChevronDown, Code2, FileCode2, FilePlus2, Files, FileText, FileType2, FolderOpen, Heading2, Italic, Languages, List, Monitor, Moon, Settings2, Shapes, Sun, Undo2 } from 'lucide-react';
import { tikzSampleInsertion } from './tikz-language';
import { isThemePreference, type DisplayThemeControls } from './display-theme';
import type { ExportSettings } from './document-model';
import { FontPicker } from './FontPicker';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

type Sheet = 'settings' | 'fonts' | null;
type UpdateSettings = <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) => void;

export const BrandHeader = memo(function BrandHeader({ theme }: { theme: DisplayThemeControls }) {
  const { t, dir, locale, setLocale } = useLocale();
  const nextLanguage = locale === 'fa' ? 'en' : 'fa';
  return (<header className="app-header">
        <a className="brand" href="#" onClick={e => e.preventDefault()} aria-label={t("پارسی‌ورد")}>
          <span className="brand-mark"><FileText size="1.4375rem" strokeWidth={1.8} /><span /></span>
          <span className="brand-name">{t("پارسی‌ورد")}<span>PARSIWORD</span></span>
        </a>
        <div className="header-controls">
        {!theme.isHostControlled && <ToggleGroup type="single" variant="outline" spacing={1} dir={dir} value={theme.preference}
          onValueChange={value => { if (isThemePreference(value)) theme.setPreference(value); }}
          aria-label={t('ظاهر برنامه')} className="theme-choices">
          <ToggleGroupItem value="light" className="theme-choice"><Sun aria-hidden="true" data-icon="inline-start" />{t('روشن')}</ToggleGroupItem>
          <ToggleGroupItem value="dark" className="theme-choice"><Moon aria-hidden="true" data-icon="inline-start" />{t('تیره')}</ToggleGroupItem>
          <ToggleGroupItem value="system" className="theme-choice" aria-label={t('همگام با سیستم')} title={t('همگام با سیستم')}><Monitor aria-hidden="true" data-icon="inline-start" />{t('سیستم')}</ToggleGroupItem>
        </ToggleGroup>}
        <nav className="language-switch" aria-label={t('زبان رابط')}>
          <Button asChild variant="outline">
            <a href={languagePath(nextLanguage)} hrefLang={nextLanguage} lang={nextLanguage} dir={nextLanguage === 'fa' ? 'rtl' : 'ltr'}
              onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); setLocale(nextLanguage); } }}>
              <Languages data-icon="inline-start" />{nextLanguage === 'fa' ? 'فارسی' : 'English'}
            </a>
          </Button>
        </nav>
        </div>
      </header>);
});

export const IntroControls = memo(function IntroControls({ direction, onDirectionChange }: { direction: ExportSettings['direction']; onDirectionChange: (direction: ExportSettings['direction']) => void }) {
  const { t, dir } = useLocale();
  const dirLabel = { rtl: t("راست‌به‌چپ"), auto: t("جهت خودکار"), ltr: t("چپ‌به‌راست") }[direction];
  return (<section className="intro">
        <div className="intro-copy">
          <h1><span>{t('Markdown راست‌به‌چپ را')}</span>{' '}<span>{t('ببین و ویرایش کن.')}</span></h1>
          <div className="intro-controls">
            <ToggleGroup type="single" variant="outline" dir={dir} value={direction} onValueChange={value => { if (value) onDirectionChange(value as ExportSettings['direction']); }} aria-label={t("جهت متن")} title={dirLabel} className="w-full max-w-sm gap-1">
              <ToggleGroupItem value="rtl" className="h-10 min-w-0 flex-1 px-2">{t("راست‌به‌چپ")}</ToggleGroupItem><ToggleGroupItem value="auto" className="h-10 min-w-0 flex-1 px-2">{t("جهت خودکار")}</ToggleGroupItem><ToggleGroupItem value="ltr" className="h-10 min-w-0 flex-1 px-2">{t("چپ‌به‌راست")}</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p className="intro-description">{t('پیش‌نمایش قابل ویرایش برای متن فارسی، عربی و ترکیبی؛ با خروجی Word و PDF.')}</p>
        </div>
        <div className="intro-art" aria-hidden="true">
          <div className="intro-decoration">
            <FileText size="6.5rem" strokeWidth={1} />
            <span className="decoration-check"><Check size="1.5rem" strokeWidth={2.5} /></span>
            <span className="decoration-brackets">( )</span>
          </div>
          <span className="decoration-spark" />
        </div>
        </section>);
});

export const DocumentHeading = memo(function DocumentHeading({ instanceId, hostControlled = false, compact = false, direction, title, busy, canExport, onDirectionChange, onTitleChange, onOpen, onNew, onSettings, onExport, onExportPdf, onExportMarkdown }: { instanceId?: string; hostControlled?: boolean; compact?: boolean; direction: ExportSettings['direction']; title: string; busy: boolean; canExport: boolean; onDirectionChange: (direction: ExportSettings['direction']) => void; onTitleChange: (title: string) => void; onOpen: () => void; onNew: () => void; onSettings: () => void; onExport: () => void; onExportPdf: () => void; onExportMarkdown: () => void }) {
  const titleId = instanceId ? `document-title-${instanceId}` : 'document-title';
  const { t, dir } = useLocale();
  return (<div className={hostControlled ? 'document-host-controls flex items-center gap-1' : 'document-heading'}>
              {compact && <ToggleGroup type="single" variant="outline" size="sm" spacing={0} dir="ltr" value={direction}
                onValueChange={value => { if (value === 'rtl' || value === 'ltr' || value === 'auto') onDirectionChange(value); }}
                aria-label={t('جهت متن')} className="comparison-direction-controls">
                <ToggleGroupItem value="rtl" aria-label={t('راست‌به‌چپ')} title={t('راست‌به‌چپ')}>RTL</ToggleGroupItem>
                <ToggleGroupItem value="ltr" aria-label={t('چپ‌به‌راست')} title={t('چپ‌به‌راست')}>LTR</ToggleGroupItem>
                <ToggleGroupItem value="auto" aria-label={t('جهت خودکار')} title={t('جهت خودکار')}>Auto</ToggleGroupItem>
              </ToggleGroup>}
              {!hostControlled && <><div className="document-name"><span className="file-icon"><FileText size="1.1875rem" /></span><FieldGroup className="gap-1"><Field className="gap-1"><FieldLabel htmlFor={titleId} className="sr-only">{t("نام سند")}</FieldLabel><Input id={titleId} value={title} onChange={e => onTitleChange(e.target.value)} maxLength={90} placeholder={t("نام سند")} /><span className="text-muted-foreground text-xs">{t("پیش‌نویس شخصی")}</span></Field></FieldGroup></div>
              <div className="document-tools">
                <div className="document-actions"><Button variant="ghost" size="icon-lg" className="document-icon-control" title={t("باز کردن فایل")} aria-label={t("باز کردن فایل")} onClick={onOpen}><FolderOpen data-icon="inline-start" /></Button></div>
                <Button variant="ghost" size="icon-lg" className="document-icon-control" title={t("یادداشت تازه")} aria-label={t("یادداشت تازه")} onClick={onNew}><FilePlus2 data-icon="inline-start" /></Button>
              </div></>}
              <div className={hostControlled ? 'flex items-center gap-1' : 'document-export'}>
                <Button variant="outline" size={compact ? 'icon-xs' : 'icon'} className={cn(!compact && 'document-icon-control')} aria-label={t("تنظیمات خروجی")} title={t("تنظیمات خروجی")} onClick={onSettings}><Settings2 data-icon="inline-start" /></Button>
                <Button variant={compact ? 'outline' : 'default'} size={compact ? 'xs' : 'lg'} className={cn('document-export-button min-w-0', !hostControlled && 'flex-1')} aria-label={compact ? t('ذخیرهٔ فایل Word') : undefined} title={compact ? t('ذخیرهٔ فایل Word') : undefined} onClick={onExport} disabled={busy || !canExport}>{busy ? <Spinner aria-label={t("در حال ساخت سند")} data-icon="inline-start" /> : !compact && <ArrowDownToLine data-icon="inline-start" />}<span>{compact ? 'Word' : busy ? t("در حال ساخت سند…") : t("ذخیرهٔ فایل Word")}</span></Button>
                {compact && <Button variant="outline" size="xs" aria-label={t('ذخیرهٔ فایل PDF')} title={t('ذخیرهٔ فایل PDF')} onClick={onExportPdf} disabled={busy || !canExport}>PDF</Button>}
                <DropdownMenu dir={dir}>
                  <DropdownMenuTrigger asChild><Button variant="outline" size={compact ? 'icon-xs' : 'icon'} className={cn(!compact && 'document-icon-control')} aria-label={t("قالب‌های دیگر خروجی")} title={t("قالب‌های دیگر خروجی")} disabled={busy}><Files data-icon="inline-start" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={0} className="min-w-48">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>{t("ذخیره در قالب")}</DropdownMenuLabel>
                      {!compact && <DropdownMenuItem className="export-menu-item" onSelect={onExportPdf} disabled={busy || !canExport}><FileType2 aria-hidden="true" />{t("ذخیرهٔ فایل PDF")}</DropdownMenuItem>}
                      <DropdownMenuItem className="export-menu-item" onSelect={onExportMarkdown} disabled={busy}><FileCode2 aria-hidden="true" />{t("ذخیرهٔ فایل Markdown")}</DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>);
});

export const MobileViewSwitch = memo(function MobileViewSwitch({ view, onSelect }: { view: 'edit' | 'preview'; onSelect: (view: 'edit' | 'preview') => void }) {
  const { t, dir } = useLocale();
  return (<ToggleGroup type="single" variant="outline" dir={dir} value={view} onValueChange={value => { if (value === 'edit' || value === 'preview') onSelect(value); }} className="mobile-view-switch w-full rounded-none" aria-label={t("نمای سند")}>
              <ToggleGroupItem value="edit" data-mobile-view="edit" aria-controls="edit-panel" className="h-[2.75rem] min-w-0 flex-1"><Code2 data-icon="inline-start" /> {t("ویرایش متن")}</ToggleGroupItem>
              <ToggleGroupItem value="preview" data-mobile-view="preview" aria-controls="preview-pane" className="h-[2.75rem] min-w-0 flex-1"><BookOpen data-icon="inline-start" /> {t("پیش‌نمایش")}</ToggleGroupItem>
            </ToggleGroup>);
});

export const SourceToolbar = memo(function SourceToolbar({ canRestore, onWrap, onRestore, readOnly = false }: { canRestore: boolean; onWrap: (before: string, after?: string) => void; onRestore: () => void; readOnly?: boolean }) {
  const { t } = useLocale();
  return (<fieldset disabled={readOnly} className="format-toolbar overflow-x-auto" role="toolbar" aria-label={t("ابزار قالب‌بندی")}>
                <Button variant="ghost" size="icon" title={t("تیتر")} aria-label={t("درج تیتر")} onClick={() => onWrap('## ')}><Heading2 data-icon="inline-start" /></Button>
                <Button variant="ghost" size="icon" title={t("پررنگ")} aria-label={t("درج متن پررنگ")} onClick={() => onWrap('**', '**')}><Bold data-icon="inline-start" /></Button>
                <Button variant="ghost" size="icon" title={t("مورب")} aria-label={t("درج متن مورب")} onClick={() => onWrap('*', '*')}><Italic data-icon="inline-start" /></Button>
                <Separator orientation="vertical" className="mx-2 h-4" />
                <Button variant="ghost" size="icon" title={t("فهرست")} aria-label={t("درج فهرست")} onClick={() => onWrap('- ')}><List data-icon="inline-start" /></Button>
                <Button variant="ghost" size="icon" title={t("کد")} aria-label={t("درج کد")} onClick={() => onWrap('`', '`')}><Code2 data-icon="inline-start" /></Button>
                <Button variant="ghost" size="icon" title={t('درج شکل TikZ')} aria-label={t('درج شکل TikZ')} onClick={() => onWrap(tikzSampleInsertion, '')}><Shapes data-icon="inline-start" /></Button>
                {canRestore && <Button variant="ghost" size="sm" className="ms-auto" onClick={onRestore}><Undo2 data-icon="inline-start" /> {t("متن قبلی")}</Button>}
              </fieldset>);
});

export const ExportSettingsDialog = memo(function ExportSettingsDialog({ settings, sheet, onSheetChange, onUpdate }: { settings: ExportSettings; sheet: Sheet; onSheetChange: (sheet: Sheet) => void; onUpdate: UpdateSettings }) {
  const { t, dir, number } = useLocale();
  return (<Dialog open={sheet !== null} onOpenChange={open => { if (!open) onSheetChange(null); }}>
        <DialogContent dir={dir} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{sheet === 'fonts' ? t("انتخاب فونت") : t("تنظیمات خروجی")}</DialogTitle>
            <DialogDescription>{sheet === 'fonts' ? t("فونت‌های Google Fonts، با دانلود و نگهداری روی دستگاه") : t("جهت متن، اندازه و فونت سند را انتخاب کن. این تنظیمات برای Word و PDF مشترک‌اند.")}</DialogDescription>
          </DialogHeader>
          {sheet === 'settings' ? <FieldGroup>
            <Field><FieldLabel htmlFor="export-title">{t("نام فایل")}</FieldLabel><Input id="export-title" value={settings.title} onChange={e => onUpdate('title', e.target.value)} maxLength={90} /></Field>
            <Field>
              <FieldLabel>{t("جهت متن در خروجی")}</FieldLabel>
              <ToggleGroup type="single" variant="outline" value={settings.direction} onValueChange={value => { if (value) onUpdate('direction', value as ExportSettings['direction']); }} dir={dir} aria-label={t("جهت متن در خروجی")} className="w-full">
                <ToggleGroupItem value="rtl" className="flex-1">{t("راست‌به‌چپ")}</ToggleGroupItem><ToggleGroupItem value="auto" className="flex-1">{t("خودکار")}</ToggleGroupItem><ToggleGroupItem value="ltr" className="flex-1">{t("چپ‌به‌راست")}</ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>{t("«خودکار» جهت هر پاراگراف را جدا تشخیص می‌دهد؛ پاراگراف انگلیسی چپ‌به‌راست می‌ماند.")}</FieldDescription>
            </Field>
            <Field><FieldLabel>{t("فونت خروجی")}</FieldLabel><Button variant="outline" className="w-full justify-between" onClick={() => onSheetChange('fonts')} aria-label={t("انتخاب فونت خروجی")}><span dir="ltr">{settings.fontFamily}</span><ChevronDown data-icon="inline-end" /></Button><FieldDescription>{t("فونت داخل فایل‌های Word و PDF جاسازی می‌شود و همراه سند منتقل می‌شود.")}</FieldDescription></Field>
            <Field><FieldLabel id="font-size-label">{t("اندازهٔ متن")}</FieldLabel><ToggleGroup type="single" variant="outline" dir={dir} value={String(settings.fontSize)} onValueChange={value => { if (value) onUpdate('fontSize', Number(value)); }} aria-labelledby="font-size-label" className="grid w-full grid-cols-3">{[10, 11, 12, 14, 16, 18].map(n => <ToggleGroupItem key={n} value={String(n)} className="h-10">{number(n)} pt</ToggleGroupItem>)}</ToggleGroup></Field>
            <p className="text-muted-foreground text-xs leading-6">{t("کاغذ در Word و PDF اندازهٔ A4 دارد. فرمول LaTeX در Word قابل ویرایش است؛ نمودار Mermaid و تصاویر Markdown داخل فایل جاسازی می‌شوند.")}</p>
            <Button onClick={() => onSheetChange(null)}>{t("آماده است")}<Check data-icon="inline-end" /></Button>
          </FieldGroup> : <><FontPicker value={settings.fontFamily} onSelect={family => { onUpdate('fontFamily', family); onSheetChange('settings'); }} /><Button variant="outline" onClick={() => onSheetChange('settings')}>{t("بازگشت به تنظیمات")}</Button></>}

        </DialogContent>
      </Dialog>);
});
