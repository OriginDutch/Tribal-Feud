/**
 * Bot armies: npm run armies -- <bots> <days> [difficulty]
 * Marcel's settings (speed 20, production/population/recruiting x2). Per game day: how big the
 * offensive armies in bot villages are (share of the farm, "nukes"), and how big the attacks on
 * players are that are not scouts, noblemen or farming.
 */
import { createConfig } from '../../src/shared/config';
import { DAY, HOUR } from '../../src/shared/time';
import { setAttackHook, type Movement } from '../../src/sim/movement';
import { advance } from '../../src/sim/simulation';
import { BARBARIAN, createWorld, type WorldState } from '../../src/sim/state';
import { popMax, type Village } from '../../src/sim/village';

const bots = Number(process.argv[2] ?? 200), days = Number(process.argv[3] ?? 10), difficulty = process.argv[4] ?? 'normal';
const extra = process.env.EXTRA ? JSON.parse(process.env.EXTRA) : {};
const s = createWorld(createConfig('classic', 'Armies', Number(process.env.SEED ?? 11), {
  worldSpeed: 20, productionMultiplier: 2, farmMultiplier: 2, recruitSpeed: 2, ...extra,
  bots: { count: bots, difficulty, ...(extra.bots ?? {}) }, map: { barbarianCount: bots * 15, ...(extra.map ?? {}) },
} as never));
const OFF = ['axe', 'light', 'marcher', 'ram', 'catapult'] as const;
const offPop = (st: WorldState, v: Village) => OFF.reduce((n, u) => n + (v.units[u] + v.outside[u]) * st.config.units[u].pop, 0);
const offAtt = (st: WorldState, u: Movement['units']) => OFF.reduce((n, x) => n + (u[x] ?? 0) * st.config.units[x].attack, 0);
const pct = (xs: number[], p: number) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))]! : 0; };
const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

let attacks: { att: number; share: number; won?: boolean }[] = [];
const pending = new Map<number, { att: number; share: number }>();
setAttackHook((st, m, target, after) => {
  if (target.owner < 0 || target.owner === BARBARIAN || !st.players[m.owner]?.bot || (m.units.snob ?? 0) > 0) return;
  const att = offAtt(st, m.units);
  if (att < 1000) return; // scouts and farm groups
  if (!after) {
    const from = st.villages[m.from];
    pending.set(m.id, { att, share: from ? OFF.reduce((n, u) => n + (m.units[u] ?? 0) * st.config.units[u].pop, 0) / Math.max(1, popMax(st.config, from)) : 0 });
    return;
  }
  const p = pending.get(m.id);
  pending.delete(m.id);
  if (p) attacks.push({ ...p, won: after.won });
});

for (let d = 1; d <= days; d++) {
  const t0 = performance.now();
  while (s.time < d * DAY) { s.paused = false; advance(s, Math.min(HOUR, d * DAY - s.time)); }
  const sec = (performance.now() - t0) / 1000;
  // villages of pros and mids that are at least half built (farm >= 15)
  const vs = Object.values(s.villages).filter((v) => v.owner > 0 && s.players[v.owner]?.bot && (s.players[v.owner]!.bot!.tier ?? 'pro') !== 'casual' && v.buildings.farm >= 15);
  const shares = vs.map((v) => offPop(s, v) / Math.max(1, popMax(s.config, v)));
  const nukes = shares.filter((x) => x >= 0.6).length, half = shares.filter((x) => x >= 0.3).length;
  const won = attacks.filter((a) => a.won).length;
  console.log(`dag ${d}: dorpen (pro/mid, boerderij>=15) ${vs.length} · offensief deel van de boerderij p50/p90 ${pct(shares, 0.5).toFixed(2)}/${pct(shares, 0.9).toFixed(2)} · >=60% (nuke) ${nukes} · >=30% ${half} · aanvallen op spelers ${attacks.length}: aanval p10/p50/p90 ${k(pct(attacks.map((a) => a.att), 0.1))}/${k(pct(attacks.map((a) => a.att), 0.5))}/${k(pct(attacks.map((a) => a.att), 0.9))}, deel van de boerderij p50 ${pct(attacks.map((a) => a.share), 0.5).toFixed(2)}, onder 100k ${attacks.filter((a) => a.att < 100_000).length} (gewonnen ${attacks.filter((a) => a.att < 100_000 && a.won).length}), gewonnen ${attacks.length ? Math.round((100 * won) / attacks.length) : 0}% · ${sec.toFixed(0)} s`);
  attacks = [];
}
