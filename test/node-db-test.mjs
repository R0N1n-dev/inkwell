/**
 * Node smoke test for the Inkwell data layer:
 * Dexie storage, notes CRUD, queries, attachments, version history, backup.
 *
 * Run: npm run test:db
 */
import 'fake-indexeddb/auto';

const { getDB, noteList, notebookList, uid } = await import('../src/db/database.js');
const notes = await import('../src/db/notes.js');
const { listRevisions, snapshotNote } = await import('../src/db/revisions.js');
const { getSetting, setSetting } = await import('../src/db/settings.js');
const { useNotesQuery } = await import('../src/composables/useQueries.js');
const { ref } = await import('vue');
const { htmlToText } = await import('../src/utils/format.js');

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

await getDB();

console.log('— create + list');
const nb = await import('../src/db/database.js').then((m) =>
  m.commitNotebook({ id: 'nb1', title: 'Work', description: '', color: '', icon: '', created: 1, updated: 1, sortIndex: 1 })
);
await getDB();
check('notebook stored', notebookList.some((n) => n.id === 'nb1'));

const a = await notes.createNote({ title: 'Hello', content: '<p>World</p>', tags: ['demo', 'work'], notebookId: 'nb1' });
await new Promise((r) => setTimeout(r, 5));
const b = await notes.createNote({ title: 'Second', content: '<p>another</p>', tags: ['demo'] });
check('note ids are unique', a.id !== b.id && a.id.startsWith('n_'));
check('contentText projection', a.contentText === 'World');
check('notebook list has the notebook', nb.title === 'Work');

const all = useNotesQuery(ref({ sort: 'updated' }));
check('query returns both notes, newest first', all.list.value.length === 2 && all.list.value[0].id === b.id);

const tagged = useNotesQuery(ref({ tag: 'work' }));
check('tag filter', tagged.list.value.length === 1 && tagged.list.value[0].id === a.id);

const notArchived = useNotesQuery(ref({ archived: false }));
check('archived filter', notArchived.list.value.length === 2);

console.log('— update is reactive + persisted');
await notes.updateNote(a.id, { title: 'Hello edited' });
const sameObject = noteList.find((n) => n.id === a.id);
check('in-memory object updated in place', sameObject.title === 'Hello edited');
const reopened = await (await getDB()).notes.get(a.id);
check('write reached the database', reopened.title === 'Hello edited');

console.log('— attachments');
const bytes = new TextEncoder().encode('fake-audio-bytes-0123456789');
await notes.addAttachment(a, { id: 'att1', name: 'rec.webm', type: 'audio/webm', data: bytes });
await getDB();
const withAtt = noteList.find((n) => n.id === a.id);
check('attachment metadata', withAtt.atts.length === 1 && withAtt.atts[0].name === 'rec.webm');
const back = await notes.getAttachmentBytes(withAtt, 'att1');
check('attachment roundtrip', back.length === bytes.length);
const attUrl = await notes.getAttachmentUrl(withAtt, 'att1');
check('attachment url', typeof attUrl === 'string' && attUrl.startsWith('blob:'));
await notes.removeAttachment(withAtt, 'att1');
check('attachment removed', noteList.find((n) => n.id === a.id).atts.length === 0);

console.log('— version history');
await notes.updateNote(a.id, { content: '<p>first edit</p>' });
await snapshotNote(noteList.find((n) => n.id === a.id), { force: true });
await notes.updateNote(a.id, { content: '<p>second edit</p>' });
await snapshotNote(noteList.find((n) => n.id === a.id), { force: true });
const revs = await listRevisions(a.id);
check('two snapshots kept', revs.length === 2);
check('newest snapshot first', revs[0].content.includes('second edit') && revs[1].content.includes('first edit'));
await notes.purgeNote(a.id);
check('purge removes revisions', (await listRevisions(a.id)).length === 0);

console.log('— trash / restore / soft-delete purge window');
await notes.trashNote(b.id);
check('trash flag set', noteList.find((n) => n.id === b.id).trashed === true);
const trashQuery = useNotesQuery(ref({ trash: true }));
check('trash query', trashQuery.list.value.length === 1);
await notes.restoreNote(b.id);
check('restore', noteList.find((n) => n.id === b.id).trashed === false);
check('auto-purge keeps recent trash', (await notes.autoPurgeTrash(30)) === 0);

console.log('— settings');
await setSetting('startup', 'notes');
check('setting roundtrip', (await getSetting('startup')) === 'notes');
check('setting fallback', (await getSetting('missing', 42)) === 42);

console.log('— backup / restore');
const backup = await notes.exportBackup();
const parsed = JSON.parse(backup);
check('backup carries notes + notebooks', parsed.app === 'inkwell' && parsed.notes.length === 1 && parsed.notebooks.length >= 1);
await notes.purgeNote(b.id);
check('note really gone before import', noteList.length === 0);
const imported = await notes.importBackup(backup);
check('import restores the note', imported === 1 && noteList.length === 1);

console.log('— hashtags become tags');
const { extractHashtags, mergeTags } = await import('../src/utils/tags.js');
check('simple hashtag', extractHashtags('buy milk #errands').includes('errands'));
check('start of line', extractHashtags('#idea first thought').includes('idea'));
check('mid-word hash ignored', extractHashtags('see page#anchor').length === 0);
check('numeric tag ignored', extractHashtags('#2026 goals').length === 0);
check('dedupe', extractHashtags('#a #a #b').join(',') === 'a,b');
check('trailing dash trimmed', extractHashtags('tag #work-').join(',') === 'work');
check('merge keeps existing', mergeTags(['keep'], ['new']).join(',') === 'keep,new');
check('merge dedupes', mergeTags(['a'], ['a', 'b']).join(',') === 'a,b');

const grocery = await notes.createNote({ title: 'Groceries', content: '<p>milk #errands #home</p>' });
check('create picks up hashtags', grocery.tags.join(',') === 'errands,home');
await notes.saveNote(grocery.id, { content: '<p>milk #errands #home and #later</p>' });
check('edit adds new hashtag only', noteList.find((n) => n.id === grocery.id).tags.join(',') === 'errands,home,later');
await notes.updateNote(grocery.id, { tags: ['errands'] });
await notes.saveNote(grocery.id, { title: 'Groceries, renamed' });
check('title-only edit keeps the trimmed tags', noteList.find((n) => n.id === grocery.id).tags.join(',') === 'errands');
await notes.purgeNote(grocery.id);

console.log('— htmlToText');
check('strip html', htmlToText('<h1>T</h1><p>a<br>b</p>').includes('T'));
check('uid prefix', uid('rev').startsWith('rev_'));

console.log(failures ? `\n${failures} FAILURES` : '\nALL DATA-LAYER TESTS PASSED');
process.exit(failures ? 1 : 0);
