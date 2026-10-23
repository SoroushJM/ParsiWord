// Reproduce source/preview input measurements without making machine speed a test.
// Start Vite first, then: node scripts/profile-rich-input.mjs --editor source --label after --cpu 4
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const options = {};
const valid = new Set(['editor', 'scenario', 'label', 'cpu', 'repeat', 'width', 'height', 'url', 'output', 'profile']);
for (let i = 2; i < process.argv.length; i++) {
  const argument = process.argv[i];
  if (argument === '--help') {
    console.log('node scripts/profile-rich-input.mjs [--editor preview|source] [--scenario typing|long-block|many-blocks|paste|view-switch] [--label after] [--cpu 4] [--repeat 1] [--width 393] [--height 851] [--url http://127.0.0.1:1420] [--output artifacts/input-after.json] [--profile artifacts/input-after.cpuprofile]');
    process.exit(0);
  }
  const name = argument.replace(/^--/, '');
  const value = process.argv[++i];
  if (!argument.startsWith('--') || !valid.has(name) || value === undefined || value.startsWith('--')) throw new Error(`Invalid option: ${argument}`);
  options[name] = value;
}

const label = options.label || 'after';
if (!/^[a-z0-9_-]+$/i.test(label)) throw new Error('Use a simple label containing letters, numbers, underscores or hyphens.');
const editor = options.editor || 'preview';
if (!['preview', 'source'].includes(editor)) throw new Error('The editor must be preview or source.');
const scenario = options.scenario || 'typing';
if (!['typing', 'long-block', 'many-blocks', 'paste', 'view-switch'].includes(scenario)) throw new Error('Unknown performance scenario.');
const heavy = scenario !== 'typing';
const cpu = Number(options.cpu || 4), repeat = Number(options.repeat || 1);
const width = Number(options.width || 393), height = Number(options.height || 851);
if (!(cpu >= 1 && cpu <= 20 && Number.isInteger(repeat) && repeat >= 1 && repeat <= 10 && width >= 320 && height >= 320)) throw new Error('Invalid CPU rate, repeat count or viewport.');
const url = options.url || 'http://127.0.0.1:1420';
const output = resolve(options.output || `${projectRoot}/artifacts/${editor === 'source' ? 'source' : 'rich'}-input-${label}.json`);
const fixture = await readFile(`${projectRoot}/packages/core/src/default-document.md`, 'utf8');
const anchor = 'EDITINGANCHOR';
const unit = 'متن فارسی و English sample words 42 ';
const literal = count => unit.repeat(Math.ceil(count / unit.length)).slice(0, count);
const syntax = '# Heavy performance\n\n## Syntax sample\n\n**متن پررنگ** and [reference][id].\n\n[id]: https://example.com\n\n```typescript\nconst answer = 42;\n```\n\nInline $E=mc^2$.\n\n';
let paragraph, source;
if (scenario === 'typing') source = '# Typing performance\n\nEditable paragraph: \n\n' + fixture.repeat(repeat);
else if (scenario === 'long-block' || scenario === 'paste') {
  const half = scenario === 'long-block' ? 100_000 : 90_000;
  paragraph = literal(half) + anchor + literal(half) + (scenario === 'paste' ? 'END' : '');
  source = '# Heavy single paragraph\n\n' + paragraph + '\n';
} else {
  const paragraphs = Array.from({ length: 2_000 }, (_, index) => `Block${String(index).padStart(5, '0')} ${index === 1_000 ? anchor + ' ' : ''}${unit.repeat(2)}end.`);
  paragraph = paragraphs[1_000];
  source = syntax + paragraphs.join('\n\n') + '\n';
}
if (source.length > 500_000) throw new Error('The performance fixture exceeds the draft limit.');
const text = ' typing responsiveness benchmark';
const insertion = scenario === 'paste' ? literal(100_000) : scenario === 'view-switch' ? '' : text;
const offset = heavy ? source.indexOf(anchor) + anchor.length : source.indexOf('Editable paragraph: ') + 'Editable paragraph: '.length;
const expectedSource = source.slice(0, offset) + insertion + source.slice(offset);
const expectedParagraph = heavy ? paragraph.slice(0, paragraph.indexOf(anchor) + anchor.length) + insertion + paragraph.slice(paragraph.indexOf(anchor) + anchor.length) : undefined;
const sha = value => createHash('sha256').update(value).digest('hex');
if (scenario === 'view-switch' && width >= 900) throw new Error('The website view-switch scenario requires its existing mobile tabs below 900px.');
if (heavy && repeat !== 1) throw new Error('Heavy fixtures are fixed; use independent labelled runs instead of changing repeat.');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width, height } });
  if (heavy) page.setDefaultTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  if (heavy) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.addInitScript(({ source }) => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: source, settings: { direction: 'auto' } })), { source });
  const loadStart = performance.now();
  const initialization = {};
  try {
  await page.goto(url, { timeout: heavy ? 120_000 : 30_000 });
  initialization.navigationMs = Math.round(performance.now() - loadStart);
  if (width < 900 && editor === 'preview') await page.locator('[data-mobile-view="preview"]').click();
  await page.locator('.rich-document p').first().waitFor({ state: 'attached' });
  if (scenario === 'typing') await page.locator('.mermaid-diagram svg').first().waitFor({ state: 'attached', timeout: 45_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  initialization.readyMs = Math.round(performance.now() - loadStart);
  } catch (error) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify({ schemaVersion: 2, label, scenario, initialization: { ...initialization, failedAfterMs: Math.round(performance.now() - loadStart), error: String(error) }, protocol: { sourceSha256: sha(source), characters: source.length, viewport: { width, height }, cpuThrottleRate: cpu, url }, measurements: null }, null, 2) + '\n');
    throw error;
  }
  if (editor === 'preview') {
    if (heavy) await page.evaluate(anchor => {
      const paragraph = [...document.querySelectorAll('.rich-document p')].find(element => element.textContent.includes(anchor));
      if (!paragraph) throw new Error('Rich typing anchor is missing.');
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const at = node.textContent.indexOf(anchor);
        if (at < 0) continue;
        const range = document.createRange(); range.setStart(node, at + anchor.length); range.collapse(true);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        paragraph.closest('[contenteditable]').focus({ preventScroll: true }); return;
      }
      throw new Error('Rich text anchor is missing.');
    }, anchor);
    else await page.locator('.rich-document p').first().evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element); range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      element.closest('[contenteditable]').focus();
    });
  } else {
    await page.locator('textarea.markdown-editor').evaluate((element, offset) => {
      element.focus({ preventScroll: true });
      element.setSelectionRange(offset, offset);
    }, offset);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.evaluate(({ editor, scenario, heavy }) => {
    window.__richPerf = { events: [], longTasks: [], coloredInputFrames: 0, staleHighlightFrames: 0 };
    const record = () => {
      const start = performance.now();
      requestAnimationFrame(() => {
        window.__richPerf.events.push(performance.now() - start);
        if (editor === 'source' && document.querySelector('.markdown-source-editor')?.dataset.highlighted === 'true') {
          window.__richPerf.coloredInputFrames++;
          if (document.querySelector('.markdown-source-highlight').textContent !== document.querySelector('textarea.markdown-editor').value) window.__richPerf.staleHighlightFrames++;
        }
      });
    };
    if (scenario === 'view-switch') for (const button of document.querySelectorAll('[data-mobile-view]')) button.addEventListener('click', record, { capture: true });
    else document.querySelector(editor === 'source' ? 'textarea.markdown-editor' : '.rich-document').addEventListener(scenario === 'paste' ? 'paste' : 'beforeinput', record, { capture: heavy });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__richPerf.longTasks.push(entry.duration);
    }).observe({ type: 'longtask' });
    if (editor === 'source') {
      const overlay = document.querySelector('.markdown-source-highlight');
      const lines = [...(overlay?.querySelectorAll('[data-source-line]') || [])];
      const changedLines = new Set();
      const observer = new MutationObserver(records => {
        for (const record of records) {
          const touched = [record.target, ...(record.type === 'childList' ? [...record.addedNodes, ...record.removedNodes] : [])];
          for (const node of touched) {
            const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
            const line = element?.closest('[data-source-line]');
            if (line) changedLines.add(Number(line.getAttribute('data-source-line')));
          }
        }
      });
      if (overlay) observer.observe(overlay, { subtree: true, childList: true, characterData: true });
      window.__sourceDOMPerf = { overlay, lines, changedLines, observer };
    }
  }, { editor, scenario, heavy });
  if (scenario === 'paste') {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(text => navigator.clipboard.writeText(text), insertion);
  }
  await cdp.send('Performance.enable');
  const beforeMetrics = (await cdp.send('Performance.getMetrics')).metrics;
  const timeline = [];
  if (heavy) {
    cdp.on('Tracing.dataCollected', event => timeline.push(...event.value));
    await cdp.send('Tracing.start', { categories: 'devtools.timeline', options: 'record-as-much-as-possible', transferMode: 'ReportEvents' });
  }
  // Profile both runs, even if the optional full CPU artifact is discarded.
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  const start = performance.now();
  const switches = [];
  if (scenario === 'view-switch') {
    for (let index = 0; index < 20; index++) {
      const target = index % 2 ? editor === 'source' ? 'edit' : 'preview' : editor === 'source' ? 'preview' : 'edit';
      await page.locator(`[data-mobile-view="${target}"]`).click();
      switches.push(await page.evaluate(({ source, paragraph, target }) => ({ target, active: document.querySelector('.live-workspace')?.getAttribute('data-view'), sourceMatches: document.querySelector('textarea.markdown-editor').value === source, displayMatches: [...document.querySelectorAll('.rich-document p')].some(element => element.textContent === paragraph) }), { source, paragraph, target }));
    }
  } else if (scenario === 'paste') await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  else await page.keyboard.type(text, { delay: 35 });
  await page.waitForTimeout(1200);
  const elapsedMs = Math.round(performance.now() - start);
  const { profile } = await cdp.send('Profiler.stop');
  const afterMetrics = (await cdp.send('Performance.getMetrics')).metrics;
  if (heavy) {
    const finished = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.end'); await finished;
  }
  const metrics = await page.evaluate(() => window.__richPerf);
  const sourceRendering = editor === 'source' ? await page.evaluate(({ expected }) => {
    const { overlay, lines, changedLines, observer } = window.__sourceDOMPerf;
    observer.disconnect();
    const input = document.querySelector('textarea.markdown-editor');
    const highlighted = document.querySelector('.markdown-source-editor')?.dataset.highlighted === 'true';
    return {
      overlayAvailable: !!overlay, highlighted, initialLineCount: lines.length,
      mutatedLineIndexes: [...changedLines].sort((a, b) => a - b),
      originalLineNodesStillConnected: lines.filter(line => line.isConnected).length,
      finalLineCount: overlay?.querySelectorAll('[data-source-line]').length || 0,
      sourceMatchesExpected: input.value === expected,
      overlayMatchesNativeValue: highlighted ? overlay.textContent === input.value : null,
      coloredInputFrames: window.__richPerf.coloredInputFrames,
      staleHighlightFrames: window.__richPerf.staleHighlightFrames,
    };
  }, { expected: expectedSource }) : undefined;
  const expectedEvents = scenario === 'view-switch' ? 20 : scenario === 'paste' ? 1 : text.length;
  const documentChecks = heavy ? await page.evaluate(({ expectedSource, expectedParagraph, anchor }) => {
    const actual = document.querySelector('textarea.markdown-editor').value;
    const paragraphs = [...document.querySelectorAll('.rich-document p')].filter(element => element.textContent.includes(anchor));
    let firstDifference = 0;
    while (firstDifference < actual.length && firstDifference < expectedSource.length && actual[firstDifference] === expectedSource[firstDifference]) firstDifference++;
    return { exactSource: actual === expectedSource, exactParagraphDisplay: paragraphs.length === 1 && paragraphs[0].textContent === expectedParagraph,
      paragraphMatches: paragraphs.length, actualSource: actual, firstDifference: actual === expectedSource ? null : { offset: firstDifference, expected: expectedSource.slice(Math.max(0, firstDifference - 40), firstDifference + 100), actual: actual.slice(Math.max(0, firstDifference - 40), firstDifference + 100) } };
  }, { expectedSource, expectedParagraph, anchor }) : undefined;
  if (documentChecks) {
    documentChecks.actualSourceSha256 = sha(documentChecks.actualSource);
    documentChecks.expectedSourceSha256 = sha(expectedSource);
    delete documentChecks.actualSource;
  }
  const checks = { eventCountMatches: metrics.events.length === expectedEvents,
    ...(documentChecks || {}),
    ...(switches.length ? { switches: switches.every(item => item.active === item.target && item.sourceMatches && item.displayMatches), switchChecks: switches } : {}) };
  if (!heavy) {
    if (!checks.eventCountMatches) throw new Error(`Expected ${expectedEvents} input events; received ${metrics.events.length}. Discarding an interrupted measurement.`);
    if (sourceRendering && !sourceRendering.sourceMatchesExpected) throw new Error('Source typing lost or changed characters; discarding the measurement.');
    if (sourceRendering?.highlighted && !sourceRendering.overlayMatchesNativeValue) throw new Error('The highlighted source differs from the native control; discarding the measurement.');
  }
  const latencies = [...metrics.events].sort((a, b) => a - b);
  const performanceCounters = {};
  for (const name of ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration']) {
    performanceCounters[name] = (afterMetrics.find(metric => metric.name === name)?.value || 0) - (beforeMetrics.find(metric => metric.name === name)?.value || 0);
  }
  for (const name of ['JSHeapUsedSize', 'Nodes', 'Documents']) performanceCounters[name] = afterMetrics.find(metric => metric.name === name)?.value;
  const timelineCounts = {};
  for (const name of ['Layout', 'UpdateLayoutTree', 'Paint', 'PrePaint', 'CompositeLayers']) timelineCounts[name] = timeline.filter(event => event.name === name && event.ph === 'X').length;
  const samples = new Map();
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  for (const id of profile.samples || []) { const frame = nodes.get(id)?.callFrame; if (frame) { const key = `${frame.functionName || '(anonymous)'} @ ${frame.url.split('/').pop()}:${frame.lineNumber}`; samples.set(key, (samples.get(key) || 0) + 1); } }
  const topFunctions = [...samples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([functionName, samples]) => ({ functionName, samples }));
  const result = {
    schemaVersion: heavy ? 2 : 1, label, recordedAt: new Date().toISOString(),
    environment: { browserVersion: browser.version(), nodeVersion: process.version, platform: process.platform, architecture: process.arch },
    protocol: {
      editor, scenario, fixture: heavy ? 'fixed plain-text generator in scripts/profile-rich-input.mjs' : 'packages/core/src/default-document.md', fixtureSha256: heavy ? sha(source) : sha(fixture), sourceSha256: sha(source),
      repeat, characters: source.length, viewport: { width, height }, cpuThrottleRate: cpu,
      input: scenario === 'paste' ? { characters: insertion.length, sha256: sha(insertion), mechanism: 'real clipboard write + native Control/Meta V' } : scenario === 'view-switch' ? { switches: 20, tabs: 'existing website mobile source/preview tabs' } : text,
      keyDelayMs: 35, settleBeforeMs: 800, settleAfterMs: 1200, cpuProfiler: true, initCpuThrottleRate: heavy ? cpu : 1, url,
      latencyDefinition: `${scenario === 'paste' ? 'capturing paste' : scenario === 'view-switch' ? 'capturing tab click' : heavy ? 'capturing beforeinput' : 'beforeinput'} event to first requestAnimationFrame callback; browser scheduling, not native-device input latency`,
      ...(heavy ? { reviewTriggers: { relativeP95: 'both >20% and >16ms increase', longTasks: 'both >25% and >50ms increase', absoluteFlags: 'p95>100ms; tasks>50ms are diagnostic, not device-independent SLOs' }, profileLimit: 'CPU samples are not parse/serialize invocation counts; minified names limit attribution.' } : {}),
    },
    ...(heavy ? { initialization, checks } : {}),
    measurements: {
      keys: metrics.events.length, elapsedMs,
      latencyMedianMs: latencies.length ? Math.round(latencies[Math.floor(latencies.length / 2)]) : null,
      latencyP95Ms: latencies.length ? Math.round(latencies[Math.floor(latencies.length * .95)]) : null,
      longTaskCount: metrics.longTasks.length,
      longTaskTotalMs: Math.round(metrics.longTasks.reduce((sum, duration) => sum + duration, 0)),
      maxLongTaskMs: Math.round(Math.max(0, ...metrics.longTasks)),
      ...(heavy ? { performanceCounters, timelineCounts, topFunctions } : {}),
    },
    ...(sourceRendering ? { sourceRendering } : {}),
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  if (options.profile) {
    const profilePath = resolve(options.profile);
    await mkdir(dirname(profilePath), { recursive: true });
    await writeFile(profilePath, JSON.stringify(profile));
  }
  console.log(JSON.stringify({ output, editor, ...result.measurements, ...(sourceRendering ? { sourceRendering } : {}) }));
} finally { await browser.close(); }
