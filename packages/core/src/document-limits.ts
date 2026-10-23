/** Limits apply to the final logical Markdown, after escaping/serialization. */
export const MAX_MARKDOWN_LENGTH = 500_000;

/** An oversize recovered document stays intact and can be reduced to the limit. */
export function canApplyMarkdown(previous: string, next: string): boolean {
  return next.length <= MAX_MARKDOWN_LENGTH
    || (previous.length > MAX_MARKDOWN_LENGTH && next.length < previous.length);
}
