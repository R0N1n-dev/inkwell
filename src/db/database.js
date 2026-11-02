import Dexie from 'dexie';
import { reactive, ref } from 'vue';

/**
 * Storage
 * -------
 * Everything is persisted with Dexie over IndexedDB. On Android the Capacitor
 * WebView backs IndexedDB with SQLite inside the app's private data directory,
 * so notes, attachments and settings stay fully offline and private.
 *
 * Reads are served from two in-memory arrays (`noteList`, `notebookList`) that
 * are loaded once at boot and kept in sync by every write. That keeps the app
 * reactive without a query engine: a list view is a computed filter over
 * `noteList`, so adding a note shows up everywhere at once.
 */
export const noteList = reactive([]);
export const notebookList = reactive([]);

/** Bumped on every write so callers (widgets) can react to changes. */
export const dataVersion = ref(0);

let dbPromise = null;

export function getDB() {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

async function open() {
  const db = new Dexie('inkwell');
  db.version(1).stores({
    notes: 'id, updated, created, notebookId, trashed, locked, pinned, archived, favorite, reminderAt',
    notebooks: 'id, sortIndex, updated',
    settings: 'key',
    revisions: 'id, noteId, created',
    attachments: 'key, noteId'
  });
  await db.open();

  const [notes, notebooks] = await Promise.all([db.notes.toArray(), db.notebooks.toArray()]);
  noteList.splice(0, noteList.length, ...notes.map((n) => reactive(n)));
  notebookList.splice(0, notebookList.length, ...notebooks.map((n) => reactive(n)));
  return db;
}

/** Plain, structured-cloneable copy — reactive proxies cannot be stored. */
export function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

export function uid(prefix = 'n') {
  const c = globalThis.crypto;
  const raw = c?.randomUUID
    ? c.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${raw}`;
}

/**
 * Put a note in the list, keeping the existing reactive object when there is
 * one so component references (editor, cards) stay valid.
 */
export function indexNote(note) {
  const next = plain(note);
  const existing = noteList.find((n) => n.id === next.id);
  if (existing) {
    for (const key of Object.keys(existing)) {
      if (!(key in next)) delete existing[key];
    }
    Object.assign(existing, next);
    return existing;
  }
  const created = reactive(next);
  noteList.push(created);
  return created;
}

/** Persist a note and update the in-memory list. */
export async function commitNote(note) {
  const db = await getDB();
  const next = plain(note);
  await db.notes.put(next);
  dataVersion.value++;
  return indexNote(next);
}

export async function dropNote(id) {
  const db = await getDB();
  await db.notes.delete(id);
  const i = noteList.findIndex((n) => n.id === id);
  if (i >= 0) noteList.splice(i, 1);
  dataVersion.value++;
}

export async function commitNotebook(notebook) {
  const db = await getDB();
  const next = plain(notebook);
  await db.notebooks.put(next);
  const existing = notebookList.find((n) => n.id === next.id);
  if (existing) Object.assign(existing, next);
  else notebookList.push(reactive(next));
  dataVersion.value++;
  return existing || notebookList[notebookList.length - 1];
}

export async function dropNotebook(id) {
  const db = await getDB();
  await db.notebooks.delete(id);
  const i = notebookList.findIndex((n) => n.id === id);
  if (i >= 0) notebookList.splice(i, 1);
  dataVersion.value++;
}
