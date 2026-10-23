import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadDraft, persistDraft } from './drafts';
import { MAX_MARKDOWN_LENGTH } from '@parsiword/core/document-limits';

afterEach(() => vi.unstubAllGlobals());
describe('saved draft migration and recovery', () => {
  it('preserves an oversize saved draft instead of replacing it with a sample', () => {
    const markdown = 'متن\n'.repeat(Math.ceil(MAX_MARKDOWN_LENGTH / 4) + 1);
    let raw = JSON.stringify({ markdown, settings: { direction: 'ltr', fontSize: 14, alignmentOnly: true } });
    vi.stubGlobal('localStorage', { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } });
    const draft = loadDraft('fa');
    expect(draft).toMatchObject({ markdown, recovery: 'oversize', settings: { direction: 'ltr', fontSize: 14, alignmentOnly: false } });
    persistDraft(draft);
    expect(JSON.parse(raw).markdown).toBe(markdown);
  });
  it('migrates partial settings and ignores invalid individual fields', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ markdown: '', settings: { direction: 'auto', title: 'kept', fontSize: 999, fontFamily: 'Vazirmatn' } }) });
    expect(loadDraft('en')).toMatchObject({ markdown: '', settings: { title: 'kept', direction: 'auto', fontSize: 12, fontFamily: 'Vazirmatn' } });
  });
  it('retires the legacy comparison flag without losing RTL text or its title', () => {
    const markdown = 'متن قدیمی React (version 19) حفظ می‌شود.';
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ markdown, settings: { title: 'سند قبلی', fontFamily: 'Arial', direction: 'rtl', alignmentOnly: true } }) });
    expect(loadDraft('fa')).toMatchObject({ markdown, settings: { title: 'سند قبلی', direction: 'rtl', fontFamily: 'Vazirmatn', alignmentOnly: false } });
  });
});
