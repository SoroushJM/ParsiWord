import { editorHost, type SaveFormat } from './host';
import { ParsiWordError, getErrorCode } from './errors';

async function saveBytes(
  bytes: Uint8Array,
  filename: string,
  format: SaveFormat,
): Promise<boolean> {
  try {
    const save = editorHost().saveBytes;
    if (save) return await save(bytes, filename, format);
    const url = URL.createObjectURL(
      new Blob([bytes.slice().buffer], { type: format.mime }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return true;
  } catch (cause) {
    if (getErrorCode(cause)) throw cause;
    throw new ParsiWordError('FILE_SAVE_FAILED', { cause });
  }
}
export const saveDocx = (bytes: Uint8Array, filename: string) =>
  saveBytes(bytes, filename, {
    label: 'Word document',
    extension: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
export const savePdf = (bytes: Uint8Array, filename: string) =>
  saveBytes(bytes, filename, {
    label: 'PDF document',
    extension: 'pdf',
    mime: 'application/pdf',
  });
export const saveMarkdown = (markdown: string, filename: string) =>
  saveBytes(new TextEncoder().encode(markdown), filename, {
    label: 'Markdown document',
    extension: 'md',
    mime: 'text/markdown;charset=utf-8',
  });
export async function openMarkdown() {
  try {
    return (await editorHost().openMarkdown?.()) ?? null;
  } catch (cause) {
    if (getErrorCode(cause)) throw cause;
    throw new ParsiWordError('FILE_OPEN_FAILED', { cause });
  }
}
