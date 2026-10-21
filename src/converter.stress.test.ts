import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { DOMParser, type Node as XmlNode } from '@xmldom/xmldom';
import { exportWord, defaultSettings } from './converter';
import { hardCases, hardMarkdown, catalogPairs } from '../tests/fixtures/rtl-stress';

function textOf(node: XmlNode): string {
  if (node.nodeName === 'w:t') return node.textContent || '';
  if (node.nodeName === 'w:br') return '\n';
  return Array.from(node.childNodes || []).map(textOf).join('');
}

describe('complete stress corpus through actual Markdown → DOCX export', () => {
  it.each(['auto', 'rtl', 'ltr'] as const)('preserves all symbols, formatting, links and breaks in %s mode', async direction => {
    const zip = await JSZip.loadAsync(await exportWord(hardMarkdown, { ...defaultSettings, direction }));
    const document = new DOMParser().parseFromString(await zip.file('word/document.xml')!.async('string'), 'application/xml');
    const paragraphs = Array.from(document.getElementsByTagName('w:p'));
    const stripAddedControls = (text: string) => text.replace(/[\u200e\u202b\u202c]/g, '');
    const text = paragraphs.map(p => stripAddedControls(textOf(p)));
    for (const test of hardCases) {
      const index = text.indexOf(test.id);
      expect(index, test.id).toBeGreaterThan(-1);
      expect(text[index + 2], test.id).toBe(test.parts.map(p => p.text).join(''));
    }
    const rows = Array.from(document.getElementsByTagName('w:tr'));
    expect(rows).toHaveLength(catalogPairs.length + 1);
    for (const [index, pair] of catalogPairs.entries()) {
      const cells = Array.from(rows[index + 1].getElementsByTagName('w:tc')).map(c => stripAddedControls(textOf(c)));
      expect(cells[1]).toBe(pair.open + 'متن فارسی' + pair.close);
      expect(cells[2]).toBe(pair.open + 'React 19' + pair.close);
      expect(cells[3]).toBe(pair.open + 'React و فارسی' + pair.close);
    }
    const runs = Array.from(document.getElementsByTagName('w:r'));
    for (const run of runs) {
      if (run.getElementsByTagName('w:rtl').length) expect(textOf(run)).not.toMatch(/[A-Za-z]/u);
    }
    expect(document.getElementsByTagName('w:br')).toHaveLength(1);
    expect(document.getElementsByTagName('w:b').length).toBeGreaterThan(2);
    expect(document.getElementsByTagName('w:i').length).toBeGreaterThan(0);
    expect(document.getElementsByTagName('w:hyperlink').length).toBeGreaterThan(0);
    expect(await zip.file('word/_rels/document.xml.rels')!.async('string')).toContain('https://react.dev/');
    expect(document.getElementsByTagName('w:dir')).toHaveLength(0);
    expect(zip.file('word/vbaProject.bin')).toBeNull();
    // Every generated scope is balanced within its own paragraph, not merely
    // balanced across the complete document after accidental leakage.
    for (const paragraph of paragraphs) {
      let depth = 0;
      for (const c of textOf(paragraph)) {
        if (c === '\u202b') depth++;
        if (c === '\u202c') depth--;
        expect(depth).toBeGreaterThanOrEqual(0);
      }
      expect(depth).toBe(0);
    }
  });
});
