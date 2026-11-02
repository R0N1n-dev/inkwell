<script setup>
import { computed, ref, inject } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import EmptyState from '../components/EmptyState.vue';
import { useNotebooks, useCounts } from '../composables/useQueries.js';
import { noteList, uid, commitNotebook, dropNotebook } from '../db/database.js';
import { updateNote } from '../db/notes.js';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const openSidebar = inject('openSidebar', () => {});

const notebooks = useNotebooks();
const counts = useCounts();
void counts;

const dlg = ref(false);
const editing = ref(null);
const form = ref({ title: '', color: '#2EC4B6', icon: 'bx bx-book' });
const COLORS = ['#2EC4B6', '#3E63DD', '#8E4EC6', '#D6409F', '#E5484D', '#F76B15', '#FFC53D', '#46A758'];
const ICONS = ['bx bx-book', 'bx bx-briefcase', 'bx bx-heart', 'bx bx-star', 'bx bx-bulb', 'bx bx-code', 'bx bx-paper-plane', 'bx bx-home'];

const noteCountPerNb = computed(() => {
  const m = {};
  for (const n of noteList) if (!n.trashed && n.notebookId) m[n.notebookId] = (m[n.notebookId] || 0) + 1;
  return m;
});

function openCreate() {
  editing.value = null;
  form.value = { title: '', color: '#2EC4B6', icon: 'bx bx-book' };
  dlg.value = true;
}

function openEdit(nb) {
  editing.value = nb.id;
  form.value = { title: nb.title, color: nb.color || '#2EC4B6', icon: nb.icon || 'bx bx-book' };
  dlg.value = true;
}

async function save() {
  if (!form.value.title.trim()) return;
  const now = Date.now();
  if (editing.value) {
    await commitNotebook({ ...notebooks.value.find((n) => n.id === editing.value), ...form.value, updated: now });
  } else {
    await commitNotebook({ id: uid('nb'), description: '', created: now, updated: now, sortIndex: now, ...form.value });
  }
  dlg.value = false;
  toast.add({ severity: 'success', summary: 'Saved', life: 1400 });
}

function remove(nb) {
  confirm.require({
    header: 'Delete notebook?',
    message: `“${nb.title}” will be deleted. Notes inside stay in All notes.`,
    icon: 'bx bx-trash',
    acceptClass: 'p-button-danger',
    accept: async () => {
      for (const n of noteList.filter((n) => n.notebookId === nb.id)) {
        await updateNote(n.id, { notebookId: '' });
      }
      await dropNotebook(nb.id);
      toast.add({ severity: 'success', summary: 'Notebook deleted', life: 1600 });
    }
  });
}
</script>

<template>
  <div class="app-shell">
    <header class="app-topbar">
      <button class="icon-btn" @click="openSidebar()"><i class="bx bx-menu"></i></button>
      <div class="title">Notebooks</div>
      <button class="icon-btn" @click="openCreate"><i class="bx bx-plus"></i></button>
    </header>

    <div class="scroll-area">
      <EmptyState v-if="!notebooks.length" title="No notebooks" text="Group related notes into notebooks — work, travel, journal…" />
      <div v-else class="nb-grid">
        <div v-for="nb in notebooks" :key="nb.id" class="nb-card" @click="router.push(`/notes?notebook=${nb.id}`)">
          <div class="nb-head">
            <i :class="nb.icon || 'bx bx-book'" :style="{ color: nb.color || 'var(--ink-accent)' }"></i>
            <button class="icon-btn" style="width:32px;height:32px" @click.stop="openEdit(nb)">
              <i class="bx bx-pencil"></i>
            </button>
            <button class="icon-btn" style="width:32px;height:32px" @click.stop="remove(nb)">
              <i class="bx bx-trash"></i>
            </button>
          </div>
          <h3>{{ nb.title }}</h3>
          <span class="muted">{{ noteCountPerNb[nb.id] || 0 }} notes</span>
        </div>
      </div>
    </div>

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Edit notebook' : 'New notebook'" :style="{ width: '380px', maxWidth: '92vw' }">
      <InputText v-model="form.title" placeholder="Notebook name" class="w-full" autofocus />
      <div class="row" style="flex-wrap: wrap; gap: 10px; margin-top: 14px">
        <button v-for="c in COLORS" :key="c" class="dot" :class="{ active: form.color === c }" :style="{ background: c }" @click="form.color = c"></button>
      </div>
      <div class="row" style="flex-wrap: wrap; margin-top: 8px">
        <button v-for="ic in ICONS" :key="ic" class="icon-btn" :class="{ active: form.icon === ic }" @click="form.icon = ic"><i :class="ic"></i></button>
      </div>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="dlg = false" />
        <Button label="Save" icon="bx bx-check" @click="save" />
      </template>
    </Dialog>
    <ConfirmDialog />
    <Toast position="bottom-center" />
  </div>
</template>

<style scoped>
.nb-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
@media (max-width: 400px) {
  .nb-grid {
    grid-template-columns: 1fr;
  }
}
.nb-card {
  background: var(--ink-surface);
  border: 1px solid var(--ink-border);
  border-radius: var(--ink-radius);
  padding: 14px;
  cursor: pointer;
}
.nb-card h3 {
  margin: 8px 0 2px;
  font-size: 15.5px;
}
.nb-head {
  display: flex;
  align-items: center;
}
.nb-head i:first-child {
  font-size: 20px;
  flex: 1;
}
.dot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}
.dot.active,
.icon-btn.active {
  border-color: var(--ink-text);
  background: var(--ink-accent-soft);
}
.w-full {
  width: 100%;
}
</style>
