declare module 'bidi-js' {
  export default function bidiFactory(): {
    getBidiCharTypeName(character: string): string;
    openingToClosingBracket(character: string): string | null;
    closingToOpeningBracket(character: string): string | null;
    getCanonicalBracket(character: string): string | null;
    getEmbeddingLevels(text: string, direction?: 'ltr' | 'rtl'): {
      levels: Uint8Array;
      paragraphs: { start: number; end: number; level: number }[];
    };
  };
}
