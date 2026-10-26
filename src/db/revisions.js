/**
 * Local version history.
 *
 * Snapshots are captured before an edit lands (throttled so autosave does not
 * create a row every 700 ms) and kept per note. They live in the same local
 * IndexedDB database — nothing leaves the device.
 */
import { getDB, uid } from './database.js';

/** Minimum time between automatic snapshots of the same note. */
export const REVISION_GAP_MS = 2 * 60 * 1000;
/** Newest snapshots kept per note. */
export const MAX_REVISIONS_PER_NOTE = 25;

async function newest(noteId) {
  const db = await getDB();
  const rows = await db.revisions
    .find({ selector: { noteId }, sort: [{ created: 'desc' }], limit: 1 })
    .exec();
  return rows[0] || null;
}

async function prune(noteId) {
  const db = await getDB();
  const rows = await db.revisions
    .find({ selector: { noteId }, sort: [{ created: 'desc' }] })
    .exec();
  for (const row of rows.slice(MAX_REVISIONS_PER_NOTE)) await row.incrementalRemove();
}

/**
 * Capture the current state of a note. Returns the new revision id or null
 * when nothing meaningful changed / snapshot was throttled.
 */
export async function snapshotNote(doc, { force = false, reason = 'edit' } = {}) {
  if (!doc || doc.locked) return null; // never persist plaintext for vault notes
  const last = await newest(doc.id);
  if (!force) {
    if (last && Date.now() - last.created < REVISION_GAP_MS) return null;
    if (last && last.title === doc.title && last.content === doc.content) return null;
  }
  if (!doc.content && !doc.title) return null;

  const db = await getDB();
  const id = uid('rev');
  await db.revisions.insert({
    id,
    noteId: doc.id,
    title: doc.title || '',
    content: doc.content || '',
    contentText: doc.contentText || '',
    created: Date.now(),
    reason
  });
  await prune(doc.id);
  return id;
}

export async function listRevisions(noteId) {
  const db = await getDB();
  return db.revisions
    .find({ selector: { noteId }, sort: [{ created: 'desc' }] })
    .exec();
}

export async function countRevisions(noteId) {
  const db = await getDB();
  return db.revisions.count({ selector: { noteId } }).exec();
}

/** Restore a snapshot. The pre-restore state is snapshotted first. */
export async function restoreRevision(noteId, revisionId) {
  const db = await getDB();
  const [doc, rev] = await Promise.all([
    db.notes.findOne(noteId).exec(),
    db.revisions.findOne(revisionId).exec()
  ]);
  if (!doc || !rev) return null;
  await snapshotNote(doc, { force: true, reason: 'restore' });
  await doc.incrementalPatch({
    title: rev.title || '',
    content: rev.content || '',
    contentText: rev.contentText || '',
    updated: Date.now()
  });
  return doc;
}

export async function purgeRevisions(noteId) {
  const db = await getDB();
  const rows = await db.revisions.find({ selector: { noteId } }).exec();
  for (const row of rows) await row.incrementalRemove();
}

/** Global cleanup — keeps history bounded even after bulk imports. */
export async function pruneAllRevisions() {
  const db = await getDB();
  const rows = await db.revisions.find({ selector: {}, sort: [{ created: 'desc' }] }).exec();
  const seen = new Map();
  for (const row of rows) {
    const n = (seen.get(row.noteId) || 0) + 1;
    seen.set(row.noteId, n);
    if (n > MAX_REVISIONS_PER_NOTE) await row.incrementalRemove();
  }
}
