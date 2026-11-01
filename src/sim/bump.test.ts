import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY } from '../shared/time';
import { MAX_MEMBERS } from '../shared/tribes';
import { RECRUIT_DAYS, addMerit, updateRanks } from './ranks';
import { BARBARIAN, HUMAN_ID, createWorld, invalidateOwners, villagesOf, type WorldState } from './state';
import { bumpCandidate, found, join } from './tribes';

function world(): WorldState {
  return createWorld(createConfig('classic', 'B', 71, { worldSpeed: 1, bots: { tiers: { pro: 1, mid: 0 }, count: 40 } } as never));
}
/** A full tribe of bots, all past their recruit days; `weak` has one village left. */
function full(s: WorldState) {
  const bots = s.players.filter((p) => p.bot && villagesOf(s, p.id).length).slice(0, MAX_MEMBERS);
  const t = found(s, bots[0]!);
  for (const b of bots.slice(1)) join(s, t, b);
  s.time += RECRUIT_DAYS * DAY + 1;
  t.merit = {}; t.seeded = 2;
  bots.slice(1).forEach((b, i) => addMerit(s, b.id, 10 + i));
  updateRanks(s, t);
  return { t, bots };
}
const shrink = (s: WorldState, id: number) => { for (const v of villagesOf(s, id).slice(1)) v.owner = BARBARIAN; invalidateOwners(s); };
const grow = (s: WorldState, id: number, n: number) => { for (const v of Object.values(s.villages).filter((x) => x.owner === BARBARIAN).slice(0, n)) v.owner = id; invalidateOwners(s); };

describe('aankloppen bij een volle stam', () => {
  it('a much stronger newcomer takes the place of the member valued least; that one holds a grudge', () => {
    const s = world();
    const { t, bots } = full(s);
    const weakest = bots[1]!; // fewest rank points
    shrink(s, weakest.id);
    grow(s, HUMAN_ID, 60);
    expect(bumpCandidate(s, t, HUMAN_ID)?.id).toBe(weakest.id);
    join(s, t, s.players[HUMAN_ID]!);
    expect(t.members).toHaveLength(MAX_MEMBERS);
    expect(t.members).toContain(HUMAN_ID);
    expect(t.members).not.toContain(weakest.id);
    expect(weakest.bot!.grudges?.[HUMAN_ID]?.why).toBe('nam mijn plek in');
  });

  it('not without twice his points; never the leader, the right hand or a recruit', () => {
    const s = world();
    const { t, bots } = full(s);
    expect(bumpCandidate(s, t, HUMAN_ID)).toBeNull(); // you are small
    grow(s, HUMAN_ID, 400);
    const out = bumpCandidate(s, t, HUMAN_ID)!;
    expect(out).not.toBeNull();
    expect([t.leader, t.order?.[0]]).not.toContain(out.id);
    // a recruit is safe
    t.joinedAt![out.id] = s.time;
    expect(bumpCandidate(s, t, HUMAN_ID)?.id).not.toBe(out.id);
    void bots;
  });

  it('equal playing field: a strong bot can take your place when you are valued least', () => {
    const s = world();
    const { t, bots } = full(s);
    // make room for you first, then you are the one valued least
    const gone = bots[1]!;
    t.members = t.members.filter((m) => m !== gone.id); delete gone.tribe;
    join(s, t, s.players[HUMAN_ID]!);
    s.time += RECRUIT_DAYS * DAY + 1;
    shrink(s, HUMAN_ID);
    updateRanks(s, t);
    const strong = s.players.find((p) => p.bot && p.tribe === undefined && villagesOf(s, p.id).length)!;
    grow(s, strong.id, 60);
    expect(bumpCandidate(s, t, strong.id)?.id).toBe(HUMAN_ID);
    join(s, t, strong);
    expect(t.members).not.toContain(HUMAN_ID);
    expect(s.inbox?.some((m) => /Uit \[/.test(m.title))).toBe(true);
  });
});
