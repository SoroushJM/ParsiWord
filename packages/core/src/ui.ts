/** React editor surface. Hosts configure services separately through /host. */
export { default as EditorApp } from './App';
export { ComparisonWorkspace } from './ComparisonWorkspace';
export { LocaleProvider, translate } from './locale';
export { useDisplayTheme, type ThemePreference, type ResolvedTheme, type DisplayThemeControls } from './display-theme';
export { browserImageUrl } from './markdown-image';
export { receiveAppearance } from './appearance-store';
