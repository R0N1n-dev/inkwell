# Inkwell 🖋️

**A fast, private, offline-first notes app for Android** — rich text, voice notes, a real encrypted
vault, home-screen widgets, and the small thoughtful tools that make a notes app worth living in.

Vue 3 · Vite 8 · Capacitor 8 · RxDB · PrimeVue 4 · plain JavaScript (no TypeScript)

> **Validated in this repo:** production web bundle builds cleanly, data-layer tests pass, and the
> feature suites pass against Dexie/IndexedDB semantics and a real headless browser
> (`test:db`, `test:notes`, `test:features`, `test:e2e`).
>
> `apk/inkwell-v1.0.0-debug.apk` is the original v1.0.0 baseline build; the build steps below
> produce a fresh APK with everything in this README.

---

## What makes Inkwell different

Most note apps stop at “type something and save it.” Inkwell adds the connective tissue:

| New in this release | What it does |
| --- | --- |
| ⚡ **Quick switcher** | `Ctrl / ⌘ K` searches every note and runs commands — new note, today's journal, tasks, insights, themes. |
| 🧩 **Templates** | Start from Daily journal, Meeting notes, Project plan, Checklist, Book notes or a Weekly review — or save any note as your own template. |
| 🕘 **Version history** | Automatic local snapshots (newest 25 per note) with one-tap restore, plus manual “Save snapshot”. |
| 🔗 **Wiki links & backlinks** | Type `[[Another note]]`; open the Links panel to see outgoing links, linked mentions and create missing notes. |
| 🧭 **Outline & reading time** | A heading outline jumps through long notes; the status bar shows reading time at 200 wpm. |
| ✅ **Tasks hub** | Every checklist across every note in one place — tick items off without opening the note. |
| 📊 **Insights** | Writing streak, best streak, 12-week activity heatmap, word totals, top tags and notes per notebook. |
| 🌅 **Daily journal & word goal** | One tap opens (or creates) today's journal in a Journal notebook, with a configurable daily word goal. |
| 🔖 **Saved searches** | Turn any search + filter combination into a named smart view in the sidebar. |
| 📑 **Duplicate & merge** | Duplicate a note (attachments included), or merge several notes into one new note without touching the originals. |

Everything above works **completely offline**. There is no account, no server and no telemetry.

---

## Feature tour

### Capture & write

