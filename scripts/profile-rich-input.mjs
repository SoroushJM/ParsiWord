// Reproduce rich-input measurements without turning machine speed into a test.
// Start Vite first, then: node scripts/profile-rich-input.mjs --label after --cpu 4
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const options = {};
const valid = new Set(['label', 'cpu', 'repeat', 'width', 'height', 'url', 'output', 'profile']);
for (let i = 2; i < process.argv.length; i++) {
  const argument = process.argv[i];
  if (argument === '--help') {
    console.log('node scripts/profile-rich-input.mjs [--label after] [--cpu 4] [--repeat 1] [--width 393] [--height 851] [--url http://127.0.0.1:1420] [--output artifacts/rich-input-after.json] [--profile artifacts/rich-input-after.cpuprofile]');
    process.exit(0);
  }
  const name = argument.replace(/^--/, '');
  const value = process.argv[++i];
  if (!argument.startsWith('--') || !valid.has(name) || value === undefined || value.startsWith('--')) throw new Error(`Invalid option: ${argument}`);
  options[name] = value;
}

const label = options.label || 'after';
if (!/^[a-z0-9_-]+$/i.test(label)) throw new Error('Use a simple label containing letters, numbers, underscores or hyphens.');
const cpu = Number(options.cpu || 4), repeat = Number(options.repeat || 1);
const width = Number(options.width || 393), height = Number(options.height || 851);
if (!(cpu >= 1 && cpu <= 20 && Number.isInteger(repeat) && repeat >= 1 && repeat <= 10 && width >= 320 && height >= 320)) throw new Error('Invalid CPU rate, repeat count or viewport.');
const url = options.url || 'http://127.0.0.1:1420';
const output = resolve(options.output || `${projectRoot}/artifacts/rich-input-${label}.json`);
const fixture = await readFile(`${projectRoot}/src/default-document.md`, 'utf8');
const source = '# Typing performance\n\nEditable paragraph: \n\n' + fixture.repeat(repeat);
if (source.length > 500_000) throw new Error('The performance fixture exceeds the draft limit.');
const text = ' typing responsiveness benchmark';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.addInitScript(({ source }) => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: source, settings: { direction: 'auto' } })), { source });
  await page.goto(url);
  if (width < 900) await page.locator('[data-mobile-view="preview"]').click();
  await page.locator('.mermaid-diagram svg').first().waitFor({ timeout: 45_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.locator('.rich-document p').first().evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element); range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    element.closest('[contenteditable]').focus();
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.evaluate(() => {
    window.__richPerf = { events: [], longTasks: [] };
    document.querySelector('.rich-document').addEventListener('beforeinput', () => {
      const start = performance.now();
      requestAnimationFrame(() => window.__richPerf.events.push(performance.now() - start));
    });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__richPerf.longTasks.push(entry.duration);
    }).observe({ type: 'longtask' });
  });
  // Profile both runs, even if the optional full CPU artifact is discarded.
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  const start = performance.now();
  await page.keyboard.type(text, { delay: 35 });
  await page.waitForTimeout(1200);
  const elapsedMs = Math.round(performance.now() - start);
  const { profile } = await cdp.send('Profiler.stop');
  const metrics = await page.evaluate(() => window.__richPerf);
  if (metrics.events.length !== text.length) throw new Error(`Expected ${text.length} input events; received ${metrics.events.length}. Discarding an interrupted measurement.`);
  const latencies = [...metrics.events].sort((a, b) => a - b);
  const result = {
    schemaVersion: 1, label, recordedAt: new Date().toISOString(),
    environment: { browserVersion: browser.version(), nodeVersion: process.version, platform: process.platform, architecture: process.arch },
    protocol: {
      fixture: 'src/default-document.md', fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
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
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  if (options.profile) {
    const profilePath = resolve(options.profile);
    await mkdir(dirname(profilePath), { recursive: true });
    await writeFile(profilePath, JSON.stringify(profile));
  }
  console.log(JSON.stringify({ output, ...result.measurements }));
} finally { await browser.close(); }
