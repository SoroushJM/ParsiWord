import { isTauri, invoke } from '@tauri-apps/api/core';
import { configureHost } from '@parsiword/core/host';
import { ParsiWordError } from '@parsiword/core/errors';
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
    fontResource: async (url: string) => {
      try { return new Uint8Array(await invoke<ArrayBuffer>('google_font_request', { url })); }
      catch (cause) {
        // The Rust IPC command returns these exact codes, not a display message.
        throw new ParsiWordError(cause === 'FONT_TOO_LARGE' ? 'FONT_TOO_LARGE' : 'FONT_NETWORK', { cause });
      }
    },
  } : {}),
});
