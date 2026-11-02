import { getDB, noteList, notebookList, uid, plain, commitNote, dropNote, commitNotebook } from './database.js';
import { htmlToText, bytesToBase64, base64ToBytes } from '../utils/format.js';
import { extractHashtags, mergeTags } from '../utils/tags.js';
import { encryptPayload, decryptPayload, vaultUnlocked } from '../crypto/vault.js';
import { snapshotNote, purgeRevisions } from './revisions.js';

/* ------------------------------------------------------------------ */
/* Notes CRUD                                                          */
/* ------------------------------------------------------------------ */

export async function createNote(fields = {}) {
  const now = Date.now();
  const content = fields.content || '';
  const contentText = htmlToText(content);
  return commitNote({
    id: uid('n'),
    title: fields.title || '',
    content,
    contentText,
    created: now,
    updated: now,
    pinned: false,
    favorite: false,
    archived: false,
    trashed: false,
    deletedAt: 0,
    locked: false,
    cipher: '',
    color: fields.color || '',
    notebookId: fields.notebookId || '',
    tags: mergeTags(fields.tags || [], extractHashtags(contentText)),
    reminderAt: 0,
    reminderNotified: false,
    atts: [],
    ...fields.extra
  });
}

export async function getNote(id) {
  await getDB();
  return noteList.find((n) => n.id === id) || null;
}

/** Patch a note: shallow merge, persisted and reflected everywhere. */
export async function updateNote(id, patch) {
  const note = await getNote(id);
  if (!note) return null;
  return commitNote({ ...plain(note), ...plain(patch) });
}

/** Save edits. For locked notes the payload is re-encrypted on the fly. */
export async function saveNote(id, patch) {
  const note = await getNote(id);
  if (!note) return null;

  if (note.locked) {
    if (!vaultUnlocked.value) throw new Error('vault locked');
    const payload = note.cipher ? await decryptPayload(note.cipher) : emptyPayload();
    Object.assign(payload, pickEditable(patch));
    if (patch.content !== undefined) payload.contentText = htmlToText(patch.content);
    return updateNote(id, { cipher: await encryptPayload(payload), updated: Date.now() });
  }

  const clean = { ...patch, updated: Date.now() };
  if (patch.content !== undefined && patch.contentText === undefined) {
    clean.contentText = htmlToText(patch.content);
  }
  // `#tag` written in the body becomes a tag. Only on an edit that touches the
  // body, so removing a tag by hand does not immediately bring it back.
  if (patch.content !== undefined) {
    clean.tags = mergeTags(clean.tags ?? note.tags ?? [], extractHashtags(clean.contentText));
  }
  // Capture the pre-edit state for version history (throttled inside).
  const contentChanged =
    (patch.title !== undefined && patch.title !== note.title) ||
    (patch.content !== undefined && patch.content !== note.content);
  if (contentChanged) await snapshotNote(note);
  return updateNote(id, clean);
}

function emptyPayload() {
  return { title: '', content: '', contentText: '', color: '', notebookId: '', tags: [] };
}

function pickEditable(patch) {
  const out = {};
  for (const k of ['title', 'content', 'color', 'notebookId', 'tags']) {
    if (patch[k] !== undefined) out[k] = patch[k];
  }
  return out;
}

/** Read a note's editable fields, decrypting when locked + vault open. */
export async function readNoteFields(note) {
  if (!note.locked) {
    return {
      title: note.title,
      content: note.content,
      contentText: note.contentText,
      color: note.color,
      notebookId: note.notebookId,
      tags: [...(note.tags || [])]
    };
  }
  if (!vaultUnlocked.value || !note.cipher) {
    return { title: '', content: '', contentText: '', color: note.color, notebookId: '', tags: [] };
  }
  return { ...emptyPayload(), ...(await decryptPayload(note.cipher)) };
}

/* ------------------------------------------------------------------ */
/* State transitions                                                   */
/* ------------------------------------------------------------------ */

export async function trashNote(id) {
  await updateNote(id, { trashed: true, deletedAt: Date.now(), pinned: false, updated: Date.now() });
}

export async function restoreNote(id) {
  await updateNote(id, { trashed: false, deletedAt: 0, updated: Date.now() });
}

export async function purgeNote(id) {
  const db = await getDB();
  await db.attachments.where('noteId').equals(id).delete();
  await purgeRevisions(id);
  await dropNote(id);
}

export async function emptyTrash() {
  await getDB();
  const ids = noteList.filter((n) => n.trashed).map((n) => n.id);
  for (const id of ids) await purgeNote(id);
}

