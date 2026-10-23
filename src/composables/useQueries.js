import { ref, watch, onScopeDispose } from 'vue';
import { getDB } from '../db/database.js';

/**
 * Reactive note list for the current filter set.
 * Uses RxDB's Vue reactivity plugin (query.$$ -> Vue ref).
 */
export function useNotesQuery(filters) {
  const list = ref([]);
  let disposed = false;

  const build = async () => {
    const db = await getDB();
    const f = filters.value;
    const selector = { trashed: !!f.trash };

    if (f.trash) {
      // nothing extra
    } else {
      selector.archived = !!f.archived;
      if (f.vault) selector.locked = true;
      else if (f.favorites) selector.favorite = true;
      if (f.notebook) selector.notebookId = f.notebook;
      if (f.tag) selector.tags = { $in: [f.tag] };
    }

    const sortKey = f.sort || 'updated';
    const query = db.notes
      .find({ selector })
      .sort([{ [sortKey]: 'desc' }])
      .limit(f.limit || 500);

    const reactiveRef = query.$$;
    const stop = watchRef(reactiveRef, (docs) => {
      if (disposed) return;
      list.value = docs || [];
    });
    return stop;
  };

  let stopCurrent = null;
  const reload = async () => {
    stopCurrent?.();
    stopCurrent = await build();
  };

  function watchRef(r, cb) {
    // r is a Vue ref kept alive by RxDB; mirror it with a plain watcher
    const { watch } = require_vue();
    const un = watch(r, cb, { immediate: true, deep: false });
    return un;
  }

  reload();

  onScopeDispose(() => {
    disposed = true;
    stopCurrent?.();
  });

  return { list, reload };
}

// tiny indirection so the file stays import-cycle free
import * as vue from 'vue';
function require_vue() {
  return vue;
}

/** Reactive counters for sidebar badges */
export function useCounts() {
  const counts = ref({ notes: 0, favorites: 0, archived: 0, trash: 0, vault: 0, notebooks: 0 });
  let sub = null;
  let alive = true;

  const recompute = async () => {
    const db = await getDB();
    const c = async (selector) => db.notes.count({ selector }).exec();
    if (!alive) return;
    counts.value = {
      notes: await c({ trashed: false, locked: false, archived: false }),
      favorites: await c({ trashed: false, locked: false, favorite: true }),
      archived: await c({ trashed: false, locked: false, archived: true }),
      trash: await c({ trashed: true }),
      vault: await c({ locked: true }),
      notebooks: await db.notebooks.count().exec()
    };
  };

  (async () => {
    const db = await getDB();
    await recompute();
    sub = db.notes.$.subscribe(() => recompute());
  })();

  onScopeDispose(() => {
    alive = false;
    sub?.unsubscribe();
  });

  return counts;
}

/** Reactive notebooks list */
export function useNotebooks() {
  const list = ref([]);
  let un = null;
  (async () => {
    const db = await getDB();
    const q = db.notebooks.find().sort([{ sortIndex: 'asc' }, { title: 'asc' }]);
    const r = q.$$;
    un = vue.watch(r, (v) => (list.value = v || []), { immediate: true });
  })();
  onScopeDispose(() => un?.());
  return list;
}

/** Reactive all-tags map: tag -> count */
export function useTagCounts() {
  const map = ref({});
  let sub = null;
  const recompute = async () => {
    const db = await getDB();
    const docs = await db.notes.find({ selector: { trashed: false, locked: false } }).exec();
    const m = {};
    for (const d of docs) for (const t of d.tags || []) m[t] = (m[t] || 0) + 1;
    map.value = m;
  };
  (async () => {
    const db = await getDB();
    await recompute();
    sub = db.notes.$.subscribe(() => recompute());
  })();
  onScopeDispose(() => sub?.unsubscribe());
  return map;
}

