<script setup>
import { onMounted, onUnmounted, provide, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppSidebar from './components/AppSidebar.vue';
import CommandPalette from './components/CommandPalette.vue';
import {
  initPlatform,
  hideSplash,
  onBackButton,
  onAppStateChange,
  exitApp
} from './platform/cap.js';
import { initIncomingActions } from './platform/sharein.js';
import { initNotifications, sweepDueReminders } from './platform/notify.js';
import { watchWidgets, syncWidgetNow, drainQuickCaptures, quickCaptureNoteMap } from './platform/widgets.js';
import { lockVault, vaultUnlocked } from './crypto/vault.js';
import { getSetting } from './db/settings.js';
import { createNote, addAttachment, autoPurgeTrash, updateNote } from './db/notes.js';
import { getOrCreateDailyNote } from './db/daily.js';
import { dataUrlToBytes, htmlToText } from './utils/format.js';
import { paletteOpen, openPalette, closePalette } from './composables/usePalette.js';
import { loadSavedSearches } from './composables/useSavedSearches.js';
import { runBackInterceptors } from './composables/useBackIntercept.js';
import { flushAll } from './composables/useFlushRegistry.js';

const router = useRouter();
const sidebarOpen = ref(false);
const exitPromptOpen = ref(false);
provide('sidebarOpen', sidebarOpen);
provide('openSidebar', () => (sidebarOpen.value = true));
provide('openPalette', openPalette);

let drainActions = null;
let backHandle = null;

function routeForAction(action) {
  switch (action?.type) {
    case 'new_note':
      router.push({ name: 'editor', params: { id: 'new' } });
      break;
    case 'daily':
      getOrCreateDailyNote()
        .then((doc) => router.push({ name: 'editor', params: { id: doc.id } }))
        .catch(() => router.push({ name: 'editor', params: { id: 'new' } }));
      break;
    case 'open_note': {
      // Rows captured from the widget carry a "qc:<timestamp>" id until the
      // capture has been imported; open the note it turned into instead.
      const id = quickCaptureNoteMap.get(action.id) || action.id;
      if (id && !String(id).startsWith('qc:')) {
        router.push({ name: 'editor', params: { id } });
      } else {
        router.push({ name: 'notes' });
      }
      break;
    }
    case 'search':
      // Launcher shortcut: straight into the quick switcher.
      router.replace({ name: 'notes' });
      openPalette();
      break;
    case 'share_text':
      handleSharedText(action.text || '');
      break;
    case 'share_media':
      handleSharedMedia(action);
      break;
    default:
      break;
  }
}

async function handleSharedText(text) {
  if (!text) return;
  const firstLine = text.split('\n')[0].slice(0, 80);
  const doc = await createNote({
    title: firstLine,
    content: `<p>${text.replace(/</g, '&lt;').replace(/\n/g, '</p><p>')}</p>`
  });
  router.push({ name: 'editor', params: { id: doc.id } });
}

async function handleSharedMedia(action) {
  const doc = await createNote({ title: action.title || 'Shared to Inkwell' });
  for (const item of action.items || []) {
    try {
      const { bytes, mime } = dataUrlToBytes(item.dataUrl);
      await addAttachment(doc, {
        id: `att_${Math.random().toString(36).slice(2, 10)}`,
        name: item.name || `shared-${Date.now()}`,
        type: mime,
        data: bytes
      });
    } catch {
      /* skip unreadable item */
    }
  }
  if (action.text) {
    await updateNote(doc.id, { content: `<p>${action.text}</p>`, contentText: action.text });
  }
  router.push({ name: 'editor', params: { id: doc.id } });
}

/**
 * Hardware back. Capacitor delivers it through the App plugin, and also fires
 * the legacy `document` "backbutton" event; listen to both so the flow survives
 * either dispatch path. The two arrive together for one press, hence the guard.
 */
let lastBackAt = 0;

function onNativeBack() {
  const now = Date.now();
  if (now - lastBackAt < 150) return;
  lastBackAt = now;
  handleBack();
}

async function initBackHandling() {
  document.addEventListener('backbutton', onNativeBack);
  backHandle = await onBackButton(onNativeBack);
}

/* ------------------------------------------------------------------ */
/* Hardware back: overlays -> nested screens -> notes home -> confirm  */
/* ------------------------------------------------------------------ */

function isVisible(el) {
  if (el.closest('[aria-hidden="true"]')) return false;
  if (
    typeof el.checkVisibility === 'function' &&
    !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
  ) {
    return false;
  }
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    rect.width > 0 &&
    rect.height > 0
  );
}

/** Any PrimeVue dialog, drawer, popover or select/date overlay on screen? */
function hasOpenOverlay() {
  const selector = [
    '.p-dialog-mask',
    '.p-drawer-mask',
    '.p-popover',
    '.p-menu',
    '.p-select-overlay',
    '.p-datepicker-panel',
    '.p-autocomplete-overlay'
  ].join(',');
  return [...document.querySelectorAll(selector)].some(isVisible);
}

/** Let PrimeVue close its own topmost overlay via its Escape handler. */
function closeTopOverlay() {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    bubbles: true,
    cancelable: true
  });
  const active = document.activeElement;
  const target = active && active !== document.body ? active : document;
  target.dispatchEvent(event);
}

