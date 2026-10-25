import { it } from 'vitest';
import { createConfig } from '../shared/config';
import { BOT_PROFILES } from '../shared/botProfiles';
import { createWorld, villagesOf } from './state';
import { onBotTurn } from './bots';
import { advance, setPaused } from './simulation';
import { villagePoints } from './barbarians';
import { buildBlocker, currentResources, plannedLevel, popMax, popUsed } from './village';
import { storageCapacity } from './formulas';
import { noblesAllowed } from './nobles';
it('easy stuck', () => {
  const s = createWorld(createConfig('classic', 'x', 1, { worldSpeed: 20, productionMultiplier: 1, bots: { difficulty: 'easy' } }));
  setPaused(s, false);
  const H = 3600000;
  while (s.time < 6 * 24 * H) { advance(s, H / 4); setPaused(s, false); }
  for (const p of s.players.filter((x) => x.isBot && villagesOf(s, x.id).length === 1).slice(0, 4)) {
    const v = villagesOf(s, p.id)[0]!;
    const step = BOT_PROFILES[p.bot!.archetype].buildOrder.find(([b, l]) => plannedLevel(v, b) < l);
    const units = Object.entries(v.units).filter(([, n]) => n).map(([u, n]) => `${u}:${n}`).join(' ');
    delete p.bot!.lastCheck;
    p.bot!.nextTurn = s.time;
    const before = Object.keys(s.movements).length;
    onBotTurn(s, p.id);
    const mine = Object.values(s.movements).filter((m) => m.owner === p.id && (m.units.snob ?? 0) > 0);
    const far = Object.values(s.villages).filter((x) => x.owner === -1 && Math.hypot(x.x - v.x, x.y - v.y) <= 20).length;
    console.log('moves', Object.keys(s.movements).length - before, 'snobAttacks', mine.length, 'barbs<=20', far, 'target', p.bot!.nobleTarget, 'farmLog lost', Object.values(p.bot!.farmLog).filter((x) => !x.won).length, 'outgoing', p.bot!.outgoing.length);
    console.log(`${p.bot!.archetype} pts ${villagePoints(s.config, v)} res ${currentResources(s.config, v, s.time).map(Math.round).join('/')} st ${storageCapacity(v.buildings.storage)} pop ${popUsed(s.config, v)}/${popMax(v)} snob ${v.buildings.snob} coins ${p.coins ?? 0} allowed ${noblesAllowed(s, v)} q[${v.buildQueue.map((j) => j.building + j.level)}] next ${step} blk ${step ? buildBlocker(s, v, step[0]) : '-'} units ${units} levels w${v.buildings.wood} s${v.buildings.stone} i${v.buildings.iron} farm${v.buildings.farm} st${v.buildings.storage}`);
  }
});
