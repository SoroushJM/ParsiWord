import { describe, expect, it } from 'vitest';
import {
  ParsiWordError,
  errorMessage,
  errorMessages,
  getErrorCode,
  isErrorCode,
  isFontError,
} from './errors';
import { RichContentError } from './rich-content';
import english from './locales/en.json';
import { renderMath, wordMath } from './math';
import { renderMermaid } from './diagrams';

describe('stable errors across locale and host boundaries', () => {
  it('classifies actual codes and serialized errors without matching text', () => {
    const cause = new Error('FONT_FORMAT in an unrelated provider message');
    const error = new ParsiWordError('FONT_NETWORK', { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.cause).toBe(cause);
    expect(getErrorCode(error)).toBe('FONT_NETWORK');
    expect(isFontError(error)).toBe(true);
    expect(getErrorCode(JSON.parse(JSON.stringify(error)))).toBe(
      'FONT_NETWORK',
    );
    for (const value of [
      cause,
      'FONT_NETWORK',
      { message: 'FILE_TOO_LARGE' },
      { code: 'FONT_UNKNOWN' },
      null,
    ]) {
      expect(getErrorCode(value)).toBeUndefined();
      expect(errorMessage(value, 'fallback')).toBe('fallback');
    }
    expect(isErrorCode('toString')).toBe(false);
    expect(isFontError(new ParsiWordError('FILE_TOO_LARGE'))).toBe(false);
  });
  it('provides an English translation for every stable user-facing message', () => {
    const messages: Record<string, string> = english;
    for (const [code, text] of Object.entries(errorMessages)) {
      expect(isErrorCode(code)).toBe(true);
      expect(messages[text], code).toBeTruthy();
      expect(messages[text], code).not.toBe(text);
      expect(errorMessage({ code })).toBe(text);
    }
  });
  it('keeps RichContentError instanceof and legacy message constructors compatible', () => {
    const error = new RichContentError('DIAGRAM_NOT_READY');
    expect(error).toBeInstanceOf(RichContentError);
    expect(error).toBeInstanceOf(ParsiWordError);
    expect(error.code).toBe('DIAGRAM_NOT_READY');
    const legacy = new RichContentError('Custom integration failure');
    expect(legacy.message).toBe('Custom integration failure');
    expect(legacy.code).toBe('RICH_CONTENT_FAILED');
  });
  it('preserves distinct equation errors rather than flattening them into a generic export failure', () => {
    const cases = [
      [() => renderMath('x'.repeat(20_001)), 'MATH_TOO_LARGE'],
      [() => renderMath('\\notARealCommand'), 'MATH_INVALID'],
      [() => wordMath('\\phantom{x}'), 'MATH_WORD_UNSUPPORTED'],
    ] as const;
    for (const [run, code] of cases) {
      expect(run).toThrow(expect.objectContaining({ code }));
    }
  });
  it('preserves the diagram size code before loading a renderer or touching the DOM', async () => {
    await expect(renderMermaid('x'.repeat(50_001))).rejects.toMatchObject({
      code: 'DIAGRAM_TOO_LARGE',
    });
    await expect(renderMermaid('x'.repeat(50_001))).rejects.toMatchObject({
      code: 'DIAGRAM_TOO_LARGE',
    });
  });
});
