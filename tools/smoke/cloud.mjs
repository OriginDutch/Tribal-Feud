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
const ADMIN = 'admin@tribal-feud.test';
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
    const p = await ctx.newPage();
    p.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/the server responded with a status of (400|403|404|409)/.test(m.text())) problems.push(`console error: ${m.text()}`); });
    p.on('dialog', (d) => d.accept());
    await p.goto(URL);
    await p.waitForSelector('button.account-btn', { timeout: 20_000 });
    return p;
  };
  const account = async (p, mode, email, password) => {
    await p.click('button.account-btn');
    if (mode === 'up') await p.click('.account-form .seg button:has-text("Account maken")');
    await p.fill('.account-form input[name=email]', email);
    await p.fill('.account-form input[name=password]', password);
    await p.click(`.account-form button.primary`);
    await p.waitForSelector('.account-form:has-text("Ingelogd als")', { timeout: 20_000 });
    await p.keyboard.press('Escape');
  };
  const cloudState = (p) => p.locator('button.account-btn').getAttribute('class');
  const waitCloud = async (p, state, ms = 20_000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if ((await cloudState(p))?.includes(`cloud-${state}`)) return true; await p.waitForTimeout(200); }
    return false;
  };
  const clock = async (p) => secs(await p.locator('.clock-time').first().textContent());

  // device A: a new world and an account; the save button puts it in the cloud
  const A = await device();
  await A.click('button.primary:has-text("Nieuwe wereld")');
  await A.waitForSelector('nav.rail', { timeout: 60_000 });
  await account(A, 'up', 'speler@test.nl', 'wachtwoord1');
  expect('account made, signed in', (await A.locator('button.account-btn').getAttribute('aria-label')) === 'Account en cloud');
  await A.locator('.speed-seg button').last().click();
  await A.locator('button.play[aria-label="Start"]').click();
  await A.waitForTimeout(2500);
  await A.locator('button.play[aria-label="Pauze"]').click();
  await A.locator('button.save-btn').click();
  expect('the save button uploads (cloud ok)', await waitCloud(A, 'ok'));
  const timeA = await clock(A);

  // device B: same account, the world comes from the cloud
  const B = await device();
  await account(B, 'in', 'speler@test.nl', 'wachtwoord1');
  await B.waitForSelector('.cloud-saves li:has-text("☁")', { timeout: 20_000 });
  await B.locator('.cloud-saves li:has-text("☁") button:has-text("Laden")').first().click();
  await B.waitForSelector('nav.rail', { timeout: 60_000 });
  const timeB = await clock(B);
  expect('the other device loads the cloud world', Math.abs(timeB - timeA) < 600, `A ${timeA}, B ${timeB}`);

  // B plays on and saves; A (behind now) must not overwrite B's progress
  await B.locator('.speed-seg button').last().click();
  await B.locator('button.play[aria-label="Start"]').click();
  await B.waitForTimeout(4000);
  await B.locator('button.play[aria-label="Pauze"]').click();
  expect('B uploads its progress on pause', await waitCloud(B, 'ok'));
  await A.locator('button.save-btn').click();
  expect('A, further behind, gets a conflict and overwrites nothing', await waitCloud(A, 'conflict'));

  // deleting from the cloud (on the start screen of a third, fresh profile signed in)
  const C = await device();
  await account(C, 'in', 'speler@test.nl', 'wachtwoord1');
  await C.waitForSelector('.cloud-saves li:has-text("☁")', { timeout: 20_000 });
  await C.locator('.cloud-saves li:has-text("☁") button:has-text("Verwijder")').first().click();
  await C.waitForSelector('.cloud-saves li.muted', { timeout: 20_000 });
  expect('a cloud world can be deleted', (await C.locator('.cloud-saves li:has-text("☁")').count()) === 0);

  // the admin: confirms the address, sees the accounts with a badge
  const D = await device();
  await D.click('button.primary:has-text("Nieuwe wereld")');
  await D.waitForSelector('nav.rail', { timeout: 60_000 });
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
  await A.click('button.account-btn');
  await A.click('.account-form button:has-text("Uitloggen")');
  await A.waitForSelector('button.account-btn[aria-label="Inloggen"]', { timeout: 10_000 });
  expect('signed out', true);

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
