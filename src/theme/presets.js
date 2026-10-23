import Aura from '@primeuix/themes/aura';
import { usePreset } from '@primeuix/themes';
import {
  getTheme,
  buildPalette,
  buildSurfacePalette,
  onColor,
  rgbString,
  mix,
  shade,
  isDarkColor
} from './themes.js';

/**
 * Builds a PrimeVue v4 preset from one of the Inkwell themes.
 * Primary dominates (~80%), the accent (~20%) is exposed as CSS custom
 * properties used by app-level components (FAB, selection, widgets...).
 */
export function buildPreset(themeId) {
  const theme = getTheme(themeId);
  const primaryPalette = buildPalette(theme.primary);
  const primaryOn = onColor(theme.primary);
  const accentOn = onColor(theme.accent);

  const preset = structuredClone(Aura);

  // primitive palettes
  preset.primitive.primary = { ...primaryPalette, contrast: primaryOn };
  if (theme.secondary && theme.secondary !== theme.accent) {
    preset.primitive.secondary = buildPalette(theme.secondary);
  }

  // semantic surfaces + primary per color scheme
  const lightSurface = buildSurfacePalette(theme.primary, false);
  const darkSurface = buildSurfacePalette(theme.primary, true);

  for (const scheme of ['light', 'dark']) {
    const cs = preset.semantic.colorScheme[scheme];
    const surface = scheme === 'light' ? lightSurface : darkSurface;
    cs.surface = surface;

    cs.primary = {
      ...primaryPalette,
      contrast: primaryOn,
      // hover/active tuned per scheme so buttons stay legible on dark bg
      ...(scheme === 'dark'
        ? {
            500: primaryPalette[400],
            600: primaryPalette[300],
            700: primaryPalette[200]
          }
        : {})
    };

    cs.focus = { ...(cs.focus || {}), ring: { ...(cs.focus?.ring || {}) } };
    cs.content = { ...(cs.content || {}) };
    cs.text = {
      ...(cs.text || {}),
      color: scheme === 'light' ? surface[700] : surface[100],
      hoverColor: scheme === 'light' ? surface[900] : surface[0],
      mutedColor: scheme === 'light' ? surface[500] : surface[400]
    };

    // make the focus ring use the theme primary
    if (cs.primary) {
      cs.focus.ring.color = scheme === 'light' ? primaryPalette[500] : primaryPalette[300];
    }
  }

  // component-level accent touches (kept subtle: 20% rule)
  preset.components = preset.components || {};
  preset.components.button = {
    ...(preset.components.button || {}),
    colorScheme: {
      light: { primary: { contrast: primaryOn } },
      dark: { primary: { contrast: onColor(primaryPalette[400]) } }
    }
  };

  return preset;
}

/**
 * Applies theme + color mode to PrimeVue and the document.
 */
export function applyTheme(themeId, mode) {
  const theme = getTheme(themeId);
  const dark = mode === 'dark';

  usePreset(buildPreset(themeId));

  const root = document.documentElement;
  root.classList.toggle('inkwell-dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';

  // App-level custom properties (the "20% accent" and brand colors)
  const accent = theme.accent;
  const secondary = theme.secondary || theme.accent;
  const vars = {
    '--ink-primary': theme.primary,
    '--ink-primary-rgb': rgbString(theme.primary),
    '--ink-secondary': secondary,
    '--ink-secondary-rgb': rgbString(secondary),
    '--ink-accent': accent,
    '--ink-accent-rgb': rgbString(accent),
    '--ink-on-primary': onColor(theme.primary),
    '--ink-on-accent': onColor(accent),
    '--ink-on-secondary': onColor(secondary),
    '--ink-accent-soft': dark ? mix(accent, '#12141c', 0.72) : mix(accent, '#ffffff', 0.84),
    '--ink-primary-soft': dark ? mix(theme.primary, '#12141c', 0.55) : mix(theme.primary, '#ffffff', 0.9),
    '--ink-surface': dark ? '#14161f' : '#ffffff',
    '--ink-surface-2': dark ? '#1b1e29' : '#f6f6f8',
    '--ink-surface-3': dark ? '#232735' : '#ececf0',
    '--ink-border': dark ? 'rgba(255,255,255,0.09)' : 'rgba(20,22,31,0.1)',
    '--ink-text': dark ? '#e8eaf1' : '#181b25',
    '--ink-text-muted': dark ? '#9aa1b2' : '#6b7180',
    '--ink-statusbar': dark ? shade(theme.primary, -0.55) : theme.primary,
    '--ink-safe-top': 'env(safe-area-inset-top, 0px)',
    '--ink-safe-bottom': 'env(safe-area-inset-bottom, 0px)'
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);

  // meta theme-color for browser chrome
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = dark ? '#14161f' : theme.primary;
}

export { isDarkColor };
