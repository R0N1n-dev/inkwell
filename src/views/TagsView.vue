<script setup>
import { computed, inject } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import EmptyState from '../components/EmptyState.vue';
import { useTagCounts } from '../composables/useQueries.js';
import { getDB } from '../db/database.js';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const openSidebar = inject('openSidebar', () => {});

const tagCounts = useTagCounts();
const tags = computed(() => Object.entries(tagCounts.value).sort((a, b) => b[1] - a[1]));

function removeTag(tag) {
  confirm.require({
    header: `Remove #${tag}?`,
    message: 'The tag will be removed from all notes. Notes themselves are kept.',
    icon: 'pi pi-tag',
    accept: async () => {
      const db = await getDB();
      const docs = await db.notes.find({ selector: { tags: { $in: [tag] } } }).exec();
      for (const d of docs) await d.incrementalPatch({ tags: d.tags.filter((t) => t !== tag) });
      toast.add({ severity: 'success', summary: 'Tag removed', life: 1500 });
    }
  });
}
</script>

<template>
  <div class="app-shell">
    <header class="app-topbar">
      <button class="icon-btn" @click="openSidebar()"><i class="pi pi-bars"></i></button>
      <div class="title">Tags</div>
    </header>
    <div class="scroll-area">
      <EmptyState v-if="!tags.length" title="No tags yet" text="Add tags from a note's details to organize across notebooks." />
      <div v-else class="tag-cloud">
        <div v-for="[tag, count] in tags" :key="tag" class="tag-item" @click="router.push(`/notes?tag=${tag}`)">
          <span class="tag-name">#{{ tag }}</span>
          <span class="tag-count">{{ count }}</span>
          <button class="icon-btn" style="width: 28px; height: 28px" @click.stop="removeTag(tag)">
            <i class="pi pi-times"></i>
          </button>
        </div>
      </div>
    </div>
    <ConfirmDialog />
    <Toast position="bottom-center" />
  </div>
</template>

<style scoped>
.tag-cloud {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tag-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--ink-surface);
  border: 1px solid var(--ink-border);
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
}
.tag-name {
  font-weight: 650;
  color: var(--ink-accent);
  flex: 1;
}
.tag-count {
  font-size: 12px;
  color: var(--ink-text-muted);
  background: var(--ink-surface-3);
  border-radius: 999px;
  padding: 2px 9px;
}
</style>
