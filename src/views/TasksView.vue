<script setup>
import { computed, inject, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import EmptyState from '../components/EmptyState.vue';
import { getDB } from '../db/database.js';
import { saveNote } from '../db/notes.js';
import { extractTasks, toggleTaskInHtml } from '../utils/tasks.js';

const router = useRouter();
const toast = useToast();
const openSidebar = inject('openSidebar', () => {});

const docs = ref([]);
const filter = ref('open');
const term = ref('');
const busy = ref('');
let sub = null;

async function load() {
  const db = await getDB();
  docs.value = await db.notes
    .find({ selector: { trashed: false, locked: false, archived: false } })
    .exec();
}

onMounted(async () => {
  await load();
  const db = await getDB();
  sub = db.notes.$.subscribe(() => load());
});

onUnmounted(() => sub?.unsubscribe());

const allTasks = computed(() => {
  const out = [];
  for (const doc of docs.value) {
    for (const task of extractTasks(doc.content)) {
      out.push({
        ...task,
        noteId: doc.id,
        noteTitle: doc.title || 'Untitled',
        noteUpdated: doc.updated,
        tags: doc.tags || [],
        color: doc.color || ''
      });
    }
  }
  return out;
});

const stats = computed(() => {
  const total = allTasks.value.length;
  const done = allTasks.value.filter((t) => t.checked).length;
  return { total, done, open: total - done, percent: total ? Math.round((done / total) * 100) : 0 };
});

const shown = computed(() => {
  const q = term.value.trim().toLowerCase();
  return allTasks.value
    .filter((t) => (filter.value === 'all' ? true : filter.value === 'done' ? t.checked : !t.checked))
    .filter(
      (t) =>
        !q ||
        t.text.toLowerCase().includes(q) ||
        t.noteTitle.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
});

const groups = computed(() => {
  const map = new Map();
  for (const task of shown.value) {
    if (!map.has(task.noteId)) {
      map.set(task.noteId, {
        noteId: task.noteId,
        title: task.noteTitle,
        updated: task.noteUpdated,
        color: task.color,
        items: []
      });
    }
    map.get(task.noteId).items.push(task);
  }
  return [...map.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => Number(a.checked) - Number(b.checked) || a.index - b.index)
    }))
    .sort((a, b) => b.items.filter((t) => !t.checked).length - a.items.filter((t) => !t.checked).length);
});

async function toggle(task) {
  const doc = docs.value.find((d) => d.id === task.noteId);
  if (!doc || busy.value === `${task.noteId}:${task.index}`) return;
  busy.value = `${task.noteId}:${task.index}`;
  try {
    const next = toggleTaskInHtml(doc.content, task.index);
    await saveNote(doc.id, { content: next });
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Could not update task', detail: String(err?.message || err), life: 2600 });
  } finally {
    busy.value = '';
  }
}

function openNote(noteId) {
  router.push({ name: 'editor', params: { id: noteId } });
}
</script>

<template>
  <div class="app-shell">
    <header class="app-topbar">
      <button class="icon-btn" @click="openSidebar()"><i class="pi pi-bars"></i></button>
      <div class="title">
        Tasks
        <div class="subtitle">{{ stats.open }} open · {{ stats.done }} done</div>
      </div>
      <button class="icon-btn" @click="router.push({ name: 'editor', params: { id: 'new' } })" title="New checklist note">
        <i class="pi pi-plus"></i>
      </button>
    </header>

    <div v-if="stats.total" class="task-hero">
      <div class="task-progress">
        <div class="task-progress-fill" :style="{ width: `${stats.percent}%` }"></div>
      </div>
      <div class="task-hero-row">
        <span><strong>{{ stats.done }}</strong> of {{ stats.total }} complete</span>
        <span>{{ stats.percent }}%</span>
      </div>
    </div>

    <div class="task-controls">
      <div class="task-tabs">
        <button v-for="tab in [
          { id: 'open', label: 'Open' },
          { id: 'done', label: 'Done' },
          { id: 'all', label: 'All' }
        ]" :key="tab.id" class="task-tab" :class="{ active: filter === tab.id }" @click="filter = tab.id">
          {{ tab.label }}
        </button>
      </div>
      <input v-model="term" class="task-search" type="search" placeholder="Filter tasks…" />
    </div>

    <div class="scroll-area">
      <EmptyState
        v-if="!groups.length"
        icon="pi pi-check-square"
        :title="stats.total ? 'Nothing here' : 'No tasks yet'"
        :text="stats.total ? 'Try another filter or clear the search.' : 'Add a checklist to any note with the checklist button, then tick items off here — across all notes.'"
      />

      <section v-for="group in groups" :key="group.noteId" class="task-group">
        <button class="task-group-head" @click="openNote(group.noteId)">
          <span v-if="group.color" class="task-color" :class="`c-${group.color}`"></span>
          <span class="task-group-title">{{ group.title }}</span>
          <span class="task-group-count">{{ group.items.filter((t) => !t.checked).length }} open</span>
          <i class="pi pi-arrow-right" style="font-size: 11px"></i>
        </button>
        <div class="task-list">
          <button
            v-for="task in group.items"
            :key="`${task.noteId}-${task.index}`"
            class="task-row"
            :class="{ done: task.checked, busy: busy === `${task.noteId}:${task.index}` }"
            @click="toggle(task)"
          >
            <span class="task-box" :class="{ checked: task.checked }">
              <i v-if="task.checked" class="pi pi-check"></i>
            </span>
            <span class="task-text">{{ task.text || 'Empty task' }}</span>
            <span v-if="task.checked" class="task-state">done</span>
          </button>
        </div>
      </section>

      <p v-if="groups.length" class="task-footnote">
        Tick an item here and the checklist in the note updates instantly — no need to open it.
      </p>
    </div>

    <Toast position="bottom-center" />
  </div>
