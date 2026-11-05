import { onScopeDispose } from 'vue';

/**
 * Components with unsaved state (currently the editor) register a flusher so
 * the shell can persist everything before backgrounding and before rebuilding
 * the home-screen widget snapshot.
 */
const flushers = new Set();

export function registerFlusher(fn) {
  flushers.add(fn);
  onScopeDispose(() => flushers.delete(fn));
}

export async function flushAll() {
  await Promise.all(
    [...flushers].map(async (fn) => {
      try {
        await fn();
      } catch {
        /* never block backgrounding on a failed flush */
      }
    })
  );
}
