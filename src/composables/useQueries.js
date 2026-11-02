import { computed } from 'vue';
import { noteList, notebookList } from '../db/database.js';

/**
 * Reactive note list for the current filter set.
 * Everything is a computed view over the in-memory note list, so a write
 * anywhere in the app updates every screen at once.
 */
export function useNotesQuery(filters) {
  const list = computed(() => {
    const f = filters.value || {};
    const rows = noteList.filter((n) => {
      if (f.trash) return !!n.trashed;
      if (n.trashed) return false;
      if (!!n.archived !== !!f.archived) return false;
      if (f.vault) return !!n.locked;
      if (n.locked) return false;
      if (f.favorites && !n.favorite) return false;
      if (f.notebook && n.notebookId !== f.notebook) return false;
      if (f.tag && !(n.tags || []).includes(f.tag)) return false;
      return true;
    });

    const key = f.sort || 'updated';
    rows.sort((a, b) =>
      key === 'title'
        ? String(a.title || '').localeCompare(String(b.title || ''))
        : (b[key] || 0) - (a[key] || 0)
    );
    return rows.slice(0, f.limit || 500);
  });

  // Kept for callers that used to invalidate a query; lists are live now.
  return { list, reload: () => {} };
}

/** Reactive counters for sidebar badges */
export function useCounts() {
  return computed(() => ({
    notes: noteList.filter((n) => !n.trashed && !n.locked && !n.archived).length,
    favorites: noteList.filter((n) => !n.trashed && !n.locked && n.favorite).length,
    archived: noteList.filter((n) => !n.trashed && !n.locked && n.archived).length,
    trash: noteList.filter((n) => n.trashed).length,
    vault: noteList.filter((n) => n.locked && !n.trashed).length,
    notebooks: notebookList.length
  }));
}

/** Reactive notebooks list */
export function useNotebooks() {
  return computed(() =>
    [...notebookList].sort(
      (a, b) => (a.sortIndex || 0) - (b.sortIndex || 0) || String(a.title).localeCompare(String(b.title))
    )
  );
}

/** Reactive all-tags map: tag -> count */
export function useTagCounts() {
  return computed(() => {
    const map = {};
    for (const n of noteList) {
      if (n.trashed || n.locked) continue;
      for (const tag of n.tags || []) map[tag] = (map[tag] || 0) + 1;
    }
    return map;
  });
}
