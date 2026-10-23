/**
 * Inkwell theme definitions — straight from the app-theme.txt spec.
 * Dual themes: 80% primary / 20% accent.
 * Triple themes: 60% dominant / 30% structural / 10% accent.
 */

export const THEMES = [
  {
    id: 'classic-corporate',
    name: 'Classic Corporate',
    useCase: 'Fintech, SaaS, and Crypto apps',
    kind: 'dual',
    primary: '#1E2761',
    secondary: '#408EC6',
    accent: '#408EC6'
  },
  {
    id: 'energetic-retail',
    name: 'Energetic Retail',
    useCase: 'E-commerce, delivery, and travel apps',
    kind: 'dual',
    primary: '#2C3E50',
    secondary: '#E67E22',
    accent: '#E67E22'
  },
  {
    id: 'eco-organic',
    name: 'Eco-Organic',
    useCase: 'Sustainability, gardening, and wellness',
    kind: 'dual',
    primary: '#2C5F2D',
    secondary: '#97BC62',
    accent: '#97BC62'
  },
  {
    id: 'cyber-contrast',
    name: 'Cyber High-Contrast',
    useCase: 'Productivity, developer tools, and fitness',
    kind: 'dual',
    primary: '#1A1A1A',
    secondary: '#C1DD13',
    accent: '#C1DD13'
  },
  {
    id: 'minimalist-editorial',
    name: 'Minimalist Editorial',
    useCase: 'Fashion, portfolio, or lifestyle apps',
    kind: 'dual',
    primary: '#CC313D',
    secondary: '#F7C5CC',
    accent: '#F7C5CC'
  },
  {
    id: 'high-end-trio',
    name: 'The High-End Trio',
    useCase: 'Luxury retail, portfolio, fine dining',
    kind: 'triple',
    primary: '#1E2761',
    secondary: '#408EC6',
    accent: '#7A2048'
  },
  {
    id: 'bright-tech',
    name: 'The Bright Tech Vibe',
    useCase: 'SaaS dashboards, finance, data tracking',
    kind: 'triple',
    primary: '#2D3047',
    secondary: '#2EC4B6',
    accent: '#FF7A59'
  },
  {
    id: 'playful-pastel',
    name: 'The Playful Pastel',
    useCase: 'Casual social, mindfulness, education',
    kind: 'triple',
    primary: '#B298E7',
    secondary: '#B8E3E9',
    accent: '#F5B8D5'
  },
  {
    id: 'earthy-muted',
    name: 'The Earthy Muted',
    useCase: 'Home decor, plant tracking, lifestyle blogs',
    kind: 'triple',
    primary: '#4A5842',
    secondary: '#EFEBE4',
    accent: '#D98A6C'
  }
];

export const DEFAULT_THEME_ID = 'bright-tech';

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES.find((t) => t.id === DEFAULT_THEME_ID);
}

/* ------------------------------------------------------------------ */
/* Color math helpers                                                  */
/* ------------------------------------------------------------------ */

export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mix color with white (amount>0) or black (amount<0). amount in [-1,1] */
export function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return rgbToHex({
    r: r + (target - r) * t,
    g: g + (target - g) * t,
    b: b + (target - b) * t
  });
}

export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  });
}

export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function isDarkColor(hex) {
  return luminance(hex) < 0.35;
}

/** Best foreground (near-white or near-black) for a background color */
export function onColor(hex) {
  return isDarkColor(hex) ? '#FFFFFF' : '#16181F';
}

export function rgbString(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

/**
 * Material-style 50..950 palette for a base color.
 */
export function buildPalette(hex) {
  return {
    50: shade(hex, 0.92),
    100: shade(hex, 0.84),
    200: shade(hex, 0.68),
    300: shade(hex, 0.5),
    400: shade(hex, 0.28),
    500: hex,
    600: shade(hex, -0.12),
    700: shade(hex, -0.26),
    800: shade(hex, -0.4),
    900: shade(hex, -0.54),
    950: shade(hex, -0.7)
  };
}

/**
 * Tinted neutral surface palette.
 * Both ramps run light -> dark (0 = lightest, 950 = darkest), which is the
 * order PrimeVue's tokens assume: dark-mode components ask for
 * `{surface.950}`/`{surface.900}` as backgrounds and `{surface.0}`/`{surface.100}`
 * as text. Deep steps sit on the same values as the app's --ink-surface tokens.
 */
export function buildSurfacePalette(hex, dark) {
  const steps = dark
    ? {
        0: '#ffffff',
        50: mix('#eef0f6', hex, 0.06),
        100: mix('#e0e3ec', hex, 0.07),
        200: mix('#c4c9d7', hex, 0.08),
        300: mix('#a2a9ba', hex, 0.09),
        400: mix('#828a9d', hex, 0.1),
        500: mix('#5e657a', hex, 0.1),
        600: mix('#454c60', hex, 0.1),
        700: mix('#333a4b', hex, 0.09),
        800: mix('#232735', hex, 0.07),
        900: mix('#1b1e29', hex, 0.06),
        950: mix('#14161f', hex, 0.05)
      }
    : {
        0: '#ffffff',
        50: mix('#fafafa', hex, 0.04),
        100: mix('#f4f4f5', hex, 0.05),
        200: mix('#e4e4e7', hex, 0.06),
        300: mix('#d4d4d8', hex, 0.07),
        400: mix('#a1a1aa', hex, 0.08),
        500: mix('#71717a', hex, 0.08),
        600: mix('#52525b', hex, 0.09),
        700: mix('#3f3f46', hex, 0.09),
        800: mix('#27272a', hex, 0.1),
        900: mix('#18181b', hex, 0.1),
        950: mix('#0c0c0e', hex, 0.1)
      };
  return steps;
}

/** The 8 quick note colors offered in the editor color picker */
export const NOTE_COLORS = [
  { id: '', name: 'None', value: '' },
  { id: 'red', name: 'Red', value: '#E5484D' },
  { id: 'orange', name: 'Orange', value: '#F76B15' },
  { id: 'yellow', name: 'Yellow', value: '#FFC53D' },
  { id: 'green', name: 'Green', value: '#46A758' },
  { id: 'teal', name: 'Teal', value: '#12A594' },
  { id: 'blue', name: 'Blue', value: '#3E63DD' },
  { id: 'purple', name: 'Purple', value: '#8E4EC6' },
  { id: 'pink', name: 'Pink', value: '#D6409F' }
];
