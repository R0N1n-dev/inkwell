/**
 * Feature tests for note intelligence + editor round-trips (DOM based).
 * Run: npm run test:features
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;
globalThis.Text = dom.window.Text;
globalThis.Element = dom.window.Element;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.getSelection = () => dom.window.getSelection();
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
    writable: true
  });
} catch {
  /* Node 24+ exposes a read-only navigator; Quill can use it as-is */
}

const { extractWikiLinks, extractHeadings, readingTime, dateKey, prettyDay, isEmptyHtml } =
  await import('../src/utils/links.js');
const { extractTasks, toggleTaskInHtml, taskStats } = await import('../src/utils/tasks.js');
const { BUILTIN_TEMPLATES } = await import('../src/utils/templates.js');

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name}`);
  }
}

console.log('— wiki links');
const links = extractWikiLinks('See [[Alpha]], [[Beta#part|the beta]] and [[Alpha|again]].');
check('extracts unique targets', links.length === 2 && links[0] === 'Alpha' && links[1] === 'Beta');
check('ignores plain text', extractWikiLinks('nothing linked').length === 0);

console.log('— outline & reading time');
const headings = extractHeadings('<h1>One</h1><p>x</p><h2>Two</h2><h3>Three</h3>');
check('finds heading levels', headings.length === 3 && headings[1].level === 2);
check('heading text is clean', headings[2].text === 'Three');
check('reading time at 200 wpm', readingTime(400) === 2 && readingTime(1) === 1);
check('empty quill html detected', isEmptyHtml('<p><br></p>') && !isEmptyHtml('<p>x</p>'));

console.log('— journal day keys');
const sample = new Date(2026, 9, 23, 9, 30);
check('local date key', dateKey(sample) === '2026-10-23');
check('pretty day label', prettyDay(sample).includes('October 23, 2026'));

console.log('— tasks');
const taskHtml = `<ul>
  <li data-list="unchecked">Buy milk</li>
  <li data-list="checked">Ship release</li>
  <li data-list="bullet">Not a task</li>
  <li data-list="unchecked">Write docs</li>
</ul>`;
let tasks = extractTasks(taskHtml);
check('finds checklist items only', tasks.length === 3);
check('reads checked state', tasks[1].checked === true && tasks[0].checked === false);
check('stats', taskStats(taskHtml).done === 1 && taskStats(taskHtml).open === 2);

const toggled = toggleTaskInHtml(taskHtml, 0);
tasks = extractTasks(toggled);
check('toggle marks a task done', tasks[0].checked === true);
const toggledBack = toggleTaskInHtml(toggled, 1);
check('toggle also unchecks', extractTasks(toggledBack)[1].checked === false);

const checkboxHtml = '<ul><li><input type="checkbox" checked> Imported task</li><li><input type="checkbox"> Plain task</li></ul>';
check('handles pasted checkbox inputs', extractTasks(checkboxHtml)[0].checked === true);
check('toggles pasted checkbox inputs', !extractTasks(toggleTaskInHtml(checkboxHtml, 0))[0].checked);

console.log('— built-in templates');
check('every template parses', BUILTIN_TEMPLATES.every((tpl) => typeof tpl.content === 'string'));
const daily = BUILTIN_TEMPLATES.find((tpl) => tpl.id === 'tpl_daily');
check('daily template has a checklist', extractTasks(daily.content).length >= 1);
check('meeting template has checkboxes', extractTasks(BUILTIN_TEMPLATES.find((tpl) => tpl.id === 'tpl_meeting').content).length >= 1);

console.log('— Quill round-trip (editor persistence)');
const { default: Quill } = await import('quill');
const host = document.createElement('div');
document.body.appendChild(host);
const quill = new Quill(host, { theme: 'snow' });
const editorHtml = '<h2>Checklist</h2><ul><li data-list="unchecked">First</li><li data-list="checked">Second</li></ul>';
quill.setContents(quill.clipboard.convert({ html: editorHtml }));
const saved = quill.getSemanticHTML();
const roundTrip = extractTasks(saved);
check('checklist survives editor load', roundTrip.length === 2);
check('checked state survives editor load', roundTrip[0].checked === false && roundTrip[1].checked === true);

quill.setContents(quill.clipboard.convert({ html: toggleTaskInHtml(saved, 0) }));
check('task-hub toggle reloads in editor', extractTasks(quill.getSemanticHTML())[0].checked === true);

console.log('— heading outline from editor');
quill.setContents(quill.clipboard.convert({ html: '<h1>A</h1><p>x</p><h2>B</h2>' }));
check('editor headings feed outline', extractHeadings(quill.getSemanticHTML()).length === 2);

console.log(failures ? `\n${failures} FEATURE TEST FAILURES` : '\nALL FEATURE TESTS PASSED');
process.exit(failures ? 1 : 0);
