import { getDB } from '../db/database.js';
import { getBridge } from './cap.js';
import { debounce, excerpt } from '../utils/format.js';

/**
 * Builds the JSON snapshot the Android home-screen widgets render from and
 * pushes it to the native side (SharedPreferences + AppWidgetManager update).
 * Locked notes are never exposed to widgets.
 */
export async function buildWidgetSnapshot() {
  const db = await getDB();
  const docs = await db.notes
    .find({
      selector: { trashed: false, locked: false, archived: false },
      sort: [{ updated: 'desc' }],
      limit: 12
    })
    .exec();

  const pinned = docs.filter((d) => d.pinned);
  const rest = docs.filter((d) => !d.pinned);
  const ordered = [...pinned, ...rest].slice(0, 8);

  const total = await db.notes
    .count({ selector: { trashed: false, locked: false } })
    .exec();

  return {
    updatedAt: Date.now(),
    total,
    notes: ordered.map((d) => ({
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

/** Subscribe to note changes and keep widgets fresh. Call once at boot. */
export async function watchWidgets() {
  const db = await getDB();
  db.notes.$.subscribe(() => syncWidgets());
  await push();
}
