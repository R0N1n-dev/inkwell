/* Tiny formatting / DOM helpers shared across the app */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

/** Convert Markdown -> sanitized HTML safe for the Quill editor / DB storage.
 * dompurify v3 needs a real window (browser). Guarded so the module still
 * loads in non-DOM environments (it's only invoked from the editor). */
export function markdownToHtml(md) {
  if (!md) return '';
  const html = marked.parse(String(md));
  if (typeof window === 'undefined') return html;
  const purify = DOMPurify(window);
  return purify && typeof purify.sanitize === 'function' ? purify.sanitize(html) : html;
}

/** Extract the first H1 heading from Markdown to reuse as a note title. */
export function extractFirstH1(md) {
  if (!md) return '';
  const m = String(md).match(/^#\s+(.+)/m);
  return m ? m[1].trim() : '';
}

const REL_STEPS = [
  [60, 'just now', null],
  [120, '1 min ago', null],
  [3600, 'min ago', 60],
  [7200, '1 hr ago', null],
  [86400, 'hrs ago', 3600],
  [172800, 'yesterday', null],
  [604800, 'days ago', 86400]
];

export function relativeTime(ts) {
  if (!ts) return '';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  for (const [limit, label, div] of REL_STEPS) {
    if (diff < limit) return div ? `${Math.floor(diff / div)} ${label}` : label;
  }
  const d = new Date(ts);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  });
}

export function fullDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

export function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Strip HTML to plain text (for previews, search, widgets). */
export function htmlToText(html) {
  if (!html) return '';
  if (typeof DOMParser === 'undefined') {
    // Node fallback (tests): crude but sufficient
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // checklist + block separators become newlines
  doc.querySelectorAll('p, li, h1, h2, h3, blockquote, pre, div').forEach((el) => {
    el.append('\n');
  });
  return (doc.body.textContent || '').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function excerpt(text, len = 160) {
  if (!text) return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > len ? `${flat.slice(0, len)}…` : flat;
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function dataUrlToBytes(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(head)?.[1] || 'application/octet-stream';
  return { bytes: base64ToBytes(b64), mime };
}

export function bytesToDataUrl(bytes, mime) {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function noteFileName(title, ext = 'md') {
  const base = (title || 'untitled').replace(/[^\w\d-]+/g, '-').replace(/-+/g, '-').slice(0, 60);
  return `${base || 'untitled'}.${ext}`;
}

export function wordCount(text) {
  const t = (text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}
