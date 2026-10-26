// Bake driver: renders every village sprite in headless Chromium and writes PNGs + a raw manifest.
//   node tools/art/bake.cjs [day|dusk] [workers]
// Needs the static server for tools/art on :8766 (python3 -m http.server 8766 in tools/art).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const mode = process.argv[2] || 'day';
const workers = Number(process.argv[3] || 4);
const only = process.argv[4] ? new RegExp(process.argv[4]) : null;
const OUT = `/tmp/bake/${mode}`;
fs.mkdirSync(OUT, { recursive: true });
const URL = `http://localhost:8766/index.html?mode=${mode}`;
const ARGS = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };

(async () => {
  const browser = await chromium.launch(ARGS);
  const open = async () => { const p = await browser.newPage(); p.on('pageerror', (e) => console.error('pageerror', e.message)); await p.goto(URL); await p.waitForFunction(() => window.__ready, null, { timeout: 60000 }); return p; };
  const first = await open();
  const L = await first.evaluate(() => window.layout);
  const frame = await first.evaluate(() => ({ ...window.FRAME, ppu: window.PPU }));
  const cells = await first.evaluate(() => window.forestCells());
  const jobs = [{ type: 'ground' }];
  for (const id of L.SLOTS) { const n = L.STAGE_LEVELS[id].length; for (let s = 0; s <= n; s++) jobs.push({ type: 'building', id, stage: s }); }
  for (let i = 0; i < L.HOMES; i++) jobs.push({ type: 'home', i });
  jobs.push({ type: 'well' });
  for (const kind of L.KINDS) { for (let i = 0; i < L.WALL_N; i++) jobs.push({ type: 'wall', kind, i }); jobs.push({ type: 'gate', kind }); }
  for (const c of cells) jobs.push({ type: 'trees', ...c });
  const todo = only ? jobs.filter((j) => only.test(JSON.stringify(j))) : jobs;
  console.log(`${mode}: ${todo.length} jobs, frame ${frame.w}x${frame.h}`);
  const sprites = {};
  let done = 0;
  const pages = [first]; for (let i = 1; i < workers; i++) pages.push(await open());
  const queue = todo.slice();
  await Promise.all(pages.map(async (p) => {
    let n = 0;
    while (queue.length) {
      const job = queue.shift();
      if (++n % 25 === 0) { await p.goto(URL); await p.waitForFunction(() => window.__ready); } // keep GPU memory in check
      const res = await p.evaluate((j) => window.bake(j), job);
      for (const s of res) {
        const file = `${s.key.replace(/[@:]/g, '_')}.png`;
        fs.writeFileSync(path.join(OUT, file), Buffer.from(s.data.split(',')[1], 'base64'));
        delete s.data; s.file = file; sprites[s.key] = s;
      }
      done++; if (done % 20 === 0) console.log(`${mode}: ${done}/${todo.length}`);
    }
  }));
  const mf = path.join(OUT, 'raw.json');
  const prev = only && fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')).sprites : {};
  fs.writeFileSync(mf, JSON.stringify({ frame, layout: L, sprites: { ...prev, ...sprites } }));
  console.log(`${mode}: done`);
  await browser.close();
})();
