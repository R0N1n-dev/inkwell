<script setup>
import { inject, onMounted, ref } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Capacitor } from '@capacitor/core';
import { THEMES, themeId, setTheme, modePref, setMode } from '../composables/useTheme.js';
import { getSetting, setSetting } from '../db/settings.js';
import { getDB } from '../db/database.js';
import { exportBackup, importBackup, emptyTrash } from '../db/notes.js';
import { saveTextFile } from '../utils/exporters.js';
import { scheduleDailyReminder } from '../platform/notify.js';
import { base64ToBytes } from '../utils/format.js';
import { vaultConfigured, lockVault } from '../crypto/vault.js';
import { syncWidgets } from '../platform/widgets.js';

const openSidebar = inject('openSidebar', () => {});
const toast = useToast();
const confirm = useConfirm();

const themeDlg = ref(false);
const trashDays = ref(30);
const autoLock = ref(10);
const lockOnBg = ref(true);
const dailyOn = ref(false);
const dailyHour = ref(20);
const dailyMin = ref(0);

onMounted(async () => {
  trashDays.value = await getSetting('trashDays', 30);
  autoLock.value = await getSetting('vaultAutoLockMin', 10);
  lockOnBg.value = await getSetting('lockOnBackground', true);
  dailyOn.value = await getSetting('dailyReminder', false);
  const t = await getSetting('dailyReminderTime', [20, 0]);
  dailyHour.value = t[0];
  dailyMin.value = t[1];
});

async function pickTrashDays(v) {
  trashDays.value = v;
  await setSetting('trashDays', v);
}

async function pickAutoLock(v) {
  autoLock.value = v;
  await setSetting('vaultAutoLockMin', v);
}

async function toggleLockBg(v) {
  lockOnBg.value = v;
  await setSetting('lockOnBackground', v);
}

async function toggleDaily(v) {
  dailyOn.value = v;
  await setSetting('dailyReminder', v);
  await scheduleDailyReminder(v, dailyHour.value, dailyMin.value);
}

