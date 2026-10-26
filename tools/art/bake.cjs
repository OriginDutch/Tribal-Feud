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
  const browsers = [];
  const open = async () => { const br = await chromium.launch(ARGS); browsers.push(br); const p = await br.newPage(); p.on('pageerror', (e) => console.error('pageerror', e.message)); await p.goto(URL); await p.waitForFunction(() => window.__ready, null, { timeout: 60000 }); return p; };
  const first = await open();
  const L = await first.evaluate(() => window.layout);
  const frame = await first.evaluate(() => ({ ...window.FRAME, ppu: window.PPU, proj: window.proj }));
  const cells = await first.evaluate(() => window.forestCells());
  const jobs = [{ type: 'ground' }];
  for (const id of L.SLOTS) { const n = L.STAGE_LEVELS[id].length; for (let s = id === 'firstchurch' ? 1 : 0; s <= n; s++) jobs.push({ type: 'building', id, stage: s }); }
  for (let i = 0; i < L.HOMES; i++) jobs.push({ type: 'home', i });
  for (let i = 0; i < L.OUTER; i++) jobs.push({ type: 'outer', i });
  jobs.push({ type: 'well' }, { type: 'slothome' });
  for (const kind of L.KINDS) { for (let i = 0; i < L.WALL_N; i++) jobs.push({ type: 'wall', kind, i }); jobs.push({ type: 'gate', kind }); }
  for (const c of cells) jobs.push({ type: 'trees', ...c });
  for (const id of L.SLOTS) { const n = L.STAGE_LEVELS[id].length; for (let s = 1; s <= n; s++) jobs.push({ type: 'building', id, stage: s, anim: true }); }
  for (const kind of L.KINDS) jobs.push({ type: 'gate', kind, anim: true });
  jobs.push({ type: 'walker', name: 'v0', kind: 'villager', seed: 11, carry: 'basket', color: 0x7a4a2a }, { type: 'walker', name: 'v1', kind: 'villager', seed: 23, color: 0x4a5a7a }, { type: 'walker', name: 'v2', kind: 'villager', seed: 37, carry: 'sack', color: 0x8a3a2a }, { type: 'walker', name: 'soldier', kind: 'soldier', seed: 5 }, { type: 'walker', name: 'barrow', kind: 'barrow', seed: 41 });
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
      if (++n % 12 === 0 || job.anim || job.type === 'walker') { await p.goto(URL); await p.waitForFunction(() => window.__ready); } // keep GPU memory in check
      let res;
      for (let attempt = 0; ; attempt++) {
        try { res = await p.evaluate((j) => window.bake(j), job); break; } catch (e) {
          if (attempt >= 3) { console.error('GAVE UP', JSON.stringify(job)); res = []; break; }
          console.error(`retry ${JSON.stringify(job).slice(0, 80)}: ${String(e).slice(0, 80)}`);
          await p.goto(URL); await p.waitForFunction(() => window.__ready);
        }
      }
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
  if (only) for (const k of Object.keys(prev)) if (k.includes('~') && todo.some((j) => j.anim && k.startsWith(j.type === 'gate' ? `gate-${j.kind}~` : `${j.id}@${j.stage}~`))) delete prev[k];
  fs.writeFileSync(mf, JSON.stringify({ frame, layout: L, sprites: { ...prev, ...sprites } }));
  console.log(`${mode}: done`);
  for (const br of browsers) await br.close();
})();
