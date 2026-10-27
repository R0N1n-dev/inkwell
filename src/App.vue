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
import { watchWidgets } from './platform/widgets.js';
import { lockVault, vaultUnlocked } from './crypto/vault.js';
import { getSetting } from './db/settings.js';
import { createNote, addAttachment, autoPurgeTrash } from './db/notes.js';
import { getOrCreateDailyNote } from './db/daily.js';
import { dataUrlToBytes, htmlToText } from './utils/format.js';
import { paletteOpen, openPalette, closePalette } from './composables/usePalette.js';
import { loadSavedSearches } from './composables/useSavedSearches.js';
import { runBackInterceptors } from './composables/useBackIntercept.js';

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
    case 'open_note':
      router.push({ name: 'editor', params: { id: action.id } });
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
    await doc.incrementalPatch({ content: `<p>${action.text}</p>`, contentText: action.text });
  }
  router.push({ name: 'editor', params: { id: doc.id } });
}

async function initBackHandling() {
  backHandle = await onBackButton(handleBack);
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
  await initPlatform();
  await initBackHandling();
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
      getSetting('lockOnBackground', true).then((v) => {
        if (v && vaultUnlocked.value) lockVault();
      });
    } else {
      drainActions?.();
      sweepDueReminders();
    }
  });

  await hideSplash();
});

onUnmounted(() => {
  window.removeEventListener('keydown', onCmdKey);
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

    <Dialog
      v-model:visible="exitPromptOpen"
      modal
      header="Exit Inkwell?"
      :style="{ width: '360px', maxWidth: '90vw' }"
    >
      <div class="exit-dialog">
        <div class="exit-icon"><i class="pi pi-power-off"></i></div>
        <p>Your notes are saved on this device. Exit the app?</p>
      </div>
      <template #footer>
        <Button label="Stay" text severity="secondary" @click="exitPromptOpen = false" />
        <Button label="Exit" icon="pi pi-power-off" @click="confirmExit" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.exit-dialog {
  display: flex;
  align-items: center;
  gap: 14px;
}
.exit-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--ink-accent-soft);
  color: var(--ink-accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex: none;
}
.exit-dialog p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--ink-text-muted);
}
</style>
