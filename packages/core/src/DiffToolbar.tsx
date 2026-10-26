import { ArrowDown, ArrowUp, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLocale } from './locale';
import type { DocumentComparison } from './host';
import type { MarkdownDiff } from './markdown-diff';
import './markdown-diff.css';

export function DiffToolbar({ comparison, diff, index, onNavigate }: { comparison: DocumentComparison; diff: MarkdownDiff; index: number; onNavigate: (index: number) => void }) {
  const { locale, number } = useLocale();
  const fa = locale === 'fa', original = comparison.side === 'original';
  const label = original ? comparison.staged ? 'HEAD' : fa ? 'نسخهٔ staged' : 'Index' : comparison.staged ? fa ? 'نسخهٔ staged' : 'Index' : fa ? 'فایل فعلی' : 'Working tree';
  const count = diff.original.anchors.length;
  return <section className="diff-toolbar" aria-label={fa ? 'مقایسهٔ تغییرات Git' : 'Git change comparison'}>
    <div className="diff-revision">
      <strong>{label}</strong>
      {(original || comparison.staged) && <Badge variant="secondary"><LockKeyhole data-icon="inline-start" />{fa ? 'فقط خواندنی' : 'Read only'}</Badge>}
    </div>
    <div className="diff-summary">
      <span className="diff-count" data-diff="delete">{fa ? `${number(diff.original.count)} خط حذف` : `${number(diff.original.count)} removed lines`}</span>
      <span className="diff-count" data-diff="insert">{fa ? `${number(diff.modified.count)} خط اضافه` : `${number(diff.modified.count)} added lines`}</span>
      {!count && <span>{fa ? 'تغییری وجود ندارد.' : 'No changes.'}</span>}
    </div>
    <nav aria-label={fa ? 'حرکت بین تغییرات' : 'Navigate changes'}>
      <Button variant="outline" size="icon-sm" disabled={!count} aria-label={fa ? 'تغییر قبلی' : 'Previous change'} onClick={() => onNavigate((index - 1 + count) % count)}><ArrowUp /></Button>
      <span aria-live="polite">{count ? `${number(Math.max(0, index) + 1)} / ${number(count)}` : number(0)}</span>
      <Button variant="outline" size="icon-sm" disabled={!count} aria-label={fa ? 'تغییر بعدی' : 'Next change'} onClick={() => onNavigate((index + 1) % count)}><ArrowDown /></Button>
    </nav>
    {diff.coarse && <p>{fa ? 'برای این تغییر بزرگ، تفاوت‌ها در سطح بلوک نشان داده می‌شوند.' : 'This large change is highlighted at block level.'}</p>}
  </section>;
}
