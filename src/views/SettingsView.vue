<script setup>
import { computed, inject, onMounted, ref } from 'vue';
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
import { syncWidgets, syncWidgetNow } from '../platform/widgets.js';
import { loadTemplates, deleteCustomTemplate } from '../utils/templates.js';
import { openPalette } from '../composables/usePalette.js';

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
const wordGoal = ref(300);
const templates = ref([]);
const templateDlg = ref(false);
const widgetSync = ref('sync now');
const customTemplates = computed(() => templates.value.filter((tpl) => tpl.id.startsWith('tpl_user_')));

onMounted(async () => {
  trashDays.value = await getSetting('trashDays', 30);
  autoLock.value = await getSetting('vaultAutoLockMin', 10);
  lockOnBg.value = await getSetting('lockOnBackground', true);
  dailyOn.value = await getSetting('dailyReminder', false);
  const t = await getSetting('dailyReminderTime', [20, 0]);
  dailyHour.value = t[0];
  dailyMin.value = t[1];
  wordGoal.value = (await getSetting('dailyWordGoal', 300)) || 300;
  templates.value = await loadTemplates();
});

async function saveWordGoal(v) {
  const goal = Math.max(50, Math.min(5000, Number(v) || 300));
  wordGoal.value = goal;
  await setSetting('dailyWordGoal', goal);
}

async function openTemplates() {
  templates.value = await loadTemplates();
  templateDlg.value = true;
}

function quickSwitcher() {
  openPalette();
}

async function refreshHomeWidgets() {
  widgetSync.value = 'syncing…';
  await syncWidgetNow();
  widgetSync.value = 'synced';
  toast.add({ severity: 'success', summary: 'Widgets refreshed', life: 1500 });
  setTimeout(() => (widgetSync.value = 'sync now'), 2500);
}

function removeTemplate(tpl) {
  confirm.require({
    header: 'Delete template?',
    message: `“${tpl.name}” will be removed. Notes created from it are untouched.`,
    icon: 'bx bx-bookmark',
    acceptClass: 'p-button-danger',
    accept: async () => {
      await deleteCustomTemplate(tpl.id);
      templates.value = await loadTemplates();
      toast.add({ severity: 'success', summary: 'Template deleted', life: 1500 });
    }
  });
}

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
      icon: 'bx bx-download',
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
    icon: 'bx bx-error',
    acceptClass: 'p-button-danger',
    acceptLabel: 'Erase all',
    accept: async () => {
      const db = await getDB();
      await db.delete();
      location.reload();
    }
  });
}
</script>

