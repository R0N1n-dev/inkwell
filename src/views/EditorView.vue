<script setup>
import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { Clipboard } from '@capacitor/clipboard';
import Quill from 'quill';
import NotebookDialog from '../components/dialogs/NotebookDialog.vue';
import TagsDialog from '../components/dialogs/TagsDialog.vue';
import ReminderDialog from '../components/dialogs/ReminderDialog.vue';
import { registerAttImageBlot } from '../editor/attBlot.js';
import { useRecorder } from '../composables/useRecorder.js';
import {
  getNote,
  createNote,
  saveNote,
  readNoteFields,
  trashNote,
  togglePin,
  toggleFavorite,
  lockNote,
  unlockNote,
  addAttachment,
  removeAttachment,
  getAttachmentUrl,
  getAttachmentBytes
} from '../db/notes.js';
import { vaultUnlocked, vaultConfigured, unlockVault } from '../crypto/vault.js';
import { capturePhoto, pickImages, pickFiles } from '../platform/media.js';
import { syncWidgets } from '../platform/widgets.js';
import { scheduleReminder, cancelReminder } from '../platform/notify.js';
import { isNative } from '../platform/cap.js';
import { debounce, htmlToText, wordCount, noteFileName, formatSize, fullDate, dataUrlToBytes, markdownToHtml, extractFirstH1 } from '../utils/format.js';
import { htmlToMarkdown, buildStandaloneHtml, saveTextFile, shareText } from '../utils/exporters.js';
import { NOTE_COLORS } from '../theme/themes.js';
import { useNotebooks } from '../composables/useQueries.js';

registerAttImageBlot();

const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const notebooks = useNotebooks();
const recorder = useRecorder();

const docRef = ref(null);
const loaded = ref(false);
const fields = ref({ title: '', content: '', color: '', notebookId: '', tags: [] });
const reminderAt = ref(0);
const pinned = ref(false);
const favorite = ref(false);
const isLocked = ref(false);
const showLockedPanel = ref(false);
const unlockPassword = ref('');
const saving = ref(false);
const savedAt = ref(0);
const formats = ref({});
const attUrls = ref({});
const lightbox = ref(null); // attachment id for preview

const notebookDlg = ref(false);
const tagsDlg = ref(false);
const reminderDlg = ref(false);
const detailsDlg = ref(false);
const overflow = ref(null);

const editorEl = ref(null);
// shallowRef: a reactive Proxy around Quill breaks Parchment's `blot.scroll === this`
// identity checks, so selection lookups return null and throw.
const quill = shallowRef(null);

const isDraft = computed(() => route.params.id === 'new' && !docRef.value);
const notebookTitle = computed(
  () => notebooks.value.find((n) => n.id === fields.value.notebookId)?.title || ''
);
const words = computed(() => wordCount(htmlToText(fields.value.content)));
const images = computed(() => (docRef.value?.atts || []).filter((a) => a.type.startsWith('image/')));
const audios = computed(() => (docRef.value?.atts || []).filter((a) => a.type.startsWith('audio/')));
const files = computed(() => {
  const atts = docRef.value?.atts || [];
  return atts.filter((a) => !a.type.startsWith('image/') && !a.type.startsWith('audio/'));
});

const overflowItems = computed(() => [
  { label: 'Note details', icon: 'pi pi-info-circle', command: () => (detailsDlg.value = true) },
  { label: 'Share', icon: 'pi pi-share-alt', command: share },
  { label: 'Export Markdown', icon: 'pi pi-file-export', command: () => exportNote('md') },
  { label: 'Import Markdown', icon: 'pi pi-file-import', command: importMarkdown },
  { label: 'Export HTML', icon: 'pi pi-file', command: () => exportNote('html') },
  { label: 'Copy text', icon: 'pi pi-copy', command: copyText },
  { separator: true },
  {
    label: 'Move to trash',
    icon: 'pi pi-trash',
    command: () =>
      confirm.require({
        header: 'Delete note?',
        message: 'It will stay in Trash for 30 days.',
        icon: 'pi pi-trash',
        accept: async () => {
          if (docRef.value) {
            await trashNote(docRef.value.id);
            syncWidgets();
          }
          router.back();
        }
      })
  }
]);

