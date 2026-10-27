<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getDB } from '../db/database.js';
import { getOrCreateDailyNote } from '../db/daily.js';
import { loadTemplates } from '../utils/templates.js';
import { excerpt, relativeTime } from '../utils/format.js';
import { paletteOpen, closePalette } from '../composables/usePalette.js';
import { toggleDark } from '../composables/useTheme.js';

const router = useRouter();
const input = ref(null);
const query = ref('');
const active = ref(0);
const notes = ref([]);
const templates = ref([]);

const actions = [
  {
    label: 'New note',
    hint: 'Blank page',
    icon: 'pi pi-plus',
    keywords: 'create write add',
    run: () => router.push({ name: 'editor', params: { id: 'new' } })
  },
  {
    label: "Today's journal",
    hint: 'Open or create the note for today',
    icon: 'pi pi-sun',
    keywords: 'daily journal today diary',
    run: async () => {
      const doc = await getOrCreateDailyNote();
      router.push({ name: 'editor', params: { id: doc.id } });
    }
  },
  { label: 'Tasks', hint: 'All checklists in one place', icon: 'pi pi-check-square', keywords: 'todo checklist', run: () => router.push({ name: 'tasks' }) },
  { label: 'Insights', hint: 'Streak, heatmap and word counts', icon: 'pi pi-chart-bar', keywords: 'stats activity streak words', run: () => router.push({ name: 'insights' }) },
  { label: 'Notebooks', icon: 'pi pi-folder', keywords: 'folders organize', run: () => router.push({ name: 'notebooks' }) },
  { label: 'Tags', icon: 'pi pi-tags', keywords: 'labels organize', run: () => router.push({ name: 'tags' }) },
  { label: 'Trash', icon: 'pi pi-trash', keywords: 'deleted restore', run: () => router.push({ name: 'trash' }) },
  { label: 'Vault', icon: 'pi pi-shield', keywords: 'locked secret private', run: () => router.push({ name: 'vault' }) },
  { label: 'Settings', icon: 'pi pi-cog', keywords: 'theme preferences backup', run: () => router.push({ name: 'settings' }) },
  { label: 'Toggle dark mode', icon: 'pi pi-moon', keywords: 'theme light appearance', run: () => toggleDark() }
];

async function refresh() {
  const db = await getDB();
  const docs = await db.notes.find({ selector: { trashed: false }, sort: [{ updated: 'desc' }] }).exec();
  notes.value = docs;
  templates.value = await loadTemplates();
}

watch(paletteOpen, async (open) => {
  if (!open) return;
  query.value = '';
  active.value = 0;
  await refresh();
  await nextTick();
  input.value?.focus();
});

const norm = (s) => String(s || '').toLowerCase();

function noteScore(doc, q) {
  if (!q) return 1;
  const title = norm(doc.title);
  if (title.startsWith(q)) return 100;
  if (title.includes(q)) return 70;
  if ((doc.tags || []).some((tag) => norm(tag).includes(q))) return 45;
  if (norm(doc.contentText).includes(q)) return 30;
  return 0;
}

const results = computed(() => {
  const q = norm(query.value.trim());
  const out = [];

  for (const action of actions) {
    if (q && !norm(`${action.label} ${action.hint || ''} ${action.keywords || ''}`).includes(q)) continue;
    out.push({ kind: 'action', label: action.label, hint: action.hint || '', icon: action.icon, run: action.run });
  }

  for (const tpl of templates.value) {
    if (q && !norm(`${tpl.name} ${tpl.description || ''}`).includes(q)) continue;
    out.push({
      kind: 'template',
      label: tpl.name,
      hint: tpl.description || 'Template',
      icon: tpl.icon || 'pi pi-bookmark',
      run: () => router.push({ name: 'editor', params: { id: 'new' }, query: { template: tpl.id } })
    });
  }

  const matches = notes.value
    .map((doc) => ({ doc, score: noteScore(doc, q) }))
    .filter((row) => row.score > 0)
    .slice(0, 8);
  for (const { doc } of matches) {
    const locked = !!doc.locked;
    out.push({
      kind: 'note',
      label: locked ? 'Locked note' : doc.title || 'Untitled',
      hint: locked
        ? 'Open the vault to read it'
        : excerpt(doc.contentText, 90) || (doc.archived ? 'Archived note' : 'Empty note'),
      icon: locked ? 'pi pi-lock' : doc.pinned ? 'pi pi-thumbtack' : 'pi pi-file-edit',
      meta: relativeTime(doc.updated),
      run: () => router.push({ name: 'editor', params: { id: doc.id } })
    });
  }
  return out;
});

const COMMANDS = new Set(['action', 'template']);

const groups = computed(() => {
  const rows = results.value.map((row, index) => ({ ...row, flatIndex: index }));
  const commandRows = rows.filter((row) => COMMANDS.has(row.kind));
  const noteRows = rows.filter((row) => row.kind === 'note');
  const out = [];
  if (commandRows.length) out.push({ label: query.value ? 'Commands' : 'Quick actions', items: commandRows });
  if (noteRows.length) out.push({ label: query.value ? 'Notes' : 'Recent notes', items: noteRows });
  return out;
});

const flat = computed(() => groups.value.flatMap((group) => group.items));

