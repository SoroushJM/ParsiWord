/** User-facing failures: do not silently lose formulas or diagrams in a document. */
export class RichContentError extends Error {}
export const mathLanguage = (language?: string | null) => /^(math|latex|tex)$/i.test(language || '');
