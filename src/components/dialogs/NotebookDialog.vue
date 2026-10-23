<script setup>
import { ref, computed } from 'vue';
import { getDB, uid } from '../../db/database.js';
import { useNotebooks } from '../../composables/useQueries.js';

const props = defineProps({ visible: Boolean, modelValue: { type: String, default: '' } });
const emit = defineEmits(['update:visible', 'update:modelValue', 'saved']);

const notebooks = useNotebooks();
const newTitle = ref('');
const showCreate = ref(false);
const newColor = ref('#2EC4B6');
const COLORS = ['#2EC4B6', '#3E63DD', '#8E4EC6', '#D6409F', '#E5484D', '#F76B15', '#FFC53D', '#46A758'];
const ICONS = ['pi pi-book', 'pi pi-briefcase', 'pi pi-heart', 'pi pi-star', 'pi pi-lightbulb', 'pi pi-code', 'pi pi-plane', 'pi pi-home'];
const newIcon = ref('pi pi-book');

const selected = computed(() => props.modelValue);

function pick(id) {
  emit('update:modelValue', id === selected.value ? '' : id);
  emit('update:visible', false);
}

async function create() {
  if (!newTitle.value.trim()) return;
  const db = await getDB();
  const now = Date.now();
  const doc = await db.notebooks.insert({
    id: uid('nb'),
    title: newTitle.value.trim(),
    description: '',
    color: newColor.value,
    icon: newIcon.value,
    created: now,
    updated: now,
    sortIndex: now
  });
  newTitle.value = '';
  showCreate.value = false;
  emit('update:modelValue', doc.id);
  emit('saved', doc);
  emit('update:visible', false);
}
</script>

<template>
  <Dialog v-model:visible="props.visible" modal header="Notebook" :style="{ width: '380px', maxWidth: '92vw' }">
    <div class="nb-list">
      <button class="nb-row" :class="{ active: !selected }" @click="pick('')">
        <i class="pi pi-inbox"></i><span>No notebook</span>
      </button>
      <button
        v-for="nb in notebooks"
        :key="nb.id"
        class="nb-row"
        :class="{ active: selected === nb.id }"
        @click="pick(nb.id)"
      >
        <i :class="nb.icon" :style="{ color: nb.color }"></i>
        <span>{{ nb.title }}</span>
        <i v-if="selected === nb.id" class="pi pi-check" style="margin-left: auto; color: var(--ink-accent)"></i>
      </button>
    </div>

    <Divider />

    <template v-if="!showCreate">
      <Button label="New notebook" icon="pi pi-plus" severity="secondary" text @click="showCreate = true" />
    </template>
    <div v-else class="create-box">
      <InputText v-model="newTitle" placeholder="Notebook name" autofocus class="w-full" />
      <div class="row" style="flex-wrap: wrap; margin-top: 10px">
        <button
          v-for="c in COLORS"
          :key="c"
          class="dot"
          :class="{ active: newColor === c }"
          :style="{ background: c }"
          @click="newColor = c"
        ></button>
      </div>
      <div class="row" style="flex-wrap: wrap; margin-top: 8px">
        <button
          v-for="ic in ICONS"
          :key="ic"
          class="icon-btn"
          :class="{ active: newIcon === ic }"
          @click="newIcon = ic"
        >
          <i :class="ic"></i>
        </button>
      </div>
      <div class="row" style="margin-top: 12px; justify-content: flex-end">
        <Button label="Cancel" text severity="secondary" @click="showCreate = false" />
        <Button label="Create" icon="pi pi-check" @click="create" />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.nb-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 40vh;
  overflow-y: auto;
}
.nb-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  border-radius: 12px;
  border: none;
  background: transparent;
  font-size: 14.5px;
  font-weight: 550;
  color: var(--ink-text);
  cursor: pointer;
  text-align: left;
}
.nb-row.active {
  background: var(--ink-accent-soft);
}
.dot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}
.dot.active {
  border-color: var(--ink-text);
}
.icon-btn.active {
  background: var(--ink-accent-soft);
  color: var(--ink-accent);
}
.create-box {
  display: flex;
  flex-direction: column;
}
.w-full {
  width: 100%;
}
</style>
