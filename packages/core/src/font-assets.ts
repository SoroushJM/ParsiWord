export const bundledFont = 'Vazirmatn';
export const codeFont = 'Noto Sans Mono';
export const mathFont = 'STIX Two Math';
export const bundledFaces: Record<string, { arabic: boolean; regular: string; bold?: string }> = {
  [bundledFont]: { arabic: true, regular: 'Vazirmatn-Regular', bold: 'Vazirmatn-Bold' },
  [codeFont]: { arabic: false, regular: 'NotoSansMono-Regular', bold: 'NotoSansMono-Bold' },
  [mathFont]: { arabic: false, regular: 'STIXTwoMath-Regular' },
};
export const isBundledFont = (family: string) => Object.prototype.hasOwnProperty.call(bundledFaces, family);
export function normalizeFontFamily(family: string): string {
  return ['Arial', 'Tahoma', 'Times New Roman', 'Courier New'].includes(family) ? bundledFont : family;
}
export const codeRunFont = { ascii: codeFont, hAnsi: codeFont, eastAsia: codeFont, cs: bundledFont };
