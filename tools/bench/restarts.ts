/**
 * Casual restarts and spells away on a real save: npm run restarts -- <save.json> <hours>
 * Runs the save forward and reports per 6 hours: restarts (random vs. stuck), bots away, and
 * how the casuals are spread over village counts and points. At the end: restarts per cause
 * (tier, villages just before, last village conquered or not, still growing or stuck).
 */
import { readFileSync } from 'node:fs';
import { HOUR } from '../../src/shared/time';
import { villagePoints } from '../../src/sim/barbarians';
import { fromSaveData } from '../../src/sim/save';
import { advance } from '../../src/sim/simulation';
import { BARBARIAN } from '../../src/sim/state';

const raw = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const slot = Array.isArray(raw) ? raw[0].data : raw;
const s = fromSaveData(slot);
s.speed = 1;
const hours = Number(process.argv[3] ?? 72);
const t0 = s.time;
const pct = (xs: number[], p: number) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))]! : 0; };

function snapshot(label: string) {
  const pts = new Map<number, number>(), vc = new Map<number, number>();
  for (const v of Object.values(s.villages)) {
    if (!v || v.owner === BARBARIAN) continue;
    pts.set(v.owner, (pts.get(v.owner) ?? 0) + villagePoints(s.config, v));
    vc.set(v.owner, (vc.get(v.owner) ?? 0) + 1);
  }
  const bots = s.players.filter((p) => p.bot);
  const byTier = (t: string) => bots.filter((p) => (p.bot!.tier ?? 'pro') === t);
  const cas = byTier('casual');
  const away = cas.filter((p) => (p.bot!.awayUntil ?? 0) > s.time).length;
  const vcs = cas.map((p) => vc.get(p.id) ?? 0);
  const cp = cas.map((p) => pts.get(p.id) ?? 0);
  const restarted = bots.filter((p) => (p.joinedAt ?? 0) > t0).length;
  console.log(`${label.padEnd(8)} casuals ${cas.length} | away ${away} | 1 dorp ${vcs.filter((n) => n === 1).length}, 2-3 ${vcs.filter((n) => n >= 2 && n <= 3).length}, 4+ ${vcs.filter((n) => n >= 4).length} | pts p10 ${Math.round(pct(cp, 0.1))} p50 ${Math.round(pct(cp, 0.5))} p90 ${Math.round(pct(cp, 0.9))} | bots herstart sinds start ${restarted}`);
}

console.log(`save: speed ${s.config.worldSpeed}, ${s.players.filter((p) => p.bot).length} bots, game day ${(s.time / (24 * HOUR) * s.config.worldSpeed).toFixed(1)}`);
const tiers = ['pro', 'mid', 'casual'].map((t) => `${t} ${s.players.filter((p) => p.bot && (p.bot.tier ?? 'pro') === t).length}`).join(', ');
console.log(tiers);
snapshot('start');
const causes: Record<string, number> = {};
const DAY1 = (24 * HOUR) / s.config.worldSpeed;
for (let h = 1; h <= hours; h += 1) {
  const t = performance.now();
  const before = new Map(s.players.filter((p) => p.bot).map((p) => [p.id, { joined: p.joinedAt ?? 0, tier: p.bot!.tier ?? 'pro', vill: Object.values(s.villages).filter((v) => v && v.owner === p.id).length, ids: Object.values(s.villages).filter((v) => v && v.owner === p.id).map((v) => v!.id), stale: p.bot!.peak ? (s.time - p.bot!.peak.at) / DAY1 : -1 }]));
  while (s.time < t0 + h * HOUR) { s.paused = false; advance(s, Math.min(HOUR, t0 + h * HOUR - s.time)); }
  for (const p of s.players) {
    const b = before.get(p.id);
    if (!b || (p.joinedAt ?? 0) === b.joined) continue;
    const lost = b.ids.some((id) => { const o = s.villages[id]?.owner; return o !== undefined && o !== BARBARIAN && o !== p.id; });
    const key = `${b.tier} ${b.vill}d ${lost ? 'VEROVERD' : 'zelf'} ${b.stale < 0 ? 'geen peak' : b.stale > 25 ? 'stil>25d' : 'groeide'}`;
    causes[key] = (causes[key] ?? 0) + 1;
  }
  if (h % 6) continue;
  snapshot(`+${h}u`);
  process.stderr.write(`  (${((performance.now() - t) / 1000).toFixed(0)}s)\n`);
}
console.log(causes);
