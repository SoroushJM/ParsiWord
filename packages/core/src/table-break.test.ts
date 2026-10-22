import { describe, expect, it } from 'vitest';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { createWord, defaultSettings } from './converter';

async function readTableCell(source: string) {
  const markdown = `| Value | Neighbour |\n| --- | --- |\n| ${source} | unchanged |`;
  const bytes = await Packer.toArrayBuffer(createWord(markdown, defaultSettings));
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')!.async('string');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  expect(document.getElementsByTagName('w:tbl')).toHaveLength(1);
  expect(document.getElementsByTagName('w:tr')).toHaveLength(2);
  const cells = Array.from(document.getElementsByTagName('w:tc'));
  expect(cells).toHaveLength(4);
  expect(cells[3].textContent).toBe('unchanged');
  const cell = cells[2];
  // Read actual OOXML descendants in document order, including native Word
  // breaks. Concatenated w:t alone would miss a lost or misplaced line break.
  const text = Array.from(cell.getElementsByTagName('*'))
    .filter(element => element.tagName === 'w:t' || element.tagName === 'w:br')
    .map(element => element.tagName === 'w:br' ? '\n' : element.textContent)
    .join('');
  return { cell, text };
}

describe('table cell line breaks survive real DOCX serialization', () => {
  it.each(['<br>', '<br/>', '<BR />'])('exports %s as a native Word line break between the original text', async tag => {
    const { cell, text } = await readTableCell(`first${tag}second`);
    expect(text).toBe('first\nsecond');
    expect(cell.getElementsByTagName('w:br')).toHaveLength(1);
    expect(cell.getElementsByTagName('w:p')).toHaveLength(1);
  });

  it('keeps multiple line breaks in the correct order without splitting the table row', async () => {
    const { cell, text } = await readTableCell('first<br>second<br/>third<BR />fourth');
    expect(text).toBe('first\nsecond\nthird\nfourth');
    expect(cell.getElementsByTagName('w:br')).toHaveLength(3);
    expect(cell.getElementsByTagName('w:p')).toHaveLength(1);
  });

  it.each(['<span>literal</span>', '<hr>', '<br class="line">', '<brx>'])('retains other HTML %s as literal cell text', async html => {
    const source = `before${html}after`;
    const { cell, text } = await readTableCell(source);
    expect(text).toBe(source);
    expect(cell.getElementsByTagName('w:br')).toHaveLength(0);
  });

  it.each([
    ['&lt;br&gt;', '<br>'],
    ['&lt;br/&gt;', '<br/>'],
    ['&lt;BR /&gt;', '<BR />'],
  ])('retains escaped %s as visible text rather than a line break', async (escaped, visible) => {
    const { cell, text } = await readTableCell(`before${escaped}after`);
    expect(text).toBe(`before${visible}after`);
    expect(cell.getElementsByTagName('w:br')).toHaveLength(0);
  });

  it('keeps an inline-code break tag as editable code text', async () => {
    const { cell, text } = await readTableCell('before `<br>` after');
    expect(text.replace(/\u200e/g, '')).toBe('before <br> after');
    expect(cell.getElementsByTagName('w:br')).toHaveLength(0);
  });
});
