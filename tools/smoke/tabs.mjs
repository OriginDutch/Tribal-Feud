/**
 * Several tabs on one world (SharedWorker), on the BUILT game: npm run smoke:tabs (after npm run build).
 * Two tabs with their own village and screen, quick switching, a link opened in a new tab, the
 * save button, closing a tab, reloading, and the lock: a second simulation never runs.
 * Fails on any page error, console error or broken expectation. The deploy waits for this.
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 4180;
const URL = `http://localhost:${PORT}/`;
// its own process group, so stopping it also stops vite under npx (else old servers pile up on the port)
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32', detached: process.platform !== 'win32' });
const stop = () => { try { if (process.platform === 'win32') server.kill(); else process.kill(-server.pid); } catch { /* gone */ } };
const problems = [];
const expect = (what, pass, detail = '') => { if (!pass) problems.push(`${what}${detail ? ` (${detail})` : ''}`); };
const secs = (t) => { const m = /Dag (\d+) · (\d+):(\d+):(\d+)/.exec(t ?? ''); return m ? +m[1] * 86400 + +m[2] * 3600 + +m[3] * 60 + +m[4] : NaN; };

let browser;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  const open = async (url = URL) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
    await p.goto(url);
    return p;
  };
  const clock = async (p) => secs(await p.locator('.clock-time').first().textContent());
  const name = (p) => p.locator('.vname b').first().textContent();

  // a world with two villages, so the tabs can differ
  const A = await open();
  await A.click('.home-new-top');
  await A.click('.home-panel-modal button.primary:has-text("Nieuwe wereld")');
  await A.waitForSelector('nav.rail', { timeout: 60_000 });
  await A.keyboard.press('Digit4');

  // a menu link opened in a new tab lands in the same world, on that screen
  await A.waitForFunction(() => location.hash === '#farm');
  // ctrl-click a menu link; once more if the first click went nowhere (a slow first paint)
  const openMap = () => Promise.all([ctx.waitForEvent('page', { timeout: 8_000 }), A.locator('nav.rail a[aria-label="Kaart"]').click({ modifiers: ['ControlOrMeta'] })]);
  // headless Chromium sometimes opens the new tab but never navigates it (it stays at about:blank,
  // ~1 run in 10): a harness quirk, not the game. Then close it and click again (at most 3 times).
  // Or the click opens nothing at all. Either way: click again, up to 4 times.
  let B;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const [page] = await openMap().catch(() => [null]);
    if (!page) continue;
    B = page;
    if (await B.waitForURL(/#map$/, { timeout: 8_000 }).then(() => true).catch(() => false)) break;
    if (attempt < 4) await B.close();
  }
  if (!B) throw new Error('a ctrl-click on a menu link opened no tab (4 tries)');
  B.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  await B.bringToFront();
  await B.waitForSelector('nav.rail', { timeout: 20_000 });
  expect('a link opened in a new tab shows the world on that screen', B.url().endsWith('#map') && A.url().endsWith('#farm'), `${A.url()} / ${B.url()}`);
  expect('each tab is titled after its screen', (await A.title()) === 'Farm-assistent · Tribal Feud' && (await B.title()) === 'Kaart · Tribal Feud', `${await A.title()} / ${await B.title()}`);
  expect('the favicon is there', (await fetch(`${URL}favicon.svg`)).ok && (await fetch(`${URL}favicon-32.png`)).ok);
  expect('both tabs show the same village to start', (await name(A)) === (await name(B)));

  // music: a theme first, and only the tab you look at plays
  const music = async (p) => ({ track: await p.locator('.music-btn').first().getAttribute('data-track'), playing: await p.locator('.music-btn').first().getAttribute('data-playing') });
  await A.bringToFront();
  await A.mouse.click(5, 300);
  await A.waitForTimeout(1500);
  const mA = await music(A);
  expect('the music opens with a theme', /^menu-[12]$/.test(mA.track ?? ''), JSON.stringify(mA));
  expect('the music plays in the tab you look at', mA.playing === 'yes', JSON.stringify(mA));
  expect('the music files are there', (await fetch(`${URL}music/menu-1.webm`)).ok && (await fetch(`${URL}music/morning-2.m4a`)).ok);
  await B.bringToFront();
  await B.mouse.click(5, 300);
  await B.waitForTimeout(1500);
  const [a2, b2] = [await music(A), await music(B)];
  expect('switching tabs: the new tab carries on with the same track, the other goes quiet', b2.playing === 'yes' && a2.playing === 'no' && b2.track === mA.track, `${JSON.stringify(a2)} ${JSON.stringify(b2)}`);
  await B.locator('.music-btn').first().click();
  await B.waitForTimeout(1500);
  expect('the speaker button mutes', (await music(B)).playing === 'no');
  await B.locator('.music-btn').first().click();

  // one clock: run in A, B follows; quick switching
  await A.bringToFront();
  await A.locator('.speed-seg button').last().click();
  await A.locator('button.play[aria-label="Start"]').click();
  const t0 = await clock(A);
  for (let i = 0; i < 20; i++) { await (i % 2 ? A : B).bringToFront(); await A.waitForTimeout(80); }
  await A.bringToFront();
  await A.waitForTimeout(1200);
  expect('the clock runs while switching tabs', (await clock(A)) > t0);
  expect('both tabs show the same time', Math.abs((await clock(A)) - (await clock(B))) < 120);

  // pause in B stops A
  await B.bringToFront();
  await B.keyboard.press('Space');
  await B.waitForTimeout(600);
  const p0 = await clock(A);
  await A.waitForTimeout(1200);
  expect('pause in one tab pauses the world', (await clock(A)) === p0);

  // the save button saves the world in its own manual slot
  await A.bringToFront();
  await A.locator('button.save-btn').click();
  await A.waitForSelector('.notice:has-text("Wereld opgeslagen")', { timeout: 10_000 }).catch(() => expect('save button confirms', false));

  // reload keeps the screen; closing a tab leaves the other playing
  await B.reload();
  await B.waitForSelector('nav.rail', { timeout: 20_000 });
  expect('reload keeps the screen', B.url().endsWith('#map'));
  await B.keyboard.press('Space');
  await B.close();
  const c0 = await clock(A);
  await A.waitForTimeout(1500);
  expect('the other tab plays on after one closes', (await clock(A)) > c0);

  // without SharedWorker a second tab must not start a second world
  const solo = await browser.newContext();
  await solo.addInitScript(() => { delete window.SharedWorker; });
  const S1 = await solo.newPage();
  await S1.goto(URL);
  await S1.click('.home-new-top');
  await S1.click('.home-panel-modal button.primary:has-text("Nieuwe wereld")');
  await S1.waitForSelector('nav.rail', { timeout: 60_000 });
  const S2 = await solo.newPage();
  await S2.goto(URL);
  const refused = await S2.waitForSelector('text=draait al in een ander tabblad', { timeout: 15_000 }).then(() => true).catch(() => false);
  expect('a second simulation refuses to run', refused);
  console.log('smoke:tabs done');
} catch (e) {
  problems.push(`smoke:tabs failed: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await browser?.close();
  stop();
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('smoke:tabs: ok');
