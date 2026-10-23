<script setup>
import { computed, ref, watch, inject } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import SwipeRow from '../components/SwipeRow.vue';
import NoteCard from '../components/NoteCard.vue';
import EmptyState from '../components/EmptyState.vue';
import { useNotesQuery } from '../composables/useQueries.js';
import { restoreNote, purgeNote, emptyTrash } from '../db/notes.js';
import { getSetting } from '../db/settings.js';
import { syncWidgets } from '../platform/widgets.js';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const openSidebar = inject('openSidebar', () => {});

const filters = ref({ trash: true, sort: 'deletedAt' });
const { list } = useNotesQuery(filters);
const trashDays = ref(30);
getSetting('trashDays', 30).then((v) => (trashDays.value = v || 30));

const shown = computed(() => [...(list.value || [])].sort((a, b) => b.deletedAt - a.deletedAt));

function onSwipeRight(doc) {
  restoreNote(doc.id);
  syncWidgets();
  toast.add({ severity: 'success', summary: 'Note restored', life: 1600 });
}

function onSwipeLeft(doc) {
  confirm.require({
    header: 'Delete forever?',
    message: `“${doc.title || 'Untitled'}” will be permanently deleted, including attachments.`,
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    accept: async () => {
      await purgeNote(doc.id);
      syncWidgets();
      toast.add({ severity: 'success', summary: 'Deleted forever', life: 1600 });
    }
  });
}

function purgeAll() {
  confirm.require({
    header: 'Empty trash?',
    message: 'All notes in trash will be permanently deleted.',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    accept: async () => {
      await emptyTrash();
      syncWidgets();
      toast.add({ severity: 'success', summary: 'Trash emptied', life: 1600 });
    }
  });
}
</script>

<template>
  <div class="app-shell">
    <header class="app-topbar">
      <button class="icon-btn" @click="openSidebar()"><i class="pi pi-bars"></i></button>
      <div class="title">Trash<div class="subtitle">{{ shown.length }} notes</div></div>
      <button v-if="shown.length" class="icon-btn" @click="purgeAll"><i class="pi pi-eraser"></i></button>
    </header>

    <div v-if="shown.length" class="trash-banner">
      <i class="pi pi-info-circle"></i>
      Notes are kept for {{ trashDays }} days, then deleted forever.
    </div>

    <div class="scroll-area">
      <EmptyState v-if="!shown.length" icon="pi pi-trash" title="Trash is empty" text="Notes you delete land here first — swipe right on a note to restore it." />
      <div v-else class="note-list">
        <SwipeRow
          v-for="doc in shown"
          :key="doc.id"
          left-icon="pi pi-exclamation-triangle"
          right-icon="pi pi-replay"
          left-color="#B42318"
          right-color="#46A758"
          @swipe-left="onSwipeLeft(doc)"
          @swipe-right="onSwipeRight(doc)"
        >
          <div @click="router.push({ name: 'editor', params: { id: doc.id } })">
            <NoteCard :doc="doc" />
          </div>
        </SwipeRow>
      </div>
    </div>
    <ConfirmDialog />
    <Toast position="bottom-center" />
  </div>
</template>

<style scoped>
.trash-banner {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 10px 12px 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--ink-accent-soft);
  color: var(--ink-accent);
  font-size: 12.5px;
  font-weight: 550;
}
</style>