/* ------------------------------ load / save ------------------------------ */

let loadedId = null;

async function load() {
  const id = route.params.id;
  loadedId = id;
  if (id === 'new') {
    loaded.value = true;
    pushContent('');
    return;
  }
  const doc = await getNote(id);
  if (!doc) {
    toast.add({ severity: 'error', summary: 'Note not found', life: 2000 });
    router.back();
    return;
  }
  docRef.value = doc;
  isLocked.value = doc.locked;
  pinned.value = doc.pinned;
  favorite.value = doc.favorite;
  reminderAt.value = doc.reminderAt;
  if (doc.locked && !vaultUnlocked.value) {
    showLockedPanel.value = true;
    loaded.value = true;
    return;
  }
  fields.value = await readNoteFields(doc);
  loaded.value = true;
  await refreshAttUrls();
  await nextTick();
  pushContent(fields.value.content);
  refreshFigureSrcs();
}

watch(() => route.params.id, (id) => {
  if (id !== loadedId) {
    loaded.value = false;
    docRef.value = null;
    fields.value = { title: '', content: '', color: '', notebookId: '', tags: [] };
    load();
  }
});

watch(vaultUnlocked, async (v) => {
  if (v && docRef.value?.locked) {
    showLockedPanel.value = false;
    isLocked.value = true;
    fields.value = await readNoteFields(docRef.value);
    await nextTick();
    pushContent(fields.value.content);
    refreshFigureSrcs();
  }
});

load();

/**
 * Quill owns the live document: fields.content is refreshed only when something
 * reads or saves it, because getSemanticHTML() serialises the whole note and
 * must not run on every keystroke.
 *
 * Quill takes over the element it is given (it becomes .ql-container and gets an
 * inner .ql-editor), so the element must outlive note switches: it is created
 * once for this screen and only the content is swapped (see load()).
 */
watch(
  editorEl,
  (el) => {
    if (!el) {
      quill.value = null;
      return;
    }
    const q = new Quill(el, {
      theme: 'snow',
      placeholder: 'Start writing…',
      modules: { toolbar: false }
    });
    q.on('text-change', (_delta, _old, source) => {
      if (source !== 'user') return;
      convertPastedDataImages();
      scheduleSave();
    });
    q.on('selection-change', (range) => {
      formats.value = range ? q.getFormat(range) : {};
    });
    quill.value = q;
  },
  { flush: 'post' }
);

function pullContent() {
  const q = quill.value;
  if (!q) return;
  const html = q.getSemanticHTML();
  fields.value.content = html === '<p><br></p>' ? '' : html;
}

function pushContent(html) {
  const q = quill.value;
  if (!q) return;
  if (html) q.setContents(q.clipboard.convert({ html }));
  else q.setText('');
}

const scheduleSave = debounce(() => flushSave(), 700);

async function flushSave() {
  pullContent();
  const f = fields.value;
  const emptyDraft =
    !docRef.value && !f.title.trim() && !htmlToText(f.content).trim() && route.params.id === 'new';
  if (emptyDraft) return;
  saving.value = true;
  try {
    if (!docRef.value) {
      const doc = await createNote({ ...f });
      docRef.value = doc;
      isLocked.value = false;
      loadedId = doc.id;
      router.replace({ name: 'editor', params: { id: doc.id } });
      if (reminderAt.value) await applyReminder(doc);
    } else {
      await saveNote(docRef.value.id, { ...f, reminderAt: reminderAt.value });
      pinned.value = docRef.value.pinned;
      favorite.value = docRef.value.favorite;
    }
    savedAt.value = Date.now();
    syncWidgets();
  } catch (err) {
    console.error(err);
    toast.add({ severity: 'error', summary: 'Save failed', detail: String(err?.message || err), life: 3000 });
  } finally {
    saving.value = false;
  }
}

onBeforeRouteLeave(async () => {
  await flushSave();
});

/* ------------------------------ toolbar ------------------------------ */

