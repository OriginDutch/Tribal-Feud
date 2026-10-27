/**
 * World statistics run: npm run stats -- <bots> <barbarians> <days> <worldSpeed> [difficulty]
 * Prints per game day: attacks on players / barbarians, conquests, tribes, wars, solo bots, biggest bot.
 */
import { createConfig } from '../../src/shared/config';
import { DAY, HOUR } from '../../src/shared/time';
import { advance } from '../../src/sim/simulation';
import { createWorld, villagesOf } from '../../src/sim/state';

const bots = Number(process.argv[2] ?? 200), barbs = Number(process.argv[3] ?? 3000), days = Number(process.argv[4] ?? 7);
const s = createWorld(createConfig('classic', 'Stats', 7, { worldSpeed: Number(process.argv[5] ?? 20), bots: { count: bots, difficulty: process.argv[6] ?? 'normal' }, map: { barbarianCount: barbs }, ...(process.env.EXTRA ? JSON.parse(process.env.EXTRA) : {}) } as never));
const t0 = performance.now();
for (let d = 1; d <= days; d++) {
  for (let h = 0; h < 24; h++) {
    const end = s.time + HOUR;
    while (s.time < end) { s.paused = false; advance(s, end - s.time); }
  }
  const day = s.worldStats?.days.find((x) => x.day === Math.floor((s.time - 1) / DAY));
  const ws = Object.values(s.tribes ?? {}).reduce((a, t) => a + Object.values(t.relations).filter((r) => r === 'war').length, 0) / 2;
  const solo = s.players.filter((p) => p.bot && p.tribe === undefined && villagesOf(s, p.id).length).length;
  const alive = s.players.filter((p) => p.bot && villagesOf(s, p.id).length).length;
  const sizes = s.players.filter((p) => p.bot).map((p) => villagesOf(s, p.id).length).sort((a, b) => b - a);
  console.log(`dag ${d}: aanvallen spelers ${day?.attacksPvp ?? 0} / barb ${day?.attacksBarb ?? 0} · overnames spelers ${day?.conquestsPvp ?? 0} / barb ${day?.conquestsBarb ?? 0} · stammen ${Object.keys(s.tribes ?? {}).length} · oorlogen ${ws} · solo ${solo}/${alive} · grootste ${sizes.slice(0, 3).join(',')} mediaan ${sizes[Math.floor(sizes.length / 2)]}`);
}
{
  const vs = Object.values(s.villages).filter((v) => v.owner >= 0);
  const out = vs.filter((v) => v.scav?.runs.length).length;
  const lv = [0, 0, 0, 0];
  for (const v of vs) if (v.scav) lv[v.scav.unlocked]!++;
  console.log(`rooftocht: ${out}/${vs.length} dorpen nu onderweg · hoogste open level ${lv.join('/')}`);
}
console.log(`klaar in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
