import '@parsiword/core/styles.css';
import './vscode.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { EditorApp as App, ComparisonWorkspace, LocaleProvider, translate } from '@parsiword/core/ui';
import { configureHost, DocumentSync, isHostMessage, ParsiWordError, errorMessage, type DocumentSnapshot, type DocumentComparison, type EditorAction, type EditorHost, isRecord } from '@parsiword/core/host';
import { toast } from 'sonner';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void; getState(): unknown; setState(value: unknown): void };
const api = acquireVsCodeApi();
// A retained webview can receive real input before panel.active reflects its
// editor group. Route document actions to the view that actually has focus.
let comparisonSide: 'original' | 'modified' = 'modified';
const reportFocus = () => api.postMessage({ type: 'focus', focused: true, comparisonSide });
const focusSide = (side: 'original' | 'modified') => { comparisonSide = side; reportFocus(); };
document.addEventListener('focusin', reportFocus);
document.addEventListener('pointerdown', reportFocus);
window.addEventListener('focus', reportFocus);
window.addEventListener('blur', () => api.postMessage({ type: 'focus', focused: false }));
document.body.classList.add('vscode-shell');
const root = createRoot(document.getElementById('root')!);
const showError = (error: unknown) => toast.error(translate(errorMessage(error), document.documentElement.lang === 'en' ? 'en' : 'fa'));
let serial = 0;
let client = '';
let eol: '\n' | '\r\n' = '\n';
let sync: DocumentSync;
const listeners = new Set<(snapshot: DocumentSnapshot) => void>();
const comparisonListeners = new Set<(comparison: DocumentComparison | undefined) => void>();
const navigationListeners = new Set<(index: number) => void>();
const actionListeners = new Set<(action: EditorAction) => void>();
let comparison: DocumentComparison | undefined;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const request = <T,>(method: string, args: unknown): Promise<T> => new Promise((resolve, reject) => {
  const id = ++serial;
  const timer = setTimeout(() => { pending.delete(id); reject(new ParsiWordError('HOST_REQUEST_FAILED')); }, 120_000);
  pending.set(id, { resolve: value => resolve(value as T), reject, timer });
  api.postMessage({ type: 'request', id, method, args });
});
window.addEventListener('message', event => {
  const message = event.data;
  if (!isHostMessage(message)) return;
  if (message.type === 'editorAction') {
    for (const listener of actionListeners) listener(message.action);
  } else if (message.type === 'response') {
    const operation = pending.get(message.id);
    if (operation) { clearTimeout(operation.timer); pending.delete(message.id); if (message.error || message.errorCode) operation.reject(new ParsiWordError(message.errorCode ?? 'HOST_REQUEST_FAILED')); else operation.resolve(message.result); }
  } else if (message.type === 'comparison') {
    comparison = message.comparison ?? undefined;
    if (comparison?.singleTab && comparison.originalUri) api.setState({ comparisonOriginal: comparison.originalUri });
    for (const listener of comparisonListeners) listener(comparison);
  } else if (message.type === 'comparisonNavigate') {
    for (const listener of navigationListeners) listener(message.index);
  } else if (message.type === 'document' && sync) {
    eol = message.snapshot.eol ?? eol;
    sync.receive(message.snapshot, message.snapshot.client === client);
  } else if (message.type === 'init' && !sync) {
    client = message.client;
    eol = message.snapshot.eol ?? '\n';
    comparison = message.comparison ?? undefined;
    sync = new DocumentSync(message.snapshot,
      edit => api.postMessage({ type: 'edit', edit }),
      snapshot => { for (const listener of listeners) listener({ markdown: snapshot.text, dirty: snapshot.dirty }); },
      text => { void request('recover', { text }).catch(showError); },
      pending => api.postMessage({ type: 'pending', pending }),
      edit => api.postMessage({ type: 'draft', edit }));
    const host: EditorHost = {
      kind: 'vscode', version: message.version, locale: message.locale,
      readOnly: message.readOnly, comparison,
      subscribeComparison: listener => { comparisonListeners.add(listener); listener(comparison); return () => { comparisonListeners.delete(listener); }; },
      navigateComparison: index => api.postMessage({ type: 'comparisonNavigate', index }),
      subscribeComparisonNavigation: listener => { navigationListeners.add(listener); return () => { navigationListeners.delete(listener); }; },
      subscribeEditorAction: listener => { actionListeners.add(listener); return () => { actionListeners.delete(listener); }; },
      asset: path => `${message.assetRoot}/${path.replace(/^\/+/, '')}`,
      initial: { markdown: message.snapshot.text, settings: message.settings, dirty: message.snapshot.dirty, viewMode: message.viewMode },
      documentChanged: text => sync.edit(text),
      compositionChanged: composing => sync.composition(composing),
      subscribeDocument: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      settingsChanged: settings => api.postMessage({ type: 'settings', settings }),
      localeChanged: locale => api.postMessage({ type: 'locale', locale }),
      resolveImage: source => request<string | null>('imageUri', { source }),
      fontResource: async url => Uint8Array.from(await request<number[]>('font', { url })),
      saveBytes: async (bytes, filename, format) => {
        await sync.drain();
        const output = format.extension === 'md' ? new TextEncoder().encode(new TextDecoder().decode(bytes).replace(/\r\n|\n/g, eol)) : bytes;
        return request<boolean>('saveBytes', { bytes: Array.from(output), filename, extension: format.extension });
      },
      openMarkdown: () => request<null>('open', {}),
      command: name => { void sync.drain().then(() => request('command', { name })).catch(showError); },
    };
    configureHost(host);
    const originalImage = (source: string) => request<string | null>('imageUri', { source, baseUri: comparison?.originalUri });
    if (comparison?.singleTab && comparison.originalUri) api.setState({ comparisonOriginal: comparison.originalUri });
    root.render(<React.StrictMode><LocaleProvider>{comparison?.singleTab ? <ComparisonWorkspace host={host} resolveOriginalImage={originalImage} onFocusSide={focusSide} /> : <App />}</LocaleProvider></React.StrictMode>);
  }
});
const state = api.getState();
api.postMessage({ type: 'ready', restoreComparison: isRecord(state) && typeof state.comparisonOriginal === 'string' ? state.comparisonOriginal : undefined });
