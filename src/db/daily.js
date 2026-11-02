import { getDB, noteList, notebookList, uid, commitNotebook } from './database.js';
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
  await getDB();
  const found = notebookList.find((n) => n.title === JOURNAL_NOTEBOOK);
  if (found) return found;
  const now = Date.now();
  return commitNotebook({
    id: uid('nb'),
    title: JOURNAL_NOTEBOOK,
    description: 'Your daily notes',
    color: '#F76B15',
    icon: 'bx bx-sun',
    created: now,
    updated: now,
    sortIndex: now
  });
}

export async function findTodaysNote() {
  const map = (await getSetting('dailyNotes', {})) || {};
  const id = map[dateKey()];
  if (!id) return null;
  await getDB();
  const note = noteList.find((n) => n.id === id);
  return note && !note.trashed ? note : null;
}

export async function getOrCreateDailyNote() {
  const existing = await findTodaysNote();
  if (existing) return existing;

  const journal = await ensureJournalNotebook();
  const title = prettyDay();
  let note = noteList.find((n) => n.notebookId === journal.id && n.title === title && !n.trashed);
  if (!note) {
    note = await createNote({
      title,
      content: DAILY_CONTENT,
      notebookId: journal.id,
      tags: ['journal'],
      color: 'orange'
    });
  }

  const map = (await getSetting('dailyNotes', {})) || {};
  map[dateKey()] = note.id;
  // keep the mapping small: only the last 400 days
  const keys = Object.keys(map).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete map[k];
  await setSetting('dailyNotes', map);
  return note;
}
