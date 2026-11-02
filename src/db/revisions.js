/**
 * Local version history.
 *
 * Snapshots are captured before an edit lands (throttled so autosave does not
 * create a row every 700 ms) and kept per note. They live in the same local
 * database — nothing leaves the device.
 */
import { getDB, noteList, uid, plain, commitNote } from './database.js';

/** Minimum time between automatic snapshots of the same note. */
export const REVISION_GAP_MS = 2 * 60 * 1000;
/** Newest snapshots kept per note. */
export const MAX_REVISIONS_PER_NOTE = 25;

/** Newest first. */
async function rowsFor(noteId) {
  const db = await getDB();
  const rows = await db.revisions.where('noteId').equals(noteId).toArray();
  return rows.sort((a, b) => b.created - a.created);
}

async function prune(noteId) {
  const db = await getDB();
  const rows = await rowsFor(noteId);
  const extra = rows.slice(MAX_REVISIONS_PER_NOTE);
  if (extra.length) await db.revisions.bulkDelete(extra.map((r) => r.id));
}

/**
 * Capture the current state of a note. Returns the new revision id or null
 * when nothing meaningful changed / snapshot was throttled.
 */
export async function snapshotNote(note, { force = false, reason = 'edit' } = {}) {
  if (!note || note.locked) return null; // never persist plaintext for vault notes
  const last = (await rowsFor(note.id))[0] || null;
  if (!force) {
    if (last && Date.now() - last.created < REVISION_GAP_MS) return null;
    if (last && last.title === note.title && last.content === note.content) return null;
  }
  if (!note.content && !note.title) return null;

  const db = await getDB();
  const row = {
    id: uid('rev'),
    noteId: note.id,
    title: note.title || '',
    content: note.content || '',
    contentText: note.contentText || '',
    created: Date.now(),
    reason
  };
  await db.revisions.put(row);
  await prune(note.id);
  return row.id;
}

export async function listRevisions(noteId) {
  return rowsFor(noteId);
}

export async function countRevisions(noteId) {
  return (await rowsFor(noteId)).length;
}

/** Restore a snapshot. The pre-restore state is snapshotted first. */
export async function restoreRevision(noteId, revisionId) {
  const db = await getDB();
  const note = noteList.find((n) => n.id === noteId);
  const rev = await db.revisions.get(revisionId);
  if (!note || !rev) return null;
  await snapshotNote(note, { force: true, reason: 'restore' });
  return commitNote({
    ...plain(note),
    title: rev.title || '',
    content: rev.content || '',
    contentText: rev.contentText || '',
    updated: Date.now()
  });
}

export async function purgeRevisions(noteId) {
  const db = await getDB();
  await db.revisions.where('noteId').equals(noteId).delete();
}

/** Global cleanup — keeps history bounded even after bulk imports. */
export async function pruneAllRevisions() {
  const db = await getDB();
  const rows = (await db.revisions.toArray()).sort((a, b) => b.created - a.created);
  const seen = new Map();
  const doomed = [];
  for (const row of rows) {
    const n = (seen.get(row.noteId) || 0) + 1;
    seen.set(row.noteId, n);
    if (n > MAX_REVISIONS_PER_NOTE) doomed.push(row.id);
  }
  if (doomed.length) await db.revisions.bulkDelete(doomed);
}
