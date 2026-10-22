import { isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeFile } from '@tauri-apps/plugin-fs';

type DownloadFormat = { label: string; extension: string; mime: string };

export async function saveNativeBytes(bytes: Uint8Array, filename: string, format: DownloadFormat): Promise<boolean> {
  if (isTauri()) {
    const path = await save({ defaultPath: filename, filters: [{ name: format.label, extensions: [format.extension] }] });
    if (!path) return false;
    await writeFile(path, bytes);
    return true;
  }
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: format.mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}

export function saveDocx(bytes: Uint8Array, filename: string): Promise<boolean> {
  return saveNativeBytes(bytes, filename, { label: 'Word document', extension: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export function saveMarkdown(markdown: string, filename: string): Promise<boolean> {
  // Encode the logical source directly: preserve escapes, line endings and
  // trailing whitespace without adding a BOM or passing through a renderer.
  return saveNativeBytes(new TextEncoder().encode(markdown), filename, { label: 'Markdown document', extension: 'md', mime: 'text/markdown;charset=utf-8' });
}

export function savePdf(bytes: Uint8Array, filename: string): Promise<boolean> {
  return saveNativeBytes(bytes, filename, { label: 'PDF document', extension: 'pdf', mime: 'application/pdf' });
}

export async function openMarkdown(): Promise<{ name: string; text: string } | null> {
  if (isTauri()) {
    // Android document providers don't consistently label .md as text/markdown.
    const path = await open({ multiple: false, directory: false, fileAccessMode: 'copy', filters: [{ name: 'Markdown / Text', extensions: ['md', 'markdown', 'txt'] }] });
    if (!path) return null;
    const text = await readTextFile(path);
    if (text.length > 500_000) throw new Error('FILE_TOO_LARGE');
    let name = 'یادداشت واردشده';
    try {
      const filename = decodeURIComponent(path.replace(/\\/g, '/').split('/').pop() || '');
      if (/\.(md|markdown|txt)$/iu.test(filename)) name = filename.replace(/\.(md|markdown|txt)$/iu, '').slice(0, 90);
    } catch { /* Keep a readable title for document-provider URLs. */ }
    return { name, text };
  }
  return null;
}
