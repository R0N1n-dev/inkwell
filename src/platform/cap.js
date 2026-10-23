import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';

export const isNative = Capacitor.isNativePlatform();

/** Custom Kotlin/Java plugin defined in android/app (see InkwellBridgePlugin.java) */
let bridgePromise = null;
export async function getBridge() {
  if (!isNative) return null;
  if (!bridgePromise) {
    bridgePromise = import('@capacitor/core').then(({ registerPlugin }) =>
      registerPlugin('InkwellBridge')
    );
  }
  return bridgePromise;
}

export async function initPlatform() {
  if (!isNative) return;
  try {
    await Keyboard.setResizeMode({ mode: 'body' });
  } catch {
    /* noop */
  }
  // Status bar style is owned by useTheme.js (apply() -> setStatusBarStyle),
  // which runs during boot before this mounts. Do not hardcode a style here,
  // otherwise light mode starts with a dark status bar (white text on a light
  // status bar = invisible) until the user toggles themes.
}

export async function hideSplash() {
  if (!isNative) return;
  try {
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch {
    /* noop */
  }
}

export async function setStatusBarStyle(mode) {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: mode === 'dark' ? Style.Dark : Style.Light });
  } catch {
    /* noop */
  }
}

export function onAppStateChange(cb) {
  if (!isNative) return { remove: () => {} };
  return App.addListener('appStateChange', cb);
}

export function onBackButton(cb) {
  if (!isNative) return { remove: () => {} };
  return App.addListener('backButton', cb);
}

export async function exitApp() {
  if (!isNative) return;
  try {
    await App.exitApp();
  } catch {
    /* noop */
  }
}
