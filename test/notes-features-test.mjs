/**
 * End-to-end data-layer tests for the newer note features:
 * version history, duplicate/merge, daily notes and search helpers.
 *
 * Runs against real Dexie/IndexedDB semantics via fake-indexeddb.
 * Run: npm run test:notes
 */
import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;
globalThis.Text = dom.window.Text;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.getSelection = () => dom.window.getSelection();
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

const { getDB } = await import('../src/db/database.js');
const {
  createNote,
  getNote,
  saveNote,
  duplicateNote,
  mergeNotes,
  purgeNote,
  addAttachment,
  getAttachmentBytes
} = await import('../src/db/notes.js');
const { listRevisions, snapshotNote, restoreRevision, purgeRevisions } = await import('../src/db/revisions.js');
const { getOrCreateDailyNote, findTodaysNote } = await import('../src/db/daily.js');
const { resolveOutgoing, findBacklinks } = await import('../src/db/links.js');

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name}`);
  }
}

await getDB();
const db = await getDB();

console.log('— notes + version history');
const note = await createNote({ title: 'Original', content: '<p>Hello [[Second note]]</p>' });
await saveNote(note.id, { title: 'Original v2', content: '<p>Hello [[Second note]] world</p>' });
let revs = await listRevisions(note.id);
check('autosave snapshots the previous state', revs.length === 1);
check('snapshot keeps old title/content', revs[0].title === 'Original' && revs[0].content.includes('Hello'));

await snapshotNote(await getNote(note.id), { force: true, reason: 'manual' });
revs = await listRevisions(note.id);
check('manual snapshot added', revs.length === 2);

const restored = await restoreRevision(note.id, revs[1].id);
const fieldsAfterRestore = await getNote(note.id);
check('restore works', restored && fieldsAfterRestore.title === 'Original');
check('pre-restore state is snapshotted', (await listRevisions(note.id)).length === 3);

console.log('— duplicate + merge');
const withAttachment = await addAttachment(await getNote(note.id), {
  id: 'att_test',
  name: 'hello.txt',
  type: 'text/plain',
  data: new TextEncoder().encode('attachment body')
});
const copy = await duplicateNote(withAttachment.id);
const copyFresh = await getNote(copy.id);
check('duplicate copies content', copyFresh.title.includes('(copy)') && copyFresh.content.includes('Hello'));
check('duplicate copies attachment metadata', copyFresh.atts.length === 1 && copyFresh.atts[0].name === 'hello.txt');
const copyBytes = await getAttachmentBytes(copyFresh, 'att_test');
check('duplicate copies attachment bytes', new TextDecoder().decode(copyBytes) === 'attachment body');

const locked = await db.notes.insert({
  id: 'n_locked',
  title: '',
  content: '',
  contentText: '',
  created: Date.now(),
  updated: Date.now(),
  locked: true,
  cipher: 'fake-ciphertext',
  atts: []
});
const lockedCopy = await duplicateNote(locked.id);
check('duplicate keeps vault notes encrypted', lockedCopy.locked === true && lockedCopy.cipher === 'fake-ciphertext');

const another = await createNote({ title: 'Second note', content: '<p>Second body</p>' });
await addAttachment(another, {
  id: 'att_two',
  name: 'second.txt',
  type: 'text/plain',
  data: new TextEncoder().encode('second attachment')
});
const merged = await mergeNotes([copyFresh.id, another.id]);
const mergedFresh = await getNote(merged.id);
check('merge creates a new note', mergedFresh.id !== copyFresh.id && mergedFresh.id !== another.id);
check('merge keeps both sections', mergedFresh.content.includes('Hello') && mergedFresh.content.includes('Second body'));
check('merge copies attachments from every source', mergedFresh.atts.length === 2);

console.log('— links');
const backlinks = await findBacklinks(another);
check('backlinks resolve by title', backlinks.some((doc) => doc.id === copyFresh.id || doc.id === mergedFresh.id));
const outgoing = await resolveOutgoing(mergedFresh);
check('outgoing links resolve', outgoing.some((row) => row.note?.title === 'Second note') || outgoing.length > 0);

console.log('— purge cleans history');
await purgeNote(note.id);
check('revisions removed with note', (await listRevisions(note.id)).length === 0);
check('note removed', (await getNote(note.id)) === null);

console.log('— daily journal');
const today1 = await getOrCreateDailyNote();
const today2 = await getOrCreateDailyNote();
check('daily note is reused', today1.id === today2.id);
check('daily note is in Journal notebook', !!(await db.notebooks.findOne(today1.notebookId).exec()));
check('daily note has checklist content', today1.content.includes('data-list'));
check('findTodaysNote matches', (await findTodaysNote())?.id === today1.id);

console.log(failures ? `\n${failures} NOTE FEATURE TEST FAILURES` : '\nALL NOTE FEATURE TESTS PASSED');
process.exit(failures ? 1 : 0);
