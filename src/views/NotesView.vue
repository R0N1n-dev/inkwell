<script setup>
import { computed, ref, watch, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import SwipeRow from '../components/SwipeRow.vue';
import NoteCard from '../components/NoteCard.vue';
import EmptyState from '../components/EmptyState.vue';
import SelectionBar from '../components/SelectionBar.vue';
import { useNotesQuery, useNotebooks } from '../composables/useQueries.js';
import {
  setArchived,
  trashNote,
  restoreNote,
  purgeNote,
  togglePin,
  toggleFavorite,
  lockNote,
  duplicateNote,
  mergeNotes
} from '../db/notes.js';
import { getSetting, setSetting } from '../db/settings.js';
import { vaultUnlocked } from '../crypto/vault.js';
import { openPalette } from '../composables/usePalette.js';
import { addSavedSearch } from '../composables/useSavedSearches.js';

defineOptions({ name: 'NotesView' });

const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const filters = ref({});
const { list, reload } = useNotesQuery(filters);
const notebooks = useNotebooks();

const searching = ref(!!route.query.q);
const term = ref(route.query.q || '');
const viewMode = ref('list');
const sortBy = ref('updated');

const selectionMode = ref(false);
const selected = ref(new Set());

const undoState = ref(null); // {ids, fn}
const openSidebar = inject('openSidebar', () => {});

const nbMap = computed(() => Object.fromEntries(notebooks.value.map((n) => [n.id, n.title])));

function applyFilters() {
  const q = route.query;
  filters.value = {
    trash: false,
    archived: q.archived === '1',
    favorites: q.fav === '1',
    notebook: q.notebook || '',
    tag: q.tag || '',
    sort: sortBy.value
  };
  reload();
}

watch(
  () => route.query,
  (q) => {
    if (q.sort && q.sort !== sortBy.value) sortBy.value = q.sort;
    term.value = q.q || '';
    searching.value = !!q.q;
    applyFilters();
    selectionMode.value = false;
    selected.value = new Set();
  },
  { immediate: true, deep: true }
);

watch(sortBy, () => applyFilters());

(async () => {
  viewMode.value = await getSetting('viewMode', 'list');
  sortBy.value = await getSetting('sortBy', 'updated');
})();

const title = computed(() => {
  const q = route.query;
  if (q.fav === '1') return 'Favorites';
  if (q.archived === '1') return 'Archive';
  if (q.notebook) return nbMap.value[q.notebook] || 'Notebook';
  if (q.tag) return `#${q.tag}`;
  return 'All notes';
});

const shown = computed(() => {
  const src = list.value || [];
  const t = term.value.trim().toLowerCase();
  if (!t) return src;
  return src.filter(
    (d) =>
      (d.title || '').toLowerCase().includes(t) ||
      (d.contentText || '').toLowerCase().includes(t) ||
      (d.tags || []).some((tag) => tag.includes(t))
  );
});

function openNote(doc) {
  if (selectionMode.value) {
    toggleSelect(doc.id);
    return;
  }
  router.push({ name: 'editor', params: { id: doc.id } });
}

function toggleSelect(id) {
  const s = new Set(selected.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  selected.value = s;
  if (!s.size) selectionMode.value = false;
}

function startSelection(doc) {
  selectionMode.value = true;
  selected.value = new Set([doc.id]);
}

/* ---------------- swipe actions ---------------- */

async function onSwipeLeft(doc) {
  // left = delete (trash) / purge in trash
  if (route.query.archived === '1') {
    await trashNote(doc.id);
    offerUndo([doc.id], 'Note moved to trash', async () => restoreNote(doc.id));
    return;
  }
  await trashNote(doc.id);
  offerUndo([doc.id], 'Note moved to trash', async () => restoreNote(doc.id));
}

async function onSwipeRight(doc) {
  // right = archive / un-archive
  if (route.query.archived === '1') {
    await setArchived(doc.id, false);
    toast.add({ severity: 'success', summary: 'Restored from archive', life: 1800 });
    return;
  }
  await setArchived(doc.id, true);
  offerUndo([doc.id], 'Note archived', async () => setArchived(doc.id, false));
}

function offerUndo(ids, message, fn) {
  undoState.value = { ids, fn };
  toast.add({ group: 'undo', severity: 'info', summary: message, life: 4200 });
}

async function doUndo() {
  const u = undoState.value;
  if (u) await u.fn();
  undoState.value = null;
  toast.removeGroup('undo');
}

/* ---------------- selection bulk actions ---------------- */

async function bulk(action) {
  const ids = [...selected.value];
  if (action === 'merge') {
    if (ids.length < 2) {
      toast.add({ severity: 'info', summary: 'Select at least two notes to merge', life: 2200 });
      return;
    }
    try {
      const merged = await mergeNotes(ids);
      selectionMode.value = false;
      selected.value = new Set();
      toast.add({ severity: 'success', summary: 'Merged into a new note', life: 1800 });
      router.push({ name: 'editor', params: { id: merged.id } });
    } catch (err) {
      toast.add({ severity: 'error', summary: 'Merge failed', detail: String(err?.message || err), life: 3000 });
    }
    return;
  }
  if (action === 'duplicate') {
    try {
      for (const id of ids) await duplicateNote(id);
      selectionMode.value = false;
      selected.value = new Set();
      toast.add({ severity: 'success', summary: `Duplicated ${ids.length} note(s)`, life: 1800 });
    } catch (err) {
      toast.add({ severity: 'error', summary: 'Duplicate failed', detail: String(err?.message || err), life: 3000 });
    }
    return;
  }
  for (const id of ids) {
    if (action === 'trash') await trashNote(id);
    if (action === 'archive') await setArchived(id, true);
    if (action === 'pin') await togglePin(id);
    if (action === 'favorite') await toggleFavorite(id);
    if (action === 'lock') {
      if (!vaultUnlocked.value) {
        toast.add({ severity: 'warn', summary: 'Unlock the vault first', life: 2500 });
        break;
      }
      await lockNote(id);
    }
  }
  selectionMode.value = false;
  selected.value = new Set();
  toast.add({ severity: 'success', summary: `Done for ${ids.length} note(s)`, life: 1600 });
}

/* ---------------- topbar menus ---------------- */

const optionsMenu = ref(null);
const menuItems = computed(() => [
  {
    label: sortBy.value === 'updated' ? '✓ Modified date' : 'Modified date',
    icon: 'pi pi-history',
    command: () => setSort('updated')
  },
  {
    label: sortBy.value === 'created' ? '✓ Created date' : 'Created date',
    icon: 'pi pi-calendar',
    command: () => setSort('created')
  },
  {
    label: sortBy.value === 'title' ? '✓ Title' : 'Title',
    icon: 'pi pi-sort-alpha-down',
    command: () => setSort('title')
  },
  { separator: true },
  {
    label: viewMode.value === 'list' ? 'Grid view' : 'List view',
    icon: viewMode.value === 'list' ? 'pi pi-table' : 'pi pi-list',
    command: toggleView
  },
  { separator: true },
  { label: 'Save this view', icon: 'pi pi-bookmark', command: saveCurrentSearch },
  { label: 'Quick switcher', icon: 'pi pi-bolt', command: openPalette }
]);

async function saveCurrentSearch() {
  const q = route.query;
  const query = {
    q: term.value.trim(),
    tag: q.tag || '',
    notebook: q.notebook || '',
    fav: q.fav || '',
    archived: q.archived || '',
    sort: sortBy.value === 'updated' ? '' : sortBy.value
  };
  if (!query.q && !query.tag && !query.notebook && !query.fav && !query.archived) {
    toast.add({ severity: 'info', summary: 'Nothing to save', detail: 'Search or filter notes first.', life: 2400 });
    return;
  }
  const fallback = query.q || (query.tag ? `#${query.tag}` : 'My view');
  const name = window.prompt('Name this view', fallback);
  if (!name) return;
  await addSavedSearch(name, query);
  toast.add({ severity: 'success', summary: 'View saved to the sidebar', life: 2000 });
}

async function setSort(key) {
  sortBy.value = key;
  await setSetting('sortBy', key);
}

async function toggleView() {
  viewMode.value = viewMode.value === 'list' ? 'grid' : 'list';
  await setSetting('viewMode', viewMode.value);
}
</script>

<template>
  <div class="app-shell">
    <header class="app-topbar">
      <button v-if="!searching" class="icon-btn" @click="openSidebar()">
        <i class="pi pi-bars"></i>
      </button>
      <button v-else class="icon-btn" @click="searching = false; term = ''">
        <i class="pi pi-arrow-left"></i>
      </button>

      <template v-if="!searching">
        <div class="title">
          {{ selectionMode ? `${selected.size} selected` : title }}
          <div v-if="!selectionMode" class="subtitle">{{ shown.length }} note{{ shown.length === 1 ? '' : 's' }}</div>
        </div>
        <button class="icon-btn" @click="searching = true"><i class="pi pi-search"></i></button>
        <button class="icon-btn qs-btn" title="Quick switcher" @click="openPalette"><i class="pi pi-bolt"></i></button>
        <button class="icon-btn" @click="optionsMenu?.toggle($event)">
          <i class="pi pi-ellipsis-v"></i>
        </button>
      </template>
      <input
        v-else
        v-model="term"
        class="search-input"
        type="search"
        placeholder="Search notes, tags…"
        autofocus
      />
      <button v-if="searching" class="icon-btn" title="View options" @click="optionsMenu?.toggle($event)">
        <i class="pi pi-ellipsis-v"></i>
      </button>
      <Popover ref="optionsMenu">
        <Menu :model="menuItems" class="border-none" style="max-height: 70vh; overflow-y: auto" />
      </Popover>
    </header>

    <div class="scroll-area">
      <EmptyState
        v-if="!shown.length"
        :title="term ? 'No matches' : 'No notes here'"
        :text="term ? `Nothing matches “${term}”.` : 'Tap the + button to capture your first thought.'"
      />

      <div v-else :class="viewMode === 'grid' ? 'note-grid' : 'note-list'">
        <template v-if="viewMode === 'list'">
          <SwipeRow
            v-for="doc in shown"
            :key="doc.id"
            :disabled="selectionMode"
            :left-icon="route.query.archived === '1' ? 'pi pi-trash' : 'pi pi-trash'"
            :right-icon="route.query.archived === '1' ? 'pi pi-box' : 'pi pi-box'"
            @swipe-left="onSwipeLeft(doc)"
            @swipe-right="onSwipeRight(doc)"
            @longpress="startSelection(doc)"
          >
            <div @click="openNote(doc)">
              <NoteCard
                :doc="doc"
                :selected="selected.has(doc.id)"
                :selection-mode="selectionMode"
                :notebook-title="nbMap[doc.notebookId] || ''"
              />
            </div>
          </SwipeRow>
        </template>
        <template v-else>
          <div v-for="doc in shown" :key="doc.id" @click="openNote(doc)" @longpress="startSelection(doc)">
            <NoteCard
              :doc="doc"
              :selected="selected.has(doc.id)"
              :selection-mode="selectionMode"
              :notebook-title="nbMap[doc.notebookId] || ''"
            />
          </div>
        </template>
      </div>
    </div>

    <button v-if="!selectionMode" class="fab" @click="router.push({ name: 'editor', params: { id: 'new' } })">
      <i class="pi pi-plus"></i>
    </button>

    <SelectionBar
      v-if="selectionMode"
      @action="bulk"
      @close="selectionMode = false; selected = new Set()"
    />

    <Toast group="undo" position="bottom">
      <template #message="slot">
        <div class="row" style="gap: 12px; align-items: center">
          <i class="pi pi-info-circle" style="color: var(--ink-accent)"></i>
          <span style="flex: 1">{{ slot.message.summary }}</span>
          <Button label="Undo" text size="small" @click="doUndo" />
        </div>
      </template>
    </Toast>
  </div>
</template>

<style scoped>
.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: var(--ink-surface-2);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 15px;
  color: var(--ink-text);
}
</style>
