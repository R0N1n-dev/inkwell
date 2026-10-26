import { getDB, uid } from './database.js';
import { createNote } from './notes.js';
import { getSetting, setSetting } from './settings.js';
import { DAILY_CONTENT } from '../utils/templates.js';
import { dateKey, prettyDay } from '../utils/links.js';

/**
 * Daily notes
 * -----------
 * One note per local calendar day, kept in a "Journal" notebook. The mapping
 * day -> note id is stored in settings so renaming a note never breaks it.
 */
export const JOURNAL_NOTEBOOK = 'Journal';

async function ensureJournalNotebook() {
  const db = await getDB();
  const found = await db.notebooks.find({ selector: { title: JOURNAL_NOTEBOOK } }).exec();
  if (found[0]) return found[0];
  const now = Date.now();
  return db.notebooks.insert({
    id: uid('nb'),
    title: JOURNAL_NOTEBOOK,
    description: 'Your daily notes',
    color: '#F76B15',
    icon: 'pi pi-sun',
    created: now,
    updated: now,
    sortIndex: now
  });
}

export async function findTodaysNote() {
  const map = (await getSetting('dailyNotes', {})) || {};
  const id = map[dateKey()];
  if (!id) return null;
  const db = await getDB();
  const doc = await db.notes.findOne(id).exec();
  return doc && !doc.trashed ? doc : null;
}

export async function getOrCreateDailyNote() {
  const existing = await findTodaysNote();
  if (existing) return existing;

  const db = await getDB();
  const journal = await ensureJournalNotebook();
  const title = prettyDay();
  const found = await db.notes
    .find({ selector: { notebookId: journal.id, title, trashed: false } })
    .exec();
  let doc = found[0];
  if (!doc) {
    doc = await createNote({
      title,
      content: DAILY_CONTENT,
      notebookId: journal.id,
      tags: ['journal'],
      color: 'orange'
    });
  }

  const map = (await getSetting('dailyNotes', {})) || {};
  map[dateKey()] = doc.id;
  // keep the mapping small: only the last 400 days
  const keys = Object.keys(map).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete map[k];
  await setSetting('dailyNotes', map);
  return doc;
}
