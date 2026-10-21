import data from './data/delimiter-font.json';

export const delimiterFont = data;
const pattern = new RegExp(`([${String.fromCodePoint(...data.codepoints)}]+)`, 'u');
const fallback = new Set(data.codepoints);

// Only the 14 characters observed missing on the user's device use this face.
// Keep the selected family for all prose and all ordinary punctuation.
export function delimiterFontParts(text: string): { text: string; fallback: boolean }[] {
  return text.split(pattern).filter(Boolean).map(text => ({ text, fallback: fallback.has(text.codePointAt(0)!) }));
}
