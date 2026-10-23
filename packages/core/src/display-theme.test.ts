import { describe, expect, it } from 'vitest';
import { isThemePreference, readThemePreference, resolveDisplayTheme, themePreferenceKey } from './display-theme';

describe('display preferences', () => {
  it('accepts only supported preferences and defaults invalid storage to system', () => {
    for (const value of ['system', 'light', 'dark']) {
      expect(isThemePreference(value)).toBe(true);
      expect(readThemePreference({ getItem: key => key === themePreferenceKey ? value : null })).toBe(value);
    }
    for (const value of [null, '', 'auto', 'DARK', '{}']) {
      expect(readThemePreference({ getItem: () => value })).toBe('system');
    }
    expect(readThemePreference({ getItem: () => { throw new Error('Storage blocked'); } })).toBe('system');
  });

  it('resolves system changes without overriding explicit choices', () => {
    expect(resolveDisplayTheme('system', true).resolvedTheme).toBe('dark');
    expect(resolveDisplayTheme('system', false).resolvedTheme).toBe('light');
    expect(resolveDisplayTheme('light', true).resolvedTheme).toBe('light');
    expect(resolveDisplayTheme('dark', false).resolvedTheme).toBe('dark');
  });

  it('follows all VS Code theme kinds independently of the web preference', () => {
    for (const preference of ['system', 'light', 'dark'] as const) {
      expect(resolveDisplayTheme(preference, true, 'vscode-light')).toEqual({ resolvedTheme: 'light', highContrast: false });
      expect(resolveDisplayTheme(preference, false, 'vscode-dark')).toEqual({ resolvedTheme: 'dark', highContrast: false });
      expect(resolveDisplayTheme(preference, false, 'vscode-high-contrast')).toEqual({ resolvedTheme: 'dark', highContrast: true });
      expect(resolveDisplayTheme(preference, true, 'vscode-high-contrast-light')).toEqual({ resolvedTheme: 'light', highContrast: true });
      for (const classes of [
        'vscode-high-contrast vscode-high-contrast-light',
        'vscode-high-contrast-light vscode-high-contrast',
        'vscode-high-contrast vscode-high-contrast-light vscode-light',
      ]) expect(resolveDisplayTheme(preference, true, classes)).toEqual({ resolvedTheme: 'light', highContrast: true });
    }
  });
});
