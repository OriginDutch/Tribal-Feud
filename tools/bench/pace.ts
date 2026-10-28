/**
 * Noble pace: npm run pace -- <days> <difficulty> [cooldownHours]
 * Marcel's world settings (200 bots, 3000 barbarians, speed 20, production and farm x2) unless
 * EXTRA overrides them. Per game day: how many barbarian villages are left, how big the bots are
 * (per tier), and how many villages changed hands.
 */
import { createConfig, DIFFICULTIES } from '../../src/shared/config';
import { DAY, HOUR } from '../../src/shared/time';
import { advance } from '../../src/sim/simulation';
import { BARBARIAN, createWorld } from '../../src/sim/state';

const days = Number(process.argv[2] ?? 8);
const difficulty = (process.argv[3] ?? 'easy') as keyof typeof DIFFICULTIES;
if (process.argv[4] !== undefined) for (const d of Object.values(DIFFICULTIES)) d.conquestCooldownHours = Number(process.argv[4]);
const seed = Number(process.env.SEED ?? 11);
const s = createWorld(createConfig('classic', 'Pace', seed, {
  worldSpeed: 20, productionMultiplier: 2, farmMultiplier: 2,
  bots: { count: 200, difficulty }, map: { barbarianCount: 3000 },
  ...(process.env.EXTRA ? JSON.parse(process.env.EXTRA) : {}),
} as never));
const q = (xs: number[], p: number) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))]! : 0; };
const barbStart = Object.values(s.villages).filter((v) => v && v.owner === BARBARIAN).length;
const t0 = performance.now();
for (let d = 1; d <= days; d++) {
  const step = d === 1 ? [0.5, 1] : [1];
  for (const f of step) {
    const end = (d - 1 + f) * DAY;
    while (s.time < end) { s.paused = false; advance(s, Math.min(HOUR, end - s.time)); }
  }
  const count = new Map<number, number>();
  let barbs = 0;
  for (const v of Object.values(s.villages)) { if (!v) continue; if (v.owner === BARBARIAN) barbs++; else count.set(v.owner, (count.get(v.owner) ?? 0) + 1); }
  const bots = s.players.filter((p) => p.bot);
  const by = (tier?: string) => bots.filter((p) => !tier || p.bot!.tier === tier).map((p) => count.get(p.id) ?? 0);
  const all = by();
  const fmt = (xs: number[]) => `${q(xs, 0.5)}/${q(xs, 0.9)}/${Math.max(0, ...xs)}`;
  console.log(`dag ${d}: barbaren over ${barbs} (${Math.round((100 * barbs) / barbStart)}%) · bots mediaan/p90/max ${fmt(all)} · pro ${fmt(by('pro'))} · mid ${fmt(by('mid'))} · casual ${fmt(by('casual'))} · weg ${all.filter((n) => n === 0).length}`);
}
console.log(`klaar in ${Math.round((performance.now() - t0) / 1000)} s`);
