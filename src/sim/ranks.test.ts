import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY } from '../shared/time';
import { leaderPicks } from './nobleRole';
import { MERIT_HALF_LIFE_DAYS, RECRUIT_DAYS, SEED_PER_CONQUEST, addMerit, meritOf, rankOf, updateRanks } from './ranks';
import { HUMAN_ID, createWorld, villagesOf, type WorldState } from './state';
import { askForOrder } from './tribeOrders';
import { found, join, leave } from './tribes';
import { txt } from '../shared/i18n';

function world(): WorldState {
  return createWorld(createConfig('classic', 'R', 51, { worldSpeed: 1, bots: { tiers: { pro: 1, mid: 0 }, count: 20 } } as never));
}

/** A tribe of a bot leader, you and five bots, all past their recruit days, no merit yet. */
function tribe(s: WorldState) {
  const bots = s.players.filter((p) => p.bot && villagesOf(s, p.id).length).slice(0, 6);
  const t = found(s, bots[0]!);
  for (const b of bots.slice(1)) join(s, t, b);
  join(s, t, s.players[HUMAN_ID]!);
  s.time += RECRUIT_DAYS * DAY + 1;
  t.seeded = 2;
  t.merit = {};
  return { t, lead: bots[0]!, mates: bots.slice(1) };
}

describe('rangen', () => {
  it('places by merit: one right hand, one captain, two veterans, the rest warriors', () => {
    const s = world();
    const { t, mates } = tribe(s);
    [50, 40, 30, 20, 10].forEach((m, i) => addMerit(s, mates[i]!.id, m));
    addMerit(s, HUMAN_ID, 5);
    updateRanks(s, t);
    expect(mates.map((m) => rankOf(s, t, m.id))).toEqual(['rechterhand', 'kapitein', 'veteraan', 'veteraan', 'krijger']);
    expect(rankOf(s, t, HUMAN_ID)).toBe('krijger');
    expect(rankOf(s, t, t.leader)).toBe('leider');
  });

  it('taking a place takes clearly more (10%), not just a little', () => {
    const s = world();
    const { t, mates } = tribe(s);
    addMerit(s, mates[0]!.id, 50);
    updateRanks(s, t);
    addMerit(s, HUMAN_ID, 53);
    updateRanks(s, t);
    expect(rankOf(s, t, mates[0]!.id)).toBe('rechterhand');
    addMerit(s, HUMAN_ID, 10);
    updateRanks(s, t);
    expect(rankOf(s, t, HUMAN_ID)).toBe('rechterhand');
    expect(rankOf(s, t, mates[0]!.id)).toBe('kapitein');
  });

  it('merit fades: half after the half-life; newcomers are recruits for a few days', () => {
    const s = world();
    const { t, mates } = tribe(s);
    addMerit(s, mates[0]!.id, 40);
    s.time += MERIT_HALF_LIFE_DAYS * DAY;
    expect(meritOf(s, t, mates[0]!.id)).toBeCloseTo(20, 5);
    const newcomer = s.players.filter((p) => p.bot && villagesOf(s, p.id).length && p.tribe === undefined)[0]!;
    join(s, t, newcomer);
    addMerit(s, newcomer.id, 500);
    updateRanks(s, t);
    expect(rankOf(s, t, newcomer.id)).toBe('rekruut');
    s.time += RECRUIT_DAYS * DAY + 1;
    updateRanks(s, t);
    expect(rankOf(s, t, newcomer.id)).not.toBe('rekruut');
  });

  it('the right hand succeeds the leader, even with fewer points', () => {
    const s = world();
    const { t, lead, mates } = tribe(s);
    const weakest = [...mates].sort((a, b) => villagesOf(s, a.id).length - villagesOf(s, b.id).length)[0]!;
    addMerit(s, weakest.id, 100);
    updateRanks(s, t);
    expect(rankOf(s, t, weakest.id)).toBe('rechterhand');
    leave(s, lead);
    expect(t.leader).toBe(weakest.id);
  });

  it('the leader weighs rank: a right hand beats a warrior at equal distance and nobles', () => {
    const s = world();
    const { t, mates } = tribe(s);
    addMerit(s, mates[0]!.id, 100);
    updateRanks(s, t);
    const [a, b] = [mates[0]!, mates[4]!];
    const va = villagesOf(s, a.id)[0]!, vb = villagesOf(s, b.id)[0]!;
    for (const v of [va, vb]) { v.units.snob = 4; v.units.axe = 0; v.units.light = 0; }
    a.bot!.mood = 60; b.bot!.mood = 60;
    let wins = 0;
    for (let i = 0; i < 200; i++) if (leaderPicks(s, t, { member: a.id, village: va.id, d: 10 }, { member: b.id, village: vb.id, d: 10 }).member === a.id) wins++;
    expect(wins).toBe(200);
  });

  it('you can ask for an order; nothing to do = a no with a reason, and a wait before asking again', () => {
    const s = world();
    tribe(s);
    expect(askForOrder(s)).toBeNull();
    expect(txt(s.inbox!.at(-1)!.title)).toMatch(/nu niks/);
    expect(askForOrder(s)).toMatch(/Je vroeg net al/);
  });

  it('tribes from before ranks start from the conquests on players everyone made (no fading)', () => {
    const s = world();
    const { t, mates } = tribe(s);
    delete t.seeded;
    s.worldStats = { days: [], conquests: [], players: { [HUMAN_ID]: { pvp: 0, barb: 0, took: 33, tookBarb: 5, lost: 0 }, [mates[0]!.id]: { pvp: 0, barb: 0, took: 3, tookBarb: 0, lost: 0 } } };
    updateRanks(s, t);
    expect(meritOf(s, t, HUMAN_ID)).toBe(33 * SEED_PER_CONQUEST);
    expect(rankOf(s, t, HUMAN_ID)).toBe('rechterhand');
    expect(rankOf(s, t, mates[0]!.id)).toBe('kapitein');
    // once
    updateRanks(s, t);
    expect(meritOf(s, t, HUMAN_ID)).toBe(33 * SEED_PER_CONQUEST);
  });
});
