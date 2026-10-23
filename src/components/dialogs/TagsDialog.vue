<script setup>
import { ref, computed } from 'vue';
import { useTagCounts } from '../../composables/useQueries.js';

const props = defineProps({ visible: Boolean, modelValue: { type: Array, default: () => [] } });
const emit = defineEmits(['update:visible', 'update:modelValue']);

const tagCounts = useTagCounts();
const input = ref('');

const tags = computed(() => props.modelValue);

const suggestions = computed(() =>
  Object.keys(tagCounts.value)
    .filter((t) => !tags.value.includes(t) && t.includes(input.value.trim().toLowerCase()))
    .slice(0, 8)
);

function add(tag) {
  const clean = tag.trim().toLowerCase().replace(/\s+/g, '-').replace(/^#/, '');
  if (!clean || tags.value.includes(clean)) return;
  emit('update:modelValue', [...tags.value, clean]);
  input.value = '';
}

function remove(tag) {
  emit('update:modelValue', tags.value.filter((t) => t !== tag));
}

function onKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    add(input.value);
  } else if (e.key === 'Backspace' && !input.value && tags.value.length) {
    remove(tags.value[tags.value.length - 1]);
  }
}
</script>

<template>
  <Dialog v-model:visible="props.visible" modal header="Tags" :style="{ width: '380px', maxWidth: '92vw' }">
    <div class="chips">
      <span v-for="t in tags" :key="t" class="tag-chip">
        #{{ t }}
        <button @click="remove(t)"><i class="pi pi-times"></i></button>
      </span>
      <input v-model="input" class="tag-input" placeholder="Add tag…" @keydown="onKey" />
    </div>
    <div v-if="suggestions.length" class="sugg">
      <button v-for="s in suggestions" :key="s" class="tag-chip ghost" @click="add(s)">#{{ s }}</button>
    </div>
    <p class="muted" style="font-size: 12px; margin-top: 12px">Press Enter or comma to add a tag.</p>
  </Dialog>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  border: 1px solid var(--ink-border);
  border-radius: 12px;
  padding: 10px;
}
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--ink-accent-soft);
  color: var(--ink-accent);
  font-weight: 600;
  font-size: 13px;
  border-radius: 999px;
  padding: 5px 10px;
}
.tag-chip button {
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  font-size: 10px;
}
.tag-chip.ghost {
  background: var(--ink-surface-3);
  color: var(--ink-text-muted);
  border: none;
  cursor: pointer;
}
.tag-input {
  flex: 1;
  min-width: 100px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--ink-text);
}
.sugg {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
</style>