/** Purge notes that have been in trash longer than `days`. */
export async function autoPurgeTrash(days = 30) {
  if (!days) return 0;
  await getDB();
  const cutoff = Date.now() - days * 86400000;
  const ids = noteList.filter((n) => n.trashed && n.deletedAt < cutoff).map((n) => n.id);
  for (const id of ids) await purgeNote(id);
  return ids.length;
}

export async function setArchived(id, archived) {
  await updateNote(id, { archived, updated: Date.now() });
}

export async function togglePin(id) {
  const note = await getNote(id);
  if (!note) return undefined;
  const saved = await updateNote(id, { pinned: !note.pinned, updated: Date.now() });
  return saved.pinned;
}

export async function toggleFavorite(id) {
  const note = await getNote(id);
  if (!note) return undefined;
  const saved = await updateNote(id, { favorite: !note.favorite, updated: Date.now() });
  return saved.favorite;
}

/* ------------------------------------------------------------------ */
/* Duplicate / merge                                                   */
/* ------------------------------------------------------------------ */

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Copy every attachment (binary + metadata) from one note to another. */
async function copyAttachments(fromNote, toNote) {
  let target = toNote;
  const copied = [];
  for (const att of fromNote.atts || []) {
    if ((target.atts || []).some((a) => a.id === att.id)) continue;
    const bytes = await getAttachmentBytes(fromNote, att.id);
    if (!bytes) continue;
    target = await addAttachment(target, { ...att, data: bytes });
    copied.push(att.id);
  }
  return copied.length;
}

/** Create a standalone copy (content, tags, notebook, color, attachments). */
export async function duplicateNote(id) {
  const src = await getNote(id);
  if (!src) return null;
  const now = Date.now();

  if (src.locked) {
    // Keep the copy encrypted: never turn a vault note into a plaintext note.
    const copy = await createNote({ extra: { favorite: src.favorite, color: src.color || '' } });
    await commitNote({ ...plain(copy), locked: true, cipher: src.cipher, title: '', contentText: '' });
    await copyAttachments(src, await getNote(copy.id));
    return getNote(copy.id);
  }

  const fields = await readNoteFields(src);
  const copy = await createNote({
    title: `${fields.title || 'Untitled'} (copy)`,
    content: fields.content || '',
    tags: [...(fields.tags || [])],
    notebookId: fields.notebookId || '',
    color: fields.color || '',
    extra: { favorite: src.favorite }
  });
  await copyAttachments(src, copy);
  return getNote(copy.id);
}

/**
 * Merge notes into a new note, non-destructively (originals stay put).
 * Each source becomes an H1 section; attachments are copied across.
 */
export async function mergeNotes(ids, { title = '' } = {}) {
  const notes = [];
  for (const id of ids) {
    const note = await getNote(id);
    if (note) notes.push(note);
  }
  if (notes.length < 2) throw new Error('pick at least two notes');

  const sections = [];
  const tags = new Set();
  for (const note of notes) {
    if (note.locked) continue; // merge never pulls vault plaintext into a normal note
    const fields = await readNoteFields(note);
    for (const t of fields.tags || []) tags.add(t);
    sections.push(`<h1>${escapeHtml(fields.title || 'Untitled')}</h1>${fields.content || ''}`);
  }
  if (sections.length < 2) throw new Error('pick at least two unlocked notes');

  const first = notes[0];
  const merged = await createNote({
    title: title || `Merged · ${sections.length} notes`,
    content: sections.join('<hr>'),
    tags: [...tags],
    notebookId: first.notebookId || '',
    color: first.color || ''
  });
  for (const note of notes) {
    if (note.locked) continue;
    await copyAttachments(note, await getNote(merged.id));
  }
  return getNote(merged.id);
}

/* ------------------------------------------------------------------ */
/* Vault lock / unlock of a single note                                */
/* ------------------------------------------------------------------ */

export async function lockNote(id) {
  const note = await getNote(id);
  if (!note || note.locked) return;
  const payload = {
    title: note.title,
    content: note.content,
    contentText: note.contentText,
    color: note.color,
    notebookId: note.notebookId,
    tags: [...(note.tags || [])]
  };
  // Plaintext history must not survive the note being moved into the vault.
  await purgeRevisions(id);
  await updateNote(id, {
    locked: true,
    cipher: await encryptPayload(payload),
    title: '',
    content: '',
    contentText: '',
    tags: [],
    notebookId: '',
    reminderAt: 0,
    updated: Date.now()
  });
}

