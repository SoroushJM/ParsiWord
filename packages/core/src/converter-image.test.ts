import { describe, expect, it, vi } from 'vitest';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { createWord, defaultSettings, exportPreparedWord, exportWord } from './converter';
import { documentLayout } from './document-layout';
import { markdownContext, markdownParser } from './markdown';
import * as exportImages from './export-images';
import type { ExportImage } from './export-images';

const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64'));
const image = (width = 160, height = 80): ExportImage => ({ png, width, height });
const pageWidth = documentLayout.width - documentLayout.margins.left - documentLayout.margins.right;
const pageHeight = documentLayout.height - documentLayout.margins.top - documentLayout.margins.bottom;
const emuPerTwip = 635;
const emuPerRasterUnit = 9525;

async function readDocument(markdown: string, images: ReadonlyMap<string, ExportImage>) {
  const zip = await JSZip.loadAsync(await Packer.toArrayBuffer(createWord(markdown, defaultSettings, [], new Map(), images)));
  const xml = await zip.file('word/document.xml')!.async('string');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  return { zip, xml, document };
}

function extent(element: { getElementsByTagName(name: string): ArrayLike<{ getAttribute(name: string): string | null }> }) {
  const node = element.getElementsByTagName('wp:extent')[0];
  return { width: Number(node.getAttribute('cx')), height: Number(node.getAttribute('cy')) };
}

