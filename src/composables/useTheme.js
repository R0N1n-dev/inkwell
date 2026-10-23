import { ref, watch } from 'vue';
import { getSetting, setSetting } from '../db/settings.js';
import { applyTheme } from '../theme/presets.js';
import { DEFAULT_THEME_ID, getTheme, THEMES } from '../theme/themes.js';
import { setStatusBarStyle } from '../platform/cap.js';

export const themeId = ref(DEFAULT_THEME_ID);
export const modePref = ref('system'); // 'light' | 'dark' | 'system'
export const isDark = ref(false);

let booted = false;
let mq = null;

function resolveDark(pref) {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return typeof matchMedia !== 'undefined'
    ? matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

function apply() {
  isDark.value = resolveDark(modePref.value);
  applyTheme(themeId.value, isDark.value ? 'dark' : 'light');
  setStatusBarStyle(isDark.value ? 'dark' : 'light');
}

export async function initTheme() {
  themeId.value = await getSetting('themeId', DEFAULT_THEME_ID);
  modePref.value = await getSetting('mode', 'system');
  if (typeof matchMedia !== 'undefined') {
    mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', () => {
      if (modePref.value === 'system') apply();
    });
  }
  apply();
  booted = true;
}

export async function setTheme(id) {
  themeId.value = getTheme(id).id;
  if (booted) await setSetting('themeId', themeId.value);
  apply();
}

export async function setMode(pref) {
  modePref.value = pref;
  if (booted) await setSetting('mode', pref);
  apply();
}

export function toggleDark() {
  setMode(isDark.value ? 'light' : 'dark');
}

export { THEMES, getTheme };
