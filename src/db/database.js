import { createRxDatabase, addRxPlugin } from 'rxdb';
import { RxDBAttachmentsPlugin } from 'rxdb/plugins/attachments';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { VueRxReactivityFactory } from 'rxdb/plugins/reactivity-vue';
import { noteSchema, notebookSchema, settingsSchema, revisionSchema } from './schema.js';

/**
 * Storage
 * -------
 * Inkwell persists everything through RxDB's Dexie storage (IndexedDB).
 * On Android the Capacitor WebView implements IndexedDB on top of SQLite
 * inside the app's private data directory, so notes, attachments and
 * settings are fully offline and private — no server, no cloud.
 */
let dbPromise = null;

async function create() {
  addRxPlugin(RxDBAttachmentsPlugin);
  addRxPlugin(RxDBQueryBuilderPlugin);

  // dev-mode gives full error messages and tolerates Vite HMR re-creating
  // the database; it must never ship in production builds (RxDB error DB9)
  const isDev = !!import.meta.env?.DEV;
  if (isDev) {
    const { RxDBDevModePlugin } = await import('rxdb/plugins/dev-mode');
    addRxPlugin(RxDBDevModePlugin);
  }

  const db = await createRxDatabase({
    name: 'inkwell',
    // dev-mode requires a schema-validating storage (RxDB error DVM1);
    // keep production storage plain to avoid the validation overhead.
    storage: isDev
      ? wrappedValidateAjvStorage({ storage: getRxStorageDexie() })
      : getRxStorageDexie(),
    reactivity: VueRxReactivityFactory,
    multiInstance: false,
    allowSlowCount: true,
    ignoreDuplicate: isDev
  });
  await db.addCollections({
    notes: { schema: noteSchema },
    notebooks: { schema: notebookSchema },
    settings: { schema: settingsSchema },
    revisions: { schema: revisionSchema }
  });

  // One-time migration: RxDB reserves `deleted` as a document property
  // (RxDB error SC17), so the soft-delete flag is stored under `trashed`.
  // Backfill any docs that were written with the legacy `deleted` field.
  const legacyNotes = await db.notes.find().exec();
  for (const n of legacyNotes) {
    if (n.trashed === undefined && n.deleted !== undefined) {
      await n.incrementalPatch({ trashed: n.deleted === true });
    }
  }

  return db;
}

export function getDB() {
  if (!dbPromise) dbPromise = create();
  return dbPromise;
}

export function uid(prefix = 'n') {
  const c = globalThis.crypto;
  const raw = c?.randomUUID
    ? c.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${raw}`;
}
