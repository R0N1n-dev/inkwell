/**
 * Note templates.
 *
 * Built-ins ship with the app; user templates are stored as JSON in the
 * settings collection so they respect backups and stay fully offline.
 */
import { getSetting, setSetting } from '../db/settings.js';

const t = (id, name, icon, description, content, extra = {}) => ({
  id,
  name,
  icon,
  description,
  title: '',
  content,
  tags: [],
  ...extra
});

export const BUILTIN_TEMPLATES = [
  t('tpl_blank', 'Blank note', 'pi pi-file', 'A clean page, nothing to delete', ''),
  t(
    'tpl_daily',
    'Daily journal',
    'pi pi-sun',
    'Focus, notes and gratitude for today',
    `<h2>Focus for today</h2><p><br></p><h2>Notes</h2><ul><li data-list="bullet"><br></li></ul><h2>Gratitude</h2><p><br></p><h2>Tomorrow</h2><ul><li data-list="unchecked"><br></li></ul>`,
    { tags: ['journal'] }
  ),
  t(
    'tpl_meeting',
    'Meeting notes',
    'pi pi-users',
    'Agenda, decisions and action items',
    `<h2>Attendees</h2><p><br></p><h2>Agenda</h2><ul><li data-list="bullet"><br></li></ul><h2>Notes</h2><p><br></p><h2>Decisions</h2><p><br></p><h2>Action items</h2><ul><li data-list="unchecked">Owner — task</li><li data-list="unchecked"><br></li></ul>`
  ),
  t(
    'tpl_project',
    'Project plan',
    'pi pi-briefcase',
    'Goal, scope, milestones and risks',
    `<h2>Goal</h2><p><br></p><h2>Scope</h2><p><br></p><h2>Milestones</h2><ul><li data-list="unchecked">Kick-off</li><li data-list="unchecked">First draft</li><li data-list="unchecked">Review</li><li data-list="unchecked">Ship</li></ul><h2>Risks &amp; open questions</h2><p><br></p><h2>Links</h2><p><br></p>`
  ),
  t(
    'tpl_checklist',
    'Checklist',
    'pi pi-check-square',
    'A simple list of things to do',
    `<h2>Checklist</h2><ul><li data-list="unchecked">First item</li><li data-list="unchecked">Second item</li><li data-list="unchecked">Third item</li></ul>`
  ),
  t(
    'tpl_book',
    'Book notes',
    'pi pi-book',
    'Key ideas, quotes and takeaways',
    `<h2>Summary</h2><p><br></p><h2>Key ideas</h2><ul><li data-list="bullet"><br></li></ul><h2>Quotes</h2><blockquote><br></blockquote><h2>What I'll apply</h2><ul><li data-list="unchecked"><br></li></ul>`
  ),
  t(
    'tpl_weekly',
    'Weekly review',
    'pi pi-calendar',
    'Wins, lessons and next week’s plan',
    `<h2>Wins</h2><ul><li data-list="bullet"><br></li></ul><h2>Lessons</h2><ul><li data-list="bullet"><br></li></ul><h2>Next week</h2><ul><li data-list="unchecked"><br></li></ul><h2>Notes</h2><p><br></p>`
  )
];

export async function loadTemplates() {
  const custom = await getSetting('noteTemplates', []);
  return [...BUILTIN_TEMPLATES, ...(Array.isArray(custom) ? custom : [])];
}

export function findTemplate(list, id) {
  return (list || []).find((tpl) => tpl.id === id) || null;
}

/** Save the current note as a reusable template (max 40 custom templates). */
export async function saveCustomTemplate({ name, title, content, tags, color, notebookId }) {
  const custom = (await getSetting('noteTemplates', [])) || [];
  const template = {
    id: `tpl_user_${Date.now().toString(36)}`,
    name: String(name || '').trim() || 'My template',
    icon: 'pi pi-bookmark',
    description: 'Saved from one of your notes',
    title: title || '',
    content: content || '',
    tags: [...(tags || [])],
    color: color || '',
    notebookId: notebookId || ''
  };
  const next = [template, ...custom].slice(0, 40);
  await setSetting('noteTemplates', next);
  return template;
}

export async function deleteCustomTemplate(id) {
  const custom = (await getSetting('noteTemplates', [])) || [];
  await setSetting('noteTemplates', custom.filter((tpl) => tpl.id !== id));
}

/** HTML used by the daily-note shortcut. */
export const DAILY_CONTENT =
  BUILTIN_TEMPLATES.find((tpl) => tpl.id === 'tpl_daily')?.content || '';