function cmd(format, value) {
  const q = quill.value;
  if (!q) return;
  q.focus();
  const current = q.getFormat();
  if ((format === 'list' || format === 'header') && current[format] === value) {
    q.format(format, false);
  } else {
    q.format(format, value);
  }
  scheduleSave();
}

function cmdLink() {
  const q = quill.value;
  if (!q) return;
  const range = q.getSelection();
  const current = range ? q.getFormat(range).link : null;
  const url = window.prompt('Link URL', current || 'https://');
  if (url === null) return;
  q.focus();
  if (!url) q.format('link', false);
  else {
    if (!range || range.length === 0) q.insertText(range?.index ?? q.getLength(), url, 'link', url);
    else q.format('link', url);
  }
  scheduleSave();
}

function cmdClean() {
  const q = quill.value;
  const range = q?.getSelection();
  if (!q || !range) return;
  q.removeFormat(range.index, range.length || 1);
  scheduleSave();
}

/* ------------------------------ attachments ------------------------------ */

async function ensureDoc() {
  if (!docRef.value) await flushSave();
  return docRef.value;
}

function insertAtCursor(blot, value) {
  const q = quill.value;
  if (!q) return;
  const idx = q.getSelection(true)?.index ?? q.getLength();
  q.insertEmbed(idx, blot, value);
  q.setSelection(idx + 1, 0);
  scheduleSave();
}

async function convertPastedDataImages() {
  const q = quill.value;
  const doc = docRef.value;
  const imgs = [...(q?.root?.querySelectorAll('img[src^="data:"]') || [])];
  if (!imgs.length) return;
  const target = doc || (await ensureDoc());
  if (!target) return;
  for (const img of imgs) {
    const { bytes, mime } = dataUrlToBytes(img.getAttribute('src'));
    const id = `att_${Math.random().toString(36).slice(2, 10)}`;
    await addAttachment(target, { id, name: `image-${Date.now()}`, type: mime, data: bytes });
    // swap the data-url img for our attachment blot
    const range = q.getSelection(true);
    img.closest('p')?.remove();
    insertAtCursor('attImage', id);
    void range;
  }
  await refreshAttUrls();
  refreshFigureSrcs();
}

/* ------------------------------ markdown import ------------------------------ */

async function doImportMarkdown() {
  let file;
  try {
    const files = await pickFiles(1);
    file = files?.[0];
  } catch {
    // picker cancelled / could not open — stay silent, no warning
    return;
  }
  if (!file) return; // cancelled — silent, no warning

  try {
    const name = (file.name || '').toLowerCase();
    if (!name.endsWith('.md') && !name.endsWith('.markdown')) {
      toast.add({ severity: 'error', summary: 'Import failed', detail: 'Pick a .md file', life: 3000 });
      return;
    }
    const md = new TextDecoder().decode(file.bytes ?? new Uint8Array(0));
    fields.value.content = markdownToHtml(md);
    pushContent(fields.value.content);
    const h1 = extractFirstH1(md);
    if (!fields.value.title.trim() && h1) fields.value.title = h1;
    scheduleSave();
    toast.add({ severity: 'success', summary: 'Markdown imported', life: 1600 });
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Import failed', detail: String(err?.message || err), life: 3000 });
  }
}

async function importMarkdown() {
  const hasContent = fields.value.content.trim() || fields.value.title.trim();
  if (hasContent) {
    confirm.require({
      header: 'Import Markdown',
      message: 'This will replace the current note content. Continue?',
      icon: 'pi pi-import',
      acceptClass: 'p-button-secondary',
      accept: doImportMarkdown
    });
    return;
  }
  await doImportMarkdown();
}

async function attachFromGallery() {
  try {
    const items = await pickImages(4);
    const doc = await ensureDoc();
    for (const it of items) {
      const id = `att_${Math.random().toString(36).slice(2, 10)}`;
      await addAttachment(doc, { id, name: it.name, type: it.mime, data: it.bytes });
      insertAtCursor('attImage', id);
    }
    await refreshAttUrls();
    refreshFigureSrcs();
  } catch (err) {
    toast.add({ severity: 'warn', summary: 'No image selected', life: 1500 });
  }
}

