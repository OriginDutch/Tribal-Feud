/**
 * World shape: npm run curve -- <bots> <barbarians> <days> [difficulty]
 * Marcel's settings (speed 20, production/population/recruiting x2) unless EXTRA overrides them.
 * Per game day: the points curve over all bots (percentiles), per tier, barbarians left, bots that
 * quit, and how long the day took to compute.
 */
import { createConfig } from '../../src/shared/config';
import { DAY, HOUR } from '../../src/shared/time';
import { villagePoints } from '../../src/sim/barbarians';
import { advance } from '../../src/sim/simulation';
import { BARBARIAN, createWorld } from '../../src/sim/state';

const bots = Number(process.argv[2] ?? 500), barbs = Number(process.argv[3] ?? 5000), days = Number(process.argv[4] ?? 8);
const difficulty = process.argv[5] ?? 'easy';
const extra = process.env.EXTRA ? JSON.parse(process.env.EXTRA) : {};
const s = createWorld(createConfig('classic', 'Curve', Number(process.env.SEED ?? 11), {
  worldSpeed: 20, productionMultiplier: 2, farmMultiplier: 2, recruitSpeed: 2,
  ...extra,
  bots: { count: bots, difficulty, ...(extra.bots ?? {}) }, map: { barbarianCount: barbs, ...(extra.map ?? {}) },
} as never));
const pct = (xs: number[], p: number) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))]! : 0; };
let restarts = 0;
const origLog = s.log;
void origLog;
const k = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
for (let d = 1; d <= days; d++) {
  const t0 = performance.now();
  while (s.time < d * DAY) { s.paused = false; advance(s, Math.min(HOUR, d * DAY - s.time)); }
  const sec = (performance.now() - t0) / 1000;
  restarts = s.players.filter((p) => p.bot && (p.joinedAt ?? 0) > 0).length;
  const pts = new Map<number, number>();
  let barbLeft = 0;
  for (const v of Object.values(s.villages)) {
    if (!v) continue;
    if (v.owner === BARBARIAN) { barbLeft++; continue; }
    pts.set(v.owner, (pts.get(v.owner) ?? 0) + villagePoints(s.config, v));
  }
  const active = s.players.filter((p) => p.bot && !p.bot.quit);
  const all = active.map((p) => pts.get(p.id) ?? 0);
  const tier = (t: string) => pct(active.filter((p) => p.bot!.tier === t).map((p) => pts.get(p.id) ?? 0), 0.5);
  console.log(`dag ${d}: punten p10/p50/p90/p99/max ${[0.1, 0.5, 0.9, 0.99].map((p) => k(pct(all, p))).join('/')}/${k(Math.max(0, ...all))} · mediaan pro ${k(tier('pro'))} mid ${k(tier('mid'))} casual ${k(tier('casual'))} · jij ${k(pts.get(0) ?? 0)} · barbaren ${barbLeft} (${Math.round((100 * barbLeft) / barbs)}%) · casuals nu weg ${s.players.filter((p) => p.bot?.awayUntil !== undefined && p.bot.awayUntil > s.time).length} · ooit herstart ${restarts} (${['pro', 'mid', 'casual'].map((t) => s.players.filter((p) => p.bot?.tier === t && (p.joinedAt ?? 0) > 0).length).join('/')} pro/mid/casual) · ${sec.toFixed(0)} s rekenen`);
}
