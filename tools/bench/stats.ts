/**
 * World statistics run: npm run stats -- <bots> <barbarians> <days> <worldSpeed> [difficulty]
 * Prints per game day: attacks on players / barbarians, conquests, tribes, wars, solo bots, biggest bot.
 */
import { createConfig } from '../../src/shared/config';
import { DAY, HOUR } from '../../src/shared/time';
import { advance } from '../../src/sim/simulation';
import { createWorld, villagesOf } from '../../src/sim/state';
import { fromSaveData, toSaveData } from '../../src/sim/save';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// CHECKPOINT=file: continue from that world, and write it after every day (long runs in parts)
const checkpoint = process.env.CHECKPOINT;

const bots = Number(process.argv[2] ?? 200), barbs = Number(process.argv[3] ?? 3000), days = Number(process.argv[4] ?? 7);
const s = checkpoint && existsSync(checkpoint) ? fromSaveData(JSON.parse(readFileSync(checkpoint, 'utf8'))) : createWorld(createConfig('classic', 'Stats', 7, { worldSpeed: Number(process.argv[5] ?? 20), bots: { count: bots, difficulty: process.argv[6] ?? 'normal' }, map: { barbarianCount: barbs }, ...(process.env.EXTRA ? JSON.parse(process.env.EXTRA) : {}) } as never));
const t0 = performance.now();
// time spent per game day, kept next to the checkpoint so a run in parts still adds up
const timeFile = checkpoint ? `${checkpoint}.time.json` : '';
const spent: Record<number, number> = timeFile && existsSync(timeFile) ? JSON.parse(readFileSync(timeFile, 'utf8')) : {};
for (let hour = Math.round(s.time / HOUR); hour < days * 24; hour++) {
  const d = Math.floor(hour / 24) + 1;
  const h0 = performance.now();
  const end = s.time + HOUR;
  while (s.time < end) { s.paused = false; advance(s, end - s.time); }
  spent[d] = (spent[d] ?? 0) + (performance.now() - h0);
  if (checkpoint && (hour + 1) % 3 === 0 && (hour + 1) % 24 !== 0) {
    writeFileSync(checkpoint, JSON.stringify(toSaveData(s, Date.now())));
    writeFileSync(timeFile, JSON.stringify(spent));
    console.log(`  dag ${d} ${String((hour + 1) % 24).padStart(2, '0')}:00 · ${(spent[d]! / 1000).toFixed(0)} s deze dag`);
  }
  if ((hour + 1) % 24 !== 0) continue;
  const day = s.worldStats?.days.find((x) => x.day === Math.floor((s.time - 1) / DAY));
  const ws = Object.values(s.tribes ?? {}).reduce((a, t) => a + Object.values(t.relations).filter((r) => r === 'war').length, 0) / 2;
  const solo = s.players.filter((p) => p.bot && p.tribe === undefined && villagesOf(s, p.id).length).length;
  const alive = s.players.filter((p) => p.bot && villagesOf(s, p.id).length).length;
  const sizes = s.players.filter((p) => p.bot).map((p) => villagesOf(s, p.id).length).sort((a, b) => b - a);
  const took = ((spent[d] ?? 0) / 1000).toFixed(0);
  const villagesNow = Object.values(s.villages).filter((v) => v.owner >= 0).length;
  const mem = Math.round(process.memoryUsage().heapUsed / 1e6);
  let saveMb = '';
  if (checkpoint) { const json = JSON.stringify(toSaveData(s, Date.now())); writeFileSync(checkpoint, json); writeFileSync(timeFile, JSON.stringify(spent)); saveMb = `, save ${(json.length / 1e6).toFixed(1)} MB`; }
  console.log(`dag ${d} (${took} s, ${villagesNow} spelersdorpen, ${mem} MB geheugen${saveMb}): aanvallen spelers ${day?.attacksPvp ?? 0} / barb ${day?.attacksBarb ?? 0} · overnames spelers ${day?.conquestsPvp ?? 0} / barb ${day?.conquestsBarb ?? 0} · stammen ${Object.keys(s.tribes ?? {}).length} · oorlogen ${ws} · solo ${solo}/${alive} · grootste ${sizes.slice(0, 3).join(',')} mediaan ${sizes[Math.floor(sizes.length / 2)]}`);
}
{
  const vs = Object.values(s.villages).filter((v) => v.owner >= 0);
  const out = vs.filter((v) => v.scav?.runs.length).length;
  const lv = [0, 0, 0, 0];
  for (const v of vs) if (v.scav) lv[v.scav.unlocked]!++;
  console.log(`rooftocht: ${out}/${vs.length} dorpen nu onderweg · hoogste open level ${lv.join('/')}`);
}
console.log(`klaar in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
