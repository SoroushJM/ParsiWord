import { useEffect, useState } from 'react';
import { Check, Download, RefreshCw, Trash2, Type, CircleAlert } from 'lucide-react';
import { activateFont, bundledFont, cachedFonts, ensureFont, fontCatalogue, fontError, initialCatalogue, refreshCatalogue, removeFont, isBundledFont, type FontBundle } from './fonts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';

export function FontPicker({ value, onSelect }: { value: string; onSelect: (family: string) => void }) {
  const [fonts, setFonts] = useState(initialCatalogue);
  const [cache, setCache] = useState<FontBundle[]>([]);
  const [filter, setFilter] = useState('arabic');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(40);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([fontCatalogue(), cachedFonts()]).then(([list, stored]) => { if (active) { setFonts(list); setCache(stored); } }).catch(e => { if (active) setError(fontError(e)); });
    return () => { active = false; };
  }, []);
  const matches = fonts.filter(f => (filter !== 'arabic' || f.arabic) && (filter !== 'cached' || isBundledFont(f.family) || cache.some(c => c.family === f.family)) && (f.family.toLowerCase().includes(query.toLowerCase()) || (f.family === bundledFont && /وزیر|وزير/.test(query))));

  async function choose(family: string) {
    if (busy) return;
    setError(''); setBusy(family);
    try {
      if (family) {
        const font = fonts.find(f => f.family === family)!;
        const bundle = await ensureFont(font);
        await activateFont(bundle);
      }
      onSelect(family);
    } catch (e) { setError(fontError(e)); }
    finally { setBusy(''); }
  }

  return <div className="flex min-h-0 flex-col gap-4">
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="font-search">جست‌وجو در Google Fonts</FieldLabel>
        <Input id="font-search" placeholder="Vazirmatn، Roboto، وزیرمتن…" value={query} onChange={e => { setQuery(e.target.value); setLimit(40); }} />
        <FieldDescription>فونت انتخاب‌شده روی دستگاه می‌ماند و داخل فایل Word هم جاسازی می‌شود.</FieldDescription>
      </Field>
    </FieldGroup>
    <ToggleGroup type="single" variant="outline" value={filter} onValueChange={v => { if (v) { setFilter(v); setLimit(40); } }} dir="rtl" aria-label="فیلتر فونت‌ها" className="w-full">
      <ToggleGroupItem value="arabic" className="flex-1">فارسی / عربی</ToggleGroupItem>
      <ToggleGroupItem value="all" className="flex-1">همه</ToggleGroupItem>
      <ToggleGroupItem value="cached" className="flex-1">دانلودشده</ToggleGroupItem>
    </ToggleGroup>
    {error && <Alert variant="destructive"><CircleAlert /><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="flex items-center justify-between gap-2"><Badge variant="secondary">{matches.length.toLocaleString('fa-IR')} فونت</Badge><span className="text-muted-foreground text-xs">{(cache.reduce((n, f) => n + f.regular.byteLength + (f.bold?.byteLength || 0), 0) / 1024 / 1024).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مگابایت دانلودشده</span></div>
    <div className="flex max-h-[42dvh] flex-col gap-2 overflow-y-auto pe-1">
      {matches.slice(0, limit).map(font => {
        const stored = isBundledFont(font.family) || cache.some(f => f.family === font.family);
        return <div key={font.family} className="flex items-center gap-2">
          <Button variant={font.family === value ? 'secondary' : 'outline'} className="h-auto min-h-14 flex-1 justify-between gap-3 py-3" disabled={!!busy} onClick={() => choose(font.family)} aria-label={`انتخاب فونت ${font.family}`}>
            <span className="flex min-w-0 flex-col items-start gap-1"><span dir="ltr">{font.family === bundledFont ? 'وزیرمتن · Vazirmatn' : font.family}</span><span className="text-muted-foreground text-xs">{isBundledFont(font.family) ? 'همراه اپ؛ آفلاین' : stored ? 'ذخیره‌شده روی دستگاه' : font.arabic ? 'با حروف فارسی / عربی' : 'فارسی با وزیرمتن نمایش داده می‌شود'}</span></span>
            {busy === font.family ? <Spinner aria-label="در حال دریافت فونت" data-icon="inline-end" /> : value === font.family ? <Check data-icon="inline-end" /> : stored ? <Type data-icon="inline-end" /> : <Download data-icon="inline-end" />}
          </Button>
          {stored && !isBundledFont(font.family) && <Button variant="ghost" size="icon" disabled={!!busy} aria-label={`حذف فونت ${font.family}`} onClick={async () => { try { await removeFont(font.family); setCache(await cachedFonts()); if (value === font.family) onSelect(bundledFont); } catch (e) { setError(fontError(e)); } }}><Trash2 data-icon="inline-start" /></Button>}
        </div>;
      })}
      {!matches.length && <Empty><EmptyHeader><EmptyTitle>فونتی پیدا نشد</EmptyTitle><EmptyDescription>فیلتر یا عبارت جست‌وجو را تغییر بده.</EmptyDescription></EmptyHeader></Empty>}
      {matches.length > limit && <Button variant="ghost" onClick={() => setLimit(n => n + 40)}>نمایش بیشتر</Button>}
    </div>
    <Button variant="ghost" disabled={!!busy} onClick={async () => { setBusy('catalogue'); setError(''); try { setFonts(await refreshCatalogue()); } catch (e) { setError(fontError(e)); } finally { setBusy(''); } }}>{busy === 'catalogue' ? <Spinner aria-label="در حال به‌روزرسانی فونت‌ها" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}به‌روزرسانی فهرست فونت‌ها</Button>
    <p className="text-muted-foreground text-xs leading-6">اینترنت فقط برای دریافت فونت جدید و به‌روزرسانی فهرست لازم است. متن سند به گوگل ارسال نمی‌شود. نمایش فونت جاسازی‌شده در Word به پشتیبانی نسخهٔ آن بستگی دارد.</p>
  </div>;
}
