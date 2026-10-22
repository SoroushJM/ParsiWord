import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { minimalChange, rebaseText, type SyncSnapshot } from '../../../packages/core/src/document-sync';

const viewType = 'parsiword.markdown';
type Session = { document: vscode.TextDocument; panel: vscode.WebviewPanel; ready: boolean; client: string };
type GitRepository = { rootUri: vscode.Uri; state: { indexChanges: { uri: vscode.Uri; originalUri?: vscode.Uri }[]; workingTreeChanges: { uri: vscode.Uri; originalUri?: vscode.Uri }[] } };
type GitApi = { getRepository(uri: vscode.Uri): GitRepository | null; toGitUri(uri: vscode.Uri, ref: string): vscode.Uri };

export function activate(context: vscode.ExtensionContext) {
  const sessions = new Set<Session>();
  const applying = new Set<string>();
  const queues = new Map<string, Promise<void>>();
  let active: Session | undefined;
  const current = (uri?: vscode.Uri) => uri ?? (active?.panel.active ? active.document.uri : vscode.window.activeTextEditor?.document.uri) ?? active?.document.uri;
  const lineEnding = (document: vscode.TextDocument) => document.eol === vscode.EndOfLine.CRLF ? '\r\n' as const : '\n' as const;
  // Native browser inputs use LF. Keep that UI representation stable while
  // applying minimal edits and exporting with the TextDocument's actual EOL.
  const snapshot = (document: vscode.TextDocument): SyncSnapshot => ({ text: document.getText().replace(/\r\n/g, '\n'), version: document.version, dirty: document.isDirty, eol: lineEnding(document) });
  const publish = (document: vscode.TextDocument, extra: Partial<SyncSnapshot> = {}) => {
    for (const session of sessions) if (session.document === document && session.ready) {
      void session.panel.webview.postMessage({ type: 'document', snapshot: { ...snapshot(document), ...extra } });
    }
  };
  const enqueue = (document: vscode.TextDocument, operation: () => Promise<void>) => {
    const key = document.uri.toString();
    const task = (queues.get(key) ?? Promise.resolve()).then(operation);
    const safe = task.catch(error => { void vscode.window.showErrorMessage(`ParsiWord: ${String(error)}`); });
    queues.set(key, safe);
    void safe.finally(() => { if (queues.get(key) === safe) queues.delete(key); });
    return task;
  };
  const open = async (uri?: vscode.Uri) => {
    const resource = current(uri);
    if (resource) {
      const document = await vscode.workspace.openTextDocument(resource);
      if (document.languageId === 'plaintext') await vscode.languages.setTextDocumentLanguage(document, 'markdown');
      await vscode.commands.executeCommand('vscode.openWith', resource, viewType);
    }
  };
  const source = async (uri?: vscode.Uri) => {
    const resource = current(uri);
    if (resource) await vscode.commands.executeCommand('vscode.openWith', resource, 'default', { viewColumn: vscode.ViewColumn.Beside });
  };
  const nativePreview = async (uri?: vscode.Uri) => {
    const resource = current(uri);
    if (resource) await vscode.commands.executeCommand('markdown.showPreviewToSide', resource);
  };
  const gitDiff = async (staged: boolean, uri?: vscode.Uri) => {
    const resource = current(uri);
    if (!resource || resource.scheme !== 'file') throw Error('Open a saved Markdown file in a Git repository first.');
    const extension = vscode.extensions.getExtension<{ getAPI(version: number): GitApi }>('vscode.git');
    if (!extension) throw Error('Enable VS Code’s built-in Git extension to compare revisions.');
    const api = (await extension.activate()).getAPI(1);
    const repository = api.getRepository(resource);
    if (!repository) throw Error('This Markdown file is not in an open Git repository.');
    const changes = staged ? repository.state.indexChanges : repository.state.workingTreeChanges;
    const change = changes.find(item => item.uri.toString() === resource.toString());
    const original = change?.originalUri ?? resource;
    // Git's public API supplies revision URIs and handles nested repositories,
    // virtual content and paths with spaces without invoking a shell.
    const left = api.toGitUri(original, staged ? 'HEAD' : '~');
    const right = staged ? api.toGitUri(resource, '~') : resource;
    await vscode.commands.executeCommand('vscode.diff', left, right, `${basename(resource.fsPath)} (${staged ? 'HEAD ↔ Index' : 'Index ↔ Working Tree'})`);
  };
  const command = async (name: string, document: vscode.TextDocument) => {
    if (name === 'source') return source(document.uri);
    if (name === 'preview') return nativePreview(document.uri);
    if (name === 'diff' || name === 'stagedDiff') return gitDiff(name === 'stagedDiff', document.uri);
    if (name === 'new') { const next = await vscode.workspace.openTextDocument({ language: 'markdown', content: '' }); return open(next.uri); }
    if (name === 'save') { await queues.get(document.uri.toString()); await document.save(); return; }
    if (name === 'undo' || name === 'redo') { await queues.get(document.uri.toString()); await vscode.commands.executeCommand(name); }
  };

  const provider: vscode.CustomTextEditorProvider = {
    async resolveCustomTextEditor(document, panel) {
      if (document.getText().length > 500_000) {
        void vscode.window.showInformationMessage('This document exceeds ParsiWord’s editing limit. Opening the native Markdown editor.');
        await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
        return;
      }
      const session: Session = { document, panel, ready: false, client: randomBytes(12).toString('hex') };
      sessions.add(session); active = session;
      panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist/webview')] };
      const assetRoot = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist/webview')).toString();
      const manifest = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'dist/webview/.vite/manifest.json'))).toString());
      const entry = manifest['index.html'];
      const nonce = randomBytes(24).toString('base64');
      const escape = (value: string) => value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
      const csp = `default-src 'none'; img-src ${panel.webview.cspSource} data: blob:; font-src ${panel.webview.cspSource} blob:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src ${panel.webview.cspSource} 'nonce-${nonce}'; connect-src ${panel.webview.cspSource}; worker-src ${panel.webview.cspSource} blob:;`;
      panel.webview.html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${escape(csp)}"><meta name="viewport" content="width=device-width, initial-scale=1.0">${(entry.css ?? []).map((file: string) => `<link rel="stylesheet" href="${escape(assetRoot + '/' + file)}">`).join('')}<title>ParsiWord</title></head><body><div id="root" role="status">Loading ParsiWord…</div><script nonce="${nonce}" type="module" src="${escape(assetRoot + '/' + entry.file)}"></script></body></html>`;
      const disposables = [
        panel.onDidChangeViewState(() => { if (panel.active) active = session; }),
        panel.webview.onDidReceiveMessage(async message => {
          if (!message || typeof message !== 'object') return;
          if (message.type === 'ready') {
            session.ready = true;
            const config = vscode.workspace.getConfiguration('parsiword', document.uri);
            const settings = context.workspaceState.get(`settings:${document.uri.toString()}`) ?? {
              title: basename(document.uri.path).replace(/\.(md|markdown|mdown|mkd)$/i, '').slice(0,90),
              direction: config.get('direction', 'auto'), fontSize: config.get('fontSize', 12),
              fontFamily: config.get('fontFamily', 'Vazirmatn'), alignmentOnly: false,
            };
            await panel.webview.postMessage({ type: 'init', snapshot: snapshot(document), client: session.client, settings, assetRoot,
              locale: context.globalState.get('locale', config.get('language', 'fa')), version: context.extension.packageJSON.version });
            return;
          }
          if (message.type === 'edit') {
            const { id, base, text } = message.edit ?? {};
            if (!Number.isSafeInteger(id) || typeof base !== 'string' || typeof text !== 'string' || base.length > 500_000 || text.length > 500_000) return;
            void enqueue(document, async () => {
              try {
                const canonical = (value: string) => value.replace(/\r\n|\n/g, lineEnding(document));
                const next = rebaseText(canonical(base), canonical(text), document.getText());
                if (next.length > 500_000) throw Error('FILE_TOO_LARGE');
                const edit = minimalChange(document.getText(), next);
                if (edit) {
                  const change = new vscode.WorkspaceEdit();
                  change.replace(document.uri, new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end)), edit.text);
                  applying.add(document.uri.toString());
                  try { if (!await vscode.workspace.applyEdit(change)) throw Error('The document is read-only or could not be updated.'); }
                  finally { applying.delete(document.uri.toString()); }
                }
                publish(document, { ack: id, client: session.client });
              } catch {
                await panel.webview.postMessage({ type: 'document', snapshot: { ...snapshot(document), ack: id, client: session.client, rejected: true } });
              }
            });
            return;
          }
          if (message.type === 'settings') { await context.workspaceState.update(`settings:${document.uri.toString()}`, message.settings); return; }
          if (message.type === 'locale' && ['fa','en'].includes(message.locale)) { await context.globalState.update('locale', message.locale); return; }
          if (message.type !== 'request' || !Number.isSafeInteger(message.id)) return;
          try {
            let result: unknown;
            const args = message.args ?? {};
            if (message.method === 'command') await command(args.name, document);
            else if (message.method === 'open') {
              const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Markdown: ['md','markdown','mdown','mkd','txt'] } });
              if (files?.[0]) await open(files[0]);
              result = null;
            } else if (message.method === 'saveBytes') {
              if (!['md','docx','pdf'].includes(args.extension) || !Array.isArray(args.bytes) || args.bytes.length > 64 * 1024 * 1024 || !args.bytes.every((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 255)) throw Error('Invalid export');
              const filename = basename(String(args.filename)).replace(/[<>:"/\\|?*]/g, '_');
              const defaultUri = document.uri.scheme === 'file' ? vscode.Uri.file(join(dirname(document.uri.fsPath), filename)) : undefined;
              const target = await vscode.window.showSaveDialog({ defaultUri, filters: { [args.extension.toUpperCase()]: [args.extension] } });
              if (target?.toString() === document.uri.toString() && args.extension === 'md') {
                await queues.get(document.uri.toString());
                const text = new TextDecoder().decode(Uint8Array.from(args.bytes));
                const delta = minimalChange(document.getText(), text);
                if (delta) {
                  const change = new vscode.WorkspaceEdit();
                  change.replace(document.uri, new vscode.Range(document.positionAt(delta.start), document.positionAt(delta.end)), delta.text);
                  if (!await vscode.workspace.applyEdit(change)) throw Error('Could not save the Markdown document.');
                }
                result = await document.save();
              } else if (target) await vscode.workspace.fs.writeFile(target, Uint8Array.from(args.bytes));
              else result = false;
              if (result === undefined) result = !!target;
            } else if (message.method === 'font') {
              const url = new URL(String(args.url));
              if (url.protocol !== 'https:' || !['fonts.gstatic.com','fonts.googleapis.com','fonts.google.com'].includes(url.hostname) || url.username || url.password || url.port) throw Error('Invalid font URL');
              const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'ParsiWord VSCode' } });
              if (!response.ok || Number(response.headers.get('content-length') || 0) > 32 * 1024 * 1024) throw Error('FONT_NETWORK');
              const bytes = new Uint8Array(await response.arrayBuffer());
              if (bytes.length > 32 * 1024 * 1024) throw Error('FONT_TOO_LARGE');
              result = Array.from(bytes);
            } else if (message.method === 'recover' && typeof args.text === 'string' && args.text.length <= 500_000) {
              const recovered = await vscode.workspace.openTextDocument({ language: 'markdown', content: args.text });
              await vscode.window.showTextDocument(recovered, vscode.ViewColumn.Beside);
              void vscode.window.showWarningMessage('ParsiWord preserved your concurrent edit in this unsaved recovery document. Review it before merging.');
            } else throw Error('Unknown request');
            await panel.webview.postMessage({ type: 'response', id: message.id, result });
          } catch (error) {
            await panel.webview.postMessage({ type: 'response', id: message.id, error: String(error) });
          }
        }),
      ];
      panel.onDidDispose(() => { disposables.forEach(item => item.dispose()); sessions.delete(session); if (active === session) active = undefined; });
    },
  };
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(viewType, provider, { supportsMultipleEditorsPerDocument: true, webviewOptions: { retainContextWhenHidden: true } }),
    vscode.workspace.onDidChangeTextDocument(event => { if (!applying.has(event.document.uri.toString())) publish(event.document); }),
    vscode.workspace.onDidSaveTextDocument(document => publish(document)),
    vscode.commands.registerCommand('parsiword.open', open),
    vscode.commands.registerCommand('parsiword.source', source),
    vscode.commands.registerCommand('parsiword.nativePreview', nativePreview),
    vscode.commands.registerCommand('parsiword.gitDiff', (uri?: vscode.Uri) => gitDiff(false, uri)),
    vscode.commands.registerCommand('parsiword.stagedDiff', (uri?: vscode.Uri) => gitDiff(true, uri)),
  );
  // Public diagnostics are read-only. Tests exercise the same document provider
  // and commands as the installed extension, without a production edit backdoor.
  return { getOpenDocuments: () => [...sessions].map(session => ({ uri: session.document.uri.toString(), ready: session.ready, active: session.panel.active })) };
}
