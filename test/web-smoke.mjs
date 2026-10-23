/**
 * Headless-browser smoke test for the Inkwell web build.
 * Boots the production bundle (vite preview), then exercises:
 *   boot -> create note -> autosave -> back to list -> search -> trash swipe path
 *
 * Run: npm run test:web   (builds first: npm run build && node test/web-smoke.mjs)
 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const PORT = 4173;
const URL = `http://localhost:${PORT}/`;
const errors = [];
let failures = 0;

const check = (name, cond) => {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
};

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: process.cwd(),
  stdio: 'ignore',
  detached: true
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await wait(2500); // let preview bind

  const browser = await puppeteer.launch({
    headless: 'shell',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 860 });

  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  console.log('— boot');
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await wait(1500);

  const bootFailed = await page.evaluate(() =>
    document.getElementById('boot-splash')?.textContent?.includes('Failed to start') ||
    document.body.textContent.includes('Failed to start')
  );
  check('no boot error splash', !bootFailed);

  const shell = await page.$('.app-shell');
  check('app shell rendered', !!shell);

  const topTitle = await page.evaluate(() => document.querySelector('.app-topbar .title')?.textContent || '');
  check(`topbar shows view title (${topTitle.trim().slice(0, 20)}…)`, /All notes/i.test(topTitle));

  const emptyState = await page.$('.empty-state');
  check('empty state visible for fresh db', !!emptyState);

  console.log('— create note');
  await page.click('.fab');
  await wait(800);
  const editor = await page.$('.editor-view');
  check('editor opened', !!editor);

  await page.type('.editor-title', 'Smoke note', { delay: 10 });
  await page.click('.ql-editor');
  await page.type('.ql-editor', 'Hello from the headless smoke test.', { delay: 5 });
  // checklist + bold via toolbar
  await wait(1400); // autosave debounce

  console.log('— back to list');
  await page.click('.app-topbar .icon-btn'); // back button
  await wait(1000);
  const cardText = await page.evaluate(() => document.querySelector('.note-card')?.textContent || '');
  check('note card appears in list', cardText.includes('Smoke note'));
  check('snippet rendered', cardText.includes('headless smoke'));

  console.log('— search');
  const searchBtns = await page.$$('.app-topbar .icon-btn');
  await searchBtns[searchBtns.length - 2].click(); // search icon
  await wait(400);
  await page.type('.search-input', 'smoke', { delay: 10 });
  await wait(500);
  const found = await page.evaluate(() => document.querySelectorAll('.note-card').length);
  check('search finds the note', found === 1);
  await page.type('.search-input', 'zzz', { delay: 10 });
  await wait(500);
  const noneFound = await page.evaluate(() => document.querySelectorAll('.note-card').length);
  check('search filters out', noneFound === 0);

  console.log('— sidebar + theme');
  // leave search mode first (its back button is the first icon-btn while searching)
  let btns = await page.$$('.app-topbar .icon-btn');
  await btns[0].click();
  await wait(500);
  btns = await page.$$('.app-topbar .icon-btn');
  await btns[0].click(); // menu button
  await wait(700);
  const drawer = await page.$('.p-drawer');
  check('sidebar drawer opens', !!drawer);
  const dots = await page.$$('.theme-dot');
  check(`theme dots rendered (${dots.length})`, dots.length === 9);
  if (dots[3]) await dots[3].click();
  await wait(600);
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ink-accent').trim());
  check(`theme switch applied accent (${accent})`, !!accent);

  await page.screenshot({ path: 'test/smoke.png' });

  console.log('— swipe to trash + undo');
  // close drawer (click modal overlay)
  await page.mouse.click(400, 420);
  await wait(600);
  const cardBox = await (await page.$('.note-card'))?.boundingBox();
  if (cardBox) {
    const cy = cardBox.y + cardBox.height / 2;
    await page.mouse.move(cardBox.x + cardBox.width - 30, cy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(cardBox.x + cardBox.width - 30 - i * 14, cy, { steps: 2 });
      await wait(16);
    }
    await page.mouse.up();
    await wait(900);
    const gone = await page.evaluate(() => document.querySelectorAll('.note-card').length === 0);
    check('swipe left trashes the note', gone);
    const hasUndo = await page.evaluate(
      () => !![...document.querySelectorAll('.p-toast button')].find((b) => b.textContent.includes('Undo'))
    );
    check('undo toast shown', hasUndo);
    if (hasUndo) {
      await page.evaluate(() => {
        [...document.querySelectorAll('.p-toast button')].find((b) => b.textContent.includes('Undo'))?.click();
      });
      await wait(900);
      const back = await page.evaluate(() => document.querySelectorAll('.note-card').length === 1);
      check('undo restores the note', back);
    }
  } else {
    check('swipe target found', false);
  }

  console.log('— vault setup + lock/unlock');
  await page.evaluate(() => (location.hash = '#/vault'));
  await wait(1500);
  const pwInputs = await page.$$('.vault-form input');
  check('vault setup form shown', pwInputs.length === 2);
  if (pwInputs.length === 2) {
    await pwInputs[0].type('smoke-pass-123', { delay: 5 });
    await pwInputs[1].type('smoke-pass-123', { delay: 5 });
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Create vault'));
      b?.click();
    });
    await wait(1500);
    const empty = await page.evaluate(() => document.body.innerText.includes('Vault is empty'));
    check('vault created, empty state', empty);

    // lock the note from the editor
    await page.evaluate(() => (location.hash = '#/notes'));
    await wait(800);
    await page.click('.note-card');
    await wait(900);
    const editorBtns = await page.$$('.app-topbar .icon-btn');
    await editorBtns[3].click(); // lock button
    await wait(1200);
    await page.click('.app-topbar .icon-btn'); // back
    await wait(900);
    const lockedCard = await page.evaluate(() => document.querySelector('.note-card')?.textContent || '');
    check('note shows as locked in list', lockedCard.includes('Locked note'));

    await page.evaluate(() => (location.hash = '#/vault'));
    await wait(900);
    const rows = await page.$$('.vault-row');
    check('vault lists the locked note', rows.length === 1);
    if (rows.length) {
      await page.click('.vault-row .icon-btn');
      await wait(1000);
      const unlocked = await page.evaluate(() => document.querySelectorAll('.vault-row').length === 0);
      check('unlock removes it from vault', unlocked);
    }
  }

  await page.screenshot({ path: 'test/smoke-vault.png' });

  console.log('— console errors');
  const realErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('Download the React DevTools'));
  if (realErrors.length) realErrors.slice(0, 8).forEach((e) => console.error('   ', e));
  check('no page/console errors', realErrors.length === 0);

  await browser.close();
}

main()
  .catch((e) => {
    failures++;
    console.error('SMOKE CRASH:', e.message, '\n', (e.stack || '').split('\n').slice(0, 6).join('\n'));
  })
  .finally(() => {
    try {
      process.kill(-server.pid);
    } catch {}
    console.log(failures ? `\n${failures} SMOKE FAILURES` : '\nWEB SMOKE TEST PASSED');
    process.exit(failures ? 1 : 0);
  });
