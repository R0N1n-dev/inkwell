<script setup>
import { computed, ref, watch } from 'vue';
import { resolveOutgoing, findBacklinks, searchLinkTargets } from '../../db/links.js';
import { excerpt, relativeTime } from '../../utils/format.js';

const props = defineProps({
  visible: Boolean,
  doc: Object
});
const emit = defineEmits(['update:visible', 'open', 'insert', 'create']);

const loading = ref(false);
const outgoing = ref([]);
const backlinks = ref([]);
const targets = ref([]);
const search = ref('');

const close = () => emit('update:visible', false);

async function load() {
  if (!props.doc?.id) {
    outgoing.value = [];
    backlinks.value = [];
    targets.value = [];
    return;
  }
  loading.value = true;
  try {
    const [out, back, candidates] = await Promise.all([
      resolveOutgoing(props.doc),
      findBacklinks(props.doc),
      searchLinkTargets('', props.doc.id)
    ]);
    outgoing.value = out;
    backlinks.value = back;
    targets.value = candidates;
  } finally {
    loading.value = false;
    search.value = '';
  }
}

watch(
  () => [props.visible, props.doc?.id],
  ([open]) => {
    if (open) load();
  }
);

const filteredTargets = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return targets.value.slice(0, 8);
  return targets.value
    .filter(
      (doc) =>
        (doc.title || '').toLowerCase().includes(q) ||
        (doc.contentText || '').toLowerCase().includes(q) ||
        (doc.tags || []).some((t) => t.toLowerCase().includes(q))
    )
    .slice(0, 8);
});

const resolvedOut = computed(() => outgoing.value.filter((row) => row.note));
const unresolvedOut = computed(() => outgoing.value.filter((row) => !row.note));

function insert(title) {
  emit('insert', title);
  close();
}

function openNote(id) {
  emit('open', id);
  close();
}

function createNote(title) {
  emit('create', title);
  close();
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Links & backlinks"
    :style="{ width: '540px', maxWidth: '94vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div v-if="loading" class="links-empty">Scanning your notes…</div>
    <div v-else class="links-body">
      <p class="links-help">
        Type <code>[[Note title]]</code> anywhere to link to another note. Backlinks update
        automatically.
      </p>

      <section class="links-section">
        <div class="links-heading"><i class="pi pi-arrow-up-right"></i> Links from this note</div>
        <div v-if="!outgoing.length" class="links-muted">No wiki links yet.</div>
        <button
          v-for="row in resolvedOut"
          :key="row.title"
          class="link-row"
          @click="openNote(row.note.id)"
        >
          <i class="pi pi-file-edit"></i>
          <span class="link-main">
            <span class="link-title">{{ row.note.title || 'Untitled' }}</span>
            <span class="link-sub">{{ excerpt(row.note.contentText, 70) || 'Empty note' }}</span>
          </span>
          <span class="link-meta">{{ relativeTime(row.note.updated) }}</span>
        </button>
        <div v-for="row in unresolvedOut" :key="row.title" class="link-row unresolved">
          <i class="pi pi-question-circle"></i>
          <span class="link-main">
            <span class="link-title">{{ row.title }}</span>
            <span class="link-sub">No note with this title</span>
          </span>
          <Button label="Create" size="small" text @click="createNote(row.title)" />
        </div>
      </section>

      <section class="links-section">
        <div class="links-heading"><i class="pi pi-arrow-down-left"></i> Linked mentions</div>
        <div v-if="!backlinks.length" class="links-muted">No other note links here yet.</div>
        <button v-for="doc in backlinks" :key="doc.id" class="link-row" @click="openNote(doc.id)">
          <i class="pi pi-link"></i>
          <span class="link-main">
            <span class="link-title">{{ doc.title || 'Untitled' }}</span>
            <span class="link-sub">{{ excerpt(doc.contentText, 70) }}</span>
          </span>
          <span class="link-meta">{{ relativeTime(doc.updated) }}</span>
        </button>
      </section>

      <section class="links-section">
        <div class="links-heading"><i class="pi pi-plus"></i> Insert a link</div>
        <input v-model="search" class="links-search" type="search" placeholder="Find a note…" />
        <div v-if="!filteredTargets.length" class="links-muted">No matching notes.</div>
        <button v-for="doc in filteredTargets" :key="doc.id" class="link-row insert" @click="insert(doc.title)">
          <i class="pi pi-plus-circle"></i>
          <span class="link-main">
            <span class="link-title">{{ doc.title || 'Untitled' }}</span>
            <span class="link-sub">{{ excerpt(doc.contentText, 60) || 'Empty note' }}</span>
          </span>
        </button>
      </section>
    </div>

    <template #footer>
      <Button label="Close" text severity="secondary" @click="close" />
    </template>
  </Dialog>
</template>
<style scoped>
.links-body {
  max-height: 62vh;
  overflow-y: auto;
  padding-right: 2px;
}
.links-help {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--ink-text-muted);
  margin: 0 0 12px;
}
.links-help code {
  background: var(--ink-surface-3);
  border-radius: 5px;
  padding: 1px 5px;
  color: var(--ink-accent);
  font-size: 11.5px;
}
.links-section {
  margin-bottom: 16px;
}
.links-heading {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: var(--ink-text-muted);
  margin-bottom: 5px;
}
.links-heading i {
  color: var(--ink-accent);
  font-size: 11px;
}
.links-muted,
.links-empty {
  font-size: 12.5px;
  color: var(--ink-text-muted);
  padding: 8px 4px;
}
.links-empty {
  padding: 30px;
  text-align: center;
}
.link-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  background: transparent;
  border: none;
  border-radius: 10px;
  padding: 8px;
  text-align: left;
  color: var(--ink-text);
  cursor: pointer;
}
.link-row:hover,
.link-row:active {
  background: var(--ink-surface-2);
}
.link-row > i {
  color: var(--ink-accent);
  font-size: 13px;
  flex: none;
}
.link-row.unresolved > i {
  color: var(--ink-text-muted);
}
.link-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.link-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.link-sub {
  font-size: 11px;
  color: var(--ink-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.link-meta {
  font-size: 10.5px;
  color: var(--ink-text-muted);
  flex: none;
}
.links-search {
  width: 100%;
  border: 1px solid var(--ink-border);
  background: var(--ink-surface-2);
  border-radius: 10px;
  padding: 8px 11px;
  font-size: 13px;
  color: var(--ink-text);
  outline: none;
  margin-bottom: 6px;
  font-family: inherit;
}
</style>