async function attachFromCamera() {
  try {
    const it = await capturePhoto();
    const doc = await ensureDoc();
    const id = `att_${Math.random().toString(36).slice(2, 10)}`;
    await addAttachment(doc, { id, name: it.name, type: it.mime, data: it.bytes });
    insertAtCursor('attImage', id);
    await refreshAttUrls();
    refreshFigureSrcs();
  } catch {
    toast.add({ severity: 'warn', summary: 'Camera unavailable', life: 1800 });
  }
}

async function attachFiles() {
  try {
    const items = await pickFiles(3);
    const doc = await ensureDoc();
    for (const it of items) {
      const id = `att_${Math.random().toString(36).slice(2, 10)}`;
      await addAttachment(doc, { id, name: it.name, type: it.mime, data: it.bytes });
    }
    await refreshAttUrls();
  } catch {
    /* cancelled */
  }
}

async function startRecording() {
  try {
    await recorder.start();
  } catch {
    toast.add({ severity: 'error', summary: 'Microphone blocked', detail: 'Grant microphone permission to record audio.', life: 3000 });
  }
}

async function stopRecording() {
  const result = await recorder.stop();
  if (!result) return;
  const doc = await ensureDoc();
  const id = `att_${Math.random().toString(36).slice(2, 10)}`;
  await addAttachment(doc, { id, name: result.name, type: result.mime, data: result.bytes });
  await refreshAttUrls();
}

async function refreshAttUrls() {
  const doc = docRef.value;
  if (!doc) return;
  const map = {};
  for (const a of doc.atts || []) {
    map[a.id] = await getAttachmentUrl(doc, a.id);
  }
  attUrls.value = map;
}

function refreshFigureSrcs() {
  const q = quill.value;
  if (!q) return;
  q.root.querySelectorAll('figure[data-att-id] img').forEach((img) => {
    const id = img.closest('figure').getAttribute('data-att-id');
    const url = attUrls.value[id];
    if (url && img.getAttribute('src') !== url) img.setAttribute('src', url);
  });
}

watch(attUrls, () => nextTick(refreshFigureSrcs));

async function dropAttachment(att) {
  const doc = docRef.value;
  if (!doc) return;
  // remove embed from editor content if present
  const q = quill.value;
  q?.root.querySelectorAll(`figure[data-att-id="${att.id}"]`).forEach((f) => {
    const idx = q.getIndex?.(f.__blot || f);
    f.remove();
    void idx;
  });
  await removeAttachment(doc, att.id);
  await refreshAttUrls();
  scheduleSave();
}

/* ------------------------------ note-level actions ------------------------------ */

async function onPin() {
  if (!docRef.value) await flushSave();
  if (!docRef.value) return;
  pinned.value = await togglePin(docRef.value.id);
  syncWidgets();
}

async function onFavorite() {
  if (!docRef.value) await flushSave();
  if (!docRef.value) return;
  favorite.value = await toggleFavorite(docRef.value.id);
}

async function onReminderChange(v) {
  reminderAt.value = v;
  if (!docRef.value) await flushSave();
  if (docRef.value) await applyReminder(docRef.value);
}

async function applyReminder(doc) {
  await doc.incrementalPatch({ reminderAt: reminderAt.value, reminderNotified: false });
  if (reminderAt.value > Date.now()) {
    const ok = await scheduleReminder({ ...doc.toJSON(), reminderAt: reminderAt.value, title: fields.value.title });
    if (ok) toast.add({ severity: 'info', summary: 'Reminder set', life: 1800 });
  } else {
    await cancelReminder(doc.id);
  }
}

async function onLockToggle() {
  if (!vaultConfigured.value) {
    toast.add({
      severity: 'warn',
      summary: 'Vault not set up',
      detail: 'Create a vault password in the Vault screen first.',
      life: 3200
    });
    router.push({ name: 'vault' });
    return;
  }
  if (!vaultUnlocked.value) {
    toast.add({ severity: 'warn', summary: 'Vault locked', detail: 'Unlock the vault to lock/unlock notes.', life: 2600 });
    router.push({ name: 'vault' });
    return;
  }
  if (!docRef.value) await flushSave();
  if (!docRef.value) return;
  if (isLocked.value) {
    await unlockNote(docRef.value.id);
    isLocked.value = false;
    fields.value = await readNoteFields(docRef.value);
    await nextTick();
    refreshFigureSrcs();
    toast.add({ severity: 'success', summary: 'Note removed from vault', life: 1800 });
  } else {
    await flushSave();
    await lockNote(docRef.value.id);
    isLocked.value = true;
    toast.add({ severity: 'success', summary: 'Note locked in vault', life: 1800 });
  }
  syncWidgets();
}

