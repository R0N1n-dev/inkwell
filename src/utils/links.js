/**
 * Note intelligence helpers: wiki links, outlines and reading time.
 * Everything here is pure (no DB access) so it can be unit-tested.
 */

/** `[[Target]]`, `[[Target|Label]]` and `[[Target#heading]]` -> target titles. */
export function extractWikiLinks(text) {
  if (!text) return [];
  const out = [];
  const re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
  let m;
  while ((m = re.exec(String(text)))) {
    const title = m[1].trim();
    if (title && !out.some((t) => t.toLowerCase() === title.toLowerCase())) out.push(title);
  }
  return out;
}

/** Headings H1–H3 with their position among all headings (for scrolling). */
export function extractHeadings(html) {
  if (!html || typeof DOMParser === 'undefined') return [];
  const root = new DOMParser().parseFromString(html, 'text/html');
  return [...root.querySelectorAll('h1, h2, h3')].map((el, index) => ({
    index,
    level: Number(el.tagName[1]),
    text: (el.textContent || '').replace(/\s+/g, ' ').trim() || 'Untitled section'
  }));
}

/** Quill emits `<p><br></p>` for an empty document. */
export function isEmptyHtml(html) {
  return !html || html === '<p><br></p>' || !String(html).replace(/<[^>]+>/g, '').trim();
}

/** Human reading time at ~200 words per minute (minimum 1 minute). */
export function readingTime(words) {
  return Math.max(1, Math.round((words || 0) / 200));
}

/** Local YYYY-MM-DD key (not UTC — journal days should follow the device). */
export function dateKey(date = new Date()) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** e.g. "Friday, October 23, 2026" */
export function prettyDay(date = new Date()) {
  return new Date(date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}
