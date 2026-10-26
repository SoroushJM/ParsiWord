import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { minimalChange, rebaseText, canApplyMarkdown, MAX_MARKDOWN_LENGTH, normalizeSettings, isRecord,
  isClientMessage, PendingDocument, ParsiWordError, getErrorCode, type SyncSnapshot, type DocumentViewMode, type DocumentComparison } from '@parsiword/core/host';

const viewType = 'parsiword.markdown';
type Session = { document: vscode.TextDocument; panel: vscode.WebviewPanel; ready: boolean; client: string; journal: PendingDocument; comparison?: DocumentComparison; peer?: Session };
type GitRepository = { rootUri: vscode.Uri; state: { indexChanges: { uri: vscode.Uri; originalUri?: vscode.Uri }[]; workingTreeChanges: { uri: vscode.Uri; originalUri?: vscode.Uri }[] } };
type GitApi = { getRepository(uri: vscode.Uri): GitRepository | null; toGitUri(uri: vscode.Uri, ref: string): vscode.Uri };

export function activate(context: vscode.ExtensionContext) {
  const sessions = new Set<Session>();
  const applying = new Set<string>();
  const queues = new Map<string, Promise<void>>();
  type ComparisonPair = { original: string; modified: string; originalColumn: vscode.ViewColumn; modifiedColumn: vscode.ViewColumn };
  const comparisonPairs: ComparisonPair[] = [];
  let openingComparison = false;
  let active: Session | undefined;
  let focused: Session | undefined;
  const current = (uri?: vscode.Uri) => uri ?? (active?.panel.active ? active.document.uri : vscode.window.activeTextEditor?.document.uri) ?? active?.document.uri;
  const lineEnding = (document: vscode.TextDocument) => document.eol === vscode.EndOfLine.CRLF ? '\r\n' as const : '\n' as const;
  const readOnly = (document: vscode.TextDocument) => !['file', 'untitled'].includes(document.uri.scheme);
  const gitRef = (uri: vscode.Uri): string | undefined => {
    if (uri.scheme !== 'git') return;
    try { return JSON.parse(uri.query).ref; } catch { return; }
  };
  // Native browser inputs use LF. Keep that UI representation stable while
  // applying minimal edits and exporting with the TextDocument's actual EOL.
  const snapshot = (document: vscode.TextDocument): SyncSnapshot => ({ text: document.getText().replace(/\r\n/g, '\n'), version: document.version, dirty: document.isDirty, eol: lineEnding(document) });
  // Legacy custom diffs wrap two webviews in a DiffEditorInput, which does not
  // route native Undo to their TextDocument. Use ordinary custom text editors
  // in adjacent groups, retaining the real host history and both ParsiWord UIs.
  const openComparison = async (original: vscode.Uri, modified: vscode.Uri, column = vscode.window.tabGroups.activeTabGroup.viewColumn, legacyTab?: vscode.Tab) => {
    if (openingComparison) return;
    openingComparison = true;
    try {
      const known = comparisonPairs.find(pair => pair.original === original.toString() && pair.modified === modified.toString()
        && sessions.size && [...sessions].some(session => session.panel.visible && session.document.uri.toString() === pair.original && session.panel.viewColumn === pair.originalColumn));
      await vscode.commands.executeCommand('vscode.openWith', original, viewType, { viewColumn: known?.originalColumn ?? column, preview: false });
      const originalColumn = vscode.window.tabGroups.activeTabGroup.viewColumn;
      await vscode.commands.executeCommand('vscode.openWith', modified, viewType, { viewColumn: known?.modifiedColumn ?? vscode.ViewColumn.Beside, preview: false });
      const modifiedColumn = vscode.window.tabGroups.activeTabGroup.viewColumn;
      comparisonPairs.push({ original: original.toString(), modified: modified.toString(), originalColumn, modifiedColumn });
      if (legacyTab) await vscode.window.tabGroups.close(legacyTab, true);
    } finally { openingComparison = false; scheduleComparisons(); }
  };
  let comparisonTimer: ReturnType<typeof setTimeout> | undefined;
  const refreshComparisons = () => {
    const visible = [...sessions].filter(session => session.panel.visible);
    if (!openingComparison) {
      for (const modified of visible) {
        const original = visible.find(other => other !== modified && other.panel.viewColumn === modified.panel.viewColumn
          && other.document.uri.scheme === 'git' && (modified.document.uri.scheme === 'file' || (gitRef(other.document.uri) === 'HEAD' && gitRef(modified.document.uri) === '~')));
        if (original) {
          const tab = vscode.window.tabGroups.all.find(group => group.viewColumn === modified.panel.viewColumn)?.activeTab;
          void openComparison(original.document.uri, modified.document.uri, modified.panel.viewColumn, tab).catch(error => { void vscode.window.showErrorMessage(`ParsiWord: ${String(error)}`); });
          return;
        }
      }
    }
    for (const session of sessions) {
      const key = session.document.uri.toString();
      const pair = [...comparisonPairs].reverse().find(pair => (pair.original === key && pair.originalColumn === session.panel.viewColumn) || (pair.modified === key && pair.modifiedColumn === session.panel.viewColumn));
      const isOriginal = pair?.original === key && pair.originalColumn === session.panel.viewColumn;
      const peer = session.panel.visible && pair ? visible.find(other => other !== session
        && other.document.uri.toString() === (isOriginal ? pair.modified : pair.original)
        && other.panel.viewColumn === (isOriginal ? pair.modifiedColumn : pair.originalColumn)) : undefined;
      const ref = gitRef(session.document.uri), peerRef = peer && gitRef(peer.document.uri);
      let side: 'original' | 'modified' | undefined;
      if (peer) {
        if (session.document.uri.scheme === 'git' && peer.document.uri.scheme === 'file') side = 'original';
        else if (session.document.uri.scheme === 'file' && peer.document.uri.scheme === 'git') side = 'modified';
        else if (ref === 'HEAD' && peerRef === '~') side = 'original';
        else if (ref === '~' && peerRef === 'HEAD') side = 'modified';
      }
      const next = side && peer ? { side, other: snapshot(peer.document).text, staged: session.document.uri.scheme === 'git' && peer.document.uri.scheme === 'git' } satisfies DocumentComparison : undefined;
      session.peer = next ? peer : undefined;
      if (JSON.stringify(next) !== JSON.stringify(session.comparison)) {
        session.comparison = next;
        if (session.ready) void session.panel.webview.postMessage({ type: 'comparison', comparison: next ?? null });
      }
    }
  };
  const scheduleComparisons = () => { clearTimeout(comparisonTimer); comparisonTimer = setTimeout(refreshComparisons, 60); };
  const publish = (document: vscode.TextDocument, extra: Partial<SyncSnapshot> = {}) => {
    for (const session of sessions) if (session.document === document && session.ready) {
      void session.panel.webview.postMessage({ type: 'document', snapshot: { ...snapshot(document), ...extra } });
    }
    scheduleComparisons();
  };
  const enqueue = (document: vscode.TextDocument, operation: () => Promise<void>) => {
    const key = document.uri.toString();
    const task = (queues.get(key) ?? Promise.resolve()).then(operation);
    const safe = task.catch(error => { void vscode.window.showErrorMessage(`ParsiWord: ${String(error)}`); });
    queues.set(key, safe);
    void safe.finally(() => { if (queues.get(key) === safe) queues.delete(key); });
    return task;
  };
  const applyText = async (document: vscode.TextDocument, next: string) => {
    if (!canApplyMarkdown(document.getText(), next) && next !== document.getText()) throw new ParsiWordError('FILE_TOO_LARGE');
    const edit = minimalChange(document.getText(), next);
    if (!edit) return;
    const change = new vscode.WorkspaceEdit();
    change.replace(document.uri, new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end)), edit.text);
    applying.add(document.uri.toString());
    try { if (!await vscode.workspace.applyEdit(change)) throw Error('The document is read-only or could not be updated.'); }
    finally { applying.delete(document.uri.toString()); }
  };
  const recover = async (text: string) => {
    const recovered = await vscode.workspace.openTextDocument({ language: 'markdown', content: text });
    await vscode.window.showTextDocument(recovered, vscode.ViewColumn.Beside);
    void vscode.window.showWarningMessage('ParsiWord preserved your concurrent edit in this unsaved recovery document. Review it before merging.');
  };
  const preserve = async (session: Session, disposing = false) => {
    await enqueue(session.document, async () => {
      if (!session.journal.pending) return;
      const text = session.journal.draft;
      try {
        const current = snapshot(session.document).text;
        // Closing/reopening a dirty custom editor may first revert its native
        // model. Replaying only the pending patch there would lose its applied
        // predecessor, so recover the complete local draft instead.
        if (disposing && current !== session.journal.baseline) throw new ParsiWordError('DOCUMENT_CONFLICT');
        const next = session.journal.against(current).replace(/\r\n|\n/g, lineEnding(session.document));
        await applyText(session.document, next);
        session.journal.clear();
        publish(session.document);
      } catch { session.journal.clear(); await recover(text); }
    });
  };
  const preserveAll = async (document: vscode.TextDocument) => {
    for (const session of sessions) if (session.document === document) await preserve(session);
    await queues.get(document.uri.toString());
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
    let resource = current(uri);
    if (resource?.scheme === 'git') {
      try { resource = vscode.Uri.file(JSON.parse(resource.query).path); } catch { /* Invalid revision URI is rejected below. */ }
    }
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
    await openComparison(left, right);
    scheduleComparisons();
  };
  const command = async (name: string, document: vscode.TextDocument, panel: vscode.WebviewPanel) => {
    if (name === 'source') return source(document.uri);
    if (name === 'preview') return nativePreview(document.uri);
    if (name === 'diff' || name === 'stagedDiff') return gitDiff(name === 'stagedDiff', document.uri);
    if (name === 'new') { const next = await vscode.workspace.openTextDocument({ language: 'markdown', content: '' }); return open(next.uri); }
    if (readOnly(document)) return;
    if (name === 'save') { await preserveAll(document); if (!await document.save()) throw new ParsiWordError('DOCUMENT_SAVE_CANCELLED'); return; }
    if (name === 'undo' || name === 'redo') {
      await preserveAll(document);
      // A revision comparison has two independent editor groups. Route the
      // host command through the requesting editor, even after focus changes.
      panel.reveal(panel.viewColumn, false);
      await vscode.commands.executeCommand(name);
    }
  };

  const provider = (viewMode: DocumentViewMode): vscode.CustomTextEditorProvider => ({
    async resolveCustomTextEditor(document, panel) {
      await preserveAll(document);
      if (document.getText().length > MAX_MARKDOWN_LENGTH) {
        void vscode.window.showInformationMessage('This document exceeds ParsiWord’s editing limit. Opening the native Markdown editor.');
        await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
        return;
      }
      const session: Session = { document, panel, ready: false, client: randomBytes(12).toString('hex'), journal: new PendingDocument() };
      sessions.add(session); active = session;
      scheduleComparisons();
      panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist/webview')] };
      const assetRoot = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist/webview')).toString();
      const manifest = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'dist/webview/.vite/manifest.json'))).toString());
      const entry = manifest['index.html'];
      const nonce = randomBytes(24).toString('base64');
      const escape = (value: string) => value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
      const csp = `default-src 'none'; img-src ${panel.webview.cspSource} data: blob:; font-src ${panel.webview.cspSource} blob:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src ${panel.webview.cspSource} 'nonce-${nonce}'; connect-src ${panel.webview.cspSource}; worker-src ${panel.webview.cspSource} blob:;`;
      panel.webview.html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${escape(csp)}"><meta name="viewport" content="width=device-width, initial-scale=1.0">${(entry.css ?? []).map((file: string) => `<link rel="stylesheet" href="${escape(assetRoot + '/' + file)}">`).join('')}<title>ParsiWord</title></head><body><div id="root" role="status">Loading ParsiWord…</div><script nonce="${nonce}" type="module" src="${escape(assetRoot + '/' + entry.file)}"></script></body></html>`;
      const disposables = [
        panel.onDidChangeViewState(() => { if (panel.active) active = session; scheduleComparisons(); }),
        panel.webview.onDidReceiveMessage(async message => {
          if (!isClientMessage(message)) {
            if (isRecord(message) && Number.isSafeInteger(message.id)) {
              await panel.webview.postMessage({ type: 'response', id: message.id, errorCode: 'INVALID_HOST_REQUEST' });
            } else if (isRecord(message) && (message.type === 'edit' || message.type === 'draft') && isRecord(message.edit) && Number.isSafeInteger(message.edit.id)) {
              await panel.webview.postMessage({ type: 'document', snapshot: { ...snapshot(document), ack: message.edit.id, client: session.client, rejected: true } });
            } else {
              await panel.webview.postMessage({ type: 'document', snapshot: { ...snapshot(document), client: session.client, rejected: true } });
            }
            return;
          }
          if (message.type === 'focus') {
            if (message.focused) focused = session;
            else if (focused === session) focused = undefined;
            return;
          }
          if (message.type === 'ready') {
            session.ready = true;
            const config = vscode.workspace.getConfiguration('parsiword', document.uri);
            const defaults = {
              title: basename(document.uri.path).replace(/\.(md|markdown|mdown|mkd)$/i, '').slice(0,90),
              direction: config.get('direction', 'auto'), fontSize: config.get('fontSize', 12),
              fontFamily: config.get('fontFamily', 'Vazirmatn'), alignmentOnly: false,
            };
            const settings = normalizeSettings(context.workspaceState.get(`settings:${document.uri.toString()}`), normalizeSettings(defaults));
            await panel.webview.postMessage({ type: 'init', snapshot: snapshot(document), client: session.client, settings, assetRoot,
              locale: context.globalState.get<string>('locale', config.get<string>('language', 'fa')) === 'en' ? 'en' : 'fa', version: context.extension.packageJSON.version, viewMode,
              readOnly: readOnly(document), comparison: session.comparison ?? null });
            scheduleComparisons();
            return;
          }
          if (message.type === 'comparisonNavigate') {
            for (const target of [session, session.peer]) if (target?.ready) void target.panel.webview.postMessage({ type: 'comparisonNavigate', index: message.index });
            return;
          }
          if (message.type === 'edit' || message.type === 'draft') {
            const { id, base, text } = message.edit;
            try { session.journal.record(message.edit); }
            catch {
              await panel.webview.postMessage({ type: 'document', snapshot: { ...snapshot(document), ack: id, client: session.client, rejected: true } });
              return;
            }
            if (message.type === 'draft') return;
            void enqueue(document, async () => {
              try {
                if (readOnly(document)) throw Error('This revision is read-only.');
                const canonical = (value: string) => value.replace(/\r\n|\n/g, lineEnding(document));
                const next = rebaseText(canonical(base), canonical(text), document.getText());
                await applyText(document, next);
                session.journal.applied(message.edit);
                publish(document, { ack: id, client: session.client });
              } catch {
                await panel.webview.postMessage({ type: 'document', snapshot: { ...snapshot(document), ack: id, client: session.client, rejected: true } });
              }
            });
            return;
          }
          if (message.type === 'pending') {
            if (!session.journal.stage(message.pending)) {
              session.journal.clear();
              await panel.webview.postMessage({ type: 'document', snapshot: { ...snapshot(document), client: session.client, rejected: true } });
            }
            return;
          }
          if (message.type === 'settings') { await context.workspaceState.update(`settings:${document.uri.toString()}`, message.settings); return; }
          if (message.type === 'locale' && ['fa','en'].includes(message.locale)) { await context.globalState.update('locale', message.locale); return; }
          if (message.type !== 'request' || !Number.isSafeInteger(message.id)) return;
          try {
            let result: unknown;
            const args = message.args ?? {};
            if (message.method === 'command') await command(String(args.name), document, panel);
            else if (message.method === 'open') {
              const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Markdown: ['md','markdown','mdown','mkd','txt'] } });
              if (files?.[0]) await open(files[0]);
              result = null;
            } else if (message.method === 'saveBytes') {
              const format = String(args.extension);
              if (!['md','docx','pdf'].includes(format) || !Array.isArray(args.bytes) || args.bytes.length > 64 * 1024 * 1024 || !args.bytes.every((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 255)) throw new ParsiWordError('INVALID_HOST_REQUEST');
              const filename = basename(String(args.filename)).replace(/[<>:"/\\|?*]/g, '_');
              const defaultUri = document.uri.scheme === 'file' ? vscode.Uri.file(join(dirname(document.uri.fsPath), filename)) : undefined;
              const target = await vscode.window.showSaveDialog({ defaultUri, filters: { [format.toUpperCase()]: [format] } });
              if (target?.toString() === document.uri.toString() && format === 'md') {
                await queues.get(document.uri.toString());
                const text = new TextDecoder().decode(Uint8Array.from(args.bytes));
                if (text !== document.getText()) throw new ParsiWordError('DOCUMENT_CHANGED_DURING_SAVE');
                result = await document.save();
              } else if (target) await vscode.workspace.fs.writeFile(target, Uint8Array.from(args.bytes));
              else result = false;
              if (result === undefined) result = !!target;
            } else if (message.method === 'font') {
              const url = new URL(String(args.url));
              if (url.protocol !== 'https:' || !['fonts.gstatic.com','fonts.googleapis.com','fonts.google.com'].includes(url.hostname) || url.username || url.password || url.port) throw new ParsiWordError('INVALID_HOST_REQUEST');
              const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'ParsiWord VSCode' } });
              if (!response.ok || Number(response.headers.get('content-length') || 0) > 32 * 1024 * 1024) throw new ParsiWordError('FONT_NETWORK');
              const bytes = new Uint8Array(await response.arrayBuffer());
              if (bytes.length > 32 * 1024 * 1024) throw new ParsiWordError('FONT_TOO_LARGE');
              result = Array.from(bytes);
            } else if (message.method === 'recover' && typeof args.text === 'string') {
              session.journal.clear();
              await recover(args.text);
            } else throw new ParsiWordError('INVALID_HOST_REQUEST');
            await panel.webview.postMessage({ type: 'response', id: message.id, result });
          } catch (error) {
            await panel.webview.postMessage({ type: 'response', id: message.id, errorCode: getErrorCode(error) ?? 'HOST_REQUEST_FAILED' });
          }
        }),
      ];
      panel.onDidDispose(() => { disposables.forEach(item => item.dispose()); void preserve(session, true); sessions.delete(session); if (active === session) active = undefined; scheduleComparisons(); });
    },
  });
  context.subscriptions.push(
    { dispose: () => clearTimeout(comparisonTimer) },
    ...(['combined', 'source', 'rendered'] as const).map(mode => vscode.window.registerCustomEditorProvider(mode === 'combined' ? viewType : `${viewType}.${mode}`, provider(mode), { supportsMultipleEditorsPerDocument: true, webviewOptions: { retainContextWhenHidden: true } })),
    vscode.workspace.onWillSaveTextDocument(event => { event.waitUntil(preserveAll(event.document).then(() => [])); }),
    vscode.workspace.onDidChangeTextDocument(event => { if (!applying.has(event.document.uri.toString())) publish(event.document); }),
    vscode.workspace.onDidSaveTextDocument(document => publish(document)),
    vscode.commands.registerCommand('parsiword.open', open),
    vscode.commands.registerCommand('parsiword.source', source),
    vscode.commands.registerCommand('parsiword.nativePreview', nativePreview),
    vscode.commands.registerCommand('parsiword.gitDiff', (uri?: vscode.Uri) => gitDiff(false, uri)),
    vscode.commands.registerCommand('parsiword.stagedDiff', (uri?: vscode.Uri) => gitDiff(true, uri)),
    ...(['find', 'replace', 'goToLine', 'findNext', 'findPrevious'] as const).map(action => vscode.commands.registerCommand(`parsiword.${action}`, () => {
      const target = focused && sessions.has(focused) && focused.panel.visible && focused.ready ? focused : [...sessions].find(session => session.panel.active && session.ready);
      if (target) void target.panel.webview.postMessage({ type: 'editorAction', action });
    })),
  );
  // Public diagnostics are read-only. Tests exercise the same document provider
  // and commands as the installed extension, without a production edit backdoor.
  return { getOpenDocuments: () => [...sessions].map(session => ({ uri: session.document.uri.toString(), ready: session.ready, active: session.panel.active, visible: session.panel.visible, column: session.panel.viewColumn, comparison: session.comparison?.side })) };
}
