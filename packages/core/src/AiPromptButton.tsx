import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useLocale } from './locale';
import persian from './ai-prompt.fa.md?raw';
import english from './ai-prompt.en.md?raw';

/** Copy only public authoring instructions; never include the user's document. */
export function AiPromptButton() {
  const { locale } = useLocale();
  const [copying, setCopying] = useState(false);
  const fa = locale === 'fa';
  const label = fa ? 'کپی راهنمای AI' : 'Copy AI authoring guide';
  const copy = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(fa ? persian : english);
      toast.success(fa ? 'راهنما کپی شد؛ آن را در گفت‌وگو با AI بچسبان و خواسته‌ات را آخرش بنویس.' : 'Guide copied. Paste it into your AI chat and add your request at the end.');
    } catch {
      toast.error(fa ? 'کپی انجام نشد. اجازهٔ دسترسی به کلیپ‌بورد را بررسی کن و دوباره بزن.' : 'Could not copy. Check clipboard permission and try again.');
    } finally { setCopying(false); }
  };
  return <Button type="button" variant="ghost" size="icon-sm" disabled={copying} aria-label={label} title={label} onClick={() => { void copy(); }}>
    <Sparkles aria-hidden="true" />
  </Button>;
}
