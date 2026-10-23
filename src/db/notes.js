import { getDB, uid } from './database.js';
import { htmlToText } from '../utils/format.js';
import { encryptPayload, decryptPayload, vaultUnlocked } from '../crypto/vault.js';

/* ------------------------------------------------------------------ */
/* Notes CRUD                                                          */
/* ------------------------------------------------------------------ */

export async function createNote(fields = {}) {
  const db = await getDB();
  const now = Date.now();
  const content = fields.content || '';
  const doc = await db.notes.insert({
    id: uid('n'),
    title: fields.title || '',
    content,
    contentText: htmlToText(content),
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
    tags: fields.tags || [],
    reminderAt: 0,
    reminderNotified: false,
    atts: [],
    ...fields.extra
  });
  return doc;
}

export async function getNote(id) {
  const db = await getDB();
  return db.notes.findOne(id).exec();
}

/** Save edits. For locked notes the payload is re-encrypted on the fly. */
export async function saveNote(id, patch) {
  const db = await getDB();
  const doc = await db.notes.findOne(id).exec();
  if (!doc) return null;

  if (doc.locked) {
    if (!vaultUnlocked.value) throw new Error('vault locked');
    const payload = doc.cipher ? await decryptPayload(doc.cipher) : emptyPayload();
    Object.assign(payload, pickEditable(patch));
    if (patch.content !== undefined) payload.contentText = htmlToText(patch.content);
    await doc.incrementalPatch({
      cipher: await encryptPayload(payload),
      updated: Date.now()
    });
    return doc;
  }

  const clean = { ...patch, updated: Date.now() };
  if (patch.content !== undefined && patch.contentText === undefined) {
    clean.contentText = htmlToText(patch.content);
  }
  await doc.incrementalPatch(clean);
  return doc;
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
export async function readNoteFields(doc) {
  if (!doc.locked) {
    return {
      title: doc.title,
      content: doc.content,
      contentText: doc.contentText,
      color: doc.color,
      notebookId: doc.notebookId,
      tags: [...doc.tags]
    };
  }
  if (!vaultUnlocked.value || !doc.cipher) {
    return { title: '', content: '', contentText: '', color: doc.color, notebookId: '', tags: [] };
  }
  return { ...emptyPayload(), ...(await decryptPayload(doc.cipher)) };
}

/* ------------------------------------------------------------------ */
/* State transitions                                                   */
/* ------------------------------------------------------------------ */

export async function trashNote(id) {
  const doc = await getNote(id);
  if (!doc) return;
  await doc.incrementalPatch({ trashed: true, deletedAt: Date.now(), pinned: false, updated: Date.now() });
}

export async function restoreNote(id) {
  const doc = await getNote(id);
  if (!doc) return;
  await doc.incrementalPatch({ trashed: false, deletedAt: 0, updated: Date.now() });
}

export async function purgeNote(id) {
  const db = await getDB();
  const doc = await db.notes.findOne(id).exec();
  if (!doc) return;
  const fresh = (await db.notes.findOne(id).exec()) || doc;
  await fresh.incrementalRemove(); // attachments are removed together with the document
}

export async function emptyTrash() {
  const db = await getDB();
  const docs = await db.notes.find({ selector: { trashed: true } }).exec();
  await Promise.all(docs.map((d) => purgeNote(d.id)));
}

/** Purge notes that have been in trash longer than `days`. */
export async function autoPurgeTrash(days = 30) {
  if (!days) return 0;
  const db = await getDB();
  const cutoff = Date.now() - days * 86400000;
  const docs = await db.notes
    .find({ selector: { trashed: true, deletedAt: { $lt: cutoff } } })
    .exec();
  await Promise.all(docs.map((d) => purgeNote(d.id)));
  return docs.length;
}

export async function setArchived(id, archived) {
  const doc = await getNote(id);
  if (doc) await doc.incrementalPatch({ archived, updated: Date.now() });
}

export async function togglePin(id) {
  const doc = await getNote(id);
  if (doc) await doc.incrementalPatch({ pinned: !doc.pinned, updated: Date.now() });
  return doc?.pinned;
}

export async function toggleFavorite(id) {
  const doc = await getNote(id);
  if (doc) await doc.incrementalPatch({ favorite: !doc.favorite, updated: Date.now() });
  return doc?.favorite;
}

/* ------------------------------------------------------------------ */
/* Vault lock / unlock of a single note                                */
/* ------------------------------------------------------------------ */

export async function lockNote(id) {
  const db = await getDB();
  const doc = await db.notes.findOne(id).exec();
  if (!doc || doc.locked) return;
  const payload = {
    title: doc.title,
    content: doc.content,
    contentText: doc.contentText,
    color: doc.color,
    notebookId: doc.notebookId,
    tags: [...doc.tags]
  };
  await doc.incrementalPatch({
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
  const db = await getDB();
  const doc = await db.notes.findOne(id).exec();
  if (!doc || !doc.locked) return;
  const payload = { ...emptyPayload(), ...(await decryptPayload(doc.cipher)) };
  await doc.incrementalPatch({
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
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

const urlCache = new Map(); // attKey -> objectURL

export async function addAttachment(doc, { id, name, type, data }) {
  const { bytesToBase64 } = await import('../utils/format.js');
  // putAttachment* returns a NEW document instance (fresh revision)
  const rxAtt = await doc.putAttachmentBase64({ id, data: bytesToBase64(data), type });
  const fresh = rxAtt.doc;
  const atts = [...(fresh.atts || []), { id, name, type, size: data.length }];
  await fresh.incrementalPatch({ atts, updated: Date.now() });
  return fresh;
}

export async function removeAttachment(doc, attId) {
  const fresh0 = (await doc.collection.findOne(doc.id).exec()) || doc;
  try {
    const att = fresh0.getAttachment(attId);
    if (att) await att.remove();
  } catch {
    /* noop */
  }
  urlCache.delete(`${doc.id}:${attId}`);
  const fresh = (await doc.collection.findOne(doc.id).exec()) || fresh0;
  await fresh.incrementalPatch({ atts: (fresh.atts || []).filter((a) => a.id !== attId), updated: Date.now() });
}

export async function getAttachmentBytes(doc, attId) {
  const fresh = (await doc.collection.findOne(doc.id).exec()) || doc;
  const att = fresh.getAttachment(attId);
  if (!att) return null;
  const { base64ToBytes } = await import('../utils/format.js');
  return base64ToBytes(await att.getDataBase64());
}

export async function getAttachmentUrl(doc, attId) {
  const key = `${doc.id}:${attId}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const bytes = await getAttachmentBytes(doc, attId);
  if (!bytes) return null;
  const meta = (doc.atts || []).find((a) => a.id === attId);
  const blob = new Blob([bytes], { type: meta?.type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

/** Rewrite `attachment://<id>` srcs inside rendered HTML to live blob URLs. */
export async function resolveAttachmentHtml(doc, html) {
  if (!html || !html.includes('attachment://')) return html;
  const parser = new DOMParser();
  const root = parser.parseFromString(html, 'text/html');
  const imgs = [...root.querySelectorAll('img[src^="attachment://"]')];
  await Promise.all(
    imgs.map(async (img) => {
      const id = img.getAttribute('src').replace('attachment://', '');
      const url = await getAttachmentUrl(doc, id);
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
  const notes = await db.notes.find().exec();
  const notebooks = await db.notebooks.find().exec();
  const payload = {
    app: 'inkwell',
    version: 1,
    exportedAt: Date.now(),
    notebooks: notebooks.map((n) => n.toJSON()),
    notes: []
  };
  for (const n of notes) {
    const json = n.toJSON();
    json.attachments = [];
    for (const att of n.atts || []) {
      const b64 = await n.getAttachment(att.id)?.getDataBase64();
      if (b64) json.attachments.push({ ...att, data: b64 });
    }
    payload.notes.push(json);
  }
  return JSON.stringify(payload);
}

export async function importBackup(jsonString) {
  const db = await getDB();
  const payload = JSON.parse(jsonString);
  if (payload?.app !== 'inkwell') throw new Error('Not an Inkwell backup');
  let count = 0;
  for (const nb of payload.notebooks || []) {
    const existing = await db.notebooks.findOne(nb.id).exec();
    if (!existing) await db.notebooks.insert(nb);
  }
  for (const noteJson of payload.notes || []) {
    const attachments = noteJson.attachments || [];
    delete noteJson.attachments;
    delete noteJson._attachments;
    // normalize legacy `deleted` field (renamed to `trashed`, RxDB reserves `deleted`)
    if (noteJson.deleted !== undefined && noteJson.trashed === undefined) {
      noteJson.trashed = noteJson.deleted === true;
      delete noteJson.deleted;
    }
    const existing = await db.notes.findOne(noteJson.id).exec();
    if (existing) {
      if (existing.updated >= (noteJson.updated || 0)) continue;
      await existing.incrementalRemove();
    }
    const doc = await db.notes.insert(noteJson);
    for (const att of attachments) {
      await doc.putAttachmentBase64({ id: att.id, type: att.type, data: att.data });
    }
    count++;
  }
  return count;
}
