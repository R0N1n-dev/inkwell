<script setup>
import { computed, inject, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import NoteCard from '../components/NoteCard.vue';
import EmptyState from '../components/EmptyState.vue';
import {
  vaultConfigured,
  vaultUnlocked,
  setupVault,
  unlockVault,
  lockVault,
  changeVaultPassword
} from '../crypto/vault.js';
import { useNotesQuery } from '../composables/useQueries.js';
import { unlockNote } from '../db/notes.js';
import { syncWidgets } from '../platform/widgets.js';

const router = useRouter();
const toast = useToast();
const openSidebar = inject('openSidebar', () => {});

const filters = ref({ vault: true });
const { list } = useNotesQuery(filters);

const password = ref('');
const password2 = ref('');
const busy = ref(false);

const lockedNotes = computed(() => list.value || []);

async function doSetup() {
  if (password.value.length < 6) {
    toast.add({ severity: 'warn', summary: 'Too short', detail: 'Use at least 6 characters.', life: 2400 });
    return;
  }
  if (password.value !== password2.value) {
    toast.add({ severity: 'warn', summary: 'Passwords do not match', life: 2200 });
    return;
  }
  busy.value = true;
  await setupVault(password.value);
  busy.value = false;
  password.value = password2.value = '';
  toast.add({ severity: 'success', summary: 'Vault created', detail: 'Lock notes from the editor’s lock button.', life: 3000 });
}

async function doUnlock() {
  busy.value = true;
  const ok = await unlockVault(password.value);
  busy.value = false;
  if (!ok) {
    toast.add({ severity: 'error', summary: 'Wrong password', life: 2000 });
    return;
  }
  password.value = '';
}

async function takeOutOfVault(doc) {
  await unlockNote(doc.id);
  syncWidgets();
  toast.add({ severity: 'success', summary: 'Note unlocked', life: 1600 });
}

const changeDlg = ref(false);
const oldPass = ref('');
const newPass = ref('');
const newPass2 = ref('');

async function doChange() {
  if (newPass.value.length < 6 || newPass.value !== newPass2.value) {
    toast.add({ severity: 'warn', summary: 'Check the new password', life: 2200 });
    return;
  }
  busy.value = true;
  const ok = await changeVaultPassword(oldPass.value, newPass.value);
  busy.value = false;
  if (!ok) toast.add({ severity: 'error', summary: 'Old password is wrong', life: 2200 });
  else {
    changeDlg.value = false;
    oldPass.value = newPass.value = newPass2.value = '';
    toast.add({ severity: 'success', summary: 'Password changed', life: 2000 });
  }
}
</script>

<template>
  <div class="app-shell">
    <header class="app-topbar">
      <button class="icon-btn" @click="openSidebar()"><i class="pi pi-bars"></i></button>
      <div class="title">Vault<div class="subtitle">encrypted on this device</div></div>
      <button v-if="vaultUnlocked" class="icon-btn" title="Lock vault" @click="lockVault()">
        <i class="pi pi-lock"></i>
      </button>
      <button v-if="vaultUnlocked && vaultConfigured" class="icon-btn" title="Change password" @click="changeDlg = true">
        <i class="pi pi-key"></i>
      </button>
    </header>

    <div class="scroll-area">
      <!-- 1. not configured -->
      <template v-if="!vaultConfigured">
        <div class="vault-hero">
          <div class="shield"><i class="pi pi-shield"></i></div>
          <h3 style="margin: 0">Create your vault</h3>
          <p class="muted" style="margin: 0; max-width: 300px; line-height: 1.55">
            Locked notes are encrypted on-device with AES-256-GCM. The password never leaves this
            device and cannot be recovered — remember it.
          </p>
        </div>
        <div class="vault-form">
          <InputText v-model="password" type="password" placeholder="Master password (min 6 chars)" />
          <InputText v-model="password2" type="password" placeholder="Repeat password" @keyup.enter="doSetup" />
          <Button :loading="busy" label="Create vault" icon="pi pi-shield" @click="doSetup" />
        </div>
      </template>

      <!-- 2. configured but locked -->
      <template v-else-if="!vaultUnlocked">
        <div class="vault-hero">
          <div class="shield"><i class="pi pi-lock"></i></div>
          <h3 style="margin: 0">Vault locked</h3>
          <p class="muted" style="margin: 0">{{ lockedNotes.length }} encrypted note(s) inside</p>
        </div>
        <div class="vault-form">
          <InputText
            v-model="password"
            type="password"
            placeholder="Master password"
            autofocus
            @keyup.enter="doUnlock"
          />
          <Button :loading="busy" label="Unlock" icon="pi pi-lock-open" @click="doUnlock" />
        </div>
      </template>

      <!-- 3. unlocked -->
      <template v-else>
        <EmptyState
          v-if="!lockedNotes.length"
          icon="pi pi-shield"
          title="Vault is empty"
          text="Open any note and tap the lock icon to encrypt it into the vault."
        />
        <div v-else class="note-list">
          <div v-for="doc in lockedNotes" :key="doc.id" class="vault-row">
            <div style="flex: 1" @click="router.push({ name: 'editor', params: { id: doc.id } })">
              <NoteCard :doc="doc" />
            </div>
            <button class="icon-btn" title="Remove from vault" @click="takeOutOfVault(doc)">
              <i class="pi pi-lock-open"></i>
            </button>
          </div>
        </div>
      </template>
    </div>

    <Dialog v-model:visible="changeDlg" modal header="Change vault password" :style="{ width: '380px', maxWidth: '92vw' }">
      <div class="vault-form" style="padding: 0">
        <InputText v-model="oldPass" type="password" placeholder="Current password" />
        <InputText v-model="newPass" type="password" placeholder="New password (min 6 chars)" />
        <InputText v-model="newPass2" type="password" placeholder="Repeat new password" />
        <Button :loading="busy" label="Change password" icon="pi pi-key" @click="doChange" />
      </div>
      <p class="muted" style="font-size: 12px">All locked notes will be re-encrypted with the new key.</p>
    </Dialog>
    <Toast position="bottom-center" />
  </div>
</template>

<style scoped>
.vault-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 340px;
  margin: 0 auto;
  padding: 0 8px;
}
.vault-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
