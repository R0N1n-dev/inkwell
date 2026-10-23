<script setup>
defineProps({
  icon: { type: String, default: 'pi pi-inbox' },
  title: { type: String, default: 'Nothing here yet' },
  text: { type: String, default: '' }
});
</script>

<template>
  <div class="empty-state">
    <svg width="120" height="90" viewBox="0 0 120 90" fill="none">
      <rect x="18" y="14" width="84" height="62" rx="10" fill="var(--ink-surface-3)" />
      <rect x="30" y="28" width="46" height="6" rx="3" fill="var(--ink-accent)" opacity="0.85" />
      <rect x="30" y="42" width="60" height="5" rx="2.5" fill="var(--ink-text-muted)" opacity="0.45" />
      <rect x="30" y="53" width="52" height="5" rx="2.5" fill="var(--ink-text-muted)" opacity="0.3" />
      <circle cx="94" cy="66" r="16" fill="var(--ink-accent)" opacity="0.18" />
      <path d="M94 58 v16 M86 66 h16" stroke="var(--ink-accent)" stroke-width="3.5" stroke-linecap="round" />
    </svg>
    <h3>{{ title }}</h3>
    <p v-if="text">{{ text }}</p>
    <slot />
  </div>
</template>
