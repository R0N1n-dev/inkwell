import { getDB } from './database.js';

/** Plain (non-reactive) get — for boot paths */
export async function getSetting(key, fallback = null) {
  const db = await getDB();
  const doc = await db.settings.findOne(key).exec();
  if (!doc || !doc.value) return fallback;
  try {
    return JSON.parse(doc.value);
  } catch {
    return fallback;
  }
}

export async function setSetting(key, value) {
  const db = await getDB();
  const json = JSON.stringify(value);
  const existing = await db.settings.findOne(key).exec();
  if (existing) {
    await existing.incrementalPatch({ value: json });
  } else {
    await db.settings.insert({ key, value: json });
  }
}

/** Reactive read — returns a Vue ref that tracks the setting document */
export function useSetting(key, fallback = null) {
  return {
    key,
    fallback,
    async read() {
      return getSetting(key, fallback);
    },
    async write(v) {
      await setSetting(key, v);
    }
  };
}