</template>


<style scoped>
.task-hero {
  margin: 10px 12px 0;
  background: var(--ink-surface);
  border: 1px solid var(--ink-border);
  border-radius: var(--ink-radius);
  padding: 12px 14px;
}
.task-progress {
  height: 7px;
  border-radius: 999px;
  background: var(--ink-surface-3);
  overflow: hidden;
}
.task-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--ink-primary), var(--ink-accent));
  border-radius: 999px;
  transition: width 0.25s ease;
}
.task-hero-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  font-size: 12px;
  color: var(--ink-text-muted);
}
.task-hero-row strong {
  color: var(--ink-text);
}
.task-controls {
  padding: 10px 12px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.task-tabs {
  display: flex;
  gap: 6px;
}
.task-tab {
  border: 1px solid var(--ink-border);
  background: var(--ink-surface);
  color: var(--ink-text-muted);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.task-tab.active {
  background: var(--ink-accent-soft);
  border-color: var(--ink-accent);
  color: var(--ink-accent);
}
.task-search {
  border: 1px solid var(--ink-border);
  background: var(--ink-surface);
  border-radius: 12px;
  padding: 9px 12px;
  font-size: 13px;
  color: var(--ink-text);
  outline: none;
  font-family: inherit;
}
.task-group {
  background: var(--ink-surface);
  border: 1px solid var(--ink-border);
  border-radius: var(--ink-radius);
  margin-bottom: 10px;
  overflow: hidden;
}
.task-group-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 13px;
  border: none;
  border-bottom: 1px solid var(--ink-border);
  background: var(--ink-surface-2);
  color: var(--ink-text);
  cursor: pointer;
  text-align: left;
}
.task-color {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.c-red { background: #E5484D; }
.c-orange { background: #F76B15; }
.c-yellow { background: #FFC53D; }
.c-green { background: #46A758; }
.c-teal { background: #12A594; }
.c-blue { background: #3E63DD; }
.c-purple { background: #8E4EC6; }
.c-pink { background: #D6409F; }
.task-group-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.task-group-count {
  font-size: 11px;
  color: var(--ink-text-muted);
}
.task-list {
  display: flex;
  flex-direction: column;
}
.task-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 14px;
  border: none;
  border-bottom: 1px solid var(--ink-border);
  background: transparent;
  color: var(--ink-text);
  text-align: left;
  cursor: pointer;
  font-size: 13.5px;
  font-family: inherit;
}
.task-row:last-child {
  border-bottom: none;
}
.task-row:active {
  background: var(--ink-surface-2);
}
.task-row.busy {
  opacity: 0.55;
}
.task-box {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  border: 1.8px solid var(--ink-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: var(--ink-on-accent);
  font-size: 10px;
  transition: background 0.12s ease;
}
.task-box.checked {
  background: var(--ink-accent);
  border-color: var(--ink-accent);
}
.task-text {
  flex: 1;
  min-width: 0;
  line-height: 1.35;
}
.task-row.done .task-text {
  text-decoration: line-through;
  color: var(--ink-text-muted);
}
.task-state {
  font-size: 10px;
  color: var(--ink-text-muted);
  background: var(--ink-surface-3);
  border-radius: 999px;
  padding: 2px 7px;
  font-weight: 600;
}
.task-footnote {
  font-size: 11px;
  color: var(--ink-text-muted);
  text-align: center;
  padding: 8px 20px 20px;
  line-height: 1.5;
}
</style>