function canGoBack() {
  return !!router.options.history.state?.back;
}

function goUp() {
  if (canGoBack()) router.back();
  else router.replace({ name: 'notes' });
}

function requestExit() {
  if (!exitPromptOpen.value) exitPromptOpen.value = true;
}

async function confirmExit() {
  exitPromptOpen.value = false;
  await exitApp();
}

function handleBack() {
  // An exit confirmation is already on screen: back cancels it.
  if (exitPromptOpen.value) {
    exitPromptOpen.value = false;
    return;
  }
  if (paletteOpen.value) {
    closePalette();
    return;
  }
  if (sidebarOpen.value) {
    sidebarOpen.value = false;
    return;
  }
  if (hasOpenOverlay()) {
    closeTopOverlay();
    return;
  }
  if (runBackInterceptors()) return;

  const current = router.currentRoute.value;
  const hasQuery = Object.keys(current.query || {}).length > 0;

  // Notes is home. A filtered/saved view first returns to All notes,
  // then the next back asks before leaving the app.
  if (current.name === 'notes') {
    if (hasQuery) router.replace({ name: 'notes' });
    else requestExit();
    return;
  }

  goUp();
}

function onCmdKey(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (paletteOpen.value) closePalette();
    else openPalette();
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onCmdKey);
  // Register back handling before any other boot work: while it is missing the
  // system back press would leave the app instead of walking up the screens.
  await initBackHandling();
  await initPlatform();
  // Notes captured from the widget live in a native queue until here.
  await drainQuickCaptures().catch(() => {});
  loadSavedSearches().catch(() => {});

  await initNotifications((extra) => {
    if (extra?.noteId) router.push({ name: 'editor', params: { id: extra.noteId } });
    else if (extra?.kind === 'daily') {
      getOrCreateDailyNote()
        .then((doc) => router.push({ name: 'editor', params: { id: doc.id } }))
        .catch(() => router.push({ name: 'editor', params: { id: 'new' } }));
    }
  });

  drainActions = await initIncomingActions(routeForAction);
  watchWidgets().catch(() => {});
  autoPurgeTrash(await getSetting('trashDays', 30));
  sweepDueReminders();

  onAppStateChange(({ isActive }) => {
    if (!isActive) {
      // Persist the editor first, then rebuild widgets from the fresh state
      // before Android can freeze the WebView.
      flushAll()
        .then(() => syncWidgetNow())
        .catch(() => {});
      getSetting('lockOnBackground', true).then((v) => {
        if (v && vaultUnlocked.value) lockVault();
      });
    } else {
      drainQuickCaptures()
        .catch(() => {})
        .finally(() => drainActions?.());
      sweepDueReminders();
    }
  });

  await hideSplash();
});

onUnmounted(() => {
  window.removeEventListener('keydown', onCmdKey);
  document.removeEventListener('backbutton', onNativeBack);
  backHandle?.remove?.();
});
</script>

<template>
  <div class="app-shell">
    <router-view v-slot="{ Component }">
      <keep-alive :include="['NotesView']">
        <component :is="Component" />
      </keep-alive>
    </router-view>
    <AppSidebar v-model:visible="sidebarOpen" />
    <CommandPalette />

    <!-- Plain overlay, not a PrimeVue dialog: the last step of the back flow
         must be visible no matter what else is on screen. -->
    <Transition name="exit-fade">
      <div v-if="exitPromptOpen" class="exit-mask" @click.self="exitPromptOpen = false">
        <div class="exit-card" role="dialog" aria-modal="true" aria-labelledby="exit-title">
          <div class="exit-icon"><i class="bx bx-power-off"></i></div>
          <div class="exit-copy">
            <h3 id="exit-title">Exit Inkwell?</h3>
            <p>Your notes are saved on this device. Press back again to stay.</p>
          </div>
          <div class="exit-actions">
            <button class="exit-btn ghost" @click="exitPromptOpen = false">Stay</button>
            <button class="exit-btn danger" @click="confirmExit">
              <i class="bx bx-power-off"></i> Exit
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.exit-mask {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(8, 10, 14, 0.55);
  backdrop-filter: blur(2px);
}
.exit-card {
  width: 100%;
  max-width: 340px;
  padding: 20px;
  border-radius: 20px;
  background: var(--ink-surface);
  border: 1px solid var(--ink-border);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
}
.exit-copy h3 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 700;
  color: var(--ink-text);
}
.exit-icon {
  width: 44px;
  height: 44px;
  margin-bottom: 12px;
  border-radius: 14px;
  background: var(--ink-accent-soft);
  color: var(--ink-accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.exit-copy p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--ink-text-muted);
}
.exit-actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}
.exit-btn {
  flex: 1;
  height: 44px;
  border-radius: 13px;
  border: 1px solid var(--ink-border);
  background: var(--ink-surface-2);
  color: var(--ink-text);
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.exit-btn.danger {
  background: var(--ink-accent);
  border-color: transparent;
  color: #0b1412;
}
.exit-btn:active {
  transform: scale(0.98);
}
.exit-fade-enter-active,
.exit-fade-leave-active {
  transition: opacity 0.16s ease;
}
.exit-fade-enter-from,
.exit-fade-leave-to {
  opacity: 0;
}
</style>
