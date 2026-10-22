// Generate the actual app converter's device fixtures, not hand-authored runs.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

const out = new URL('../artifacts/0.2.1/', import.meta.url);
await mkdir(out, { recursive: true });
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { exportWord, defaultSettings } = await server.ssrLoadModule('/../../packages/core/src/converter.ts');
  const { samples } = await server.ssrLoadModule('/../../packages/core/src/samples.ts');
  for (const sample of samples.filter(s => s.id === 'brackets' || s.id === 'mixed')) {
    await writeFile(new URL(`${sample.id}-0.2.1.docx`, out), await exportWord(sample.markdown, {
      ...defaultSettings, fontFamily: 'Arial', title: sample.title,
    }));
    await writeFile(new URL(`${sample.id}-source.md`, out), sample.markdown);
  }
  const font = { family: 'Vazirmatn', arabic: true, savedAt: 0,
    regular: new Uint8Array(await readFile('packages/core/public/fonts/Vazirmatn-Regular.ttf')),
    bold: new Uint8Array(await readFile('packages/core/public/fonts/Vazirmatn-Bold.ttf')),
  };
  await writeFile(new URL('mixed-0.2.1-Vazirmatn.docx', out), await exportWord(samples.find(s => s.id === 'mixed').markdown, defaultSettings, [font]));
  await writeFile(new URL('english-forced-rtl-0.2.1.docx', out), await exportWord('English (version 19).\n\n(250 USD)', { ...defaultSettings, direction: 'rtl', fontFamily: 'Arial' }));
  console.log('Generated 4 DOCX fixtures using the app converter.');
} finally {
  await server.close();
}
