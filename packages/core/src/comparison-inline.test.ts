import { describe, expect, it } from 'vitest';
import { inlineParts, sourceUnits } from './comparison-inline';

describe('unified comparison review', () => {
  it('keeps unchanged text once and orders deletions before insertions', () => {
    const parts = inlineParts(sourceUnits('اول\nقدیمی\nآخر\n'), sourceUnits('اول\nجدید\nآخر\n'));
    expect(parts.map(part => [part.kind, part.text])).toEqual([['same', 'اول\n'], ['delete', 'قدیمی\n'], ['insert', 'جدید\n'], ['same', 'آخر\n']]);
    expect(parts.filter(part => part.change === 0)).toHaveLength(2);
  });
  it('can reconstruct both inputs without introducing review text in either draft', () => {
    for (const [before, after] of [['', 'new'], ['old', ''], ['a\n\nb', 'a\nb\n'], ['😀\nفارسی', '😀\nعربی']]) {
      const parts = inlineParts(sourceUnits(before), sourceUnits(after));
      expect(parts.filter(part => part.kind !== 'insert').map(part => part.text).join('')).toBe(before);
      expect(parts.filter(part => part.kind !== 'delete').map(part => part.text).join('')).toBe(after);
    }
  });
  it('preserves final-newline changes and bounds pathological comparisons', () => {
    expect(inlineParts(sourceUnits('a'), sourceUnits('a\n')).map(part => part.kind)).toEqual(['delete', 'insert']);
    expect(inlineParts(['same\n','old\n','end'], ['same\n','new\n','end'], 0).map(part => part.kind)).toEqual(['same', 'delete', 'insert', 'same']);
  });
});
