import { memo } from 'react';
import { ArrowDownToLine, Bold, BookOpen, Check, ChevronDown, Code2, FilePlus2, FileText, FolderOpen, Heading2, Italic, List, Settings2, Undo2 } from 'lucide-react';
import type { ExportSettings } from './converter';
import { FontPicker } from './FontPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type Sheet = 'settings' | 'fonts' | null;
type UpdateSettings = <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) => void;
const fa = (number: number) => number.toLocaleString('fa-IR');

export const BrandHeader = memo(function BrandHeader() {
  return (<header className="app-header">
        <a className="brand" href="#" onClick={e => e.preventDefault()} aria-label="پارسی‌ورد">
          <span className="brand-mark"><FileText size={23} strokeWidth={1.8} /><span /></span>
          <span className="brand-name">پارسی‌ورد<span>PARSIWORD</span></span>
        </a>
      </header>);
});

export const IntroControls = memo(function IntroControls({ direction, onDirectionChange }: { direction: ExportSettings['direction']; onDirectionChange: (direction: ExportSettings['direction']) => void }) {
  const dirLabel = { rtl: 'راست‌به‌چپ', auto: 'جهت خودکار', ltr: 'چپ‌به‌راست' }[direction];
  return (<section className="intro">
          <h1>متن ساده بنویس.<br /><span>مرتب تحویل بگیر.</span></h1>
          <div className="intro-controls">
            <ToggleGroup type="single" variant="outline" dir="rtl" value={direction} onValueChange={value => { if (value) onDirectionChange(value as ExportSettings['direction']); }} aria-label="جهت متن" title={dirLabel} className="w-full max-w-sm gap-1">
              <ToggleGroupItem value="rtl" className="h-10 min-w-0 flex-1 px-2">راست‌به‌چپ</ToggleGroupItem><ToggleGroupItem value="auto" className="h-10 min-w-0 flex-1 px-2">جهت خودکار</ToggleGroupItem><ToggleGroupItem value="ltr" className="h-10 min-w-0 flex-1 px-2">چپ‌به‌راست</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p>Markdown تو، در یک فایل Word.<br className="mobile-break" /> با توجه به فارسی و جهت نوشتن.</p>
        </section>);
});

export const DocumentHeading = memo(function DocumentHeading({ title, busy, canExport, onTitleChange, onOpen, onNew, onSettings, onExport }: { title: string; busy: boolean; canExport: boolean; onTitleChange: (title: string) => void; onOpen: () => void; onNew: () => void; onSettings: () => void; onExport: () => void }) {
  return (<div className="document-heading">
              <div className="document-name"><span className="file-icon"><FileText size={19} /></span><FieldGroup className="gap-1"><Field className="gap-1"><FieldLabel htmlFor="document-title" className="sr-only">نام سند</FieldLabel><Input id="document-title" value={title} onChange={e => onTitleChange(e.target.value)} maxLength={90} placeholder="نام سند" /><span className="text-muted-foreground text-xs">پیش‌نویس شخصی</span></Field></FieldGroup></div>
              <div className="document-tools">
                <div className="document-actions"><Button variant="ghost" size="sm" onClick={onOpen}><FolderOpen data-icon="inline-start" /> باز کردن فایل</Button></div>
                <Button variant="ghost" size="icon-lg" title="یادداشت تازه" aria-label="یادداشت تازه" onClick={onNew}><FilePlus2 data-icon="inline-start" /></Button>
              </div>
              <div className="document-export">
                <Button variant="outline" size="icon" className="size-12" aria-label="تنظیمات خروجی" onClick={onSettings}><Settings2 data-icon="inline-start" /></Button>
                <Button size="lg" className="h-12 flex-1" onClick={onExport} disabled={busy || !canExport}>{busy ? <Spinner aria-label="در حال ساخت سند" data-icon="inline-start" /> : <ArrowDownToLine data-icon="inline-start" />}<span>{busy ? 'در حال ساخت سند…' : 'ذخیرهٔ فایل Word'}</span><span className="docx-label">.docx</span></Button>
              </div>
            </div>);
});

export const MobileViewSwitch = memo(function MobileViewSwitch({ view, onSelect }: { view: 'edit' | 'preview'; onSelect: (view: 'edit' | 'preview') => void }) {
  return (<ToggleGroup type="single" variant="outline" dir="rtl" value={view} onValueChange={value => { if (value === 'edit' || value === 'preview') onSelect(value); }} className="mobile-view-switch w-full" aria-label="نمای سند">
              <ToggleGroupItem value="edit" data-mobile-view="edit" aria-controls="edit-panel" className="h-[44px] min-w-0 flex-1"><Code2 data-icon="inline-start" /> ویرایش متن</ToggleGroupItem>
              <ToggleGroupItem value="preview" data-mobile-view="preview" aria-controls="preview-pane" className="h-[44px] min-w-0 flex-1"><BookOpen data-icon="inline-start" /> پیش‌نمایش</ToggleGroupItem>
            </ToggleGroup>);
});