async function tryUnlockVault() {
  const ok = await unlockVault(unlockPassword.value);
  if (!ok) {
    toast.add({ severity: 'error', summary: 'Wrong password', life: 2000 });
    return;
  }
  unlockPassword.value = '';
}

async function share() {
  await flushSave();
  const md = `# ${fields.value.title || 'Untitled'}\n\n${htmlToMarkdown(fields.value.content)}`;
  await shareText(fields.value.title || 'Inkwell note', md);
  if (!isNative) toast.add({ severity: 'success', summary: 'Copied to clipboard', life: 1500 });
}

async function copyText() {
  pullContent();
  const text = `${fields.value.title}\n\n${htmlToText(fields.value.content)}`;
  if (isNative) await Clipboard.write({ string: text });
  else await navigator.clipboard?.writeText(text);
  toast.add({ severity: 'success', summary: 'Copied', life: 1400 });
}

async function exportNote(kind) {
  await flushSave();
  const title = fields.value.title || 'Untitled';
  if (kind === 'md') {
    const md = `# ${title}\n\n${htmlToMarkdown(fields.value.content)}`;
    const uri = await saveTextFile(noteFileName(title, 'md'), md, 'text/markdown');
    toast.add({ severity: 'success', summary: 'Exported', detail: String(uri).split('/').slice(-2).join('/'), life: 2600 });
  } else {
    const bytes = {};
    for (const a of docRef.value?.atts || []) {
      if (a.type.startsWith('image/')) {
        const b = await getAttachmentBytes(docRef.value, a.id);
        if (b) bytes[a.id] = { type: a.type, bytes: b };
      }
    }
    const html = await buildStandaloneHtml(docRef.value, fields.value, bytes);
    const uri = await saveTextFile(noteFileName(title, 'html'), html, 'text/html');
    toast.add({ severity: 'success', summary: 'Exported', detail: String(uri).split('/').slice(-2).join('/'), life: 2600 });
  }
}

async function back() {
  await flushSave();
  router.back();
}
</script>

