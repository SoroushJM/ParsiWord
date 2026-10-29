import { describe, expect, it } from 'vitest';
import { deleteSample, readSamples, sampleStorageKey, saveSample } from './model';
const storage = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
};
describe('personal sample storage', () => {
  it('preserves exact Markdown, assigns independent ids and deletes just the chosen sample', () => {
    const store = storage(), source = '__نام__ &amp;\r\n\r\n$x^2$';
    const first = saveSample(store, '  نمونه  ', source)[0];
    const all = saveSample(store, 'نمونه', '# دیگر');
    expect(all).toHaveLength(2);
    expect(all[1].id).not.toBe(first.id);
    expect(readSamples(store)[0]).toEqual({ ...first, name: 'نمونه', markdown: source });
    expect(deleteSample(store, first.id)).toEqual([all[1]]);
  });
  it('rejects invalid input, corrupt storage and quota errors without claiming to save', () => {
    const store = storage();
    expect(() => saveSample(store, '  ', 'text')).toThrow('INVALID_SAMPLE');
    expect(() => saveSample(store, 'name', 'x'.repeat(500001))).toThrow('INVALID_SAMPLE');
    store.setItem(sampleStorageKey, '{broken');
    expect(() => saveSample(store, 'name', 'text')).toThrow();
    expect(store.getItem(sampleStorageKey)).toBe('{broken');
    expect(() => saveSample({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, 'name', 'text')).toThrow('quota');
  });
});