export async function unlockNote(id) {
  const note = await getNote(id);
  if (!note || !note.locked) return;
  const payload = { ...emptyPayload(), ...(await decryptPayload(note.cipher)) };
  await updateNote(id, {
    locked: false,
    cipher: '',
    title: payload.title || '',
    content: payload.content || '',
    contentText: payload.contentText || '',
    color: payload.color || '',
    notebookId: payload.notebookId || '',
    tags: payload.tags || [],
    updated: Date.now()
  });
}

/* ------------------------------------------------------------------ */
/* Attachments (binary rows live in their own table)                   */
/* ------------------------------------------------------------------ */

const urlCache = new Map(); // `${noteId}:${attId}` -> object URL

export async function addAttachment(note, { id, name, type, data }) {
  const db = await getDB();
  await db.attachments.put({
    key: `${note.id}:${id}`,
    noteId: note.id,
    attId: id,
    type,
    data: new Blob([data], { type })
  });
  urlCache.delete(`${note.id}:${id}`);
  const atts = [...(note.atts || []), { id, name, type, size: data.length }];
  return updateNote(note.id, { atts, updated: Date.now() });
}

export async function removeAttachment(note, attId) {
  const db = await getDB();
  await db.attachments.delete(`${note.id}:${attId}`);
  urlCache.delete(`${note.id}:${attId}`);
  const atts = (note.atts || []).filter((a) => a.id !== attId);
  return updateNote(note.id, { atts, updated: Date.now() });
}

export async function getAttachmentBytes(note, attId) {
  const db = await getDB();
  const row = await db.attachments.get(`${note.id}:${attId}`);
  if (!row?.data) return null;
  return new Uint8Array(await row.data.arrayBuffer());
}

export async function getAttachmentUrl(note, attId) {
  const key = `${note.id}:${attId}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const bytes = await getAttachmentBytes(note, attId);
  if (!bytes) return null;
  const meta = (note.atts || []).find((a) => a.id === attId);
  const blob = new Blob([bytes], { type: meta?.type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

/** Rewrite `attachment://<id>` srcs inside rendered HTML to live blob URLs. */
export async function resolveAttachmentHtml(note, html) {
  if (!html || !html.includes('attachment://')) return html;
  const parser = new DOMParser();
  const root = parser.parseFromString(html, 'text/html');
  const imgs = [...root.querySelectorAll('img[src^="attachment://"]')];
  await Promise.all(
    imgs.map(async (img) => {
      const id = img.getAttribute('src').replace('attachment://', '');
      const url = await getAttachmentUrl(note, id);
      if (url) img.setAttribute('src', url);
    })
  );
  return root.body.innerHTML;
}

/* ------------------------------------------------------------------ */
/* Backup / restore                                                    */
/* ------------------------------------------------------------------ */

export async function exportBackup() {
  const db = await getDB();
  const payload = {
    app: 'inkwell',
    version: 1,
    exportedAt: Date.now(),
    notebooks: notebookList.map((n) => plain(n)),
    notes: []
  };
  for (const note of noteList) {
    const json = plain(note);
    json.attachments = [];
    for (const att of note.atts || []) {
      const row = await db.attachments.get(`${note.id}:${att.id}`);
      if (!row?.data) continue;
      const bytes = new Uint8Array(await row.data.arrayBuffer());
      json.attachments.push({ ...att, data: bytesToBase64(bytes) });
    }
    payload.notes.push(json);
  }
  return JSON.stringify(payload);
}

export async function importBackup(jsonString) {
  const db = await getDB();
  const payload = JSON.parse(jsonString);
  if (payload?.app !== 'inkwell') throw new Error('Not an Inkwell backup');

  for (const nb of payload.notebooks || []) {
    if (!notebookList.some((n) => n.id === nb.id)) await commitNotebook(nb);
  }

  let count = 0;
  for (const noteJson of payload.notes || []) {
    const attachments = noteJson.attachments || [];
    delete noteJson.attachments;
    // normalize legacy `deleted` field (renamed to `trashed`)
    if (noteJson.deleted !== undefined && noteJson.trashed === undefined) {
      noteJson.trashed = noteJson.deleted === true;
      delete noteJson.deleted;
    }
    const existing = noteList.find((n) => n.id === noteJson.id);
    if (existing) {
      if (existing.updated >= (noteJson.updated || 0)) continue;
      await dropNote(existing.id);
    }
    await commitNote(noteJson);
    for (const att of attachments) {
      await db.attachments.put({
        key: `${noteJson.id}:${att.id}`,
        noteId: noteJson.id,
        attId: att.id,
        type: att.type,
        data: new Blob([base64ToBytes(att.data)], { type: att.type })
      });
    }
    count++;
  }
  return count;
}
