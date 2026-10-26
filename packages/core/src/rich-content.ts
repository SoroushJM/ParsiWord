import { ParsiWordError, isErrorCode, type ErrorCode, type ErrorDetails } from './errors';

/** User-facing failures: do not silently lose formulas, diagrams or images. */
export class RichContentError extends ParsiWordError {
  constructor(code: ErrorCode, details?: ErrorDetails);
  /** @deprecated Pass a stable ErrorCode. Kept for existing deep-import consumers. */
  constructor(message: string);
  constructor(codeOrMessage: string, details?: ErrorDetails) {
    super(isErrorCode(codeOrMessage) ? codeOrMessage : 'RICH_CONTENT_FAILED', details);
    this.name = 'RichContentError';
    if (!isErrorCode(codeOrMessage)) this.message = codeOrMessage;
  }
}
export const mathLanguage = (language?: string | null) => /^(math|latex|tex)$/i.test(language || '');
