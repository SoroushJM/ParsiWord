import { describe, expect, it } from 'vitest';
import { colorRoles, defaultAppearance, exportAppearance, importAppearance, isAppearanceSettings, paletteFor, presetIds, presets, type AppearanceSettings } from './appearance';
import { isClientMessage, isHostMessage } from './host-protocol';

describe('device appearance contract', () => {
  it('defines complete and separate light/dark palettes for all four families', () => {
    for (const family of presetIds) for (const mode of ['light', 'dark'] as const) {
      expect(Object.keys(presets[family][mode]).sort()).toEqual([...colorRoles].sort());
      expect(presets[family].light.background).not.toBe(presets[family].dark.background);
    }
  });
  it('keeps palette overrides and Markdown/code roles independent', () => {
    const settings: AppearanceSettings = { ...defaultAppearance(), selected: 'mine', themes: [{ id: 'mine', name: 'من', base: 'paper', light: { 'source-syntax-heading': 'oklch(40% .2 20)', 'preview-background': 'ivory' }, dark: { 'syntax-keyword': 'rgb(255 0 0 / .8)' } }] };
    expect(paletteFor(settings, 'light')['source-syntax-heading']).toBe('oklch(40% .2 20)');
    expect(paletteFor(settings, 'light')['syntax-keyword']).toBe(presets.paper.light['syntax-keyword']);
    expect(paletteFor(settings, 'dark')['syntax-keyword']).toBe('rgb(255 0 0 / .8)');
    expect(paletteFor(settings, 'dark')['preview-background']).toBe(presets.paper.dark['preview-background']);
    expect(importAppearance(exportAppearance(settings))).toMatchObject(settings);
  });
  it('rejects unsafe property names, duplicates, invalid selection, versions and unbounded imports', () => {
    const settings = { ...defaultAppearance(), selected: 'mine', themes: [{ id: 'mine', name: 'Mine', base: 'navy', light: {}, dark: {} }] };
    expect(isAppearanceSettings(settings)).toBe(true);
    for (const invalid of [null, { ...settings, version: 2 }, { ...settings, selected: 'missing' }, { ...settings, themes: [...settings.themes, ...settings.themes] },
      { ...settings, themes: [{ ...settings.themes[0], light: { background: 'red;display:none' } }] },
      { ...settings, themes: [{ ...settings.themes[0], dark: { position: 'fixed' } }] }]) expect(isAppearanceSettings(invalid)).toBe(false);
    expect(() => importAppearance(' '.repeat(1_000_001))).toThrow();
    expect(() => importAppearance(JSON.stringify(settings))).toThrow();
  });
  it('validates appearance IPC independently of document/settings messages', () => {
    const message = { type: 'appearance', appearance: defaultAppearance() };
    expect(isClientMessage(message)).toBe(true); expect(isHostMessage(message)).toBe(true);
    expect(isClientMessage({ ...message, appearance: { ...message.appearance, mode: 'script' } })).toBe(false);
  });
});
