// Reproduce source/preview input measurements without making machine speed a test.
// Start Vite first, then: node scripts/profile-rich-input.mjs --editor source --label after --cpu 4
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const options = {};
const valid = new Set(['editor', 'label', 'cpu', 'repeat', 'width', 'height', 'url', 'output', 'profile']);
for (let i = 2; i < process.argv.length; i++) {
  const argument = process.argv[i];
  if (argument === '--help') {
    console.log('node scripts/profile-rich-input.mjs [--editor preview|source] [--label after] [--cpu 4] [--repeat 1] [--width 393] [--height 851] [--url http://127.0.0.1:1420] [--output artifacts/input-after.json] [--profile artifacts/input-after.cpuprofile]');
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
const cpu = Number(options.cpu || 4), repeat = Number(options.repeat || 1);
const width = Number(options.width || 393), height = Number(options.height || 851);
if (!(cpu >= 1 && cpu <= 20 && Number.isInteger(repeat) && repeat >= 1 && repeat <= 10 && width >= 320 && height >= 320)) throw new Error('Invalid CPU rate, repeat count or viewport.');
const url = options.url || 'http://127.0.0.1:1420';
const output = resolve(options.output || `${projectRoot}/artifacts/${editor === 'source' ? 'source' : 'rich'}-input-${label}.json`);
const fixture = await readFile(`${projectRoot}/src/default-document.md`, 'utf8');
const source = '# Typing performance\n\nEditable paragraph: \n\n' + fixture.repeat(repeat);
if (source.length > 500_000) throw new Error('The performance fixture exceeds the draft limit.');
const text = ' typing responsiveness benchmark';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.addInitScript(({ source }) => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: source, settings: { direction: 'auto' } })), { source });
  await page.goto(url);
  if (width < 900 && editor === 'preview') await page.locator('[data-mobile-view="preview"]').click();
  await page.locator('.mermaid-diagram svg').first().waitFor({ state: 'attached', timeout: 45_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  if (editor === 'preview') {
    await page.locator('.rich-document p').first().evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element); range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      element.closest('[contenteditable]').focus();
    });
  } else {
    await page.locator('textarea.markdown-editor').evaluate(element => {
      const offset = element.value.indexOf('Editable paragraph: ') + 'Editable paragraph: '.length;
      if (offset < 'Editable paragraph: '.length) throw new Error('The source typing anchor is missing.');
      element.focus({ preventScroll: true });
      element.setSelectionRange(offset, offset);
    });
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.evaluate(editor => {
    window.__richPerf = { events: [], longTasks: [], coloredInputFrames: 0, staleHighlightFrames: 0 };
    document.querySelector(editor === 'source' ? 'textarea.markdown-editor' : '.rich-document').addEventListener('beforeinput', () => {
      const start = performance.now();
      requestAnimationFrame(() => {
        window.__richPerf.events.push(performance.now() - start);
        if (editor === 'source' && document.querySelector('.markdown-source-editor')?.dataset.highlighted === 'true') {
          window.__richPerf.coloredInputFrames++;
          if (document.querySelector('.markdown-source-highlight').textContent !== document.querySelector('textarea.markdown-editor').value) window.__richPerf.staleHighlightFrames++;
        }
      });
    });
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
  }, editor);
  // Profile both runs, even if the optional full CPU artifact is discarded.
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  const start = performance.now();
  await page.keyboard.type(text, { delay: 35 });
  await page.waitForTimeout(1200);
  const elapsedMs = Math.round(performance.now() - start);
  const { profile } = await cdp.send('Profiler.stop');
  const metrics = await page.evaluate(() => window.__richPerf);
  const sourceRendering = editor === 'source' ? await page.evaluate(({ source, text }) => {
    const { overlay, lines, changedLines, observer } = window.__sourceDOMPerf;
    observer.disconnect();
    const input = document.querySelector('textarea.markdown-editor');
    const highlighted = document.querySelector('.markdown-source-editor')?.dataset.highlighted === 'true';
    const offset = source.indexOf('Editable paragraph: ') + 'Editable paragraph: '.length;
    const expected = source.slice(0, offset) + text + source.slice(offset);
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
  }, { source, text }) : undefined;
  if (metrics.events.length !== text.length) throw new Error(`Expected ${text.length} input events; received ${metrics.events.length}. Discarding an interrupted measurement.`);
  if (sourceRendering && !sourceRendering.sourceMatchesExpected) throw new Error('Source typing lost or changed characters; discarding the measurement.');
  if (sourceRendering?.highlighted && !sourceRendering.overlayMatchesNativeValue) throw new Error('The highlighted source differs from the native control; discarding the measurement.');
  const latencies = [...metrics.events].sort((a, b) => a - b);
  const result = {
    schemaVersion: 1, label, recordedAt: new Date().toISOString(),
    environment: { browserVersion: browser.version(), nodeVersion: process.version, platform: process.platform, architecture: process.arch },
    protocol: {
      editor, fixture: 'src/default-document.md', fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
      repeat, characters: source.length, viewport: { width, height }, cpuThrottleRate: cpu,
      input: text, keyDelayMs: 35, settleBeforeMs: 800, settleAfterMs: 1200, cpuProfiler: true,
      latencyDefinition: 'beforeinput event to the first requestAnimationFrame callback; this is a browser scheduling measurement, not a native-device input latency guarantee',
    },
    measurements: {
      keys: metrics.events.length, elapsedMs,
      latencyMedianMs: Math.round(latencies[Math.floor(latencies.length / 2)]),
      latencyP95Ms: Math.round(latencies[Math.floor(latencies.length * .95)]),
      longTaskCount: metrics.longTasks.length,
      longTaskTotalMs: Math.round(metrics.longTasks.reduce((sum, duration) => sum + duration, 0)),
      maxLongTaskMs: Math.round(Math.max(0, ...metrics.longTasks)),
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
