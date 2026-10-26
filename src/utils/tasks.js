/**
 * Checklist helpers used by the Tasks hub.
 *
 * Quill 2 stores task state in `data-list="checked" | "unchecked"`; notes
 * pasted or imported from Markdown may instead carry real checkbox inputs or
 * `data-checked` / `ql-checked-list` markers. All three are understood.
 */

function parse(html) {
  if (typeof DOMParser === 'undefined') return null;
  return new DOMParser().parseFromString(html || '', 'text/html');
}

function isTask(li) {
  const type = li.getAttribute('data-list');
  return (
    type === 'checked' ||
    type === 'unchecked' ||
    li.querySelector('input[type="checkbox"]') ||
    li.getAttribute('data-checked') != null ||
    li.classList.contains('ql-checked-list') ||
    li.classList.contains('ql-unchecked-list') ||
    li.classList.contains('ql-checked') ||
    li.classList.contains('ql-unchecked')
  );
}

function isChecked(li) {
  const type = li.getAttribute('data-list');
  if (type === 'checked') return true;
  if (type === 'unchecked') return false;
  const attr = li.getAttribute('data-checked');
  if (attr != null) return attr === 'true';
  if (li.classList.contains('ql-checked-list') || li.classList.contains('ql-checked')) return true;
  const box = li.querySelector('input[type="checkbox"]');
  if (box) return box.hasAttribute('checked') || box.checked === true;
  return false;
}

function taskList(html) {
  const root = parse(html);
  if (!root) return null;
  return [...root.querySelectorAll('li')].filter(isTask).map((li) => ({ li, root }));
}

/** Flat, ordered list of checklist items: [{ index, text, checked }] */
export function extractTasks(html) {
  const found = taskList(html);
  if (!found) return [];
  return found.map(({ li }, index) => ({
    index,
    text: (li.textContent || '').replace(/\s+/g, ' ').trim(),
    checked: isChecked(li)
  }));
}

/**
 * Flip one checklist item and serialise the HTML again.
 * Returns the original string when the index does not exist.
 */
export function toggleTaskInHtml(html, index) {
  const found = taskList(html);
  if (!found || !found[index]) return html;
  const { li, root } = found[index];
  const next = !isChecked(li);

  const type = li.getAttribute('data-list');
  if (type === 'checked' || type === 'unchecked') li.setAttribute('data-list', next ? 'checked' : 'unchecked');
  if (li.getAttribute('data-checked') != null) li.setAttribute('data-checked', String(next));
  li.classList.toggle('ql-checked-list', next);
  li.classList.toggle('ql-unchecked-list', !next);
  li.classList.toggle('ql-checked', next);
  li.classList.toggle('ql-unchecked', !next);
  const box = li.querySelector('input[type="checkbox"]');
  if (box) {
    if (next) box.setAttribute('checked', 'checked');
    else box.removeAttribute('checked');
  }
  return root.body.innerHTML;
}

/** Fast summary for badges: { total, done, open, percent } */
export function taskStats(html) {
  const items = extractTasks(html);
  const done = items.filter((t) => t.checked).length;
  return {
    total: items.length,
    done,
    open: items.length - done,
    percent: items.length ? Math.round((done / items.length) * 100) : 0
  };
}
