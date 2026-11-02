/**
 * Wiki-link resolution: outgoing links, backlinks and link-target search.
 * Scans only local, unlocked, non-trashed notes.
 */
import { getDB, noteList } from './database.js';
import { extractWikiLinks } from '../utils/links.js';

async function activeNotes() {
  await getDB();
  return noteList.filter((n) => !n.trashed && !n.locked);
}

const norm = (s) => String(s || '').trim().toLowerCase();

/** Outgoing `[[links]]` resolved by note title. */
export async function resolveOutgoing(note) {
  if (!note || note.locked) return [];
  const titles = extractWikiLinks(note.contentText || '');
  if (!titles.length) return [];
  const notes = await activeNotes();
  const byTitle = new Map(notes.map((n) => [norm(n.title), n]));
  return titles.map((title) => ({
    title,
    note: byTitle.get(norm(title)) || null
  }));
}

/** Notes that mention this note's title as a `[[wiki link]]`. */
export async function findBacklinks(note) {
  if (!note || note.locked || !norm(note.title)) return [];
  const needle = norm(note.title);
  const notes = await activeNotes();
  return notes.filter(
    (n) =>
      n.id !== note.id &&
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
