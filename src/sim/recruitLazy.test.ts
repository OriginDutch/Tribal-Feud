import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { MINUTE } from '../shared/time';
import { advance, setPaused } from './simulation';
import { HUMAN_ID, createWorld, playerVillage, villagesOf, type WorldState } from './state';
import { cancelRecruit, recruit, settleRecruits } from './village';

function world(): WorldState {
  const s = createWorld(createConfig('classic', 'R', 5, { bots: { count: 2 }, map: { barbarianCount: 20 } } as never));
  for (const v of Object.values(s.villages)) {
    if (v.owner < 0) continue;
    Object.assign(v.buildings, { main: 10, barracks: 10, farm: 25, storage: 25 });
    v.res = [500000, 500000, 500000];
  }
  return s;
}
const recruitEvents = (s: WorldState, villageId: number) =>
  s.queue.heap.filter((i) => (i.event as { kind: string; villageId?: number }).kind === 'recruit' && (i.event as { villageId: number }).villageId === villageId).length;
function runTo(s: WorldState, t: number) {
  setPaused(s, false);
  while (s.time < t) { advance(s, Math.min(t - s.time, 10 * MINUTE)); setPaused(s, false); }
}

describe('lazy recruiting', () => {
  it('a bot job has one event; units are there the moment anything looks', () => {
    const s = world();
    const bot = s.players.find((p) => p.isBot)!;
    for (const p of s.players) if (p.bot) p.bot.nextTurn = Infinity; // keep the bot out of it
    const v = villagesOf(s, bot.id)[0]!;
    const before = v.units.spear;
    expect(recruit(s, v.id, 'spear', 50)).toBeNull();
    const job = v.recruitQueues.barracks[0]!;
    expect(recruitEvents(s, v.id)).toBe(1);
    // halfway: not written yet, but settling gives exactly the finished ones
    const half = job.nextAt + 24 * job.perUnit;
    runTo(s, half);
    settleRecruits(s, v);
    expect(v.units.spear - before).toBe(25);
    runTo(s, job.nextAt + 60 * job.perUnit);
    expect(v.units.spear - before).toBe(50);
    expect(v.recruitQueues.barracks.length).toBe(0);
  });

  it('the human keeps an event per unit, so the screen counts up live', () => {
    const s = world();
    const v = playerVillage(s)!;
    expect(v.owner).toBe(HUMAN_ID);
    const before = v.units.spear;
    recruit(s, v.id, 'spear', 10);
    const job = v.recruitQueues.barracks[0]!;
    runTo(s, job.nextAt + 3 * job.perUnit);
    expect(v.units.spear - before).toBe(4);
    expect(recruitEvents(s, v.id)).toBe(1);
  });

  it('cancelling a bot job refunds only units that were not finished yet', () => {
    const s = world();
    const bot = s.players.find((p) => p.isBot)!;
    for (const p of s.players) if (p.bot) p.bot.nextTurn = Infinity;
    const v = villagesOf(s, bot.id)[0]!;
    v.buildQueue = []; // no build events in this village: only the cancel touches it
    recruit(s, v.id, 'spear', 20);
    const job = v.recruitQueues.barracks[0]!;
    const start = v.units.spear;
    runTo(s, job.nextAt + 9 * job.perUnit);
    // nothing touched the village: the units are not written in yet
    expect(v.units.spear).toBe(start);
    // a cancel settles first, so 10 are kept and only 10 are refunded
    expect(cancelRecruit(s, v.id, job.id)).toBeNull();
    expect(v.units.spear - start).toBe(10);
  });
});
