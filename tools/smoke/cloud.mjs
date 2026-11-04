/**
 * Accounts and cloud saves in a real browser, against the Firebase emulators:
 *   npm run smoke:cloud   (builds dist-emu, starts the emulators, runs this)
 * Two "devices" (browser profiles) and an admin. Checks: making an account, uploading, loading on
 * the other device, a conflict that is not overwritten, deleting, the admin list, signing out.
 * With RULES=1 (the real Firestore emulator) also the security rules: nobody reads or writes
 * another account's data, no fourth world, no oversized pieces, the list is admin-only.
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 4181;
const URL = `http://localhost:${PORT}/`;
const PROJECT = 'demo-tribal-feud';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const ADMIN = 'marcel_19-95@hotmail.com';
const RULES = process.env.RULES === '1';

const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-emu', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' });
const stop = () => { try { server.kill(); } catch { /* gone */ } };
const problems = [];
const expect = (what, pass, detail = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${what}${detail ? ` — ${detail}` : ''}`); if (!pass) problems.push(what); };
const secs = (t) => { const m = /Dag (\d+) · (\d+):(\d+):(\d+)/.exec(t ?? ''); return m ? +m[1] * 86400 + +m[2] * 3600 + +m[3] * 60 + +m[4] : NaN; };

async function signUpRest(email, password) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  return r.json();
}
async function fsCall(token, method, path, body) {
  return fetch(`${FS}${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
}

let browser;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
  browser = await chromium.launch();
  const device = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('tf-lang', 'nl'); } catch {} });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/the server responded with a status of (400|403|404|409)/.test(m.text())) problems.push(`console error: ${m.text()}`); });
    p.on('dialog', (d) => d.accept());
    await p.goto(URL);
    await p.waitForSelector('.home', { timeout: 20_000 });
    return p;
  };
  const newWorld = async (p, name) => {
    await p.click('.home-new-top');
    if (name) await p.fill('.home-panel-modal input >> nth=0', name);
    await p.click('.home-panel-modal button.primary:has-text("Nieuwe wereld")');
    await p.waitForSelector('nav.rail', { timeout: 60_000 });
  };
  const toStart = async (p) => {
    await p.click('button.crest');
    await p.waitForSelector('.home', { timeout: 20_000 });
  };
  const row = (p, name) => p.locator(`.world-row:has(.world-open strong:text-is("${name}"))`);
  const menu = async (p, name, item) => {
    await row(p, name).locator('.world-more').click();
    await p.click(`.row-menu button:has-text("${item}")`);
  };
  const account = async (p, mode, email, password) => {
    if (await p.locator('.home-auth').count()) await p.click(mode === 'up' ? '.home-auth button.primary' : '.home-auth button.ghost');
    else {
      await p.click('button.account-btn');
      if (mode === 'up') await p.click('.account-form .seg button:has-text("Account maken")');
    }
    await p.fill('.account-form input[name=email]', email);
    await p.fill('.account-form input[name=password]', password);
    await p.click(`.account-form button.primary`);
    await p.waitForSelector('.account-form:has-text("Ingelogd als")', { timeout: 20_000 });
    await p.keyboard.press('Escape');
  };
  const cloudBtn = (p) => p.locator('button.account-btn, button.home-account').first();
  const cloudState = (p) => cloudBtn(p).getAttribute('class');
  const cloudAt = (p) => cloudBtn(p).getAttribute('data-cloud-at');
  /** Waits for this state; with `after` set, also for an upload newer than that one. */
  const waitCloud = async (p, state, after = null, ms = 20_000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if ((await cloudState(p))?.includes(`cloud-${state}`) && (after === null || (await cloudAt(p)) !== after)) return true;
      await p.waitForTimeout(200);
    }
    return false;
  };
  const clock = async (p) => secs(await p.locator('.clock-time').first().textContent());

  // device A: a new world and an account; the save button puts it in the cloud
  const A = await device();
  await newWorld(A, 'Gedeeld');
  await account(A, 'up', 'speler@test.nl', 'wachtwoord1');
  expect('account made, signed in', (await A.locator('button.account-btn').getAttribute('aria-label')) === 'Account en cloud');
  await A.locator('.speed-seg button').last().click();
  await A.locator('button.play[aria-label="Start"]').click();
  await A.waitForTimeout(2500);
  await A.locator('button.play[aria-label="Pauze"]').click();
  const a0 = await cloudAt(A);
  await A.locator('button.save-btn').click();
  expect('the save button uploads (cloud ok)', await waitCloud(A, 'ok', a0));
  const timeA = await clock(A);

  // device B: same account, the world comes from the cloud
  const B = await device();
  await account(B, 'in', 'speler@test.nl', 'wachtwoord1');
  await row(B, 'Gedeeld').locator('.world-play:has-text("Downloaden")').click({ timeout: 20_000 });
  await B.waitForSelector('nav.rail', { timeout: 60_000 });
  const timeB = await clock(B);
  expect('the other device loads the cloud world', Math.abs(timeB - timeA) < 600, `A ${timeA}, B ${timeB}`);

  // B plays on and saves; A (behind now) must not overwrite B's progress
  await B.locator('.speed-seg button').last().click();
  await B.locator('button.play[aria-label="Start"]').click();
  await B.waitForTimeout(4000);
  const b0 = await cloudAt(B);
  await B.locator('button.play[aria-label="Pauze"]').click();
  expect('B uploads its progress on pause', await waitCloud(B, 'ok', b0));
  await A.locator('button.save-btn').click();
  expect('A, further behind, gets a conflict and overwrites nothing', await waitCloud(A, 'conflict'));
  await toStart(A);
  expect('the start screen says the cloud is further along', (await row(A, 'Gedeeld').locator('.ws-warn').count()) === 1);
  const a1 = await cloudAt(A);
  await menu(A, 'Gedeeld', 'Cloud overschrijven');
  expect('…until A chooses to overwrite the cloud', await waitCloud(A, 'ok', a1));

  // deleting from the cloud (on the start screen of a third, fresh profile signed in)
  const C = await device();
  await account(C, 'in', 'speler@test.nl', 'wachtwoord1');
  await row(C, 'Gedeeld').waitFor({ timeout: 20_000 });
  await menu(C, 'Gedeeld', 'Uit de cloud halen');
  expect('a world only in the cloud warns before it goes', (await C.locator('.home-dialog.danger:has-text("voorgoed weg")').count()) === 1);
  await C.click('.home-dialog button:has-text("Voorgoed verwijderen")');
  await C.waitForSelector('.home-worlds .hint:has-text("Nog geen werelden")', { timeout: 20_000 });
  expect('a cloud world can be deleted', (await row(C, 'Gedeeld').count()) === 0);

  // a full cloud: the fourth world stays local until the player picks one to replace; switched off stays off
  const E = await device();
  await account(E, 'up', 'vol@test.nl', 'wachtwoord1');
  for (const n of ['Een', 'Twee', 'Drie', 'Vier']) { await newWorld(E, n); await toStart(E); }
  await E.waitForTimeout(1500);
  expect('three worlds go to the cloud by themselves', (await E.locator('.world-row .ws-ok').count()) === 3, String(await E.locator('.world-row .ws-ok').count()));
  expect('the fourth stays on this device', (await row(E, 'Vier').locator('.ws-local').count()) === 1);
  await row(E, 'Vier').locator('.cloud-switch').click();
  await E.waitForSelector('.home-dialog:has-text("De cloud is vol")');
  await E.click('.home-dialog li:has-text("Een") button:has-text("Vervangen")');
  await row(E, 'Vier').locator('.ws-ok').waitFor({ timeout: 20_000 });
  expect('replacing: the chosen one leaves the cloud, stays here', (await row(E, 'Een').locator('.ws-local').count()) === 1);
  await row(E, 'Een').locator('.world-play').click();
  await E.waitForSelector('nav.rail', { timeout: 60_000 });
  await toStart(E);
  await E.waitForTimeout(1500);
  expect('a world switched off does not sneak back into the cloud', (await row(E, 'Een').locator('.ws-local').count()) === 1);

  // the admin: confirms the address, sees the accounts with a badge
  const D = await device();
  await newWorld(D);
  await account(D, 'up', ADMIN, 'wachtwoord1');
  const codes = await (await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`)).json();
  const link = codes.oobCodes.filter((c) => c.email === ADMIN && c.requestType === 'VERIFY_EMAIL').pop()?.oobLink;
  if (link) await fetch(link);
  await D.click('button.account-btn');
  await D.click('button:has-text("Ik heb bevestigd")');
  await D.waitForSelector('.account-form .tag:has-text("admin")', { timeout: 20_000 });
  await D.keyboard.press('Escape');
  await D.goto(`${URL}#admin`);
  await D.waitForSelector('table tr:has-text("speler@test.nl")', { timeout: 20_000 });
  expect('the admin sees the accounts, new ones marked', (await D.locator('table .tag:has-text("nieuw")').count()) >= 1);
  const tabs = await D.locator('.screen-tabs a').allTextContents();
  expect('the admin tab is there for the admin', tabs.some((t) => t.startsWith('Admin')));
  await B.goto(`${URL}#settings`);
  await B.waitForSelector('.screen-tabs', { timeout: 20_000 });
  expect('…and not for anyone else', !(await B.locator('.screen-tabs a').allTextContents()).some((t) => t.startsWith('Admin')));

  // signing out leaves the local saves alone
  await cloudBtn(A).click();
  await A.click('.account-form button:has-text("Uitloggen")');
  await A.waitForSelector('.home-auth', { timeout: 10_000 });
  expect('signed out, the worlds on this device are still there', (await row(A, 'Gedeeld').count()) === 1);

  if (RULES) {
    const one = await signUpRest('een@test.nl', 'wachtwoord1');
    const two = await signUpRest('twee@test.nl', 'wachtwoord1');
    const world = { fields: { key: { stringValue: 'k' }, name: { stringValue: 'W' }, savedAt: { integerValue: '1' }, gameTime: { integerValue: '1' }, version: { integerValue: '19' }, size: { integerValue: '3' }, chunks: { integerValue: '1' } } };
    const ownWrite = await fsCall(one.idToken, 'PATCH', `/users/${one.localId}/worlds/1`, world);
    expect('rules: own world may be written', ownWrite.ok, String(ownWrite.status));
    expect('rules: another account\'s world can\'t be read', (await fsCall(two.idToken, 'GET', `/users/${one.localId}/worlds/1`)).status === 403);
    expect('rules: …nor written', (await fsCall(two.idToken, 'PATCH', `/users/${one.localId}/worlds/1`, world)).status === 403);
    expect('rules: no fourth world', (await fsCall(one.idToken, 'PATCH', `/users/${one.localId}/worlds/4`, world)).status === 403);
    expect('rules: no extra fields', (await fsCall(one.idToken, 'PATCH', `/users/${one.localId}/worlds/2`, { fields: { ...world.fields, evil: { stringValue: 'x' } } })).status === 403);
    const big = Buffer.alloc(700_001).toString('base64');
    expect('rules: no pieces over 700 KB', (await fsCall(one.idToken, 'PATCH', `/users/${one.localId}/worlds/1/chunks/0`, { fields: { data: { bytesValue: big } } })).status === 403);
    expect('rules: the account list is for the admin only', (await fsCall(one.idToken, 'GET', `/users`)).status === 403);
    expect('rules: nobody signed out gets in', (await fetch(`${FS}/users/${one.localId}/worlds/1`)).status === 403);
    expect('rules: no made-up created date', (await fsCall(two.idToken, 'PATCH', `/users/${two.localId}`, { fields: { email: { stringValue: 'twee@test.nl' }, created: { timestampValue: '2020-01-01T00:00:00Z' }, lastSeen: { timestampValue: '2020-01-01T00:00:00Z' } } })).status === 403);
  }
} catch (e) {
  problems.push(`smoke:cloud failed: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  await browser?.close();
  stop();
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('smoke:cloud: ok');