- **Rich text editor** (Quill 2): bold/italic/underline/strike, H1–H2, quote, code block,
  bullet/numbered/**checklists**, links and format clearing.
- **Attachments**: gallery images inline in the text, camera photos, **voice recordings**
  (MediaRecorder with live level meter) and arbitrary files. Binary data lives in RxDB
  attachments and is referenced by id — no base64 bloat in the note HTML.
- **Markdown import/export**, standalone **HTML export** with embedded images, share sheet
  integration (text + images), copy to clipboard.
- **Full JSON backup/restore** — notes, notebooks and attachments in one file, all local.
- **Templates** with seven built-ins and your own custom templates saved from any note.
- **Autosave** with a debounced editor, a saved indicator and full crash-safe persistence.
- **Outline panel** and **reading time** for longer pieces.
- **Daily journal** shortcut builds a dated note in the Journal notebook and reuses it all day.

### Organise & find

- **Notebooks**, **tags**, **colors**, **pin**, **favorite**, **archive** and a 7/30/90-day **trash**
  with restore and auto-purge.
- **Quick switcher** with fuzzy-ish ranking across titles, tags and full text.
- **Saved searches**: name the current search/filter/sort combination and open it from the sidebar.
- **Bulk actions** via long-press: pin, favorite, archive, vault, trash, **duplicate**, **merge**.
- **Swipe gestures**: right = archive, left = trash, with Undo. Long-press = multi-select.
- **Wiki links** turn a flat list of notes into a graph. Backlinks are resolved by note title,
  completely locally.

### Review & reflect

- **Tasks hub** aggregates Quill checklists (plus pasted Markdown checkboxes) and writes toggles
  straight back to the source note.
- **Insights** shows totals, a GitHub-style heatmap, current/best streak, top tags and notebook
  distribution.
- **Daily word goal** with progress in Insights; configurable from Insights or Settings.
- **Version history** keeps text snapshots so you can roll back an accidental rewrite,
  with plaintext history purged when a note moves into the vault.

### Privacy

- **Vault**: master-password locked notes encrypted with **AES-256-GCM** via WebCrypto; key derived
  with **PBKDF2-SHA256 (250k iterations)**. Passwords are never stored — only a verifier ciphertext.
- Locked notes keep title, body and tags out of plaintext columns; widgets never see them.
- Version history is disabled for vault notes, and existing snapshots are deleted when a note is
  locked, so plaintext history cannot leak.
- **Offline by default**: RxDB + Dexie (IndexedDB) on the device; no network permissions needed.

### Android integration

- **Two widget sizes**: 2×2 quick capture and 4×2 pinned/recent list, fed by a private
  SharedPreferences snapshot.
- **Per-note reminders** with exact local notifications; tapping opens the note. The daily nudge
  opens today's journal.
- **Hardware back flow**: closes overlays/search/selection first, walks back through screens, then
  asks before exiting from All notes. Side panels and dialogs stay inside the system-bar safe areas.
- Hardware back handling, status-bar theming, splash screen, edge-to-edge safe areas and
  keyboard resize.
- Share text and images **into Inkwell** from any app.

### Themes & UI

- All **9 themes** switch live (sidebar dots or Settings), each with light / dark / system modes:
  Classic Corporate · Energetic Retail · Eco-Organic · Cyber High-Contrast · Minimalist Editorial ·
  The High-End Trio · **The Bright Tech Vibe (default)** · The Playful Pastel · The Earthy Muted.
- Slide-in sidebar with live counts, notebooks, saved searches and theme dots.
- Polished empty states, undo toasts, confirmation dialogs, bottom-sheet dialogs, adaptive launcher
  icon and generated splash screens.

---

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl / ⌘ K` | Open the quick switcher |
| `↑` `↓` | Move through results |
| `Enter` | Open the selected note or command |
| `Esc` | Close the switcher |

On mobile, the same switcher is one tap away from the bolt icon in the note list, editor or sidebar.

---

## Project layout

```
inkwell/
├── src/
│   ├── main.js / App.vue / router.js      # boot, shell, hash router, global shortcuts
│   ├── theme/          # 9 themes + PrimeVue preset builder + CSS variables
│   ├── db/
│   │   ├── database.js # RxDB + Dexie storage (notes, notebooks, settings, revisions)
│   │   ├── schema.js   # note / notebook / setting / revision schemas
│   │   ├── notes.js    # CRUD, trash, vault transitions, duplicate, merge, backups
│   │   ├── revisions.js # version history snapshots + pruning + restore
│   │   ├── links.js    # wiki-link resolution + backlinks
│   │   ├── daily.js    # daily journal note factory + day mapping
│   │   └── settings.js # key/value settings
│   ├── crypto/vault.js # PBKDF2 + AES-GCM vault
│   ├── platform/       # Capacitor wrappers: widgets, notifications, share-in, media
│   ├── composables/    # reactive RxDB queries, theme, recorder, palette, saved searches
│   ├── utils/
│   │   ├── links.js    # wiki links, headings, reading time, local date keys
│   │   ├── tasks.js    # checklist extraction + in-place toggling
│   │   ├── templates.js # built-in + custom templates
│   │   ├── format.js   # text/date/byte helpers
│   │   └── exporters.js # Markdown / standalone HTML / file saving
│   ├── components/     # sidebar, swipe rows, note cards, dialogs, command palette
│   │   └── dialogs/    # notebook, tags, reminder, versions, links
│   ├── views/          # Notes, Editor, Tasks, Insights, Notebooks, Tags, Trash, Vault, Settings
│   └── editor/         # custom Quill blot for inline attachment images
├── android/            # Capacitor 8 native project
│   └── app/src/main/java/com/inkwell/notes/
│       ├── MainActivity.java            # intent routing (widgets / share)
│       ├── InkwellBridgePlugin.java     # JS↔native bridge + mic permission
│       ├── InkwellWidgetSmall/Large.java# the two widget providers
│       ├── WidgetNotesService.java      # ListView remote factory
│       └── WidgetStore.java             # snapshot prefs + refresh
├── assets/             # icon sources (adaptive fg/bg, splash, stat icon)
├── test/
│   ├── node-db-test.mjs           # RxDB schemas, CRUD, attachments, crypto, revisions
│   ├── features-test.mjs          # DOM tests: wiki links, outline, tasks, Quill round-trip
│   ├── notes-features-test.mjs    # Dexie-backed version history, merge, daily notes, links
│   ├── features-e2e.mjs           # browser E2E for the new feature flows
│   └── web-smoke.mjs              # headless-browser E2E (boot, editor, search, vault)
├── apk/                # built debug APK
└── README.md
```

---

## Storage model

RxDB uses the **Dexie (IndexedDB) storage** with the attachments and Vue-reactivity plugins.
On Android the WebView persists IndexedDB inside the app's private data directory, so notes,
attachments, settings and version history are fully offline.

- `notes` — note content, flags, tags, notebook id, reminder, attachment metadata.
- `notebooks` — user-created collections (including the automatic **Journal** notebook).
- `settings` — theme, views, templates, saved searches, daily goal, vault config, daily-note map.
- `revisions` — plaintext snapshots for unlocked notes, capped at 25 per note and pruned with the
  note. Vault notes never write revisions.

RxDB's SQLite RxStorage is avoided because it is trial-limited to 500 documents; the schemas and
queries are storage-agnostic, so swapping storage later is a one-file change.

---

## Build it yourself

Prerequisites: **Node ≥ 22**, **npm ≥ 11**, **JDK 21**, Android SDK 36 (+ build-tools 35/36).

```bash
npm install
npm run dev              # browser dev server (IndexedDB)
npm run test:db          # data layer: schemas, CRUD, attachments, crypto, revisions
npm run test:features    # DOM: wiki links, outline, tasks, templates, Quill round-trip
npm run test:notes       # Dexie: version history, duplicate/merge, daily notes, backlinks
npm run test:e2e         # headless browser: templates, backlinks, versions, tasks, insights, saved views
npm run build            # production bundle → dist/
npm run test:web         # headless-browser E2E (needs Chrome/Chromium system libraries)
npx cap sync android
cd android && ./gradlew assembleDebug   # → app/build/outputs/apk/debug/app-debug.apk
```

Regenerate icons and splash screens after editing `assets/*`:

```bash
npm run assets           # @capacitor/assets generate --android
```

Signing a release: add your keystore to `android/app/build.gradle` (`signingConfigs`) and run
`./gradlew assembleRelease`.

### Tiny-machine note

`android/gradle.properties` ships with normal settings (2 GB heap). On a constrained box:

```bash
./gradlew assembleDebug --no-daemon --max-workers=1 \
  -Dorg.gradle.jvmargs="-Xmx448m -Xss256k -XX:MaxMetaspaceSize=224m -XX:ReservedCodeCacheSize=64m -XX:+UseSerialGC"
```

---

## Design notes

- **Everything is local-first.** Backlinks, the tasks hub and insights scan local documents, so they
  keep working in airplane mode and never upload content.
- **Vault boundaries are explicit.** Version history, widgets, task aggregation and insights all
  skip locked notes. Locking a note also clears its plaintext history.
- **Merge is non-destructive.** Merging creates a new note with one H1 section per source and copies
  attachment binaries; originals remain untouched. Vault notes are never pulled into a merge, and
  duplicating a vault note produces another encrypted note.
- **Small, testable utilities.** `utils/links.js`, `utils/tasks.js` and `utils/templates.js` are pure
  functions, covered by DOM tests that include a real Quill save/reload round-trip.

---

## Roadmap ideas

End-to-end encrypted sync (RxDB replication + any backend) · biometric vault unlock using the Android
Keystore · PDF annotation · nested notebooks · Wear OS complications · an optional Markdown vault
export that mirrors the on-device folder structure.

---

**Inkwell** — your words, your vault.
