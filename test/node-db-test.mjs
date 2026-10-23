/**
 * Node smoke test for the Inkwell data layer:
 * RxDB schema, queries, attachments and vault crypto.
 *
 * Run: npm run test:db
 */
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { createRxDatabase } from 'rxdb';
import { addRxPlugin } from 'rxdb';
import { RxDBAttachmentsPlugin } from 'rxdb/plugins/attachments';
import { noteSchema, notebookSchema, settingsSchema } from '../src/db/schema.js';
import { htmlToText } from '../src/utils/format.js';

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

addRxPlugin(RxDBAttachmentsPlugin);
const storage = getRxStorageMemory();

const db = await createRxDatabase({
  name: `inktest-${Date.now()}`,
  storage,
  multiInstance: false
});
await db.addCollections({
  notes: { schema: noteSchema },
  notebooks: { schema: notebookSchema },
  settings: { schema: settingsSchema }
});

console.log('— schema + inserts');
const now = Date.now();
await db.notebooks.insert({ id: 'nb1', title: 'Work', created: now, updated: now, sortIndex: 1 });
const note = await db.notes.insert({
  id: 'n1',
  title: 'Hello',
  content: '<p>World <strong>bold</strong></p>',
  contentText: 'Hello world',
  created: now,
  updated: now,
  tags: ['demo', 'work'],
  notebookId: 'nb1'
});
await db.notes.insert({
  id: 'n2',
  title: 'Second',
  content: '',
  contentText: 'another one',
  created: now + 1,
  updated: now + 1,
  tags: ['demo'],
  archived: true
});
check('insert note + notebook', true);

console.log('— queries');
const all = await db.notes.find({ selector: { trashed: false }, sort: [{ updated: 'desc' }] }).exec();
check('find all sorted', all.length === 2 && all[0].id === 'n2');
const tagged = await db.notes.find({ selector: { tags: { $in: ['work'] } } }).exec();
check('array index query ($in)', tagged.length === 1 && tagged[0].id === 'n1');
const notArchived = await db.notes.find({ selector: { trashed: false, archived: false } }).exec();
check('boolean filter', notArchived.length === 1 && notArchived[0].id === 'n1');

console.log('— attachments');
const payload = new TextEncoder().encode('fake-audio-bytes-0123456789');
const rxAtt = await note.putAttachmentBase64({ id: 'att1', data: Buffer.from(payload).toString('base64'), type: 'audio/webm' });
const attB64 = await rxAtt.getDataBase64();
check('attachment roundtrip', Buffer.from(attB64, 'base64').length === payload.length);
await rxAtt.doc.incrementalPatch({ atts: [{ id: 'att1', name: 'rec.webm', type: 'audio/webm', size: payload.length }] });
const fresh = await db.notes.findOne('n1').exec();
check('attachment metadata patch', fresh.atts.length === 1 && fresh.atts[0].name === 'rec.webm');

console.log('— patch + soft delete');
await fresh.incrementalPatch({ trashed: true, deletedAt: now + 5 });
const trashed = await db.notes.find({ selector: { trashed: true } }).exec();
check('trash query', trashed.length === 1);
const fresh2 = await db.notes.findOne('n1').exec();
await fresh2.incrementalRemove(); // cascades attachments
check('purge', (await db.notes.findOne('n1').exec()) === null);

console.log('— vault crypto (WebCrypto AES-GCM + PBKDF2)');
const subtle = globalThis.crypto.subtle;
const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
const material = await subtle.importKey('raw', new TextEncoder().encode('hunter22'), 'PBKDF2', false, ['deriveKey']);
const key = await subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
  material,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt']
);
const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
const secret = JSON.stringify({ title: 'top secret', content: '<p>stuff</p>' });
const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(secret));
const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
check('encrypt/decrypt roundtrip', new TextDecoder().decode(pt) === secret);

console.log('— htmlToText');
check('strip html', htmlToText('<h1>T</h1><p>a<br>b</p>') .includes('T'));

await db.remove();
console.log(failures ? `\n${failures} FAILURES` : '\nALL DATA-LAYER TESTS PASSED');
process.exit(failures ? 1 : 0);
