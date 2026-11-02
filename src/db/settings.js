import { getDB } from './database.js';

/** All settings live in one small table, cached in memory after first read. */
let cache = null;

async function load() {
  if (cache) return cache;
  const db = await getDB();
  const rows = await db.settings.toArray();
  cache = new Map(rows.map((r) => [r.key, r.value]));
  return cache;
}

/** Plain (non-reactive) get — for boot paths */
export async function getSetting(key, fallback = null) {
  const map = await load();
  const raw = map.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function setSetting(key, value) {
  const db = await getDB();
  const map = await load();
  const json = JSON.stringify(value);
  map.set(key, json);
  await db.settings.put({ key, value: json });
}

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
