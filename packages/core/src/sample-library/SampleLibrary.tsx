import { useId, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLocale } from '../locale';
import { builtInSamples } from './samples';
import { deleteSample, readSamples, saveSample, type Sample } from './model';
import type { SampleLibraryProps } from './SampleLibraryLauncher';
import './sample-library.css';

export default function SampleLibrary({ current, load, readOnly, onClose }: SampleLibraryProps & { onClose: (restoreFocus?: boolean) => void }) {
  const { locale, dir } = useLocale(), fa = locale === 'fa', id = useId();
  const [personal, setPersonal] = useState<Sample[]>(() => { try { return readSamples(localStorage); } catch { return []; } });
  const [name, setName] = useState(''), [query, setQuery] = useState(''), [error, setError] = useState('');
  const save = () => {
    try { setPersonal(saveSample(localStorage, name, current())); setName(''); setError(''); }
    catch { setError(fa ? 'ذخیرهٔ نمونه انجام نشد؛ نام و فضای ذخیره‌سازی را بررسی کن.' : 'Could not save the sample. Check its name and local storage space.'); }
  };
  const remove = (id: string) => {
    try { setPersonal(deleteSample(localStorage, id)); setError(''); }
    catch { setError(fa ? 'حذف نمونه انجام نشد.' : 'Could not delete the sample.'); }
  };
  const choose = (sample: Sample) => {
    if (load(sample.markdown)) onClose(false);
    else setError(fa ? 'بارگذاری نمونه انجام نشد؛ دوباره تلاش کن.' : 'Could not load the sample. Try again.');
  };
  const group = (title: string, samples: Sample[], own = false) => <section className="flex flex-col gap-2">
    <h3 className="font-medium">{title}</h3>
    {samples.filter(sample => `${sample.name}\n${sample.markdown}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(sample =>
      <div key={sample.id} className="flex min-w-0 items-center gap-2">
        <Button type="button" variant="outline" className="min-w-0 flex-1 justify-start" disabled={readOnly} onClick={() => choose(sample)}><span className="truncate">{sample.name}</span></Button>
        {own && <Button type="button" variant="ghost" size="icon-sm" aria-label={`${fa ? 'حذف نمونه' : 'Delete sample'} ${sample.name}`} onClick={() => remove(sample.id)}><Trash2 /></Button>}
      </div>)}
    {own && !samples.length && <p className="text-muted-foreground">{fa ? 'هنوز نمونهٔ شخصی ذخیره نکرده‌ای.' : 'No personal samples saved yet.'}</p>}
  </section>;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent dir={dir} onCloseAutoFocus={event => event.preventDefault()} className="sample-library-dialog w-[min(36rem,calc(100dvw-2rem))] max-w-none sm:max-w-none">
      <DialogHeader><DialogTitle>{fa ? 'متن‌های نمونه' : 'Sample documents'}</DialogTitle><DialogDescription>{fa ? 'انتخاب نمونه، متن سند فعلی را جایگزین می‌کند. با یک واگرد می‌توانی برگردی.' : 'Choosing a sample replaces this document. Undo once to return.'}</DialogDescription></DialogHeader>
      <FieldGroup className="gap-3">
        <Field><FieldLabel htmlFor={`${id}-name`}>{fa ? 'نام نمونهٔ شخصی' : 'Personal sample name'}</FieldLabel>
          <div className="flex flex-wrap gap-2"><Input id={`${id}-name`} value={name} maxLength={100} onChange={event => setName(event.target.value)} className="min-w-0 flex-1" />
            <Button type="button" disabled={readOnly || !name.trim()} onClick={save}>{fa ? 'ذخیرهٔ متن فعلی' : 'Save current text'}</Button></div>
        </Field>
        <Field><FieldLabel htmlFor={`${id}-search`}>{fa ? 'جست‌وجوی نمونه‌ها' : 'Search samples'}</FieldLabel><Input id={`${id}-search`} value={query} onChange={event => setQuery(event.target.value)} /></Field>
      </FieldGroup>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <ScrollArea dir={dir} className="sample-library-list min-h-0" viewportProps={{ className: 'pe-3' }}>
        <div className="flex flex-col gap-6">{group(fa ? 'نمونه‌های آماده' : 'Built-in samples', builtInSamples)}{group(fa ? 'نمونه‌های شخصی' : 'Personal samples', personal, true)}</div>
      </ScrollArea>
    </DialogContent>
  </Dialog>;
}
