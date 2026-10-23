// Compatibility entry. New consumers should select /ui, /host, /document or an adapter.
export { EditorApp, LocaleProvider } from './ui';
export { configureHost, type EditorHost, type DocumentSnapshot, type HostCommand } from './host-api';
export { defaultSettings, type ExportSettings } from './document-model';
export { exportWord } from './adapters/word';
