import { describe, expect, it } from 'vitest';
import { compareMarkdown } from './markdown-diff';
import { comparisonScrollAnchors, mapComparisonSource } from './use-comparison-scroll';

const normalize = (text: string) => text.replace(/\r\n?/g, '\n');
const mapping = (original: string, modified: string) => {
  const anchors = comparisonScrollAnchors(original, modified, compareMarkdown(original, modified));
  return (source: number, side: 'original' | 'modified') => mapComparisonSource(anchors, source, side);
};

describe('comparison source positions', () => {
  it.each([
    ['shared start\nshared middle\nshared end', 'added start\nshared start\nshared middle\nshared end'],
    ['shared start\nshared middle\nshared end', 'shared start\nshared middle\nshared end\nadded end'],
    ['shared start\nremoved one\nremoved two\nshared middle\nshared end', 'shared start\nshared middle\nshared end'],
    ['shared start\nold\nshared middle\nshared end', 'shared start\nnew one\nnew two\nnew three\nshared middle\nshared end'],
    ['shared start\r\nقدیمی\r\nshared middle\r\nshared end', 'shared start\nجدید و طولانی\nshared middle\nshared end'],
  ])('keeps shared text positions exact in both directions', (before, after) => {
    const project = mapping(before, after), original = normalize(before), modified = normalize(after);
    for (const marker of ['shared start', 'shared middle', 'shared end']) {
      for (let within = 0; within < marker.length; within++) {
        const oldAt = original.indexOf(marker) + within, newAt = modified.indexOf(marker) + within;
        expect(project(oldAt, 'original')).toBe(newAt);
        expect(project(newAt, 'modified')).toBe(oldAt);
      }
    }
  });

  it('collapses inserted/deleted regions to their unchanged boundary without drift', () => {
    const original = 'a\nshared', modified = 'a\ninsert one\ninsert two\nshared';
    const project = mapping(original, modified), boundary = original.indexOf('shared');
    expect(project(boundary, 'original')).toBe(modified.indexOf('shared'));
    for (let source = modified.indexOf('insert'); source < modified.indexOf('shared'); source++) expect(project(source, 'modified')).toBe(boundary);
    const reverse = mapping(modified, original);
    expect(reverse(boundary, 'modified')).toBe(modified.indexOf('shared'));
    for (let source = modified.indexOf('insert'); source < modified.indexOf('shared'); source++) expect(reverse(source, 'original')).toBe(boundary);
  });

  it.each([['', ''], ['', 'inserted\ntext'], ['deleted\ntext', '']])('bounds empty document mappings', (original, modified) => {
    const project = mapping(original, modified);
    for (const side of ['original', 'modified'] as const) {
      const length = side === 'original' ? original.length : modified.length;
      const targetLength = side === 'original' ? modified.length : original.length;
      let previous = -1;
      for (let source = 0; source <= length; source++) {
        const target = project(source, side);
        expect(Number.isFinite(target)).toBe(true);
        expect(target).toBeGreaterThanOrEqual(previous);
        expect(target).toBeLessThanOrEqual(targetLength);
        previous = target;
      }
    }
  });
});
