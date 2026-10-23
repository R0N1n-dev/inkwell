<script setup>
import { onMounted, provide, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppSidebar from './components/AppSidebar.vue';
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
import { dataUrlToBytes, htmlToText } from './utils/format.js';

const router = useRouter();
const sidebarOpen = ref(false);
provide('sidebarOpen', sidebarOpen);
provide('openSidebar', () => (sidebarOpen.value = true));

let drainActions = null;

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

function initBackHandling() {
  onBackButton(() => {
    if (sidebarOpen.value) {
      sidebarOpen.value = false;
      return;
    }
    const name = router.currentRoute.value.name;
    const hasQuery = Object.keys(router.currentRoute.value.query || {}).length > 0;
    if (name && name !== 'notes' ? true : hasQuery) {
      if (hasQuery && name === 'notes') router.push({ name: 'notes' });
      else router.back();
    } else {
      exitApp();
    }
  });
}

onMounted(async () => {
  await initPlatform();
  initBackHandling();

  await initNotifications((extra) => {
    if (extra?.noteId) router.push({ name: 'editor', params: { id: extra.noteId } });
    else if (extra?.kind === 'daily') router.push({ name: 'editor', params: { id: 'new' } });
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
</script>

<template>
  <div class="app-shell">
    <router-view v-slot="{ Component }">
      <keep-alive :include="['NotesView']">
        <component :is="Component" />
      </keep-alive>
    </router-view>
    <AppSidebar v-model:visible="sidebarOpen" />
  </div>
</template>
