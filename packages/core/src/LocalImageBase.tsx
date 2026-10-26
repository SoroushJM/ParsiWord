import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FolderOpen, X } from 'lucide-react';
import { LocalImageBase, type ImageDirectory } from './local-image-base';
import { browserImageUrl } from './markdown-image';
import { useLocale } from './locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import './local-image-base.css';

type PickerWindow = Window & { showDirectoryPicker?: (options: { mode: 'read'; id: string }) => Promise<ImageDirectory> };

export function useLocalImageBase(enabled: boolean) {
  const [folder, setFolder] = useState<LocalImageBase | null>(null);
  const [path, setPath] = useState('');
  useEffect(() => () => folder?.dispose(), [folder]);
  const resolveImage = useCallback(async (source: string) => {
    if (/^(?:https?:)?\/\//i.test(source) || /^data:/i.test(source)) return browserImageUrl(source);
    // A chosen base makes local misses explicit; otherwise keep web-relative
    // URLs working for hosted examples and images alongside the web page.
    return folder ? folder.resolve(source, path) : browserImageUrl(source);
  }, [folder, path]);
  return { folder, path, setPath, setFolder, resolveImage: enabled ? resolveImage : undefined };
}

export function LocalImageBaseControl({ model }: { model: ReturnType<typeof useLocalImageBase> }) {
  const { locale } = useLocale();
  const fa = locale === 'fa';
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fallback, setFallback] = useState(false);
  const pathId = useId();
  useEffect(() => { if (fallback) input.current?.click(); }, [fallback]);
  const compatiblePicker = () => { setFailed(false); if (fallback) input.current?.click(); else setFallback(true); };
  const select = async () => {
    setFailed(false);
    const picker = (window as PickerWindow).showDirectoryPicker;
    if (!picker) { compatiblePicker(); return; }
    setBusy(true);
    try { model.setFolder(new LocalImageBase(await picker.call(window, { mode: 'read', id: 'parsiword-images' }))); }
    catch (error) { if ((error as Error).name !== 'AbortError') setFailed(true); }
    finally { setBusy(false); }
  };
  return <details className="local-image-base">
    <summary>{fa ? 'پوشهٔ پایهٔ تصاویر' : 'Local image base folder'}{model.folder && <span dir="auto"> · {model.folder.name}</span>}</summary>
    <FieldGroup>
      <Field>
        <FieldLabel>{fa ? 'تصاویر محلی Markdown' : 'Local Markdown images'}</FieldLabel>
        <div className="local-image-base-actions flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { void select(); }}><FolderOpen data-icon="inline-start" />{fa ? model.folder ? 'تغییر پوشه' : 'انتخاب پوشهٔ پایه' : model.folder ? 'Change folder' : 'Choose base folder'}</Button>
          {model.folder && <><span dir="auto" role="status">{model.folder.name}</span><Button type="button" variant="ghost" size="sm" aria-label={fa ? 'حذف پوشهٔ پایه' : 'Clear image base folder'} onClick={() => { model.setFolder(null); model.setPath(''); }}><X data-icon="inline-start" />{fa ? 'پاک کردن' : 'Clear'}</Button></>}
        </div>
        <FieldDescription>{fa ? 'پوشهٔ سند یا پروژه را از رایانه انتخاب کن. مرورگر فقط به پوشهٔ انتخاب‌شده دسترسی دارد؛ فایل‌ها آپلود نمی‌شوند.' : 'Choose your document or project folder on this computer. The browser can only read the selected folder; files are not uploaded.'}</FieldDescription>
      </Field>
      {model.folder && <Field>
        <FieldLabel htmlFor={pathId}>{fa ? 'مسیر سند نسبت به پوشهٔ انتخاب‌شده' : 'Document folder inside the selected folder'}</FieldLabel>
        <Input id={pathId} dir="ltr" value={model.path} placeholder="docs/notes" onChange={event => model.setPath(event.target.value)} />
        <FieldDescription>{fa ? 'اگر پوشهٔ خود سند را انتخاب کردی، خالی بگذار. برای پروژه‌ای که سندش در docs است، بنویس docs؛ مسیرهای ../ هم در محدودهٔ پوشهٔ انتخاب‌شده کار می‌کنند.' : 'Leave empty if you selected the document folder. For a project whose document is in docs, enter docs; ../ paths work within the selected folder.'}</FieldDescription>
      </Field>}
    </FieldGroup>
    {failed && <Alert variant="destructive"><AlertDescription>{fa ? 'پوشه باز نشد. دوباره انتخاب کن یا از روش سازگار استفاده کن.' : 'Could not open the folder. Try again or use the compatible picker.'}<Button type="button" variant="outline" size="sm" onClick={compatiblePicker}>{fa ? 'انتخاب پوشه با روش سازگار' : 'Use compatible folder picker'}</Button></AlertDescription></Alert>}
    {fallback && <input ref={element => { input.current = element; if (element) element.webkitdirectory = true; }} className="local-image-base-file" type="file" multiple aria-label={fa ? 'انتخاب پوشهٔ تصاویر محلی' : 'Select local image folder'} onChange={event => {
      const files = [...(event.target.files ?? [])];
      if (files.length) model.setFolder(new LocalImageBase(files));
      event.target.value = '';
    }} />}
  </details>;
}
