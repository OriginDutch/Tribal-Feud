/**
 * Smoke test of the BUILT game in a real browser: npm run smoke (after npm run build).
 * Serves dist/ with `vite preview`, creates a world, lets it run, opens every screen and
 * saves. Fails on any page error, console error or missing screen. The deploy waits for this.
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 4179;
const URL = `http://localhost:${PORT}/`;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', shell: process.platform === 'win32' });
const stop = () => { try { server.kill(); } catch { /* gone */ } };

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL)).ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

const problems = [];
let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });

  await page.goto(URL);
  await page.waitForSelector('text=Nieuwe wereld', { timeout: 20_000 });
  await page.click('button.primary:has-text("Nieuwe wereld")');
  await page.waitForSelector('nav.rail', { timeout: 60_000 });

  // let the world run for a while at full speed (bots, events, autosave)
  await page.locator('.speed-seg button').last().click();
  await page.locator('button.play[aria-label="Start"]').click();
  await page.waitForTimeout(15_000);

  // every screen in the menu opens and shows its title
  const items = await page.locator('nav.rail button[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  for (const label of items) {
    await page.locator(`nav.rail button[aria-label="${label}"]`).click();
    await page.waitForTimeout(400);
    const h2 = await page.locator('main h2, .screen h2').first().textContent().catch(() => null);
    if (!h2) problems.push(`screen "${label}" shows no title`);
  }

  // manual save shows up in the list
  await page.locator('nav.rail button[aria-label^="Log"]').click();
  await page.click('button:has-text("Opslaan")');
  await page.waitForSelector('ul.saves li:has-text("handmatig")', { timeout: 10_000 });

  // the game still runs: the clock moves
  const before = await page.locator('.clock-time').first().textContent().catch(() => '');
  await page.waitForTimeout(2_000);
  const after = await page.locator('.clock-time').first().textContent().catch(() => '');
  if (before && before === after) problems.push('the clock does not move');

  console.log(`smoke: ${items.length} screens opened`);
} catch (e) {
  problems.push(`smoke failed: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await browser?.close();
  stop();
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('smoke: ok');
process.exit(0);
