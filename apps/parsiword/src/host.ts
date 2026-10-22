import { isTauri, invoke } from '@tauri-apps/api/core';
import { configureHost } from '@parsiword/core/host';
import { openMarkdown, saveNativeBytes } from './files';
import { loadDraft, persistDraft } from './drafts';
import { version } from '../package.json';

configureHost({
  kind: isTauri() ? 'native' : 'web', version,
  initial: { ...loadDraft(/\/en(?:\/index\.html|\/)?$/.test(location.pathname) ? 'en' : 'fa'), dirty: false },
  persistDraft,
  nativeFonts: isTauri(),
  ...(isTauri() ? {
    openMarkdown,
    saveBytes: saveNativeBytes,
    fontResource: async (url: string) => new Uint8Array(await invoke<ArrayBuffer>('google_font_request', { url })),
  } : {}),
});