watch(query, () => {
  active.value = 0;
});

function move(delta) {
  if (!flat.value.length) return;
  active.value = (active.value + delta + flat.value.length) % flat.value.length;
  nextTick(() => {
    document.querySelector(`.cmdk-item[data-index="${active.value}"]`)?.scrollIntoView({ block: 'nearest' });
  });
}

async function run(item) {
  if (!item) return;
  closePalette();
  await item.run?.();
}

function onKey(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    move(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    move(-1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    run(flat.value[active.value]);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closePalette();
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="paletteOpen" class="cmdk-backdrop" @mousedown.self="closePalette">
      <div class="cmdk" role="dialog" aria-modal="true" aria-label="Quick switcher">
        <div class="cmdk-input">
          <i class="pi pi-search"></i>
          <input
            ref="input"
            v-model="query"
            type="text"
            placeholder="Search notes or run a command…"
            autocomplete="off"
            spellcheck="false"
            @keydown="onKey"
          />
          <kbd>ESC</kbd>
        </div>

        <div class="cmdk-list">
          <div v-for="group in groups" :key="group.label" class="cmdk-group">
            <div class="cmdk-section">{{ group.label }}</div>
            <button
              v-for="item in group.items"
              :key="`${item.kind}-${item.flatIndex}`"
              class="cmdk-item"
              :class="{ active: item.flatIndex === active }"
              :data-index="item.flatIndex"
              @mousemove="active = item.flatIndex"
              @click="run(item)"
            >
              <span class="cmdk-icon"><i :class="item.icon"></i></span>
              <span class="cmdk-text">
                <span class="cmdk-label">{{ item.label }}</span>
                <span v-if="item.hint" class="cmdk-hint">{{ item.hint }}</span>
              </span>
              <span v-if="item.meta" class="cmdk-meta">{{ item.meta }}</span>
              <span v-if="item.kind === 'template'" class="cmdk-badge">Template</span>
            </button>
          </div>

          <div v-if="!flat.length" class="cmdk-empty">
            <i class="pi pi-search"></i>
            <span>No notes or commands match “{{ query }}”.</span>
          </div>
        </div>

        <div class="cmdk-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span class="cmdk-brand">Inkwell quick switcher</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cmdk-backdrop {
  position: fixed;
  top: var(--ink-safe-top);
  bottom: var(--ink-safe-bottom);
  left: 0;
  right: 0;
  z-index: 1300;
  background: rgba(12, 15, 24, 0.5);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12vh 16px 16px;
  animation: cmdk-fade 0.12s ease;
}
@keyframes cmdk-fade {
  from { opacity: 0; }
}
.cmdk {
  width: 100%;
  max-width: 600px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--ink-surface);
  border: 1px solid var(--ink-border);
  border-radius: 20px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  animation: cmdk-rise 0.16s ease;
}
@keyframes cmdk-rise {
  from { transform: translateY(-10px) scale(0.99); }
}
.cmdk-input {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 18px;
  border-bottom: 1px solid var(--ink-border);
}
.cmdk-input i {
  color: var(--ink-accent);
  font-size: 16px;
}
.cmdk-input input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--ink-text);
  font-size: 16px;
  font-family: inherit;
}
.cmdk-input input::placeholder {
  color: var(--ink-text-muted);
}
kbd {
  font-size: 10px;
  font-family: inherit;
  font-weight: 700;
  color: var(--ink-text-muted);
  background: var(--ink-surface-3);
  border-radius: 5px;
  padding: 2px 5px;
  margin-left: 3px;
}
.cmdk-list {
  overflow-y: auto;
  padding: 6px;
}
.cmdk-section {
  padding: 10px 12px 4px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 1.1px;
  text-transform: uppercase;
  color: var(--ink-text-muted);
}
.cmdk-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border: none;
  background: transparent;
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  color: var(--ink-text);
}
.cmdk-item.active {
  background: var(--ink-accent-soft);
}
.cmdk-icon {
  width: 32px;
  height: 32px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--ink-surface-2);
  color: var(--ink-accent);
  font-size: 14px;
}
.cmdk-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.cmdk-label {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cmdk-hint {
  font-size: 11.5px;
  color: var(--ink-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cmdk-meta {
  font-size: 11px;
  color: var(--ink-text-muted);
  flex: none;
}
.cmdk-badge {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--ink-accent);
  background: var(--ink-accent-soft);
  border-radius: 999px;
  padding: 2px 7px;
  flex: none;
}
.cmdk-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 38px 24px;
  color: var(--ink-text-muted);
  font-size: 13px;
  text-align: center;
}
.cmdk-empty i {
  font-size: 22px;
  opacity: 0.6;
}
.cmdk-footer {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 16px;
  border-top: 1px solid var(--ink-border);
  font-size: 10.5px;
  color: var(--ink-text-muted);
}
.cmdk-brand {
  margin-left: auto;
  font-weight: 700;
  letter-spacing: 0.4px;
}
@media (max-width: 600px) {
  .cmdk-backdrop {
    padding: 0;
    align-items: stretch;
  }
  .cmdk {
    max-width: none;
    max-height: none;
    height: 100%;
    border-radius: 0;
    border: none;
  }
  .cmdk-footer {
    display: none;
  }
}
</style>

