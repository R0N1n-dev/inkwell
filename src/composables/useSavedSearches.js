import { ref } from 'vue';
import { getSetting, setSetting } from '../db/settings.js';

/**
 * Saved searches ("smart views") — a named filter set that appears in the
 * sidebar. Stored in settings so it is included in backups.
 */
export const savedSearches = ref([]);
let loaded = false;

export async function loadSavedSearches(force = false) {
  if (loaded && !force) return savedSearches.value;
  const list = await getSetting('savedSearches', []);
  savedSearches.value = Array.isArray(list) ? list : [];
  loaded = true;
  return savedSearches.value;
}

export async function addSavedSearch(name, query) {
  const list = await loadSavedSearches();
  const clean = {};
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== '' && value != null && value !== false) clean[key] = String(value);
  }
  const entry = {
    id: `ss_${Date.now().toString(36)}`,
    name: String(name || '').trim() || 'Saved search',
    query: clean,
    created: Date.now()
  };
  const next = [...list, entry];
  await setSetting('savedSearches', next);
  savedSearches.value = next;
  return entry;
}

export async function removeSavedSearch(id) {
  const list = await loadSavedSearches();
  const next = list.filter((entry) => entry.id !== id);
  await setSetting('savedSearches', next);
  savedSearches.value = next;
}

export function savedSearchToQuery(entry) {
  return { name: 'notes', query: { ...(entry?.query || {}) } };
}

/** Human label for the saved view, e.g. "#work" or "Search: budget". */
export function savedSearchLabel(entry) {
  const q = entry?.query || {};
  if (q.q) return `“${q.q}”`;
  if (q.tag) return `#${q.tag}`;
  if (q.fav === '1') return 'Favorites';
  if (q.archived === '1') return 'Archive';
  return 'View';
}
