import { describe, expect, it } from 'vitest';
import { DocumentSession } from './document-session';
import { defaultSettings } from './document-model';
import { MAX_MARKDOWN_LENGTH, canApplyMarkdown } from './document-limits';

describe('logical document session', () => {
  it('captures same-task source changes and fixed export settings', () => {
    const session = new DocumentSession('old', defaultSettings);
    session.change('latest', 'rich');
    session.update('title', 'At export');
    const operation = session.snapshot();
    session.change('later', 'source');
    session.update('title', 'Later title');
    expect(operation).toMatchObject({ markdown: 'latest', settings: { title: 'At export' }, revision: 2 });
    operation.settings.title = 'Changed copy';
    expect(session.getSnapshot().settings.title).toBe('Later title');
  });
  it('checks final Markdown size for programmatic and escaped input', () => {
    const session = new DocumentSession('a'.repeat(MAX_MARKDOWN_LENGTH), defaultSettings);
    expect(session.change(session.getSnapshot().markdown + '**', 'toolbar')).toBe(false);
    expect(session.change('\\*'.repeat(MAX_MARKDOWN_LENGTH / 2 + 1), 'rich')).toBe(false);
    expect(session.getSnapshot().revision).toBe(0);
    expect(session.change('smaller', 'source')).toBe(true);
  });
  it('retains external oversize text and allows recovery by deletion', () => {
    const oversized = 'a'.repeat(MAX_MARKDOWN_LENGTH + 10);
    const session = new DocumentSession('', defaultSettings);
    session.replace(oversized);
    expect(session.getSnapshot().markdown).toBe(oversized);
    expect(session.change(oversized + 'a', 'source')).toBe(false);
    expect(session.change(oversized.slice(1), 'source')).toBe(true);
    expect(canApplyMarkdown(oversized, oversized)).toBe(false);
    expect(session.change('recovered', 'source')).toBe(true);
  });
  it('keeps composition metadata separate from logical revisions', () => {
    const session = new DocumentSession('', defaultSettings);
    session.composition(true);
    session.change('فارسی', 'source');
    const composing = session.snapshot();
    session.composition(false);
    expect(session.getSnapshot()).toMatchObject({ markdown: 'فارسی', composing: false, revision: composing.revision });
  });
});