export const SourceToolbar = memo(function SourceToolbar({ canRestore, onWrap, onRestore }: { canRestore: boolean; onWrap: (before: string, after?: string) => void; onRestore: () => void }) {
  return (<div className="format-toolbar" role="toolbar" aria-label="ابزار قالب‌بندی">
                <Button variant="ghost" size="icon" title="تیتر" aria-label="درج تیتر" onClick={() => onWrap('## ')}><Heading2 data-icon="inline-start" /></Button>
                <Button variant="ghost" size="icon" title="پررنگ" aria-label="درج متن پررنگ" onClick={() => onWrap('**', '**')}><Bold data-icon="inline-start" /></Button>
                <Button variant="ghost" size="icon" title="مورب" aria-label="درج متن مورب" onClick={() => onWrap('*', '*')}><Italic data-icon="inline-start" /></Button>
                <Separator orientation="vertical" className="mx-2 h-4" />
                <Button variant="ghost" size="icon" title="فهرست" aria-label="درج فهرست" onClick={() => onWrap('- ')}><List data-icon="inline-start" /></Button>
                <Button variant="ghost" size="icon" title="کد" aria-label="درج کد" onClick={() => onWrap('`', '`')}><Code2 data-icon="inline-start" /></Button>
                {canRestore && <Button variant="ghost" size="sm" className="ms-auto" onClick={onRestore}><Undo2 data-icon="inline-start" /> متن قبلی</Button>}
              </div>);
});

export const ExportSettingsDialog = memo(function ExportSettingsDialog({ settings, sheet, onSheetChange, onUpdate }: { settings: ExportSettings; sheet: Sheet; onSheetChange: (sheet: Sheet) => void; onUpdate: UpdateSettings }) {
  return (<Dialog open={sheet !== null} onOpenChange={open => { if (!open) onSheetChange(null); }}>
        <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{sheet === 'fonts' ? 'انتخاب فونت' : 'تنظیمات خروجی'}</DialogTitle>
            <DialogDescription>{sheet === 'fonts' ? 'فونت‌های Google Fonts، با دانلود و نگهداری روی دستگاه' : 'جهت متن، اندازه و فونت سند Word را انتخاب کن.'}</DialogDescription>
          </DialogHeader>
          {sheet === 'settings' ? <FieldGroup>
            <Field><FieldLabel htmlFor="export-title">نام فایل</FieldLabel><Input id="export-title" value={settings.title} onChange={e => onUpdate('title', e.target.value)} maxLength={90} /></Field>
            <Field>
              <FieldLabel>جهت متن در Word</FieldLabel>
              <ToggleGroup type="single" variant="outline" value={settings.direction} onValueChange={value => { if (value) onUpdate('direction', value as ExportSettings['direction']); }} dir="rtl" aria-label="جهت متن در Word" className="w-full">
                <ToggleGroupItem value="rtl" className="flex-1">راست‌به‌چپ</ToggleGroupItem><ToggleGroupItem value="auto" className="flex-1">خودکار</ToggleGroupItem><ToggleGroupItem value="ltr" className="flex-1">چپ‌به‌راست</ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>«خودکار» جهت هر پاراگراف را جدا تشخیص می‌دهد؛ پاراگراف انگلیسی چپ‌به‌راست می‌ماند.</FieldDescription>
            </Field>
            <Field><FieldLabel>فونت خروجی</FieldLabel><Button variant="outline" className="w-full justify-between" onClick={() => onSheetChange('fonts')} aria-label="انتخاب فونت خروجی"><span dir="ltr">{settings.fontFamily}</span><ChevronDown data-icon="inline-end" /></Button><FieldDescription>فونت داخل فایل Word جاسازی می‌شود و همراه سند منتقل می‌شود.</FieldDescription></Field>
            <Field><FieldLabel id="font-size-label">اندازهٔ متن</FieldLabel><ToggleGroup type="single" variant="outline" dir="rtl" value={String(settings.fontSize)} onValueChange={value => { if (value) onUpdate('fontSize', Number(value)); }} aria-labelledby="font-size-label" className="grid w-full grid-cols-3">{[10, 11, 12, 14, 16, 18].map(n => <ToggleGroupItem key={n} value={String(n)} className="h-10">{fa(n)} pt</ToggleGroupItem>)}</ToggleGroup></Field>
            <p className="text-muted-foreground text-xs leading-6">کاغذ A4 است. فرمول LaTeX در Word قابل ویرایش است؛ نمودار Mermaid به تصویر تبدیل می‌شود. تصاویر Markdown هنوز پشتیبانی نمی‌شوند.</p>
            <Button onClick={() => onSheetChange(null)}>آماده است <Check data-icon="inline-end" /></Button>
          </FieldGroup> : <><FontPicker value={settings.fontFamily} onSelect={family => { onUpdate('fontFamily', family); onSheetChange('settings'); }} /><Button variant="outline" onClick={() => onSheetChange('settings')}>بازگشت به تنظیمات</Button></>}

        </DialogContent>
      </Dialog>);
});
