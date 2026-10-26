<script setup>
import { ref, watch } from 'vue';
import { useToast } from 'primevue/usetoast';
import { listRevisions, restoreRevision } from '../../db/revisions.js';
import { relativeTime, fullDate, wordCount, excerpt } from '../../utils/format.js';

const props = defineProps({
  visible: Boolean,
  doc: Object
});
const emit = defineEmits(['update:visible', 'restored']);
const toast = useToast();

const rows = ref([]);
const loading = ref(false);

const close = () => emit('update:visible', false);

async function load() {
  if (!props.doc?.id) {
    rows.value = [];
    return;
  }
  loading.value = true;
  try {
    rows.value = await listRevisions(props.doc.id);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.visible, props.doc?.id],
  ([open]) => {
    if (open) load();
  }
);

async function restore(rev) {
  try {
    const doc = await restoreRevision(props.doc.id, rev.id);
    toast.add({ severity: 'success', summary: 'Version restored', life: 1800 });
    emit('restored', doc);
    close();
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Restore failed', detail: String(err?.message || err), life: 3000 });
  }
}

const countFor = (rev) => `${wordCount(rev.contentText)} words`;
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Version history"
    :style="{ width: '520px', maxWidth: '94vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="versions-head">
      <i class="pi pi-history"></i>
      <span>
        Local snapshots of <strong>{{ doc?.title || 'this note' }}</strong>. Inkwell keeps the newest
        25 automatically — nothing leaves your device.
      </span>
    </div>

    <div v-if="loading" class="versions-empty">Loading snapshots…</div>
    <div v-else-if="!rows.length" class="versions-empty">
      <i class="pi pi-clock"></i>
      <span>No snapshots yet. They appear as you keep editing this note.</span>
    </div>
    <div v-else class="versions-list">
      <div v-for="(rev, i) in rows" :key="rev.id" class="version-row">
        <div class="version-dot">
          <i :class="i === 0 ? 'pi pi-star-fill' : 'pi pi-clock'"></i>
        </div>
        <div class="version-main">
          <div class="version-title">{{ rev.title || 'Untitled' }}</div>
          <div class="version-snippet">{{ excerpt(rev.contentText, 100) || 'Empty note' }}</div>
          <div class="version-meta">
            <span>{{ relativeTime(rev.created) }}</span>
            <span>·</span>
            <span>{{ countFor(rev) }}</span>
            <span v-if="rev.reason === 'restore'" class="version-tag">before restore</span>
          </div>
        </div>
        <div class="version-actions">
          <span class="version-date">{{ fullDate(rev.created) }}</span>
          <Button label="Restore" icon="pi pi-replay" size="small" text @click="restore(rev)" />
        </div>
      </div>
    </div>

    <template #footer>
      <Button label="Close" text severity="secondary" @click="close" />
    </template>
  </Dialog>
</template>

<style scoped>
.versions-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--ink-text-muted);
  background: var(--ink-surface-2);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.versions-head i {
  color: var(--ink-accent);
  margin-top: 2px;
}
.versions-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 34px 20px;
  color: var(--ink-text-muted);
  font-size: 13px;
  text-align: center;
}
.versions-empty i {
  font-size: 22px;
  opacity: 0.6;
}
.versions-list {
  display: flex;
  flex-direction: column;
  max-height: 52vh;
  overflow-y: auto;
}
.version-row {
  display: flex;
  gap: 10px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--ink-border);
  align-items: flex-start;
}
.version-row:last-child {
  border-bottom: none;
}
.version-dot {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--ink-surface-3);
  color: var(--ink-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex: none;
  margin-top: 2px;
}
.version-main {
  flex: 1;
  min-width: 0;
}
.version-title {
  font-size: 13.5px;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.version-snippet {
  font-size: 11.5px;
  color: var(--ink-text-muted);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.version-meta {
  display: flex;
  gap: 5px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 10.5px;
  color: var(--ink-text-muted);
  margin-top: 4px;
}
.version-tag {
  background: var(--ink-accent-soft);
  color: var(--ink-accent);
  border-radius: 999px;
  padding: 1px 7px;
  font-weight: 700;
  font-size: 9px;
}
.version-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex: none;
}
.version-date {
  font-size: 9.5px;
  color: var(--ink-text-muted);
  white-space: nowrap;
  max-width: 104px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
