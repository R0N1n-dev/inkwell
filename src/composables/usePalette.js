import { ref } from 'vue';

/** Shared command-palette state (openable from anywhere). */
export const paletteOpen = ref(false);

export function openPalette() {
  paletteOpen.value = true;
}

export function closePalette() {
  paletteOpen.value = false;
}
