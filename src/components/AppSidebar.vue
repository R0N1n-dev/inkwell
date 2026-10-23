<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useCounts, useNotebooks } from '../composables/useQueries.js';
import { THEMES, themeId, setTheme, isDark, toggleDark } from '../composables/useTheme.js';
import { vaultConfigured } from '../crypto/vault.js';

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
  { label: 'All notes', icon: 'pi pi-notebook', to: '/notes', count: counts.value.notes, match: () => route.name === 'notes' && !route.query.fav && !route.query.archived && !route.query.tag && !route.query.notebook },
  { label: 'Favorites', icon: 'pi pi-heart', to: '/notes?fav=1', count: counts.value.favorites, match: () => route.query.fav === '1' },
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
</script>

<template>
  <Drawer v-model:visible="open" position="left" class="ink-drawer" :style="{ width: '290px' }">
    <div class="sidebar-brand">
      <img src="/icon.png" alt="Inkwell" />
      <div>
        <div class="name">INKWELL</div>
        <div class="tag">your words, your vault</div>
      </div>
      <div class="spacer"></div>
      <button class="icon-btn" @click="toggleDark()" :title="isDark ? 'Light mode' : 'Dark mode'">
        <i :class="['pi', isDark ? 'pi-sun' : 'pi-moon']"></i>
      </button>
    </div>

    <nav class="sidebar-nav">
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
