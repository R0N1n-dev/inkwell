/**
 * Wiki-link resolution: outgoing links, backlinks and link-target search.
 * Scans only local, unlocked, non-trashed notes.
 */
import { getDB } from './database.js';
import { extractWikiLinks } from '../utils/links.js';

async function activeNotes() {
  const db = await getDB();
  return db.notes.find({ selector: { trashed: false, locked: false } }).exec();
}

const norm = (s) => String(s || '').trim().toLowerCase();

/** Outgoing `[[links]]` resolved by note title. */
export async function resolveOutgoing(doc) {
  if (!doc || doc.locked) return [];
  const titles = extractWikiLinks(doc.contentText || '');
  if (!titles.length) return [];
  const notes = await activeNotes();
  const byTitle = new Map(notes.map((n) => [norm(n.title), n]));
  return titles.map((title) => ({
    title,
    note: byTitle.get(norm(title)) || null
  }));
}

/** Notes that mention this note's title as a `[[wiki link]]`. */
export async function findBacklinks(doc) {
  if (!doc || doc.locked || !norm(doc.title)) return [];
  const needle = norm(doc.title);
  const notes = await activeNotes();
  return notes.filter(
    (n) =>
      n.id !== doc.id &&
      extractWikiLinks(n.contentText || '').some((title) => norm(title) === needle)
  );
}

/** Ranked candidates for the "insert note link" picker. */
export async function searchLinkTargets(term = '', excludeId = '') {
  const notes = await activeNotes();
  const q = norm(term);
  return notes
    .filter((n) => n.id !== excludeId)
    .map((n) => {
      const title = norm(n.title);
      let score = 0;
      if (!q) score = 1;
      else if (title.startsWith(q)) score = 3;
      else if (title.includes(q)) score = 2;
      else if (norm(n.contentText).includes(q)) score = 1;
      return { doc: n, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.doc.updated - a.doc.updated)
    .slice(0, 40)
    .map((row) => row.doc);
}
