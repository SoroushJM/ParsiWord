import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { appearanceKey } from './appearance';
import { applyAppearance, useAppearance, previewPalette, saveAppearance, savedAppearance, receiveAppearance } from './appearance-store';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
type HostKind = 'web' | 'native' | 'vscode';
export const themePreferenceKey = 'parsiword-display-theme-v1';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function readThemePreference(storage: Pick<Storage, 'getItem'>): ThemePreference {
  try {
    const value = storage.getItem(themePreferenceKey);
    return isThemePreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function resolveDisplayTheme(preference: ThemePreference, systemDark: boolean, hostClasses?: string) {
  if (hostClasses !== undefined) {
    const classes = new Set(hostClasses.split(/\s+/));
    return {
      resolvedTheme: (classes.has('vscode-high-contrast-light') || classes.has('vscode-light') ? 'light'
        : classes.has('vscode-dark') || classes.has('vscode-high-contrast') ? 'dark' : 'light') as ResolvedTheme,
      highContrast: classes.has('vscode-high-contrast') || classes.has('vscode-high-contrast-light'),
    };
  }
  return {
    resolvedTheme: (preference === 'system' ? systemDark ? 'dark' : 'light' : preference) as ResolvedTheme,
    highContrast: false,
  };
}

/** Shared appearance state changes CSS tokens, without touching document state. */
export function useDisplayTheme(hostKind: HostKind) {
  const settings = useAppearance();
  const preference = settings.mode;
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [hostClasses, setHostClasses] = useState(() => document.body.className);
  const isHostControlled = hostKind === 'vscode' && settings.followHost;
  const forced = previewPalette();
  const { resolvedTheme, highContrast } = resolveDisplayTheme(forced ?? preference, systemDark, isHostControlled ? hostClasses : undefined);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    const observer = new MutationObserver(() => setHostClasses(document.body.className));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const onStorage = (event: StorageEvent) => {
      if (event.key !== appearanceKey && event.key !== null) return;
      try { receiveAppearance(JSON.parse(localStorage.getItem(appearanceKey) ?? 'null')); } catch { /* Keep current appearance. */ }
    };
    media.addEventListener('change', update);
    window.addEventListener('storage', onStorage);
    return () => { observer.disconnect(); media.removeEventListener('change', update); window.removeEventListener('storage', onStorage); };
  }, []);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.dataset.displayTheme = resolvedTheme;
    root.dataset.themePreference = isHostControlled ? 'host' : preference;
    root.dataset.displayContrast = highContrast ? 'high' : 'normal';
    applyAppearance(settings, resolvedTheme, isHostControlled);
  }, [settings, preference, resolvedTheme, highContrast, isHostControlled]);
  const setPreference = useCallback((next: ThemePreference) => {
    if (!isHostControlled && isThemePreference(next)) saveAppearance({ ...savedAppearance(), mode: next });
  }, [isHostControlled]);
  return { preference, resolvedTheme, setPreference, isHostControlled };
}
export type DisplayThemeControls = ReturnType<typeof useDisplayTheme>;
