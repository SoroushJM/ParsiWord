import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('the actual browser decoder converts PNG, JPEG, WebP, GIF, BMP, AVIF and SVG into colored PNG export assets', async ({ page }) => {
  const fixtures = await Promise.all(['gif', 'bmp', 'avif'].map(async format => ({
    format,
    url: `data:image/${format};base64,${(await readFile(new URL(`./fixtures/export-images/sample.${format}`, import.meta.url))).toString('base64')}`,
  })));
  await page.goto('/');
  const result = await page.evaluate(async ({ fixtures, modulePath }) => {
    const { prepareExportImages } = await import(/* @vite-ignore */ modulePath + 'export-images.ts');
    const { markdownContext } = await import(/* @vite-ignore */ modulePath + 'markdown.ts');
    const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 16;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#1264c8'; context.fillRect(0, 0, 24, 16);
    const sources = [
      ...['png', 'jpeg', 'webp'].map(format => ({ format, url: canvas.toDataURL(`image/${format}`) })),
      ...fixtures,
      { format: 'svg', url: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><rect width="24" height="16" fill="#1264c8"/></svg>') },
    ];
    const source = sources.map(({ format, url }) => `![${format}](${url})`).join('\r\n\r\n');
    const snapshot = markdownContext(source);
    let ipcCalls = 0;
    const unexpectedIpc = async () => { ipcCalls++; throw new Error('Data images must bypass the native image protocol'); };
    const prepared = await prepareExportImages(snapshot, unexpectedIpc, unexpectedIpc);
    const output = [];
    for (const { format, url } of sources) {
      const image = prepared.get(url)!;
      const objectUrl = URL.createObjectURL(new Blob([image.png], { type: 'image/png' }));
      const decoded = new Image();
      try {
        decoded.src = objectUrl; await decoded.decode();
        context.clearRect(0, 0, 24, 16); context.drawImage(decoded, 0, 0);
        output.push({ format, mime: url.slice(5, url.indexOf(';')), width: image.width, height: image.height,
          signature: Array.from(image.png.subarray(0, 8)), pixel: Array.from(context.getImageData(2, 2, 1, 1).data) });
      } finally { decoded.src = ''; URL.revokeObjectURL(objectUrl); }
    }
    return { output, ipcCalls, sourcePreserved: snapshot.source === source, count: prepared.size };
  }, { fixtures, modulePath: '/@fs/' + fileURLToPath(new URL('../packages/core/src/', import.meta.url)).replaceAll('\\', '/') });
  expect(result.count).toBe(7); expect(result.ipcCalls).toBe(0); expect(result.sourcePreserved).toBe(true);
  expect(result.output.map(image => image.format)).toEqual(['png', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg']);
  for (const image of result.output) {
    expect(image.mime).toBe(`image/${image.format === 'svg' ? 'svg+xml' : image.format}`);
    expect([image.width, image.height]).toEqual([24, 16]);
    expect(image.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(image.pixel[0]).toBeLessThan(100); expect(image.pixel[2]).toBeGreaterThan(120); expect(image.pixel[3]).toBe(255);
  }
});

test('SVG export rejects external image references before decoding or fetching them', async ({ page }) => {
  await page.goto('/');
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('external-svg-resource.invalid')) requests.push(request.url()); });
  const result = await page.evaluate(async modulePath => {
    const { prepareExportImages } = await import(/* @vite-ignore */ modulePath + 'export-images.ts');
    const { markdownContext } = await import(/* @vite-ignore */ modulePath + 'markdown.ts');
    const url = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><image href="https://external-svg-resource.invalid/image.png" width="24" height="16"/></svg>');
    try { await prepareExportImages(markdownContext(`![Unsafe](${url})`)); return 'unexpected success'; }
    catch (error) { return (error as { code?: string }).code; }
  }, '/@fs/' + fileURLToPath(new URL('../packages/core/src/', import.meta.url)).replaceAll('\\', '/'));
  expect(result).toBe('IMAGE_EXPORT_FAILED'); expect(requests).toEqual([]);
});
