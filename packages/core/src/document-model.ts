import { paragraphBaseDirection } from './word-direction';

export type Direction = 'rtl' | 'auto' | 'ltr';
export type ExportSettings = {
  title: string;
  direction: Direction;
  fontSize: number;
  alignmentOnly: boolean;
  fontFamily: string;
};
export const defaultSettings: ExportSettings = {
  title: 'یادداشت من', direction: 'auto', fontSize: 12, alignmentOnly: false, fontFamily: 'Vazirmatn',
};
export function paragraphDirection(text: string, mode: Direction): 'rtl' | 'ltr' {
  return mode === 'auto' ? paragraphBaseDirection(text) : mode;
}
