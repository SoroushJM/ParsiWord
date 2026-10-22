// One layout contract for editable Word documents and downloadable PDFs.
// Word uses twentieths of a point (twips); PDF uses points.
export const documentLayout = {
  width: 11906,
  height: 16838,
  margins: { top: 1100, bottom: 1100, left: 1000, right: 1000 },
  paragraph: { after: 160, line: 340 },
  code: { fontSize: 10, line: 280 },
} as const;

export const twipsToPoints = (value: number) => value / 20;
export const documentFontSize = (value: number) => Math.min(24, Math.max(9, value));
export const documentHeadingSize = (base: number, level: number) => Math.max(documentFontSize(base), 22 - (level - 1) * 2);