<template>
  <div class="app-shell">
    <header class="app-topbar">
      <button class="icon-btn" @click="openSidebar()"><i class="bx bx-menu"></i></button>
      <div class="title">Settings</div>
    </header>

    <div class="scroll-area" style="max-width: 640px; margin: 0 auto; width: 100%">
      <div class="settings-group">
        <div class="settings-row" style="cursor: pointer" @click="themeDlg = true">
          <i class="bx bx-palette"></i>
          <span class="label">Theme</span>
          <span class="value">{{ THEMES.find((t) => t.id === themeId)?.name }}</span>
        </div>
        <div class="settings-row">
          <i class="bx bx-moon"></i>
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
          <i class="bx bx-shield"></i>
          <span class="label">Vault</span>
          <span class="value">{{ vaultConfigured ? 'configured' : 'not set up' }}</span>
        </div>
        <div class="settings-row">
          <i class="bx bx-time-five"></i>
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
          <i class="bx bx-mobile"></i>
          <span class="label">Lock when app backgrounds</span>
          <ToggleSwitch :model-value="lockOnBg" @update:model-value="toggleLockBg" />
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-row">
          <i class="bx bx-bell"></i>
          <span class="label">Daily writing nudge</span>
          <ToggleSwitch :model-value="dailyOn" @update:model-value="toggleDaily" />
        </div>
        <div v-if="dailyOn" class="settings-row">
          <i class="bx bx-time-five"></i>
          <span class="label">Time</span>
          <InputNumber v-model="dailyHour" :min="0" :max="23" :showButtons="false" style="width: 56px" />
          <span>:</span>
          <InputNumber v-model="dailyMin" :min="0" :max="59" :showButtons="false" style="width: 56px" />
        </div>
        <div class="settings-row">
          <i class="bx bx-trash"></i>
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
        <div class="settings-row">
          <i class="bx bx-pencil"></i>
          <span class="label">Daily word goal</span>
          <InputNumber
            :model-value="wordGoal"
            :min="50"
            :max="5000"
            :step="50"
            :show-buttons="false"
            style="width: 90px"
            @update:model-value="saveWordGoal"
          />
        </div>
        <div class="settings-row" style="cursor: pointer" @click="openTemplates">
          <i class="bx bx-bookmark"></i>
          <span class="label">Note templates</span>
          <span class="value">{{ customTemplates.length ? `${customTemplates.length} custom` : 'built-in' }}</span>
          <i class="bx bx-chevron-right" style="font-size: 11px; color: var(--ink-text-muted)"></i>
        </div>
        <div class="settings-row" style="cursor: pointer" @click="quickSwitcher">
          <i class="bx bx-bolt-circle"></i>
          <span class="label">Quick switcher</span>
          <span class="value">Ctrl / ⌘ K</span>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-row" style="cursor: pointer" @click="refreshHomeWidgets">
          <i class="bx bx-grid-alt"></i>
          <span class="label">Refresh home-screen widgets</span>
          <span class="value">{{ widgetSync }}</span>
        </div>
        <div class="settings-row">
          <i class="bx bx-mobile"></i>
          <span class="label">Widget quick capture</span>
          <span class="hint">imports on next open</span>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-row" style="cursor: pointer" @click="exportAll">
          <i class="bx bx-upload"></i>
          <span class="label">Export backup</span>
          <span class="value">notes + attachments</span>
        </div>
        <div class="settings-row" style="cursor: pointer" @click="importAll">
          <i class="bx bx-download"></i>
          <span class="label">Import backup</span>
          <span class="value">merge from file</span>
        </div>
        <div class="settings-row" style="cursor: pointer" @click="emptyTrash().then(() => syncWidgets())">
          <i class="bx bx-eraser"></i>
          <span class="label">Empty trash now</span>
        </div>
        <div class="settings-row" style="cursor: pointer; color: #e5484d" @click="wipeAll">
          <i class="bx bx-error" style="color: #e5484d"></i>
          <span class="label" style="color: #e5484d">Erase all data</span>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-row">
          <i class="bx bx-info-circle"></i>
          <span class="label">Inkwell</span>
          <span class="value">v1.0.0</span>
        </div>
        <div class="settings-row">
          <i class="bx bx-cog"></i>
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
    <Dialog v-model:visible="templateDlg" modal header="Note templates" :style="{ width: '460px', maxWidth: '94vw' }">
      <p class="muted" style="font-size: 12.5px; line-height: 1.5; margin: 0 0 12px">
        Start any note from a template with the quick switcher. Built-ins stay put; templates you
        save from a note can be deleted here.
      </p>
      <div class="tpl-list">
        <div v-for="tpl in templates" :key="tpl.id" class="tpl-row">
          <span class="tpl-icon"><i :class="tpl.icon || 'bx bx-file'"></i></span>
          <span class="tpl-main">
            <span class="tpl-name">{{ tpl.name }}</span>
            <span class="tpl-desc">{{ tpl.description }}</span>
          </span>
          <Button
            v-if="customTemplates.some((t) => t.id === tpl.id)"
            icon="bx bx-trash"
            text
            size="small"
            severity="danger"
            aria-label="Delete template"
            @click="removeTemplate(tpl)"
          />
          <span v-else class="tpl-builtin">built-in</span>
        </div>
      </div>
      <template #footer>
        <Button label="Done" text @click="templateDlg = false" />
      </template>
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
.tpl-list {
  display: flex;
  flex-direction: column;
  max-height: 56vh;
  overflow-y: auto;
}
.tpl-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 4px;
  border-bottom: 1px solid var(--ink-border);
}
.tpl-row:last-child {
  border-bottom: none;
}
.tpl-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--ink-accent-soft);
  color: var(--ink-accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  flex: none;
}
.tpl-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.tpl-name {
  font-size: 13.5px;
  font-weight: 650;
}
.tpl-desc {
  font-size: 11px;
  color: var(--ink-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tpl-builtin {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 700;
  color: var(--ink-text-muted);
  background: var(--ink-surface-3);
  border-radius: 999px;
  padding: 2px 7px;
}

</style>
