import { beforeEach, describe, expect, it, vi } from 'vitest';

// the dice: a test says how they fall (null = real dice, for building the world)
const dice = vi.hoisted(() => ({ roll: null as number | null }));
vi.mock('./rng', async (orig) => {
  const real = await orig<typeof import('./rng')>();
  return { ...real, nextFloat: (st: Parameters<typeof real.nextFloat>[0]) => (dice.roll === null ? real.nextFloat(st) : dice.roll) };
});

import { createConfig } from '../shared/config';
import { MAX_MEMBERS } from '../shared/tribes';
import { DAY } from '../shared/time';
import { humanTribeTick } from './humanTribe';
import { MERIT, RECRUIT_DAYS, addMerit, meritOf, rightHand, updateRanks } from './ranks';
import { RH_GRUDGE_STANDING, myRightHandTribe, rhAskAlly, rhPropose } from './rightHand';
import { HUMAN_ID, createWorld, villagesOf, type WorldState } from './state';
import { found, join, type Tribe } from './tribes';

function world(): WorldState {
  return createWorld(createConfig('classic', 'R', 71, { worldSpeed: 1, bots: { tiers: { pro: 1, mid: 0 }, count: 40 } } as never));
}

/** You as right hand of a bot tribe, and another bot tribe next to it. */
function setup() {
  const s = world();
  const bots = s.players.filter((p) => p.bot && villagesOf(s, p.id).length);
  const t = found(s, bots[0]!);
  for (const b of bots.slice(1, 4)) join(s, t, b);
  join(s, t, s.players[HUMAN_ID]!);
  const o = found(s, bots[10]!);
  for (const b of bots.slice(11, 13)) join(s, o, b);
  s.time += RECRUIT_DAYS * DAY + 1;
  t.merit = {}; t.seeded = 2;
  addMerit(s, HUMAN_ID, 100);
  updateRanks(s, t);
  bots[0]!.bot!.archetype = 'diplomat';
  bots[10]!.bot!.archetype = 'diplomat';
  dice.roll = 0;
  return { s, t, o, leader: bots[0]!, bots };
}

describe('the right hand speaks for the tribe', () => {
  beforeEach(() => { dice.roll = null; });

  it('you are the right hand; a NAP proposal goes out, a second one waits', () => {
    const { s, t, o } = setup();
    expect(rightHand(s, t)).toBe(HUMAN_ID);
    expect(myRightHandTribe(s)?.id).toBe(t.id);
    expect(rhPropose(s, o.id, 'nap')).toBeNull();
    expect(rhPropose(s, o.id, 'nap')).toMatch(/al een voorstel/);
  });

  it('only the right hand', () => {
    const { s, t, o, bots } = setup();
    addMerit(s, bots[1]!.id, 1000); updateRanks(s, t); // someone else ranks higher now
    expect(rightHand(s, t)).not.toBe(HUMAN_ID);
    expect(rhPropose(s, o.id, 'nap')).toMatch(/rechterhand/);
  });

  it('accepted: the treaty stands and you earn rank points', () => {
    const { s, t, o } = setup();
    const before = meritOf(s, t, HUMAN_ID);
    rhPropose(s, o.id, 'nap');
    humanTribeTick(s);
    expect(t.relations[o.id]).toBe('nap');
    expect(meritOf(s, t, HUMAN_ID)).toBeCloseTo(before + MERIT.treaty, 5);
  });

  it('against your leader\'s grudge: it costs standing, and an aggressive leader ends it (rank points)', () => {
    const { s, t, o, leader } = setup();
    leader.bot!.grudges = { [o.members[0]!]: { score: 2, at: s.time } };
    leader.bot!.archetype = 'rusher';
    s.standing = 60;
    rhPropose(s, o.id, 'nap');
    humanTribeTick(s); // accepted; then his look at it: roll 0 < aggression, so he ends it
    expect(s.standing).toBe(60 + RH_GRUDGE_STANDING);
    expect(t.relations[o.id]).toBeUndefined();
    expect(s.inbox?.some((m) => m.title.includes('zegt de NAP'))).toBe(true);
  });

  it('turned down: wait half a day before asking that tribe again', () => {
    const { s, o } = setup();
    dice.roll = 0.999;
    rhPropose(s, o.id, 'nap');
    humanTribeTick(s);
    expect(rhPropose(s, o.id, 'nap')).toMatch(/halve speldag/);
    s.time += DAY / 2 + 1;
    expect(rhPropose(s, o.id, 'nap')).toBeNull();
  });

  it('an alliance goes through your leader; when he agrees he proposes it', () => {
    const { s, t, o } = setup();
    expect(rhAskAlly(s, o.id)).toMatch(/niet-aanvalsverdrag/);
    t.relations[o.id] = 'nap'; o.relations[t.id] = 'nap';
    // a NAP that has stood a while (they only ally after that)
    (o.since ??= {})[t.id] = s.time - DAY; (t.since ??= {})[o.id] = s.time - DAY;
    expect(rhAskAlly(s, o.id)).toBeNull();
    humanTribeTick(s);
    expect(s.inbox?.some((m) => m.title.includes('bondgenootschap met'))).toBe(true);
    expect(t.relations[o.id]).toBe('ally');
  });

  it('lose the rank and your proposal lapses', () => {
    const { s, t, o } = setup();
    rhPropose(s, o.id, 'nap');
    t.order = [t.members.find((m) => m !== HUMAN_ID && m !== t.leader)!, ...(t.order ?? []).filter((x) => x !== HUMAN_ID)];
    humanTribeTick(s);
    expect(t.relations[o.id]).toBeUndefined();
    expect(s.tribeAsks ?? []).toHaveLength(0);
  });
});

void MAX_MEMBERS; void ({} as Tribe);