async function exportAll() {
  toast.add({ severity: 'info', summary: 'Building backup…', life: 1500 });
  const json = await exportBackup();
  const name = `inkwell-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const uri = await saveTextFile(name, json, 'application/json');
  toast.add({ severity: 'success', summary: 'Backup saved', detail: String(uri).split('/').slice(-2).join('/'), life: 3200 });
}

async function importAll() {
  try {
    const res = await FilePicker.pickFiles({ types: ['application/json', '.json'], readData: true, limit: 1 });
    const file = res.files?.[0];
    if (!file?.data) return;
    const text = new TextDecoder().decode(base64ToBytes(file.data));
    confirm.require({
      header: 'Import backup?',
      message: 'Notes from the backup will be merged into this device.',
      icon: 'pi pi-download',
      accept: async () => {
        const count = await importBackup(text);
        syncWidgets();
        toast.add({ severity: 'success', summary: `Imported ${count} notes`, life: 2600 });
      }
    });
  } catch {
    /* cancelled */
  }
}

function wipeAll() {
  confirm.require({
    header: 'Delete everything?',
    message: 'All notes, notebooks, attachments and vault data on this device will be erased. This cannot be undone.',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    acceptLabel: 'Erase all',
    accept: async () => {
      const db = await getDB();
      await db.remove();
      location.reload();
    }
  });
}
</script>

<template>
  <div class="app-shell">
    <header class="app-topbar">
      <button class="icon-btn" @click="openSidebar()"><i class="pi pi-bars"></i></button>
      <div class="title">Settings</div>
    </header>

    <div class="scroll-area" style="max-width: 640px; margin: 0 auto; width: 100%">
      <div class="settings-group">
        <div class="settings-row" style="cursor: pointer" @click="themeDlg = true">
          <i class="pi pi-palette"></i>
          <span class="label">Theme</span>
          <span class="value">{{ THEMES.find((t) => t.id === themeId)?.name }}</span>
        </div>
        <div class="settings-row">
          <i class="pi pi-moon"></i>
          <span class="label">Appearance</span>
          <Select
            v-model="modePref"
            :options="[
              { label: 'System', value: 'system' },
              { label: 'Light', value: 'light' },
              { label: 'Dark', value: 'dark' }
            ]"
            option-label="label"
            option-value="value"
            @update:model-value="setMode"
            style="width: 120px"
          />
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-row">
          <i class="pi pi-shield"></i>
          <span class="label">Vault</span>
          <span class="value">{{ vaultConfigured ? 'configured' : 'not set up' }}</span>
        </div>
        <div class="settings-row">
          <i class="pi pi-clock"></i>
          <span class="label">Auto-lock vault</span>
          <Select
            :model-value="autoLock"
            :options="[
              { label: '1 min', value: 1 },
              { label: '5 min', value: 5 },
              { label: '10 min', value: 10 },
              { label: '30 min', value: 30 },
              { label: 'Never', value: 0 }
            ]"
            option-label="label"
            option-value="value"
            @update:model-value="pickAutoLock"
            style="width: 110px"
          />
        </div>
        <div class="settings-row">
          <i class="pi pi-mobile"></i>
          <span class="label">Lock when app backgrounds</span>
          <ToggleSwitch :model-value="lockOnBg" @update:model-value="toggleLockBg" />
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-row">
          <i class="pi pi-bell"></i>
          <span class="label">Daily writing nudge</span>
          <ToggleSwitch :model-value="dailyOn" @update:model-value="toggleDaily" />
        </div>
        <div v-if="dailyOn" class="settings-row">
          <i class="pi pi-clock"></i>
          <span class="label">Time</span>
          <InputNumber v-model="dailyHour" :min="0" :max="23" :showButtons="false" style="width: 56px" />
          <span>:</span>
          <InputNumber v-model="dailyMin" :min="0" :max="59" :showButtons="false" style="width: 56px" />
        </div>
        <div class="settings-row">
          <i class="pi pi-trash"></i>
          <span class="label">Keep trash for</span>
          <Select
            :model-value="trashDays"
            :options="[
              { label: '7 days', value: 7 },
              { label: '30 days', value: 30 },
              { label: '90 days', value: 90 }
            ]"
            option-label="label"
            option-value="value"
            @update:model-value="pickTrashDays"
            style="width: 110px"
          />
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-row" style="cursor: pointer" @click="exportAll">
          <i class="pi pi-upload"></i>
          <span class="label">Export backup</span>
          <span class="value">notes + attachments</span>
        </div>
        <div class="settings-row" style="cursor: pointer" @click="importAll">
          <i class="pi pi-download"></i>
          <span class="label">Import backup</span>
          <span class="value">merge from file</span>
        </div>
        <div class="settings-row" style="cursor: pointer" @click="emptyTrash().then(() => syncWidgets())">
          <i class="pi pi-eraser"></i>
          <span class="label">Empty trash now</span>
        </div>
        <div class="settings-row" style="cursor: pointer; color: #e5484d" @click="wipeAll">
          <i class="pi pi-exclamation-triangle" style="color: #e5484d"></i>
          <span class="label" style="color: #e5484d">Erase all data</span>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-row">
          <i class="pi pi-info-circle"></i>
          <span class="label">Inkwell</span>
          <span class="value">v1.0.0</span>
        </div>
        <div class="settings-row">
          <i class="pi pi-cog"></i>
          <span class="label">Stack</span>
          <span class="value">Vue 3 · Vite 8 · Capacitor 8 · RxDB · PrimeVue</span>
        </div>
      </div>
    </div>

    <Dialog v-model:visible="themeDlg" modal header="Choose a theme" :style="{ width: '420px', maxWidth: '92vw' }">
      <div class="theme-grid">
        <button
          v-for="t in THEMES"
          :key="t.id"
          class="theme-card"
          :class="{ active: themeId === t.id }"
          @click="setTheme(t.id)"
        >
          <span class="swatch" :style="{ background: `linear-gradient(135deg, ${t.primary} 52%, ${t.accent} 52%)` }"></span>
          <span class="tname">{{ t.name }}</span>
          <span class="tuse">{{ t.useCase }}</span>
        </button>
      </div>
    </Dialog>
    <ConfirmDialog />
    <Toast position="bottom-center" />
  </div>
</template>

<style scoped>
.theme-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.theme-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  border: 2px solid var(--ink-border);
  background: var(--ink-surface);
  border-radius: 14px;
  padding: 10px;
  cursor: pointer;
  text-align: left;
}
.theme-card.active {
  border-color: var(--ink-accent);
}
.swatch {
  width: 100%;
  height: 42px;
  border-radius: 10px;
}
.tname {
  font-weight: 700;
  font-size: 13px;
  color: var(--ink-text);
}
.tuse {
  font-size: 10.5px;
  color: var(--ink-text-muted);
  line-height: 1.35;
}
</style>
