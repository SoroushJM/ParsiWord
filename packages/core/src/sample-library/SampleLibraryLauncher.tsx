import { lazy, Suspense, useRef, useState } from 'react';
import { Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocale } from '../locale';

const LibraryDialog = lazy(() => import('./SampleLibrary'));
export type SampleLibraryProps = { current: () => string; load: (markdown: string) => boolean; readOnly: boolean };

export default function SampleLibraryLauncher(props: SampleLibraryProps) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const label = locale === 'fa' ? 'متن‌های نمونه' : 'Sample documents';
  return <>
    <Button ref={trigger} type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={() => setOpen(true)}><Library aria-hidden="true" /></Button>
    {open && <Suspense fallback={<span role="status">…</span>}><LibraryDialog {...props} onClose={(restoreFocus = true) => {
      setOpen(false);
      if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
    }} /></Suspense>}
  </>;
}
