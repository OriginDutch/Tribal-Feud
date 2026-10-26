/**
 * Simulation benchmark: npm run bench -- <bots> <barbarians> <hours> <worldSpeed>
 * e.g. npm run bench -- 499 9500 48 20. Prints ms per game hour, events, queue and movements.
 */
import { createConfig } from '../../src/shared/config';
import { HOUR } from '../../src/shared/time';
import { advance } from '../../src/sim/simulation';
import { createWorld } from '../../src/sim/state';
import { mapData } from '../../src/sim/mapView';
import { toSaveData } from '../../src/sim/save';

const bots = Number(process.argv[2] ?? 499), barbs = Number(process.argv[3] ?? 9500), hours = Number(process.argv[4] ?? 72);
let t = performance.now();
const s = createWorld(createConfig('classic', 'Bench', 42, { worldSpeed: Number(process.argv[5] ?? 1), bots: { count: bots }, map: { barbarianCount: barbs } } as never));
console.log(`create: ${(performance.now() - t).toFixed(0)} ms, villages ${Object.keys(s.villages).length}, players ${s.players.length}`);
t = performance.now(); const md = mapData(s); console.log(`mapData: ${(performance.now() - t).toFixed(0)} ms (${md.villages.length})`);
t = performance.now(); const json = JSON.stringify(toSaveData(s, 0)); console.log(`save: ${(performance.now() - t).toFixed(0)} ms, ${(json.length / 1e6).toFixed(1)} MB`);
const start = performance.now();
let block = performance.now(), events = 0;
for (let h = 1; h <= hours; h++) {
  s.paused = false; s.speed = 1 as never;
  const end = s.time + HOUR;
  while (s.time < end) { s.paused = false; events += advance(s, end - s.time).processed; }
  if (h % 6 === 0) {
    const ms = performance.now() - block;
    console.log(`h${String(h).padStart(3)}: ${(ms / 6).toFixed(0).padStart(5)} ms/speluur, ${(events / 6).toFixed(0)} events/u, queue ${s.queue.heap.length}, movements ${Object.keys(s.movements).length}, tribes ${Object.keys(s.tribes ?? {}).length}`);
    const kinds: Record<string, number> = {};
    for (const it of s.queue.heap) { const k = (it.event as { kind: string }).kind; kinds[k] = (kinds[k] ?? 0) + 1; }
    const kinds2: Record<string, number> = {};
    for (const m of Object.values(s.movements)) kinds2[m.kind] = (kinds2[m.kind] ?? 0) + 1;
    console.log('   queue:', JSON.stringify(kinds), 'moves:', JSON.stringify(kinds2), 'conq:', JSON.stringify(s.conquests ?? {}));
    block = performance.now(); events = 0;
  }
}
console.log(`totaal ${((performance.now() - start) / 1000).toFixed(1)} s voor ${hours} speluren`);
t = performance.now(); const json2 = JSON.stringify(toSaveData(s, 0)); console.log(`save na: ${(performance.now() - t).toFixed(0)} ms, ${(json2.length / 1e6).toFixed(1)} MB`);