describe('Word embeds Markdown images as actual inline drawing assets', () => {
  it('embeds standalone image bytes and accessible metadata, with page bounds and aspect ratio', async () => {
    const source = '![نقشهٔ راه](./roadmap.png "Roadmap title")';
    const { zip, document, xml } = await readDocument(source, new Map([['./roadmap.png', image(2400, 1200)]]));
    const images = zip.file(/^word\/media\/.*\.png$/);
    expect(images).toHaveLength(1);
    expect(await images[0].async('uint8array')).toEqual(png);
    expect(document.getElementsByTagName('w:drawing')).toHaveLength(1);
    const size = extent(document);
    expect(size.width).toBeLessThanOrEqual(pageWidth * emuPerTwip);
    expect(size.height).toBeLessThanOrEqual(pageHeight * emuPerTwip);
    expect(size.width / size.height).toBeCloseTo(2, 5);
    expect(document.getElementsByTagName('w:spacing')[0].getAttribute('w:lineRule')).toBe('atLeast');
    const metadata = document.getElementsByTagName('wp:docPr')[0];
    expect(metadata.getAttribute('descr')).toBe('نقشهٔ راه');
    expect(metadata.getAttribute('title')).toBe('Roadmap title');
    expect(xml).not.toContain('[تصویر:');
    expect(source).toBe('![نقشهٔ راه](./roadmap.png "Roadmap title")');
  });

  it('interleaves images with editable mixed-script text and retains a linked image target', async () => {
    const source = '**پیش از تصویر** ![نمودار](plot.png) after [![پیوند](linked.png)](https://example.com/chart) پایان\n\nOrdinary paragraph.';
    const { document, zip } = await readDocument(source, new Map([['plot.png', image()], ['linked.png', image(20, 30)]]));
    const paragraph = document.getElementsByTagName('w:p')[0];
    const content = Array.from(paragraph.getElementsByTagName('*'))
      .filter(node => node.tagName === 'w:t' || node.tagName === 'w:drawing')
      .map(node => node.tagName === 'w:drawing' ? '<image>' : node.textContent)
      .join('').replace(/[\u200e\u202b\u202c]/g, '');
    expect(content).toBe('پیش از تصویر <image> after <image> پایان');
    expect(paragraph.getElementsByTagName('w:b').length).toBeGreaterThan(0);
    const hyperlinks = Array.from(document.getElementsByTagName('w:hyperlink'));
    expect(hyperlinks).toHaveLength(1);
    expect(hyperlinks[0].getElementsByTagName('w:drawing')).toHaveLength(1);
    const relationships = await zip.file('word/_rels/document.xml.rels')!.async('string');
    expect(relationships).toContain('Target="https://example.com/chart"');
    expect(paragraph.textContent).not.toContain('\ufffc');
    expect(extent(paragraph).width).toBe(160 * emuPerRasterUnit);
    const ordinarySpacing = document.getElementsByTagName('w:p')[1].getElementsByTagName('w:spacing')[0];
    expect(ordinarySpacing.getAttribute('w:line')).toBe(String(documentLayout.paragraph.line));
    expect(ordinarySpacing.getAttribute('w:lineRule')).toBeNull();
  });

  it('resolves case-insensitive reference images from the first canonical definition', async () => {
    const source = '> [Asset]: assets/first.png "First title"\n\n[asset]: assets/second.png\n\n![One][ASSET] and ![Two][asset]';
    const { document, zip, xml } = await readDocument(source, new Map([['assets/first.png', image(40, 25)]]));
    expect(document.getElementsByTagName('w:drawing')).toHaveLength(2);
    expect(Array.from(document.getElementsByTagName('wp:docPr')).map(node => node.getAttribute('descr'))).toEqual(['One', 'Two']);
    expect(Array.from(document.getElementsByTagName('wp:docPr')).every(node => node.getAttribute('title') === 'First title')).toBe(true);
    expect(zip.file(/^word\/media\/.*\.png$/)).toHaveLength(1);
    expect(xml).not.toContain('[تصویر:');
  });

  it('fits table images to actual fixed cell widths and leaves room for a repeated header', async () => {
    const source = '| Wide image | Tall image |\n| --- | --- |\n| ![Wide](wide.png) | ![Tall](tall.png) |';
    const { document } = await readDocument(source, new Map([['wide.png', image(3000, 1000)], ['tall.png', image(1000, 5000)]]));
    const table = document.getElementsByTagName('w:tbl')[0];
    expect(table.getElementsByTagName('w:tblLayout')[0].getAttribute('w:type')).toBe('fixed');
    const grid = Array.from(table.getElementsByTagName('w:gridCol')).map(node => Number(node.getAttribute('w:w')));
    expect(grid.reduce((sum, width) => sum + width, 0)).toBe(pageWidth);
    const cells = Array.from(table.getElementsByTagName('w:tc')).slice(2);
    for (const [index, cell] of cells.entries()) {
      const cellWidth = Number(cell.getElementsByTagName('w:tcW')[0].getAttribute('w:w'));
      expect(cellWidth).toBe(grid[index]);
      const size = extent(cell);
      expect(size.width).toBeLessThanOrEqual((cellWidth - 240) * emuPerTwip);
      expect(size.height).toBeLessThan(pageHeight / 2 * emuPerTwip);
      expect(size.width / size.height).toBeCloseTo(index === 0 ? 3 : 0.2, 4);
    }
  });

  it('reserves list indentation and block quote insets, and caps tall images to the page', async () => {
    const source = '- ![List](wide.png)\n  - ![Nested](wide.png)\n\n> ![Quote](wide.png)\n\n![Tall](tall.png)';
    const { document } = await readDocument(source, new Map([['wide.png', image(3000, 1000)], ['tall.png', image(2000, 6000)]]));
    const paragraphs = Array.from(document.getElementsByTagName('w:p')).filter(node => node.getElementsByTagName('w:drawing').length);
    expect(paragraphs).toHaveLength(4);
    const widths = paragraphs.map(node => extent(node).width);
    expect(widths[0]).toBeLessThanOrEqual((pageWidth - 440) * emuPerTwip);
    expect(widths[1]).toBeLessThanOrEqual((pageWidth - 880) * emuPerTwip);
    expect(widths[2]).toBeLessThanOrEqual((pageWidth - 400) * emuPerTwip);
    const tall = extent(paragraphs[3]);
    expect(tall.height).toBeLessThan(pageHeight * emuPerTwip);
    expect(tall.width / tall.height).toBeCloseTo(1 / 3, 5);
  });

  it('fails explicitly when a synchronous document has missing or invalid prepared image data', () => {
    expect(() => createWord('![Missing](missing.png)', defaultSettings)).toThrow(expect.objectContaining({ code: 'IMAGE_NOT_READY' }));
    expect(() => createWord('![Invalid](bad.png)', defaultSettings, [], new Map(), new Map([['bad.png', image(Infinity, 10)]])))
      .toThrow(expect.objectContaining({ code: 'IMAGE_NOT_READY' }));
  });

  it('prepares images once from the existing parse and forwards the optional resolver and binary reader', async () => {
    const parse = vi.spyOn(markdownParser, 'parse');
    const prepared = vi.spyOn(exportImages, 'prepareExportImages').mockResolvedValue(new Map([['assets/photo.png', image()]]));
    try {
      const source = 'Editable text ![Photo](assets/photo.png)';
      const context = markdownContext(source);
      const resolver = vi.fn(async () => 'https://example.com/photo.png');
      const reader = vi.fn(async () => ({ bytes: png, mimeType: 'image/png' }));
      const zip = await JSZip.loadAsync(await exportPreparedWord(context, defaultSettings, [], undefined, resolver, reader));
      expect(prepared).toHaveBeenCalledExactlyOnceWith(context, resolver, reader);
      expect(parse).toHaveBeenCalledTimes(1);
      expect(context.source).toBe(source);
      expect((await zip.file('word/document.xml')!.async('string'))).toContain('<w:drawing>');
      expect(zip.file(/^word\/media\/.*\.png$/)).toHaveLength(1);
    } finally { prepared.mockRestore(); parse.mockRestore(); }
  });

  it('propagates asynchronous image errors instead of generating a document with an alt-text substitute', async () => {
    const failure = Object.assign(new Error('Image could not be read'), { code: 'IMAGE_EXPORT_FAILED' });
    const prepared = vi.spyOn(exportImages, 'prepareExportImages').mockRejectedValue(failure);
    try {
      await expect(exportWord('![Photo](missing.png)', defaultSettings)).rejects.toBe(failure);
    } finally { prepared.mockRestore(); }
  });
});
