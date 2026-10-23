import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

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

function browserPreference(): ThemePreference {
  try { return readThemePreference(window.localStorage); } catch { return 'system'; }
}

/** Display state never enters a document snapshot, export settings or host edits. */
export function useDisplayTheme(hostKind: HostKind) {
  const [preference, changePreference] = useState<ThemePreference>(browserPreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [hostClasses, setHostClasses] = useState(() => document.body.className);
  const isHostControlled = hostKind === 'vscode';
  const { resolvedTheme, highContrast } = resolveDisplayTheme(preference, systemDark, isHostControlled ? hostClasses : undefined);

  useEffect(() => {
    if (isHostControlled) {
      const update = () => setHostClasses(document.body.className);
      update();
      const observer = new MutationObserver(update);
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      return () => observer.disconnect();
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    const onStorage = (event: StorageEvent) => {
      if (event.key === themePreferenceKey || event.key === null) changePreference(browserPreference());
    };
    update();
    media.addEventListener('change', update);
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('storage', onStorage);
    };
  }, [isHostControlled]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.dataset.displayTheme = resolvedTheme;
    root.dataset.themePreference = isHostControlled ? 'host' : preference;
    root.dataset.displayContrast = highContrast ? 'high' : 'normal';
  }, [preference, resolvedTheme, highContrast, isHostControlled]);

  const setPreference = useCallback((next: ThemePreference) => {
    if (isHostControlled || !isThemePreference(next)) return;
    changePreference(next);
    // A blocked/full storage area must not prevent an immediate theme change.
    try { window.localStorage.setItem(themePreferenceKey, next); } catch { /* Session preference still applies. */ }
  }, [isHostControlled]);

  return { preference, resolvedTheme, setPreference, isHostControlled };
}

export type DisplayThemeControls = ReturnType<typeof useDisplayTheme>;