<template>
  <div class="app-shell editor-view">
    <!-- locked note gate -->
    <template v-if="showLockedPanel">
      <header class="app-topbar">
        <button class="icon-btn" @click="back"><i class="pi pi-arrow-left"></i></button>
        <div class="title">Locked note</div>
      </header>
      <div class="vault-hero">
        <div class="shield"><i class="pi pi-lock"></i></div>
        <h3 style="margin: 0">This note is in your vault</h3>
        <p class="muted" style="margin: 0; max-width: 260px">
          Enter your vault password to decrypt and edit it.
        </p>
        <div class="row" style="width: 100%; max-width: 320px; margin-top: 10px">
          <InputText
            v-model="unlockPassword"
            type="password"
            placeholder="Vault password"
            style="flex: 1"
            @keyup.enter="tryUnlockVault"
          />
          <Button icon="pi pi-lock-open" label="Unlock" @click="tryUnlockVault" />
        </div>
      </div>
    </template>

    <template v-else>
      <header class="app-topbar">
        <button class="icon-btn" @click="back"><i class="pi pi-arrow-left"></i></button>
        <div class="title">
          {{ isDraft ? 'New note' : notebookTitle || 'Note' }}
          <div class="subtitle">
            <span v-if="saving">saving…</span>
            <span v-else-if="savedAt">saved</span>
            <span v-else>draft</span>
          </div>
        </div>
        <button class="icon-btn" :class="{ accent: pinned }" @click="onPin">
          <i class="pi pi-thumbtack"></i>
        </button>
        <button class="icon-btn" :class="{ accent: reminderAt > Date.now() }" @click="reminderDlg = true">
          <i class="pi pi-bell"></i>
        </button>
        <button class="icon-btn" :class="{ accent: isLocked }" @click="onLockToggle">
          <i :class="['pi', isLocked ? 'pi-lock' : 'pi-lock-open']"></i>
        </button>
        <button class="icon-btn" @click="overflow?.toggle($event)"><i class="pi pi-ellipsis-v"></i></button>
        <Popover ref="overflow">
          <Menu :model="overflowItems" class="border-none" />
        </Popover>
      </header>

      <input
        v-model="fields.title"
        class="editor-title"
        placeholder="Title"
        maxlength="180"
        @input="scheduleSave"
      />

      <!-- attachment tray -->
      <div v-if="(audios.length || files.length || images.length) && docRef" class="att-tray">
        <div v-for="a in audios" :key="a.id" class="att-audio">
          <i class="pi pi-microphone" style="color: var(--ink-accent)"></i>
          <span class="name">{{ a.name }}</span>
          <audio v-if="attUrls[a.id]" controls :src="attUrls[a.id]" style="height: 34px; max-width: 170px"></audio>
          <button class="icon-btn" style="width: 30px; height: 30px" @click="dropAttachment(a)">
            <i class="pi pi-times"></i>
          </button>
        </div>
        <div v-for="a in files" :key="a.id" class="att-audio">
          <i class="pi pi-paperclip" style="color: var(--ink-accent)"></i>
          <span class="name">{{ a.name }} <span class="muted">· {{ formatSize(a.size) }}</span></span>
          <button class="icon-btn" style="width: 30px; height: 30px" @click="dropAttachment(a)">
            <i class="pi pi-times"></i>
          </button>
        </div>
        <div v-if="images.length" class="att-imgs">
          <template v-for="a in images" :key="a.id">
            <img v-if="attUrls[a.id]" :src="attUrls[a.id]" alt="" @click="lightbox = a.id" />
          </template>
        </div>
      </div>

      <div class="ink-editor-wrap">
        <div ref="editorEl" v-show="loaded" class="ink-editor"></div>
      </div>

      <div class="editor-toolbar">
        <button class="icon-btn" :class="{ active: formats.bold }" @click="cmd('bold', true)"><i class="pi pi-bold"></i></button>
        <button class="icon-btn" :class="{ active: formats.italic }" @click="cmd('italic', true)"><i class="pi pi-italic"></i></button>
        <button class="icon-btn" :class="{ active: formats.underline }" @click="cmd('underline', true)"><i class="pi pi-underline"></i></button>
        <button class="icon-btn" :class="{ active: formats.strike }" @click="cmd('strike', true)"><i class="pi pi-strikethrough"></i></button>
        <span class="sep"></span>
        <button class="icon-btn" :class="{ active: formats.header === 1 }" style="font-weight: 800" @click="cmd('header', 1)">H1</button>
        <button class="icon-btn" :class="{ active: formats.header === 2 }" style="font-weight: 700" @click="cmd('header', 2)">H2</button>
        <button class="icon-btn" :class="{ active: formats.blockquote }" @click="cmd('blockquote', true)"><i class="pi pi-comment"></i></button>
        <button class="icon-btn" :class="{ active: formats['code-block'] }" @click="cmd('code-block', true)"><i class="pi pi-code"></i></button>
        <span class="sep"></span>
        <button class="icon-btn" :class="{ active: formats.list === 'bullet' }" @click="cmd('list', 'bullet')"><i class="pi pi-list"></i></button>
        <button class="icon-btn" :class="{ active: formats.list === 'ordered' }" @click="cmd('list', 'ordered')"><i class="pi pi-sort-numeric-down"></i></button>
        <button class="icon-btn" :class="{ active: formats.list === 'checked' || formats.list === 'unchecked' }" @click="cmd('list', 'checked')"><i class="pi pi-check-square"></i></button>
        <span class="sep"></span>
        <button class="icon-btn" @click="cmdLink"><i class="pi pi-link"></i></button>
        <button class="icon-btn" @click="cmdClean"><i class="pi pi-eraser"></i></button>
      </div>

      <div class="editor-statusbar">
        <button class="icon-btn" style="width: 34px; height: 34px" title="Gallery" @click="attachFromGallery"><i class="pi pi-image"></i></button>
        <button class="icon-btn" style="width: 34px; height: 34px" title="Camera" @click="attachFromCamera"><i class="pi pi-camera"></i></button>
        <button class="icon-btn" style="width: 34px; height: 34px" title="Record audio" @click="startRecording"><i class="pi pi-microphone"></i></button>
        <button class="icon-btn" style="width: 34px; height: 34px" title="Attach file" @click="attachFiles"><i class="pi pi-paperclip"></i></button>
        <span class="spacer"></span>
        <span>{{ words }} words</span>
        <button class="icon-btn" style="width: 34px; height: 34px" @click="detailsDlg = true"><i class="pi pi-palette"></i></button>
      </div>
    </template>

    <!-- recorder overlay -->
    <div v-if="recorder.recording.value" class="recorder-panel">
      <span class="rec-dot"></span>
      <div style="flex: 1">
        <div class="time">{{ recorder.pretty.value }}</div>
        <div class="level-meter"><div :style="{ width: `${recorder.level.value * 100}%` }"></div></div>
      </div>
      <Button icon="pi pi-times" severity="secondary" text rounded @click="recorder.cancel()" />
      <Button icon="pi pi-check" rounded @click="stopRecording" />
    </div>

    <!-- dialogs -->
    <NotebookDialog v-model:visible="notebookDlg" v-model="fields.notebookId" @update:model-value="scheduleSave" />
    <TagsDialog v-model:visible="tagsDlg" v-model="fields.tags" @update:model-value="scheduleSave" />
    <ReminderDialog v-model:visible="reminderDlg" :model-value="reminderAt" @update:model-value="onReminderChange" />

    <Dialog v-model:visible="detailsDlg" modal header="Note details" :style="{ width: '400px', maxWidth: '92vw' }">
      <div class="settings-group" style="margin-bottom: 10px">
        <div class="settings-row">
          <i class="pi pi-heart"></i>
          <span class="label">Favorite</span>
          <ToggleSwitch :model-value="favorite" @update:model-value="onFavorite" />
        </div>
        <div class="settings-row" @click="notebookDlg = true" style="cursor: pointer">
          <i class="pi pi-book"></i>
          <span class="label">Notebook</span>
          <span class="value">{{ notebookTitle || 'None' }}</span>
        </div>
        <div class="settings-row" @click="tagsDlg = true" style="cursor: pointer">
          <i class="pi pi-tags"></i>
          <span class="label">Tags</span>
          <span class="value">{{ fields.tags.length ? fields.tags.join(', ') : 'None' }}</span>
        </div>
      </div>
      <div class="row" style="flex-wrap: wrap; gap: 10px; padding: 4px 2px">
        <button
          v-for="c in NOTE_COLORS"
          :key="c.id"
          class="color-dot"
          :class="{ active: fields.color === c.id }"
          :style="{ background: c.value || 'var(--ink-surface-3)' }"
          :title="c.name"
          @click="fields.color = c.id; scheduleSave()"
        ></button>
      </div>
      <Divider />
      <div class="muted" style="font-size: 12.5px; line-height: 1.8">
        <div v-if="docRef">Created: {{ fullDate(docRef.created) }}</div>
        <div v-if="docRef">Modified: {{ fullDate(docRef.updated) }}</div>
        <div>{{ words }} words · {{ (docRef?.atts || []).length }} attachments</div>
      </div>
    </Dialog>

    <Dialog :visible="!!lightbox" modal :showHeader="false" :style="{ width: '94vw' }" @update:visible="v => { if (!v) lightbox = null; }">
      <img v-if="lightbox && attUrls[lightbox]" :src="attUrls[lightbox]" style="width: 100%; border-radius: 14px" alt="" />
    </Dialog>

    <Toast position="bottom-center" />
    <ConfirmDialog />
  </div>
</template>

<style scoped>
.color-dot {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}
.color-dot.active {
  border-color: var(--ink-text);
  box-shadow: 0 0 0 3px var(--ink-accent-soft);
}
</style>
