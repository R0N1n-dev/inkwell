/**
 * Headless-browser E2E for the new feature flows:
 * editor templates → backlinks → version snapshots → tasks hub → insights →
 * daily journal → quick switcher → saved searches.
 *
 * Run: npm run test:e2e   (builds the web bundle first)
 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const PORT = 4175;
const URL = `http://localhost:${PORT}/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.error(`  ✗ ${name} ${extra}`);
  }
};

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: process.cwd(),
  stdio: 'ignore',
  detached: true
});

async function setInput(page, selector, value) {
  await page.$eval(
    selector,
    (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    value
  );
}

async function insertAtEnd(page, text) {
  await page.evaluate((t) => {
    const el = document.querySelector('.ql-editor');
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('insertText', false, t);
  }, text);
  await wait(900);
}

async function openOverflow(page) {
  const buttons = await page.$$('.app-topbar .icon-btn');
  await buttons[buttons.length - 1].click();
  await wait(350);
}

async function menuClick(page, text) {
  await page.waitForFunction(
    (t) => [...document.querySelectorAll('.p-menu-item-label')].some((el) => el.textContent.includes(t)),
    { timeout: 4000 },
    text
  );
  await page.evaluate((t) => {
    const label = [...document.querySelectorAll('.p-menu-item-label')].find((el) => el.textContent.includes(t));
    label?.click();
  }, text);
  await wait(600);
}

async function backToList(page) {
  const buttons = await page.$$('.app-topbar .icon-btn');
  await buttons[0].click();
  await wait(900);
}

async function openPalette(page) {
  await page.click('.qs-btn');
  await wait(900);
}

async function closePalette(page) {
  await page.evaluate(() => {
    const backdrop = document.querySelector('.cmdk-backdrop');
    backdrop?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await wait(400);
}

try {
  await wait(2200);
  const browser = await puppeteer.launch({
    headless: 'shell',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900 });
  page.on('error', (e) => console.log('PAGE CRASH:', e.message));
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  await page.goto(URL, { waitUntil: 'networkidle0' });
  await wait(1200);

  console.log('— create note via editor');
  await page.click('.fab');
  await page.waitForSelector('.ql-editor');
  await wait(500);
  await setInput(page, '.editor-title', 'Alpha project');
  await insertAtEnd(page, 'Overview of the alpha project. See [[Groceries]]');
  await wait(1100);
  check('note saved and has an id', /#\/note\/n_/.test(await page.evaluate(() => location.hash)));

  console.log('— template via quick switcher');
  await openPalette(page);
  await setInput(page, '.cmdk-input input', 'Checklist');
  await wait(500);
  const templateVisible = await page.$$eval('.cmdk-item', (els) => els.map((e) => e.textContent));
  check('checklist template listed', templateVisible.some((text) => text.includes('Checklist')));
  await page.evaluate(() => {
    [...document.querySelectorAll('.cmdk-item')].find((el) => el.textContent.includes('Checklist'))?.click();
  });
  await wait(1400);
  const editorHtml = await page.$eval('.ql-editor', (el) => el.innerHTML);
  check('template content loaded', editorHtml.includes('data-list'));
  await setInput(page, '.editor-title', 'Groceries');
  await wait(1200);
  check('template note created', /#\/note\/n_/.test(await page.evaluate(() => location.hash)));

  console.log('— backlinks');
  await backToList(page);
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.note-card')].find((el) => el.textContent.includes('Alpha project'));
    card?.click();
  });
  await wait(1000);
  await openOverflow(page);
  check('links menu shows count', (await page.evaluate(() => document.body.innerText)).includes('Links & backlinks (1)'));
  await menuClick(page, 'Links & backlinks');
  await wait(600);
  const linksText = await page.evaluate(() => document.body.innerText);
  check('outgoing link resolved', linksText.includes('Groceries'));
  await page.evaluate(() => {
    [...document.querySelectorAll('.p-dialog button')].find((b) => b.textContent.includes('Close'))?.click();
  });
  await wait(500);

  console.log('— version history');
  await openOverflow(page);
  await menuClick(page, 'Save version snapshot');
  await wait(900);
  await menuClick(page, 'Version history');
  await wait(800);
  const versionRows = await page.$$('.version-row');
  check('snapshot listed in history', versionRows.length >= 1);
  await page.evaluate(() => {
    [...document.querySelectorAll('.p-dialog button')].find((b) => b.textContent.includes('Close'))?.click();
  });
  await wait(400);

  console.log('— tasks hub');
  await page.evaluate(() => (location.hash = '#/tasks'));
  await wait(1300);
  const taskRows = await page.$$('.task-row');
  check('tasks from template aggregated', taskRows.length >= 3);
  if (taskRows.length) {
    const before = taskRows.length;
    await taskRows[0].click();
    await wait(1200);
    const openRows = await page.$$eval('.task-row', (els) => els.length);
    check('task toggled out of open list', openRows === before - 1, `${openRows} vs ${before}`);
    await page.evaluate(() => {
      [...document.querySelectorAll('.task-tab')].find((b) => b.textContent.includes('Done'))?.click();
    });
    await wait(700);
    const done = await page.$$eval('.task-row.done', (els) => els.length);
    check('completed task visible in Done tab', done >= 1);
  }
  const taskProgress = await page.$('.task-progress-fill');
  check('task progress bar rendered', !!taskProgress);

  console.log('— insights');
  await page.evaluate(() => (location.hash = '#/insights'));
  await wait(1200);
  const heatCells = await page.$$eval('.heat-col .heat-cell', (els) => els.length);
  check('12-week heatmap rendered', heatCells === 84, `got ${heatCells}`);
  const insightsText = (await page.evaluate(() => document.body.innerText)).toLowerCase();
  check('streak + totals rendered', insightsText.includes('day streak') && insightsText.includes('words written'));
  check('daily goal card rendered', insightsText.includes("today's journal") && insightsText.includes('daily goal'));

  console.log('— daily journal');
  await page.evaluate(() => {
    [...document.querySelectorAll('.app-topbar .icon-btn')][0]?.click();
  });
  await wait(700);
  await page.evaluate(() => {
    [...document.querySelectorAll('.sidebar-today')][0]?.click();
  });
  await wait(1300);
  const dailyTitle = await page.$eval('.editor-title', (el) => el.value);
  check('daily note opened with dated title', !!dailyTitle && /\d{4}/.test(dailyTitle), dailyTitle);
  await page.evaluate(() => (location.hash = '#/notebooks'));
  await wait(900);
  check('Journal notebook created', (await page.evaluate(() => document.body.innerText)).includes('Journal'));

  console.log('— quick switcher search');
  await page.evaluate(() => (location.hash = '#/notes'));
  await wait(800);
  await openPalette(page);
  await setInput(page, '.cmdk-input input', 'Alpha');
  await wait(600);
  const results = await page.$$eval('.cmdk-item', (els) => els.map((e) => e.textContent));
  check('quick switcher finds note', results.some((text) => text.includes('Alpha project')));
  await closePalette(page);

  console.log('— saved search');
  await page.evaluate(() => (location.hash = '#/notes?fav=1'));
  await wait(900);
  await page.evaluate(() => {
    window.prompt = () => 'Groceries view';
  });
  const menuButtons = await page.$$('.app-topbar .icon-btn');
  await menuButtons[menuButtons.length - 1].click();
  await wait(400);
  await menuClick(page, 'Save this view');
  await wait(800);
  await page.evaluate(() => {
    [...document.querySelectorAll('.app-topbar .icon-btn')][0]?.click();
  });
  await wait(700);
  const savedRows = await page.$$eval('.saved-row', (els) => els.map((e) => e.textContent));
  check('saved search appears in sidebar', savedRows.some((text) => text.includes('Groceries view')));

  const realErrors = errors.filter((e) => !e.includes('favicon'));
  if (realErrors.length) realErrors.slice(0, 6).forEach((e) => console.error('   ', e));
  check('no runtime console errors', realErrors.length === 0);

  await browser.close();
} finally {
  try {
    process.kill(-server.pid);
  } catch {}
}

console.log(failures ? `\n${failures} E2E FAILURES` : '\nNEW FEATURE E2E PASSED');
process.exit(failures ? 1 : 0);

