import { editorHost, type SaveFormat } from './host';

async function saveBytes(bytes: Uint8Array, filename: string, format: SaveFormat): Promise<boolean> {
  const save = editorHost().saveBytes;
  if (save) return save(bytes, filename, format);
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: format.mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}
export const saveDocx = (bytes: Uint8Array, filename: string) => saveBytes(bytes, filename, { label: 'Word document', extension: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
export const savePdf = (bytes: Uint8Array, filename: string) => saveBytes(bytes, filename, { label: 'PDF document', extension: 'pdf', mime: 'application/pdf' });
export const saveMarkdown = (markdown: string, filename: string) => saveBytes(new TextEncoder().encode(markdown), filename, { label: 'Markdown document', extension: 'md', mime: 'text/markdown;charset=utf-8' });
export const openMarkdown = () => editorHost().openMarkdown?.() ?? Promise.resolve(null);
