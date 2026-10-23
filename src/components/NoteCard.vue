<script setup>
import { computed } from 'vue';
import { relativeTime, excerpt } from '../utils/format.js';
import { NOTE_COLORS } from '../theme/themes.js';

const props = defineProps({
  doc: Object,
  selected: Boolean,
  selectionMode: Boolean,
  notebookTitle: { type: String, default: '' }
});

const colorValue = computed(() => NOTE_COLORS.find((c) => c.id === props.doc.color)?.value || '');
const snippet = computed(() => excerpt(props.doc.contentText, 180));
const attImages = computed(() => (props.doc.atts || []).filter((a) => a.type.startsWith('image/')).length);
const attAudio = computed(() => (props.doc.atts || []).filter((a) => a.type.startsWith('audio/')).length);
const attFiles = computed(
  () => (props.doc.atts || []).length - attImages.value - attAudio.value
);
</script>

<template>
  <article class="note-card" :class="{ selected }">
    <span v-if="colorValue" class="color-strip" :style="{ background: colorValue }"></span>

    <template v-if="doc.locked">
      <h3><i class="pi pi-lock" style="font-size: 13px; margin-right: 6px"></i>Locked note</h3>
      <p class="snippet">Open the vault to view this note's contents.</p>
    </template>
    <template v-else>
      <h3>{{ doc.title || 'Untitled' }}</h3>
      <p v-if="snippet" class="snippet">{{ snippet }}</p>
      <p v-else-if="(doc.atts || []).length" class="snippet muted">
        <i class="pi pi-paperclip"></i> {{ (doc.atts || []).length }} attachment(s)
      </p>
    </template>

    <div class="meta">
      <span>{{ relativeTime(doc.updated) }}</span>
      <span v-if="doc.pinned" class="chip"><i class="pi pi-thumbtack"></i></span>
      <span v-if="doc.favorite"><i class="pi pi-heart" style="color: var(--ink-accent)"></i></span>
      <span v-if="doc.reminderAt > Date.now()"><i class="pi pi-bell"></i></span>
      <span v-if="attImages"><i class="pi pi-image"></i> {{ attImages }}</span>
      <span v-if="attAudio"><i class="pi pi-microphone"></i> {{ attAudio }}</span>
      <span v-if="attFiles"><i class="pi pi-paperclip"></i> {{ attFiles }}</span>
      <span v-if="notebookTitle" class="chip"><i class="pi pi-book"></i> {{ notebookTitle }}</span>
      <span v-for="tag in (doc.tags || []).slice(0, 2)" :key="tag" class="chip tag">#{{ tag }}</span>
    </div>

    <Checkbox
      v-if="selectionMode"
      :model-value="selected"
      :binary="true"
      class="select-box"
      style="position: absolute; top: 10px; right: 10px"
      @click.stop
    />
  </article>
</template>
