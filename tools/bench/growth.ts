/**
 * Growth spread of bots: points per activity band after N game days.
 * npm run growth -- <bots> <barbs> <days> <worldSpeed>
 */
import { createConfig } from '../../src/shared/config';
import { HOUR } from '../../src/shared/time';
import { villagePoints } from '../../src/sim/barbarians';
import { advance } from '../../src/sim/simulation';
import { createWorld, villagesOf } from '../../src/sim/state';

const [bots, barbs, days, speed] = [Number(process.argv[2] ?? 200), Number(process.argv[3] ?? 3000), Number(process.argv[4] ?? 4), Number(process.argv[5] ?? 1)];
const s = createWorld(createConfig('classic', 'G', 77, { worldSpeed: speed, bots: { count: bots }, map: { barbarianCount: barbs } } as never));
for (let d = 1; d <= days; d++) {
  const end = s.time + 24 * HOUR;
  while (s.time < end) { s.paused = false; s.speed = 1 as never; advance(s, Math.min(HOUR, end - s.time)); }
  const rows = s.players.filter((p) => p.bot).map((p) => ({ t: p.bot!.tier ?? 'pro', a: p.bot!.activity, pts: villagesOf(s, p.id).reduce((t, v) => t + villagePoints(s.config, v), 0), n: villagesOf(s, p.id).length }));
  rows.sort((x, y) => y.pts - x.pts);
  const pct = (q: number) => rows[Math.floor(q * (rows.length - 1))]!.pts;
  const bands = (['pro', 'mid', 'casual'] as const).map((tier) => {
    const b = rows.filter((r) => r.t === tier);
    const avg = b.reduce((t, r) => t + r.pts, 0) / Math.max(1, b.length);
    return `${tier}: ${b.length} bots, gem ${Math.round(avg)} p, ${(b.reduce((t, r) => t + r.n, 0) / Math.max(1, b.length)).toFixed(1)} dorpen`;
  });
  console.log(`dag ${d}: top ${pct(0)} | p10 ${pct(0.1)} | mediaan ${pct(0.5)} | p90 ${pct(0.9)} | laagste ${pct(1)}  —  ${bands.join(' · ')}`);
}
