/** React editor surface. Hosts configure services separately through /host. */
export { default as EditorApp } from './App';
export { LocaleProvider, translate } from './locale';
export { useDisplayTheme, type ThemePreference, type ResolvedTheme, type DisplayThemeControls } from './display-theme';
