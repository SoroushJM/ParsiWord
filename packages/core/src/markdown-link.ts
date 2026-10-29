const externalProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** Link destinations may be relative, but must never invoke script or host commands. */
export function isMarkdownLink(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 8192 || value !== value.trim()
    || /[\u0000-\u001f\u007f\\]/.test(value)) return false;
  try { return externalProtocols.has(new URL(value, 'https://parsiword.invalid/').protocol); }
  catch { return false; }
}

export function externalLinkUrl(href: string, base?: string): string | null {
  if (!isMarkdownLink(href)) return null;
  try {
    const url = new URL(href, base);
    return externalProtocols.has(url.protocol) ? url.href : null;
  } catch { return null; }
}
