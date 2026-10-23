# Inkwell 🖋️

A full-featured, offline-first **Android notes app** — built to replace your daily driver.
Vue 3 + Vite 8 + Capacitor 8 + RxDB + PrimeVue 4.5.5, plain JavaScript (no TypeScript), JDK 21 target.

> Validated end-to-end: web bundle builds, data-layer test suite passes, and a real
> **debug APK compiles** (`apk/inkwell-v1.0.0-debug.apk`, `com.inkwell.notes`, SDK 36).

---

## Feature tour

### Notes
- **Rich text editor** (Quill 2 via PrimeVue Editor): bold/italic/underline/strike, H1/H2,
  quote, code block, bullet/numbered/**checklists**, links, format clear.
- **Attachments in notes**: gallery images (inline in the text), camera photos,
  **voice recordings** (MediaRecorder with live level meter), and arbitrary files.
  Images are stored as RxDB attachments and referenced by id — no base64 bloat in note HTML.
- Note **colors**, **pin**, **favorite**, **notebooks**, **tags**, full-text **search**,
  sort (modified/created/title), **list & grid views**.
- **Swipe gestures** on every note row: swipe **right = archive**, swipe **left = trash**,
  with an **Undo** toast. Long-press enters **multi-select** with bulk actions.
- **Trash** with restore / delete-forever / auto-purge after 7/30/90 days.
- **Share into Inkwell**: the app appears in Android's share sheet for text and images.
- **Share / export out**: Markdown or standalone HTML (images embedded), copy to clipboard.
- **Backups**: full export/import (notes + notebooks + attachments) as a single JSON file.

### Vault (secret notes)
- Master-password vault, **AES-256-GCM** encryption via WebCrypto, key derived with
  **PBKDF2-SHA256 (250k iterations)**; password never stored (verifier ciphertext only).
- Lock any note from the editor: title/content/tags are wiped from plaintext columns and
  live only inside the encrypted `cipher` field. Locked notes show as placeholders outside the vault.
- Auto-lock timer (1/5/10/30 min/never) + lock-on-background, password change re-encrypts everything.

### Widgets (2 sizes)
- **2×2 quick capture**: one tap opens a fresh note; shows your note count.
- **4×2 notes widget**: pinned + recent notes list (title, snippet, date, color strip, pin flag),
  tap a row to open it, header buttons for quick-add and refresh.
- Widgets render from a JSON snapshot the app pushes to SharedPreferences on every change
  (locked notes are never exposed).

### Notifications & Android integration
- **Per-note reminders** → exact local notifications; tapping opens the note.
- Optional **daily writing nudge** at a time you choose.
- Hardware **back button** handling, status-bar theming, splash screen,
  edge-to-edge safe areas, keyboard resize.

### Themes (from your `app-theme.txt`)
All **9 themes** are built in and switchable live (sidebar dots or Settings → Theme),
each in light/dark/system mode:
Classic Corporate · Energetic Retail · Eco-Organic · Cyber High-Contrast ·
Minimalist Editorial · The High-End Trio · **The Bright Tech Vibe (default)** ·
The Playful Pastel · The Earthy Muted.
Primary drives the PrimeVue preset (~80%); the accent (~20%) powers the FAB, selection,
chips and widget highlights via `--ink-*` CSS custom properties.

### UI
- Slide-in **sidebar** with live counts (notes/favorites/notebooks/tags/archive/trash/vault),
  notebook shortcuts and theme dots.
- Polished empty states, undo toasts, confirmation dialogs, bottom sheets-style dialogs,
  custom colorful launcher icon (adaptive) + generated splash screens.

---

## Project layout

```
inkwell/
├── src/
│   ├── main.js / App.vue / router.js      # boot, shell, hash router
│   ├── theme/          # 9 themes + PrimeVue preset builder + CSS vars
│   ├── db/             # RxDB schemas, database, notes repo, settings
│   ├── crypto/vault.js # PBKDF2 + AES-GCM vault
│   ├── platform/       # Capacitor wrappers: widgets, notifications, share-in, media
│   ├── composables/    # reactive RxDB queries, theme store, audio recorder
│   ├── components/     # sidebar, swipe rows, note cards, dialogs, selection bar
│   ├── views/          # Notes, Editor, Notebooks, Tags, Trash, Vault, Settings
│   └── editor/         # custom Quill blot for inline attachment images
├── android/            # Capacitor 8 native project
│   └── app/src/main/java/com/inkwell/notes/
│       ├── MainActivity.java            # intent routing (widgets/share)
│       ├── InkwellBridgePlugin.java     # JS↔native bridge + mic permission
│       ├── InkwellWidgetSmall/Large.java# the two widget providers
│       ├── WidgetNotesService.java      # ListView remote factory
│       └── WidgetStore.java             # snapshot prefs + refresh
├── assets/             # icon sources (adaptive fg/bg, splash, stat icon)
├── test/node-db-test.mjs  # data-layer smoke test (RxDB CRUD/attachments/crypto)
└── apk/                # built debug APK
```

## Storage

RxDB with the **Dexie (IndexedDB) storage** and the RxDB attachments + Vue-reactivity plugins.
On Android the WebView's IndexedDB is persisted by Chromium inside the app's private data
directory, fully offline. RxDB's own SQLite RxStorage is a **trial limited to 500 documents**
(the full one is premium-only), which is why it is not used — the schema and queries are
storage-agnostic, so switching later is a one-file change.

## Build it yourself

Prereqs: **Node ≥ 22** (Capacitor 8 CLI), **npm ≥ 11** (npm 10 crashes on Vite 8's peer tree),
**JDK 21**, Android SDK 36 (+ build-tools 35/36).

```bash
npm install
npm run dev            # browser dev server (IndexedDB fallback)
npm run test:db        # data-layer smoke test (RxDB CRUD/attachments/vault crypto)
npm run test:web       # headless-browser E2E: boot, editor, search, themes, swipe+undo, vault
npm run build          # web bundle → dist/
npx cap sync android
cd android && ./gradlew assembleDebug     # → app/build/outputs/apk/debug/app-debug.apk
```

Regenerate icons/splashes after editing `assets/*`:

```bash
npm run assets         # @capacitor/assets generate --android
```

Signing a release: add your keystore to `android/app/build.gradle` as usual
(`signingConfigs`), then `./gradlew assembleRelease`.

### Tiny-machine note
This repo was validated in a 1 GB-RAM sandbox; `android/gradle.properties` ships with
normal settings (2 GB heap). On a constrained box, build with:
`./gradlew assembleDebug --no-daemon --max-workers=1 -Dorg.gradle.jvmargs="-Xmx448m -Xss256k -XX:MaxMetaspaceSize=224m -XX:ReservedCodeCacheSize=64m -XX:+UseSerialGC"`

## Roadmap ideas
End-to-end encrypted sync (RxDB replication + any backend), biometric vault unlock
(Android Keystore-wrapped key), note templates, PDF annotation, Wear OS complications.
