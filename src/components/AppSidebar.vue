<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useCounts, useNotebooks } from '../composables/useQueries.js';
import { THEMES, themeId, setTheme, isDark, toggleDark } from '../composables/useTheme.js';
import { vaultConfigured } from '../crypto/vault.js';
import {
  savedSearches,
  removeSavedSearch,
  savedSearchToQuery,
  savedSearchLabel
} from '../composables/useSavedSearches.js';
import { getOrCreateDailyNote } from '../db/daily.js';

const props = defineProps({ visible: Boolean });
const emit = defineEmits(['update:visible']);

const router = useRouter();
const route = useRoute();
const counts = useCounts();
const notebooks = useNotebooks();

const open = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v)
});

const items = computed(() => [
  { label: 'All notes', icon: 'pi pi-notebook', to: '/notes', count: counts.value.notes, match: () => route.name === 'notes' && !route.query.fav && !route.query.archived && !route.query.tag && !route.query.notebook && !route.query.q },
  { label: 'Favorites', icon: 'pi pi-heart', to: '/notes?fav=1', count: counts.value.favorites, match: () => route.query.fav === '1' },
  { label: 'Tasks', icon: 'pi pi-check-square', to: '/tasks', count: null, match: () => route.name === 'tasks' },
  { label: 'Insights', icon: 'pi pi-chart-bar', to: '/insights', count: null, match: () => route.name === 'insights' },
  { label: 'Notebooks', icon: 'pi pi-folder', to: '/notebooks', count: counts.value.notebooks, match: () => route.name === 'notebooks' },
  { label: 'Tags', icon: 'pi pi-tags', to: '/tags', count: null, match: () => route.name === 'tags' },
  { label: 'Archive', icon: 'pi pi-box', to: '/notes?archived=1', count: counts.value.archived, match: () => route.query.archived === '1' },
  { label: 'Trash', icon: 'pi pi-trash', to: '/trash', count: counts.value.trash, match: () => route.name === 'trash' },
  { label: 'Vault', icon: 'pi pi-shield', to: '/vault', count: vaultConfigured.value ? counts.value.vault : null, match: () => route.name === 'vault' },
  { label: 'Settings', icon: 'pi pi-cog', to: '/settings', count: null, match: () => route.name === 'settings' }
]);

function go(to) {
  router.push(to);
  open.value = false;
}

async function openToday() {
  const doc = await getOrCreateDailyNote();
  router.push({ name: 'editor', params: { id: doc.id } });
  open.value = false;
}

function openSaved(entry) {
  router.push(savedSearchToQuery(entry));
  open.value = false;
}

async function forgetSaved(entry) {
  await removeSavedSearch(entry.id);
}

function savedActive(entry) {
  const q = entry.query || {};
  const keys = Object.keys(q).filter((key) => q[key]);
  if (!keys.length) return false;
  return keys.every((key) => String(route.query[key] || '') === String(q[key]));
}
</script>

<template>
  <Drawer
    v-model:visible="open"
    position="left"
    class="ink-drawer"
    :show-close-icon="false"
    :style="{ width: '290px' }"
  >
    <div class="sidebar-brand">
      <img src="/icon.png" alt="Inkwell" />
      <div class="brand-copy">
        <div class="name">INKWELL</div>
        <div class="tag">your words, your vault</div>
      </div>
      <div class="spacer"></div>
      <div class="brand-actions">
        <button class="icon-btn brand-btn" @click="toggleDark()" :title="isDark ? 'Light mode' : 'Dark mode'">
          <i :class="['pi', isDark ? 'pi-sun' : 'pi-moon']"></i>
        </button>
        <button class="icon-btn brand-btn" title="Close menu" aria-label="Close menu" @click="open = false">
          <i class="pi pi-times"></i>
        </button>
      </div>
    </div>

    <nav class="sidebar-nav">
      <button class="sidebar-item sidebar-today" @click="openToday">
        <i class="pi pi-sun"></i>
        <span>Today's journal</span>
        <span class="count">daily</span>
      </button>
      <button
        v-for="item in items"
        :key="item.label"
        class="sidebar-item"
        :class="{ active: item.match() }"
        @click="go(item.to)"
      >
        <i :class="item.icon"></i>
        <span>{{ item.label }}</span>
        <span v-if="item.count" class="count">{{ item.count }}</span>
      </button>
    </nav>

    <div v-if="notebooks.length" class="sidebar-section">Notebooks</div>
    <nav v-if="notebooks.length" class="sidebar-nav">
      <button
        v-for="nb in notebooks.slice(0, 6)"
        :key="nb.id"
        class="sidebar-item"
        :class="{ active: route.query.notebook === nb.id }"
        @click="go(`/notes?notebook=${nb.id}`)"
      >
        <i :class="nb.icon || 'pi pi-book'" :style="nb.color ? { color: nb.color } : {}"></i>
        <span>{{ nb.title }}</span>
      </button>
    </nav>

    <template v-if="savedSearches.length">
      <div class="sidebar-section">Saved searches</div>
      <nav class="sidebar-nav">
        <div
          v-for="s in savedSearches"
          :key="s.id"
          class="sidebar-item saved-row"
          :class="{ active: savedActive(s) }"
          role="button"
          tabindex="0"
          @click="openSaved(s)"
          @keydown.enter="openSaved(s)"
        >
          <i class="pi pi-bookmark"></i>
          <span class="saved-name">{{ s.name }}<span class="saved-query">{{ savedSearchLabel(s) }}</span></span>
          <button class="saved-del" title="Remove saved search" @click.stop="forgetSaved(s)">
            <i class="pi pi-times"></i>
          </button>
        </div>
      </nav>
    </template>

    <div class="sidebar-section">Themes</div>
    <div class="theme-dots">
      <button
        v-for="t in THEMES"
        :key="t.id"
        class="theme-dot"
        :class="{ active: themeId === t.id }"
        :title="t.name"
        @click="setTheme(t.id)"
      >
        <span class="half" :style="{ background: `linear-gradient(135deg, ${t.primary} 55%, ${t.accent} 55%)` }"></span>
      </button>
    </div>
  </Drawer>
</template>

<style scoped>
.sidebar-brand {
  padding-top: 12px;
  padding-bottom: 8px;
  gap: 10px;
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--ink-surface);
}
.brand-copy {
  min-width: 0;
}
.brand-copy .name,
.brand-copy .tag {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.brand-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}
.brand-btn {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  font-size: 14px;
}
.sidebar-today {
  background: linear-gradient(120deg, var(--ink-accent-soft), transparent);
}
.sidebar-today .count {
  background: var(--ink-accent-soft);
  color: var(--ink-accent);
  text-transform: uppercase;
  font-size: 9.5px;
  letter-spacing: 0.6px;
}
.saved-name {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.saved-query {
  font-size: 10.5px;
  color: var(--ink-text-muted);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.saved-del {
  border: none;
  background: transparent;
  color: var(--ink-text-muted);
  width: 24px;
  height: 24px;
  border-radius: 8px;
  cursor: pointer;
  flex: none;
  opacity: 0.6;
}
.saved-del:active {
  background: var(--ink-surface-3);
}
.saved-del i {
  font-size: 10px;
  width: auto;
}
</style>
