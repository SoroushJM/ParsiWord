import '@parsiword/core/globals.css';
import '@parsiword/core/App.css';
import '@parsiword/core/locale.css';
import './vscode.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '@parsiword/core/App';
import { configureHost, type DocumentSnapshot } from '@parsiword/core/host';
import { LocaleProvider } from '@parsiword/core/locale';
import { DocumentSync, type SyncSnapshot } from '@parsiword/core/document-sync';
import type { ExportSettings } from '@parsiword/core/converter';
import { toast } from 'sonner';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void; getState(): unknown; setState(value: unknown): void };
const api = acquireVsCodeApi();
const root = createRoot(document.getElementById('root')!);
let serial = 0;
let client = '';
let eol: '\n' | '\r\n' = '\n';
let sync: DocumentSync;
const listeners = new Set<(snapshot: DocumentSnapshot) => void>();
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const request = <T,>(method: string, args: unknown): Promise<T> => new Promise((resolve, reject) => {
  const id = ++serial;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error('VS Code did not answer this request.')); }, 120_000);
  pending.set(id, { resolve: value => resolve(value as T), reject, timer });
  api.postMessage({ type: 'request', id, method, args });
});
window.addEventListener('message', event => {
  const message = event.data;
  if (message.type === 'response') {
    const operation = pending.get(message.id);
    if (operation) { clearTimeout(operation.timer); pending.delete(message.id); if (message.error) operation.reject(new Error(message.error)); else operation.resolve(message.result); }
  } else if (message.type === 'document' && sync) {
    eol = message.snapshot.eol ?? eol;
    sync.receive(message.snapshot, message.snapshot.client === client);
  } else if (message.type === 'init' && !sync) {
    client = message.client;
    eol = message.snapshot.eol ?? '\n';
    sync = new DocumentSync(message.snapshot as SyncSnapshot,
      edit => api.postMessage({ type: 'edit', edit }),
      snapshot => { for (const listener of listeners) listener({ markdown: snapshot.text, dirty: snapshot.dirty }); },
      text => { void request('recover', { text }).catch(error => toast.error(String(error))); });
    configureHost({
      kind: 'vscode', version: message.version, locale: message.locale,
      asset: path => `${message.assetRoot}/${path.replace(/^\/+/, '')}`,
      initial: { markdown: message.snapshot.text, settings: message.settings as ExportSettings, dirty: message.snapshot.dirty },
      documentChanged: text => sync.edit(text),
      subscribeDocument: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      settingsChanged: settings => api.postMessage({ type: 'settings', settings }),
      localeChanged: locale => api.postMessage({ type: 'locale', locale }),
      fontResource: async url => Uint8Array.from(await request<number[]>('font', { url })),
      saveBytes: (bytes, filename, format) => {
        const output = format.extension === 'md' ? new TextEncoder().encode(new TextDecoder().decode(bytes).replace(/\r\n|\n/g, eol)) : bytes;
        return request<boolean>('saveBytes', { bytes: Array.from(output), filename, extension: format.extension });
      },
      openMarkdown: () => request<null>('open', {}),
      command: name => { void request('command', { name }).catch(error => toast.error(String(error))); },
    });
    root.render(<React.StrictMode><LocaleProvider><App /></LocaleProvider></React.StrictMode>);
  }
});
api.postMessage({ type: 'ready' });
