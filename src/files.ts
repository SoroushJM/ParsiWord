import { isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeFile } from '@tauri-apps/plugin-fs';

export async function saveDocx(bytes: Uint8Array, filename: string): Promise<boolean> {
  if (isTauri()) {
    const path = await save({ defaultPath: filename, filters: [{ name: 'Word document', extensions: ['docx'] }] });
    if (!path) return false;
    await writeFile(path, bytes);
    return true;
  }
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
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
