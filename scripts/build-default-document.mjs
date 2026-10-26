// Regenerate the first-launch document from the existing RTL corpus and the
// pinned, licensed code examples. No network access is needed.
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import hljs from 'highlight.js/lib/common';
import assert from 'node:assert/strict';

const normalizeLineEndings = text => text.replace(/\r\n/g, '\n');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { hardStressMarkdown } = await server.ssrLoadModule('/../../tests/fixtures/rtl-stress.ts');
  const intro = normalizeLineEndings(await readFile('packages/core/src/starter-document.md', 'utf8'));
  const { samples } = JSON.parse(await readFile('packages/core/src/data/code-samples.json', 'utf8'));
  assert.deepEqual(samples.map(s => s.language).sort(), hljs.listLanguages().sort());
  assert.equal(samples.length, 36);
  const code = samples.map(sample => {
    // A fence longer than any run in the example also preserves Markdown demos.
    const fence = '`'.repeat(Math.max(3, ...Array.from(sample.source.matchAll(/`+/g), match => match[0].length + 1)));
    return `### ${sample.language} — ${hljs.getLanguage(sample.language).name}\n\n${fence}${sample.language}\n${sample.source}\n${fence}`;
  });
  const markdown = [intro.trim(), hardStressMarkdown(false),
    '# نمونهٔ ۳۶ زبان و قالب رایج',
    'نام زبان بالای هر بلوک آمده است. این‌ها نمونهٔ رنگ‌آمیزی‌اند و اجرا نمی‌شوند. بلوک plaintext عمداً متن ساده است. نمونه‌های دیگر، از جمله HTML/XML، Markdown و خروجی ترمینال، ساختار کد خود را حفظ می‌کنند.',
    ...code, 'پایان مجموعهٔ آزمون‌ها؛ متن، جهت نوشتن، TikZ، LaTeX، Mermaid و ۳۶ زبان کد.',
  ].join('\n\n') + '\n';
  if (process.argv.includes('--check')) assert.equal(normalizeLineEndings(await readFile('packages/core/src/default-document.md', 'utf8')), markdown, 'Run pnpm run samples:build to update the starter document');
  else await writeFile('packages/core/src/default-document.md', markdown);
  console.log(`Starter document: ${markdown.length} characters, ${samples.length} code languages, S01–S14/E01 and P01–P72.`);
} finally { await server.close(); }
