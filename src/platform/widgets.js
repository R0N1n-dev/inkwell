import { watch } from 'vue';
import { getDB, noteList, dataVersion } from '../db/database.js';
import { createNote } from '../db/notes.js';
import { findTodaysNote } from '../db/daily.js';
import { getBridge } from './cap.js';
import { debounce, excerpt, wordCount } from '../utils/format.js';

/** The widget shows as many rows as fit; a few extra cover resizes. */
const SNAPSHOT_LIMIT = 12;

/**
 * Builds the JSON snapshot the Android home-screen widgets render from and
 * pushes it to the native side (SharedPreferences + AppWidgetManager update).
 * Locked notes are never exposed to widgets.
 */
export async function buildWidgetSnapshot() {
  await getDB();
  const docs = noteList
    .filter((n) => !n.trashed && !n.locked && !n.archived)
    .sort((a, b) => b.updated - a.updated)
    .slice(0, SNAPSHOT_LIMIT);

  const pinned = docs.filter((d) => d.pinned);
  const rest = docs.filter((d) => !d.pinned);
  const ordered = [...pinned, ...rest];

  const total = noteList.filter((n) => !n.trashed && !n.locked).length;

  // Today's journal row sits above the list; never create it from here (widget
  // refreshes must stay read-only).
  let daily = null;
  try {
    const today = await findTodaysNote();
    if (today) {
      daily = {
        id: today.id,
        title: today.title || '',
        words: wordCount(today.contentText || '')
      };
    }
  } catch {
    /* no journal today is fine */
  }

  return {
    updatedAt: Date.now(),
    total,
    daily,
    // The journal gets its own pinned row above the list, so don't repeat it.
    notes: ordered
      .filter((d) => !daily || d.id !== daily.id)
      .slice(0, SNAPSHOT_LIMIT)
      .map((d) => ({
        id: d.id,
        title: d.title || 'Untitled',
        snippet: excerpt(d.contentText, 140),
        updated: d.updated,
        pinned: d.pinned,
        color: d.color || ''
      }))
  };
}

async function push() {
  const bridge = await getBridge();
  if (!bridge) return;
  try {
    const snapshot = await buildWidgetSnapshot();
    await bridge.syncWidgetData({ json: JSON.stringify(snapshot) });
  } catch (err) {
    console.warn('[inkwell] widget sync failed', err);
  }
}

export const syncWidgets = debounce(push, 600);

/** Push the snapshot right now (Settings → Refresh widgets). */
export async function syncWidgetNow() {
  await push();
}

/**
 * Ids of notes captured from the widget (native queue) mapped to the real note
 * ids they became, so tapping a queued widget row opens the imported note.
 */
export const quickCaptureNoteMap = new Map();

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let draining = null;

/**
 * Writes notes captured from the widget (saved natively, app never opened) into
 * the database. Safe to call on every boot and app resume.
 */
export function drainQuickCaptures() {
  if (!draining) {
    draining = importCaptures().finally(() => {
      draining = null;
    });
  }
  return draining;
}

async function importCaptures() {
  const bridge = await getBridge();
  if (!bridge) return 0;

  let captures = [];
  try {
    const res = await bridge.getQuickCaptures();
    captures = res?.captures || [];
  } catch {
    return 0;
  }
  if (!captures.length) return 0;

  let imported = 0;
  for (const capture of captures) {
    const text = String(capture.text || '').trim();
    if (!text) continue;
    const firstLine = text.split('\n')[0].trim().slice(0, 120);
    const html = `<p>${escapeHtml(text).replace(/\n/g, '</p><p>')}</p>`;
    try {
      const doc = await createNote({
        title: firstLine,
        content: html,
        extra: { pinned: !!capture.pinned }
      });
      quickCaptureNoteMap.set(`qc:${capture.ts}`, doc.id);
      imported++;
    } catch (err) {
      console.warn('[inkwell] widget capture import failed', err);
    }
  }

  await bridge.clearQuickCaptures().catch(() => {});
  // Push after clearing so the widget shows the real notes, not the queue.
  if (imported) await push();
  return imported;
}

/** Repaint the widgets whenever notes change. Call once at boot. */
export async function watchWidgets() {
  await getDB();
  watch(dataVersion, () => syncWidgets());
  await push();
}
