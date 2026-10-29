import { MAX_MARKDOWN_LENGTH } from '../document-limits';

export type Sample = { id: string; name: string; markdown: string };
export const sampleStorageKey = 'parsiword-personal-samples-v1';
type StorageArea = Pick<Storage, 'getItem' | 'setItem'>;

export function readSamples(storage: StorageArea): Sample[] {
  const value: unknown = JSON.parse(storage.getItem(sampleStorageKey) ?? '[]');
  if (!Array.isArray(value)) throw new Error('INVALID_SAMPLES');
  return value.filter((item): item is Sample => !!item && typeof item === 'object'
    && typeof item.id === 'string' && typeof item.name === 'string' && !!item.name.trim() && item.name.length <= 100
    && typeof item.markdown === 'string' && item.markdown.length <= MAX_MARKDOWN_LENGTH);
}

export function saveSample(storage: StorageArea, name: string, markdown: string): Sample[] {
  const clean = name.trim();
  if (!clean || clean.length > 100 || markdown.length > MAX_MARKDOWN_LENGTH) throw new Error('INVALID_SAMPLE');
  const samples = readSamples(storage);
  const next = [...samples, { id: crypto.randomUUID(), name: clean, markdown }];
  storage.setItem(sampleStorageKey, JSON.stringify(next));
  return next;
}

export function deleteSample(storage: StorageArea, id: string): Sample[] {
  const next = readSamples(storage).filter(sample => sample.id !== id);
  storage.setItem(sampleStorageKey, JSON.stringify(next));
  return next;
}
