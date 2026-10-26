import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect, type Browser, type Frame } from '@playwright/test';
import JSZip from 'jszip';
import { testGitDiff } from './git-diff';
import { testShortcuts } from './shortcuts';
import { testImageExports } from './image-export';

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
async function until<T>(read: () => T | PromiseLike<T>, predicate: (value: T) => boolean, label: string): Promise<T> {
  for (let i=0;i<100;i++) { const value = await read(); if (predicate(value)) return value; await wait(200); }
  throw Error(`Timed out: ${label}`);
}
export async function run() {
  const artifact = process.env.PARSIWORD_TEST_ARTIFACT!;
  const themeWitness = process.env.PARSIWORD_TEST_THEME_WITNESS;
  const results: string[] = [];
  const exports: Record<string,string> = {};
  let imageExports: Record<string,string> | undefined;
  const themes: unknown[] = [];
  const viewState: unknown[] = [];
  const narrowViews: unknown[] = [];
  let browser: Browser | undefined;
  const record = (text: string) => { results.push(text); console.log(`PASS ${text}`); };
  try {
    const folder = vscode.workspace.workspaceFolders![0].uri;
    const uri = vscode.Uri.joinPath(folder,'sample.md');
    const initial = await vscode.workspace.fs.readFile(uri).then(bytes => new TextDecoder().decode(bytes));
    const extension = vscode.extensions.getExtension<{getOpenDocuments(): {uri: string;ready: boolean;visible: boolean;comparison?: string}[]}>('SoroushJM.parsiword-vscode')!;
    assert.ok(extension, 'Extension is discovered');
    // Test-only transport interception, installed before the real provider.
    // This delays only delivery, leaving the native document queue unblocked.
    let delayAck = false, ackHeld = false;
    const channels: { document: vscode.TextDocument; panel: vscode.WebviewPanel; viewType: string; messages: unknown[]; dispatch?: (message: unknown) => Promise<void> }[] = [];
    type RegisterText = (viewType: string, provider: vscode.CustomTextEditorProvider, options?: { webviewOptions?: vscode.WebviewPanelOptions; supportsMultipleEditorsPerDocument?: boolean }) => vscode.Disposable;
    const windowApi = vscode.window as unknown as { registerCustomEditorProvider: RegisterText };
    const registerOriginal = windowApi.registerCustomEditorProvider;
    windowApi.registerCustomEditorProvider = (viewType, provider, options) => registerOriginal(viewType, {
      ...provider,
      resolveCustomTextEditor: (textDocument, panel, token) => {
        const channel = { document: textDocument, panel, viewType, messages: [] as unknown[], dispatch: undefined as ((message: unknown) => Promise<void>) | undefined };
        channels.push(channel);
        const webview = panel.webview as { postMessage: vscode.Webview['postMessage']; onDidReceiveMessage: vscode.Event<unknown> };
        const postOriginal = webview.postMessage.bind(panel.webview);
        const receiveOriginal = webview.onDidReceiveMessage;
        webview.onDidReceiveMessage = (listener, thisArgs, disposables) => {
          channel.dispatch = async message => { await listener.call(thisArgs, message); };
          return receiveOriginal(listener, thisArgs, disposables);
        };
        webview.postMessage = message => {
          channel.messages.push(message);
          if (delayAck && message?.type === 'document' && message.snapshot?.ack) {
            delayAck = false; ackHeld = true;
            return new Promise(resolve => { setTimeout(() => { void postOriginal(message).then(resolve); }, 1500); });
          }
          return postOriginal(message);
        };
        return provider.resolveCustomTextEditor(textDocument, panel, token);
      },
    }, options);
    const api = await extension.activate();
    windowApi.registerCustomEditorProvider = registerOriginal;
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.PARSIWORD_TEST_CDP}`);
    const pages = browser.contexts().flatMap(context=>context.pages());
    if (process.env.PARSIWORD_TEST_FOCUS === 'diff') {
      await testGitDiff(browser, api, artifact, record);
      await writeFile(join(artifact, 'results.json'), JSON.stringify({ version: vscode.version, results }, null, 2));
      return;
    }
    if (process.env.PARSIWORD_TEST_FOCUS === 'shortcuts') {
      await testShortcuts(browser, artifact, record);
      await writeFile(join(artifact, 'results.json'), JSON.stringify({ version: vscode.version, results }, null, 2));
      return;
    }
    if (process.env.PARSIWORD_TEST_FOCUS === 'image-export') {
      imageExports = await testImageExports(browser, api, artifact, record);
      await writeFile(join(artifact, 'results.json'), JSON.stringify({ version: vscode.version, results, imageExports }, null, 2));
      return;
    }
    await vscode.commands.executeCommand('vscode.open',uri);
    await until(() => api.getOpenDocuments(), items => items.some(item => item.uri===uri.toString() && item.ready),'custom editor webview ready');
    assert.ok(vscode.window.tabGroups.all.flatMap(group=>group.tabs).some(tab=>tab.input instanceof vscode.TabInputCustom && tab.input.viewType==='parsiword.markdown'));
    record('Markdown files open in the default ParsiWord custom text editor');
    const frame = await until(async () => {
      for (const page of pages) for (const candidate of page.frames()) if (await candidate.locator('#markdown-source').count()) return candidate;
      return undefined;
    }, value => !!value, 'React workspace rendered') as Frame;
    const page = frame.page();
    const errors: string[]=[];
    page.on('pageerror',error=>errors.push(String(error)));
    await expect(frame.locator('#markdown-source')).toHaveValue(initial);
    await expect(frame.locator('.document-name, .document-tools, #document-title')).toHaveCount(0);
    await expect(frame.locator('.document-host-controls')).toBeVisible();
    await expect(frame.locator('.katex').first()).toBeVisible();
    await expect(frame.locator('.mermaid-diagram svg').first()).toBeVisible({timeout:30000});
    await expect(frame.locator('.rich-document table')).toBeVisible();
    record('The real VS Code webview renders Persian, mixed text, LaTeX, Mermaid and tables under its CSP');
    if (themeWitness) {
      assert.match(themeWitness, /^[a-z0-9-]+$/);
      await vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default High Contrast Light', vscode.ConfigurationTarget.Global);
      await expect(frame.locator('body')).toHaveClass(/\bvscode-high-contrast-light\b/);
      await expect(frame.locator('.markdown-source-editor')).toHaveAttribute('data-highlighted', 'true');
      const witness = await frame.evaluate(() => {
        const surface = globalThis.document.querySelector('.markdown-source-editor')!;
        const background = getComputedStyle(surface).backgroundColor;
        const token = (property: string) => { const probe = globalThis.document.createElement('span'); probe.style.color = `var(${property})`; globalThis.document.body.append(probe); const value = getComputedStyle(probe).color; probe.remove(); return value; };
        const contrast = (foreground: string) => {
          const luminance = (value: string) => { const channels = value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => { const x = value / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722; };
          const a = luminance(foreground), b = luminance(background); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        };
        return { bodyClass: globalThis.document.body.className, background, editorForeground: token('--vscode-editor-foreground'), preformatForeground: token('--vscode-textPreformat-foreground'),
          source: globalThis.document.querySelector<HTMLTextAreaElement>('#markdown-source')!.value,
          highlightedText: globalThis.document.querySelector('.markdown-source-highlight')!.textContent,
          tokens: [...globalThis.document.querySelectorAll<HTMLElement>('.markdown-source-highlight [data-md-token]')].map(element => { const color = getComputedStyle(element).color; return { kind: element.dataset.mdToken, text: element.textContent, color, contrast: contrast(color) }; }) };
      });
      await frame.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: join(artifact, `syntax-${themeWitness}.png`) });
      await writeFile(join(artifact, `syntax-${themeWitness}.json`), JSON.stringify(witness, null, 2));
      assert.equal(witness.source, initial); assert.equal(witness.highlightedText, initial);
      if (themeWitness.endsWith('after')) {
        const relevant = witness.tokens.filter(token => ['math', 'code', 'strong', 'emphasis'].includes(token.kind!));
        assert.ok(relevant.some(token => token.kind === 'math') && relevant.some(token => token.kind === 'code'), 'The witness must include real math and fenced code');
        for (const token of relevant) assert.ok(token.contrast >= 4.5, `HC Light ${token.kind} contrast ${token.contrast}: ${token.text}`);
      }
      record(`HC Light syntax witness ${themeWitness} captured with complete unchanged source`);
      return;
    }
    const edited = initial + '\nویرایش منبع EXTENSION_SOURCE\n';
    await frame.locator('#markdown-source').fill(edited);
    let document = await vscode.workspace.openTextDocument(uri);
    await until(()=>document.getText(),text=>text===edited,'source edit reaches TextDocument');
    await until(()=>document.isDirty,value=>value,'document dirty state');
    record('Typing in the webview changes the native document and dirty state');
    const nativeEdit = new vscode.WorkspaceEdit();
    nativeEdit.insert(uri,new vscode.Position(0,0),'<!-- native edit -->\n');
    await vscode.workspace.applyEdit(nativeEdit);
    await expect(frame.locator('#markdown-source')).toHaveValue('<!-- native edit -->\n'+edited);
    record('Native WorkspaceEdit changes flow back to the shared editor without an echo');
    await frame.getByRole('button',{name:'Undo',exact:true}).click();
    await until(()=>document.getText(),text=>text===edited,'native undo from webview');
    await expect(frame.locator('#markdown-source')).toHaveValue(edited);
    await frame.getByRole('button',{name:'Redo',exact:true}).click();
    await until(()=>document.getText(),text=>text.startsWith('<!-- native edit -->'),'native redo from webview');
    record('Undo and Redo operate on VS Code’s shared document history');
    await frame.locator('.rich-document').press('Control+End');
    await frame.locator('.rich-document').press('Enter');
    await frame.locator('.rich-document').pressSequentially('RICHEDIT فارسی');
    await until(()=>document.getText(),text=>text.includes('RICHEDIT فارسی'),'rich editing reaches TextDocument');
    record('Editable rich preview writes back to the same Markdown file');
    await frame.getByRole('button',{name:'ذخیرهٔ سند',exact:true}).click();
    await until(()=>document.isDirty,dirty=>!dirty,'native save');
    assert.equal(await readFile(uri.fsPath,'utf8'),document.getText());
    record('Save writes the current TextDocument through VS Code');
    // Delay a real host acknowledgement at the transport boundary. The second
    // local edit must be saved even while the first acknowledgement is held.
    const burstBase = document.getText();
    delayAck = true; ackHeld = false;
    await frame.locator('#markdown-source').fill(burstBase + '\nDELAYED_ACK_FIRST\n');
    await until(() => ackHeld, held => held, 'host acknowledgement delay');
    await frame.locator('#markdown-source').fill(burstBase + '\nDELAYED_ACK_FIRST\nDELAYED_ACK_TAIL\n');
    assert.ok(!document.getText().includes('DELAYED_ACK_TAIL'), 'Delayed-ack fixture must retain the second edit in the webview');
    let savedBurst: string | undefined;
    const saveObserver = vscode.workspace.onDidSaveTextDocument(saved => { if (saved === document) savedBurst = saved.getText(); });
    await frame.getByRole('button',{name:'ذخیرهٔ سند',exact:true}).click();
    await until(() => savedBurst, text => text !== undefined, 'save after delayed acknowledgement');
    saveObserver.dispose();
    assert.ok(savedBurst?.includes('DELAYED_ACK_TAIL'), 'Save omitted the coalesced local tail while its predecessor acknowledgement was delayed');
    assert.ok((await readFile(uri.fsPath, 'utf8')).includes('DELAYED_ACK_TAIL'), 'Saved bytes omitted the coalesced local tail');
    record('Save includes input typed while a real host acknowledgement is delayed');
    const initialChannel = channels.find(channel => channel.document === document && channel.viewType === 'parsiword.markdown')!;
    await initialChannel.dispatch!({ type: 'request', id: 900_000, method: 'unsupported', args: {} });
    assert.ok(initialChannel.messages.some(message => (message as { id?: number; errorCode?: string }).id === 900_000 && (message as { errorCode?: string }).errorCode === 'INVALID_HOST_REQUEST'));
    record('Malformed host requests receive an explicit validated error response');
    const nativeSaveBase = document.getText();
    delayAck = true; ackHeld = false;
    await frame.locator('#markdown-source').fill(nativeSaveBase + 'NATIVE_SAVE_FIRST\n');
    await until(() => ackHeld, held => held, 'native save acknowledgement held');
    await frame.locator('#markdown-source').fill(nativeSaveBase + 'NATIVE_SAVE_FIRST\nNATIVE_SAVE_TAIL\n');
    await wait(100);
    assert.ok(await document.save(), 'Native Save should succeed');
    assert.ok((await readFile(uri.fsPath, 'utf8')).includes('NATIVE_SAVE_TAIL'), 'Native Save omitted the pending tail');
    await expect(frame.locator('#markdown-source')).toHaveValue(document.getText());
    await wait(1600); // Finish the held ack before starting independent cases.
    record('Native File Save also preserves input waiting behind a delayed acknowledgement');
    for (const [name, bodyClass, resolved] of [
      ['Default Light Modern', 'vscode-light', 'light'],
      ['Default Dark Modern', 'vscode-dark', 'dark'],
      ['Default High Contrast', 'vscode-high-contrast', 'dark'],
      ['Default High Contrast Light', 'vscode-high-contrast-light', 'light'],
    ]) {
      await vscode.workspace.getConfiguration('workbench').update('colorTheme', name, vscode.ConfigurationTarget.Global);
      await expect(frame.locator('body')).toHaveClass(new RegExp(`\\b${bodyClass}\\b`));
      await expect(frame.locator('body')).toHaveClass(/\bvscode-shell\b/);
      themes.push({ name, actualBodyClass: await frame.locator('body').getAttribute('class') });
      await expect(frame.locator('html')).toHaveAttribute('data-display-theme', resolved);
      const colors = await frame.evaluate(() => {
        const color = (selector: string, property: string) => getComputedStyle(globalThis.document.querySelector(selector)!).getPropertyValue(property);
        const token = (property: string) => {
          const probe = globalThis.document.createElement('span'); probe.style.color = `var(${property})`; globalThis.document.body.append(probe);
          const value = getComputedStyle(probe).color; probe.remove(); return value;
        };
        const contrast = (foreground: string, background: string) => {
          const luminance = (value: string) => {
            const channels = value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => { const x = value / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; });
            return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
          };
          const a = luminance(foreground), b = luminance(background); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        };
        const sourceBackground = color('.markdown-source-editor', 'background-color'), richBackground = color('.preview-pane', 'background-color');
        const sourceForeground = color('.markdown-source-highlight', 'color'), richForeground = color('.rich-document p', 'color');
        const link = color('.rich-document a', 'color');
        const math = color('.rich-document .katex', 'color'), paneIcon = color('.preview-pane .pane-heading h2 svg', 'color');
        const paneBackground = color('.preview-pane .pane-heading', 'background-color');
        const fontProbe = globalThis.document.createElement('span'); fontProbe.style.fontFamily = 'var(--vscode-font-family)'; fontProbe.style.fontSize = 'var(--vscode-font-size)'; globalThis.document.body.append(fontProbe);
        const hostFont = getComputedStyle(fontProbe).fontFamily, hostFontSize = getComputedStyle(fontProbe).fontSize; fontProbe.remove();
        return { sourceBackground, richBackground, sourceForeground, richForeground, link, math, paneIcon, paneBackground,
          uiFont: color('.app-header', 'font-family'), uiFontSize: color('.app-header', 'font-size'), hostFont, hostFontSize,
          sourceFont: color('#markdown-source', 'font-family'), sourceFontSize: color('#markdown-source', 'font-size'), richFont: color('.rich-document', 'font-family'),
          sourceSyntax: [...globalThis.document.querySelectorAll<HTMLElement>('.markdown-source-highlight [data-md-token="math"], .markdown-source-highlight [data-md-token="code"]')].map(element => ({ kind: element.dataset.mdToken, color: getComputedStyle(element).color, contrast: contrast(getComputedStyle(element).color, sourceBackground) })),
          panelRadius: color('.document-panel', 'border-radius'), panelShadow: color('.document-panel', 'box-shadow'), nativeControlHeight: color('.host-actions button', 'height'),
          caret: color('#markdown-source', 'caret-color'), border: color('.document-panel', 'border-color'),
          focus: token('--ring'), hostFocus: token('--vscode-focusBorder'), hostBackground: token('--vscode-editor-background'),
          hostLink: token('--vscode-textLink-foreground'), hostCaret: token('--vscode-editorCursor-foreground'),
          sourceContrast: contrast(sourceForeground, sourceBackground), richContrast: contrast(richForeground, richBackground), linkContrast: contrast(link, richBackground), mathContrast: contrast(math, richBackground), paneIconContrast: contrast(paneIcon, paneBackground) };
      });
      assert.equal(colors.sourceBackground, colors.hostBackground); assert.equal(colors.richBackground, colors.hostBackground);
      assert.equal(colors.link, colors.hostLink); assert.equal(colors.caret, colors.hostCaret); assert.equal(colors.focus, colors.hostFocus);
      assert.ok(colors.sourceContrast >= 4.5, `${name} source text contrast ${colors.sourceContrast}`);
      assert.ok(colors.richContrast >= 4.5, `${name} rich text contrast ${colors.richContrast}`);
      assert.ok(colors.linkContrast >= 3, `${name} link contrast ${colors.linkContrast}`);
      assert.ok(colors.mathContrast >= 4.5, `${name} math contrast ${colors.mathContrast}`);
      assert.ok(colors.paneIconContrast >= 3, `${name} pane icon contrast ${colors.paneIconContrast}`);
      assert.ok(colors.sourceSyntax.some(token => token.kind === 'math') && colors.sourceSyntax.some(token => token.kind === 'code'), 'Theme fixture must contain source math and fenced code');
      for (const token of colors.sourceSyntax) assert.ok(token.contrast >= 4.5, `${name} source ${token.kind} contrast ${token.contrast}`);
      assert.equal(colors.uiFont, colors.hostFont); assert.equal(colors.uiFontSize, colors.hostFontSize);
      assert.equal(colors.panelRadius, '0px'); assert.equal(colors.panelShadow, 'none'); assert.equal(colors.nativeControlHeight, '26px');
      await frame.locator('#markdown-source').focus();
      const sourceFocus = await frame.locator('.markdown-source-editor').evaluate(element => ({ style: getComputedStyle(element).outlineStyle, color: getComputedStyle(element).outlineColor, width: getComputedStyle(element).outlineWidth }));
      assert.equal(sourceFocus.style, 'solid'); assert.equal(sourceFocus.color, colors.hostFocus);
      assert.ok(parseFloat(sourceFocus.width) >= .7 && parseFloat(sourceFocus.width) <= 1.2, `One-pixel focus outline may round at the native display scale: ${sourceFocus.width}`);
      themes.push({ name, bodyClass, resolved, ...colors, sourceFocus });
      await expect(frame.locator('#markdown-source')).toHaveValue(document.getText());
      await frame.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: join(artifact, `shell-${bodyClass}.png`) });
      await frame.locator('.rich-document .katex').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(artifact, `theme-${bodyClass}.png`) });
    }
    await vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Light Modern', vscode.ConfigurationTarget.Global);
    record('All four native VS Code themes retain the native shell, host UI fonts, flat panel and 26px controls, with measured text/math/icon contrast and effective source focus');
    await frame.getByRole('link',{name:'English',exact:true}).click();
    await expect(frame.getByRole('button',{name:'VS Code source',exact:true})).toBeVisible();
    assert.ok(document.getText().includes('RICHEDIT فارسی'));
    record('English/Persian switching preserves the edited document');
    await frame.getByRole('button',{name:'Export settings',exact:true}).click();
    await expect(frame.getByRole('dialog')).toBeVisible();
    await frame.getByRole('button',{name:'Choose export font',exact:true}).click();
    await frame.locator('#font-search').fill('Vazirmatn');
    await frame.getByRole('button',{name:'Choose font Vazirmatn',exact:true}).click();
    await frame.getByRole('button',{name:'Done',exact:true}).click();
    record('Export settings and the shared offline font picker work in the webview');
    const saveExport = async (extension: string, trigger: () => Promise<unknown>) => {
      const target=join(artifact,`export-${Date.now()}.${extension}`);
      await trigger();
      const input=page.locator('.quick-input-widget .quick-input-box input');
      await expect(input).toBeVisible({timeout:30000});
      await input.fill(target); await input.press('Enter');
      const bytes=await until(()=>readFile(target).catch(()=>Buffer.alloc(0)),value=>value.length>0,`${extension} export file`);
      await expect(input).toBeHidden();
      exports[extension]=target;
      return bytes;
    };
    const word=await saveExport('docx',()=>frame.getByRole('button',{name:'Save Word file',exact:true}).click());
    const zip=await JSZip.loadAsync(word);
    const xml=await zip.file('word/document.xml')!.async('string');
    assert.ok(xml.includes('SEARCHABLE_EXTENSION')); assert.ok(xml.includes('m:oMath'));
    assert.ok(Object.keys(zip.files).some(name=>name.startsWith('word/fonts/')));
    assert.ok(Object.keys(zip.files).some(name=>name.startsWith('word/media/')));
    record('Word export in VS Code contains editable text/math, embedded fonts and a Mermaid image');
    const more=()=>frame.getByRole('button',{name:'More export formats',exact:true}).click();
    const pdf=await saveExport('pdf',async()=>{await more();await frame.getByRole('menuitem',{name:'Save PDF file',exact:true}).click();});
    assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
    assert.ok(pdf.toString('latin1').includes('/ToUnicode'));
    record('PDF export in VS Code writes a PDF with text-to-Unicode mappings');
    const md=await saveExport('md',async()=>{await more();await frame.getByRole('menuitem',{name:'Save Markdown file',exact:true}).click();});
    assert.equal(md.toString('utf8'),document.getText());
    record('Markdown export preserves the exact current logical UTF-8 source');
    await page.bringToFront();
    await page.screenshot({path:join(artifact,'extension-workspace.png')});
    await frame.getByRole('button',{name:'VS Code source',exact:true}).click();
    await until(()=>vscode.window.activeTextEditor?.document.uri.toString(),value=>value===uri.toString(),'native source opens');
    const symbols = await until(()=>vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider',uri),items=>!!items?.length,'Markdown Outline');
    assert.ok(symbols.length>=1);
    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider',uri,100);
    assert.ok(links.some(link=>link.target && document.getText(link.range).includes('other.md')));
    record('Native source retains Markdown Outline and link navigation from the built-in extension');
    await page.screenshot({path:join(artifact,'native-source-beside.png')});
    await vscode.commands.executeCommand('parsiword.nativePreview',uri);
    record('The built-in Markdown preview command remains usable');
    await testShortcuts(browser, artifact, record);
    await testGitDiff(browser, api, artifact, record);
    imageExports = await testImageExports(browser, api, artifact, record);
    // Comparison checks close their editors. Reopen the native document and
    // refresh its webview references before continuing the multi-view checks.
    document = await vscode.workspace.openTextDocument(uri);
    assert.equal(errors.filter(error=>!error.includes('ResizeObserver')).length,0,errors.join('\n'));
    await vscode.commands.executeCommand('vscode.openWith',uri,'parsiword.markdown',{viewColumn:vscode.ViewColumn.One});
    await vscode.commands.executeCommand('vscode.openWith',uri,'parsiword.markdown',{viewColumn:vscode.ViewColumn.Beside});
    await until(()=>api.getOpenDocuments().filter(item=>item.uri===uri.toString()&&item.ready),items=>items.length>=2,'multiple custom editor views');
    const frames: Frame[]=[];
    await until(async()=>{
      frames.length=0;
      for(const p of browser!.contexts().flatMap(c=>c.pages())) for(const f of p.frames()) if(await f.locator('#markdown-source').count()) frames.push(f);
      return frames.length;
    },count=>count>=2,'two rendered shared editors');
    const multi=document.getText()+'\nMULTIVIEW_SYNC\n';
    if(await frames[0].locator('[data-mobile-view="edit"]').isVisible()) await frames[0].locator('[data-mobile-view="edit"]').click();
    await frames[0].locator('#markdown-source').fill(multi);
    await until(()=>document.getText(),text=>text===multi,'multi-view write');
    for(const f of frames) await expect(f.locator('#markdown-source')).toHaveValue(multi);
    await document.save();
    await vscode.workspace.fs.writeFile(uri,new TextEncoder().encode(multi+'\nDISK_CHANGE\n'));
    await until(()=>document.getText(),text=>text.includes('DISK_CHANGE'),'external file change');
    for(const f of frames) await expect(f.locator('#markdown-source')).toHaveValue(multi+'\nDISK_CHANGE\n');
    record('Two custom views stay synchronized with each other and external disk changes');
    const modeTitle = await frames[0].locator('.app-shell').getAttribute('data-document-title');
    const findMode = async (mode: string) => until(async () => {
      for (const p of browser!.contexts().flatMap(c => c.pages())) for (const f of p.frames()) {
        try { if (await f.locator(`.live-workspace[data-mode="${mode}"]`).count() && await f.locator('.app-shell').getAttribute('data-document-title') === modeTitle) return f; }
        catch { /* A replaced webview frame may detach during reopening. */ }
      }
      return undefined;
    }, value => !!value, `${mode} editor mode`) as Promise<Frame>;
    // Keep a native text view open while disposing the custom views so VS Code
    // retains the same dirty TextDocument without prompting to close the file.
    await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });
    for (const tab of vscode.window.tabGroups.all.flatMap(group => group.tabs)) if (tab.input instanceof vscode.TabInputCustom && tab.input.uri.toString() === uri.toString()) await vscode.window.tabGroups.close(tab);
    await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown.source', { viewColumn: vscode.ViewColumn.One });
    let modeFrame = await findMode('source');
    await expect(modeFrame.locator('.editing-pane')).toBeVisible(); await expect(modeFrame.locator('.preview-pane')).toBeHidden();
    await expect(modeFrame.locator('.mobile-view-switch')).toBeHidden();
    const sourceModeText = document.getText() + '\nSOURCE_MODE_EDIT\n';
    await modeFrame.locator('#markdown-source').fill(sourceModeText);
    await until(() => document.getText(), text => text === sourceModeText, 'source-only edit shares native document');
    const selection = await modeFrame.evaluate(() => { const input = globalThis.document.querySelector<HTMLTextAreaElement>('#markdown-source')!; input.setSelectionRange(7, 13); window.scrollTo(0, 120); return { start: input.selectionStart, end: input.selectionEnd, scrollY }; });
    await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One });
    await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown.source', { viewColumn: vscode.ViewColumn.One });
    modeFrame = await findMode('source');
    const retained = await modeFrame.evaluate(() => { const input = globalThis.document.querySelector<HTMLTextAreaElement>('#markdown-source')!; return { start: input.selectionStart, end: input.selectionEnd, scrollY }; });
    viewState.push({ kind: 'retained-source-view', before: selection, after: retained });
    record('The ParsiWord source-only entry keeps the RTL textarea and edits the shared native document');
    for (const endBeforeInput of [true, false]) {
      const before = document.getText(); let changes = 0;
      const observer = vscode.workspace.onDidChangeTextDocument(event => { if (event.document === document && event.contentChanges.length) changes++; });
      await modeFrame.evaluate(({ before, endBeforeInput }) => {
        const input = globalThis.document.querySelector<HTMLTextAreaElement>('#markdown-source')!;
        const set = (value: string, composing: boolean) => {
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value);
          input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', isComposing: composing }));
        };
        input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        set(before + 'س', true);
        if (endBeforeInput) input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'سلام' }));
        set(before + 'سلام', !endBeforeInput);
        if (!endBeforeInput) input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'سلام' }));
      }, { before, endBeforeInput });
      await until(() => document.getText(), text => text === before + 'سلام', 'composition final native text');
      observer.dispose(); assert.equal(changes, 1, 'An IME commit must create one native edit in either event order');
    }
    record('Both compositionend/input event orders commit final source text once to native history');
    const imeBase = document.getText();
    delayAck = true; ackHeld = false;
    await modeFrame.locator('#markdown-source').fill(imeBase + '\nIMEPREDECESSOR\n');
    await until(() => ackHeld, held => held, 'IME predecessor acknowledgement held');
    const imeLocalBase = imeBase + '\nIMEPREDECESSOR\n';
    const compositionInput = async (value: string, phase: 'start' | 'end') => modeFrame.evaluate(({ value, phase }) => {
      const input = globalThis.document.querySelector<HTMLTextAreaElement>('#markdown-source')!;
      if (phase === 'start') input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', isComposing: true }));
      if (phase === 'end') input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'سلام' }));
    }, { value, phase });
    await compositionInput(imeLocalBase + 'س', 'start');
    const duringIme = new vscode.WorkspaceEdit(); duringIme.insert(uri, new vscode.Position(0, 0), '<!-- during IME -->\n');
    await vscode.workspace.applyEdit(duringIme);
    await wait(1600); // Deliver the real held predecessor ack during composition.
    await expect(modeFrame.locator('#markdown-source')).toHaveValue(imeLocalBase + 'س');
    await compositionInput(imeLocalBase + 'سلام', 'end');
    const mergedIme = '<!-- during IME -->\n' + imeLocalBase + 'سلام';
    await until(() => document.getText(), text => text === mergedIme, 'IME tail rebased across own ack and native edit');
    await expect(modeFrame.locator('#markdown-source')).toHaveValue(mergedIme);
    record('A real delayed acknowledgement and disjoint native edit cannot overwrite active IME text');
    await compositionInput(mergedIme + 'LOCALIME', 'start');
    const overlapping = new vscode.WorkspaceEdit(); overlapping.insert(uri, document.positionAt(document.getText().length), 'REMOTEIME');
    await vscode.workspace.applyEdit(overlapping);
    await expect(modeFrame.locator('#markdown-source')).toHaveValue(mergedIme + 'LOCALIME');
    await compositionInput(mergedIme + 'LOCALIMEسلام', 'end');
    await until(() => vscode.workspace.textDocuments, docs => docs.some(doc => doc.isUntitled && doc.getText() === mergedIme + 'LOCALIMEسلام'), 'overlapping IME recovery document');
    assert.equal(document.getText(), mergedIme + 'REMOTEIME');
    record('Overlapping native input preserves completed IME text in an explicit recovery document');
    const reopenBase = document.getText();
    delayAck = true; ackHeld = false;
    await modeFrame.locator('#markdown-source').fill(reopenBase + 'REOPEN_FIRST\n');
    await until(() => ackHeld, held => held, 'reopen delayed acknowledgement');
    const recoveredTail = reopenBase + 'REOPEN_FIRST\nREOPEN_LOCAL_TAIL\n';
    await modeFrame.locator('#markdown-source').fill(recoveredTail);
    assert.ok(!document.getText().includes('REOPEN_LOCAL_TAIL'), 'Reopen fixture requires an unacknowledged tail');
    // postMessage is ordered; let the incremental pending patch reach the real
    // extension, then dispose its owner before the held acknowledgement arrives.
    await wait(100);
    viewState.push({ kind: 'before-source-disposal', value: await modeFrame.evaluate(() => { const input = globalThis.document.querySelector<HTMLTextAreaElement>('#markdown-source')!; input.setSelectionRange(7, 13); window.scrollTo(0, 120); return { start: input.selectionStart, end: input.selectionEnd, scrollY }; }) });
    for (const tab of vscode.window.tabGroups.all.flatMap(group => group.tabs)) if (tab.input instanceof vscode.TabInputCustom && tab.input.viewType === 'parsiword.markdown.source') await vscode.window.tabGroups.close(tab);
    await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown.rendered', { viewColumn: vscode.ViewColumn.One });
    modeFrame = await findMode('rendered');
    viewState.push({ kind: 'fresh-rendered-view', value: await modeFrame.evaluate(() => { const input = globalThis.document.querySelector<HTMLTextAreaElement>('#markdown-source')!, selection = getSelection(); return { sourceStart: input.selectionStart, sourceEnd: input.selectionEnd, scrollY, richAnchorOffset: selection?.anchorOffset, richAnchorText: selection?.anchorNode?.textContent?.slice(0, 80) }; }) });
    try { await until(() => document.getText() === recoveredTail || vscode.workspace.textDocuments.some(doc => doc.isUntitled && doc.getText() === recoveredTail), value => value, 'disposed view complete local draft preserved or recovered'); }
    catch (error) {
      await writeFile(join(artifact, 'reopen-debug.json'), JSON.stringify({ expected: recoveredTail, actual: document.getText(), channels: channels.filter(channel => channel.document === document).map(channel => ({ viewType: channel.viewType, messages: channel.messages.slice(-12) })) }, null, 2));
      throw error;
    }
    await expect(modeFrame.locator('.editing-pane')).toBeHidden(); await expect(modeFrame.locator('.preview-pane')).toBeVisible();
    await expect(modeFrame.locator('.rich-document')).toHaveAttribute('contenteditable', 'true');
    await modeFrame.locator('.rich-document').press('Control+End'); await modeFrame.locator('.rich-document').press('Enter');
    await modeFrame.locator('.rich-document').pressSequentially('RENDEREDMODEEDIT');
    await until(() => document.getText(), text => text.includes('RENDEREDMODEEDIT'), 'rendered-only rich edit shares native document');
    await modeFrame.locator('.host-actions').getByRole('button', { name: 'Undo', exact: true }).click();
    await until(() => document.getText(), text => !text.includes('RENDEREDMODEEDIT'), 'rendered-only native undo');
    await modeFrame.locator('.host-actions').getByRole('button', { name: 'Redo', exact: true }).click();
    await until(() => document.getText(), text => text.includes('RENDEREDMODEEDIT'), 'rendered-only native redo');
    record('Reopening after disposal preserves or explicitly recovers the complete unacknowledged draft; editable result-only shares native Undo/Redo history');
    const huge = new vscode.WorkspaceEdit(); huge.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), 'a'.repeat(500_020));
    await vscode.workspace.applyEdit(huge);
    await expect(modeFrame.locator('.live-workspace')).toHaveAttribute('data-mode', 'source');
    await expect(modeFrame.locator('#markdown-source')).toHaveValue('a'.repeat(500_020));
    await expect(modeFrame.locator('#markdown-source')).toBeVisible();
    await modeFrame.locator('#markdown-source').fill('a'.repeat(500_010));
    await until(() => document.getText().length, length => length === 500_010, 'oversized native document permits shrinking');
    await modeFrame.locator('#markdown-source').fill('# Recovered\n\nWithin the limit.\n');
    await until(() => document.getText(), text => text.startsWith('# Recovered'), 'native recovery returns below limit');
    await expect(modeFrame.locator('.live-workspace')).toHaveAttribute('data-mode', 'rendered');
    record('An externally oversized native document stays complete and permits source-only shrinking recovery');
    const untitled=await vscode.workspace.openTextDocument({language:'markdown',content:'# Unsaved\n'});
    await vscode.commands.executeCommand('parsiword.open',untitled.uri);
    await until(()=>api.getOpenDocuments(),items=>items.some(item=>item.uri===untitled.uri.toString()&&item.ready),'untitled Markdown editor');
    assert.equal(untitled.languageId,'markdown');
    record('Unsaved Markdown documents use the shared editor without a browser draft');
    const untitledChannel = channels.find(channel => channel.document === untitled)!;
    const cancelledSave = untitledChannel.dispatch!({ type: 'request', id: 900_001, method: 'command', args: { name: 'save' } });
    const saveInput = page.locator('.quick-input-widget .quick-input-box input');
    await expect(saveInput).toBeVisible(); await saveInput.press('Escape'); await cancelledSave;
    assert.ok(untitledChannel.messages.some(message => (message as { id?: number; errorCode?: string }).id === 900_001 && (message as { errorCode?: string }).errorCode === 'DOCUMENT_SAVE_CANCELLED'));
    record('A cancelled native Save returns a failure code instead of reporting success');
    const windowsUri=vscode.Uri.joinPath(folder,'crlf.md');
    await vscode.commands.executeCommand('parsiword.open',windowsUri);
    const windowsDocument=await vscode.workspace.openTextDocument(windowsUri);
    const windowsFrame=await until(async()=>{
      for(const p of browser!.contexts().flatMap(c=>c.pages())) for(const f of p.frames()) if(await f.locator('.app-shell').count() && await f.locator('.app-shell').getAttribute('data-document-title')==='crlf') return f;
      return undefined;
    },value=>!!value,'CRLF webview') as Frame;
    let changedRange=Infinity;
    const changes=vscode.workspace.onDidChangeTextDocument(event=>{if(event.document===windowsDocument&&event.contentChanges.length) changedRange=event.contentChanges[0].rangeLength;});
    await windowsFrame.locator('#markdown-source').fill('# Windows\n\nمتن اصلی tail\n');
    await until(()=>windowsDocument.getText(),text=>text.includes('tail'),'CRLF source edit');
    assert.equal(windowsDocument.getText(),'# Windows\r\n\r\nمتن اصلی tail\r\n');
    assert.equal(windowsDocument.eol,vscode.EndOfLine.CRLF); assert.ok(changedRange<10);
    changes.dispose();
    record('Windows CRLF line endings survive browser edits using a minimal native range');
    await vscode.commands.executeCommand('vscode.setEditorLayout', { orientation: 0, groups: [{}] });
    const originalViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    for (const mode of ['combined', 'source', 'rendered']) {
      const captureUri = vscode.Uri.joinPath(folder, `capture-${mode}.md`);
      await vscode.workspace.fs.writeFile(captureUri, new TextEncoder().encode(initial));
      await vscode.commands.executeCommand('vscode.openWith', captureUri, mode === 'combined' ? 'parsiword.markdown' : `parsiword.markdown.${mode}`, { viewColumn: vscode.ViewColumn.One });
      const captureFrame = await until(async () => {
        for (const p of browser!.contexts().flatMap(c => c.pages())) for (const f of p.frames()) {
          try { if (await f.locator('.app-shell').count() && await f.locator('.app-shell').getAttribute('data-document-title') === `capture-${mode}`) return f; } catch { /* Detached old view. */ }
        }
        return undefined;
      }, value => !!value, `narrow ${mode} frame`) as Frame;
      await page.setViewportSize({ width: 460, height: 900 });
      for (let attempt = 0; attempt < 3; attempt++) {
        const width = await captureFrame.evaluate(() => innerWidth);
        if (Math.abs(width - 400) <= 1) break;
        const outer = await page.evaluate(() => innerWidth);
        await page.setViewportSize({ width: Math.max(400, outer + 400 - width), height: 900 });
        await wait(100);
      }
      const dimensions = await captureFrame.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: globalThis.document.documentElement.scrollWidth }));
      assert.ok(Math.abs(dimensions.width - 400) <= 1, `Expected actual 400px webview, got ${dimensions.width}`);
      assert.ok(dimensions.documentWidth <= dimensions.width + 1, `${mode} horizontal page overflow`);
      await expect(captureFrame.locator('.live-workspace')).toHaveAttribute('data-mode', mode);
      const keyboard: unknown[] = [];
      for (const pane of mode === 'combined' ? ['edit', 'preview'] : [mode === 'source' ? 'edit' : 'preview']) {
        if (mode === 'combined') await captureFrame.locator(`[data-mobile-view="${pane}"]`).click();
        const toolbar = captureFrame.locator(pane === 'edit' ? '.format-toolbar' : '.rich-format-toolbar');
        const buttons = toolbar.locator('button:not([disabled])');
        const count = await buttons.count(); assert.ok(count >= 5, `${mode}/${pane} toolbar is nonempty`);
        await buttons.first().focus();
        for (let index = 0; index < count; index++) {
          await expect(buttons.nth(index)).toBeFocused();
          await expect.poll(() => buttons.nth(index).evaluate(element => { const box = element.getBoundingClientRect(), parent = element.closest('[role="toolbar"]')!.getBoundingClientRect(); return box.left >= parent.left - 1 && box.right <= parent.right + 1; }), { timeout: 1000 }).toBe(true);
          const focus = await buttons.nth(index).evaluate(element => { const box = element.getBoundingClientRect(); const parent = element.closest('[role="toolbar"]')!.getBoundingClientRect(); return { label: element.getAttribute('aria-label'), left: box.left, right: box.right, toolbarLeft: parent.left, toolbarRight: parent.right }; });
          assert.ok(focus.left >= focus.toolbarLeft - 1 && focus.right <= focus.toolbarRight + 1, `${mode}/${pane}: keyboard focus outside scrollable toolbar ${JSON.stringify(focus)}`);
          keyboard.push({ pane, ...focus });
          await page.keyboard.press('Tab');
        }
      }
      await captureFrame.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: join(artifact, `narrow-${mode}.png`) });
      narrowViews.push({ mode, dimensions, keyboard });
    }
    await page.setViewportSize(originalViewport);
    record('Actual 400px combined/source/rendered webviews have no page overflow; every enabled source/rich toolbar button is reachable with Tab and scrolls into view');
    await writeFile(join(artifact,'results.json'),JSON.stringify({version:vscode.version,results,exports,imageExports,themes,viewState,narrowViews},null,2));
  } catch (error) {
    if(browser) for(const page of browser.contexts().flatMap(context=>context.pages())) await page.screenshot({path:join(artifact,'failure.png')}).catch(()=>{});
    await writeFile(join(artifact, themeWitness ? `syntax-${themeWitness}-failure.json` : 'results.json'),JSON.stringify({version:vscode.version,results,themes,viewState,narrowViews,error:String(error)},null,2));
    throw error;
  } finally { await browser?.close(); }
}
