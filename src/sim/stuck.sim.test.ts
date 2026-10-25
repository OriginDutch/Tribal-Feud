import { it } from 'vitest';
import { createConfig } from '../shared/config';
import { createWorld, villagesOf } from './state';
import { advance, setPaused } from './simulation';
import { villagePoints } from './barbarians';
import { currentResources, popMax, popUsed, recruitBlocker } from './village';
import { storageCapacity } from './formulas';
import { noblesAllowed } from './nobles';
it('turtles', () => {
  const s = createWorld(createConfig('classic', 'x', 4, { worldSpeed: 20, productionMultiplier: 1 }));
  setPaused(s, false);
  const H = 3600000;
  for (const day of [2, 2.5]) {
    while (s.time < day * 24 * H) { advance(s, H / 4); setPaused(s, false); }
    for (const a of ['turtle', 'supporter', 'rusher'] as const) {
      for (const p of s.players.filter((x) => x.bot?.archetype === a).slice(0, 2)) {
        const v = villagesOf(s, p.id)[0]!;
        const units = Object.entries(v.units).filter(([, n]) => n).map(([u, n]) => `${u}:${n}`).join(' ');
        const out = Object.entries(v.outside).filter(([, n]) => n).map(([u, n]) => `${u}:${n}`).join(' ');
        console.log(`day ${day} ${a} pts ${villagePoints(s.config, v)} snob ${v.buildings.snob} coins ${p.coins ?? 0} allowed ${noblesAllowed(s, v)} snobBlk ${recruitBlocker(s, v, 'snob')} res ${currentResources(s.config, v, s.time).map(Math.round).join('/')} st ${Math.round(storageCapacity(v.buildings.storage))} pop ${popUsed(s.config, v)}/${popMax(v)} place ${v.buildings.place} units ${units} out ${out} target ${p.bot!.nobleTarget}`);
      }
    }
  }
});
