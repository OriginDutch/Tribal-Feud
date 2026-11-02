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
import { addMessage, answerMessage, humanTribeTick } from './humanTribe';
import { MERIT, RECRUIT_DAYS, addMerit, meritOf, rightHand, updateRanks } from './ranks';
import { RH_GRUDGE_STANDING, UNJUST, myRightHandTribe, rhAskAlly, rhPropose, rhRound } from './rightHand';
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

describe('a bot as right hand (part 2)', () => {
  beforeEach(() => { dice.roll = null; });

  /** Two bot tribes; tribe x has bot `rh` as right hand (and you nowhere, or as x's leader). */
  function bots2(youLead = false) {
    const s = world();
    const bots = s.players.filter((p) => p.bot && villagesOf(s, p.id).length);
    const x = youLead ? found(s, s.players[HUMAN_ID]!, { name: 'Wij', tag: 'WIJ' }) : found(s, bots[0]!);
    for (const b of bots.slice(1, 4)) join(s, x, b);
    const y = found(s, bots[10]!);
    for (const b of bots.slice(11, 13)) join(s, y, b);
    s.time += RECRUIT_DAYS * DAY + 1;
    x.merit = {}; x.seeded = 2;
    const rh = bots[1]!;
    addMerit(s, rh.id, 100);
    updateRanks(s, x);
    rh.bot!.archetype = 'diplomat';
    bots[10]!.bot!.archetype = 'diplomat';
    if (!youLead) bots[0]!.bot!.archetype = 'diplomat';
    dice.roll = 0;
    return { s, x, y, rh, leader: bots[0]! };
  }

  it('in a bot tribe he makes a NAP himself (news, rank points)', () => {
    const { s, x, y, rh } = bots2();
    expect(rightHand(s, x)).toBe(rh.id);
    const before = meritOf(s, x, rh.id);
    expect(rhRound(s, x, y)).toBe(true);
    expect(x.relations[y.id]).toBe('nap');
    expect(meritOf(s, x, rh.id)).toBeCloseTo(before + MERIT.treaty, 5);
    expect((s.news ?? []).some((n) => n.dry.includes(`rechterhand ${rh.name}`))).toBe(true);
  });

  it('against his leader\'s grudge: he loses mood, and an aggressive leader ends it the next round', () => {
    const { s, x, y, rh, leader } = bots2();
    leader.bot!.archetype = 'rusher';
    leader.bot!.grudges = { [y.members[0]!]: { score: 2, at: s.time } };
    const mood = rh.bot!.mood ?? 60;
    rhRound(s, x, y);
    expect(x.relations[y.id]).toBe('nap');
    expect(rh.bot!.mood).toBe(mood + RH_GRUDGE_STANDING);
    rhRound(s, x, y); // his look: roll 0 < aggression
    expect(x.relations[y.id]).toBeUndefined();
    expect(rhRound(s, x, y)).toBe(false); // and the right hand lets it rest
    expect(x.relations[y.id]).toBeUndefined();
  });

  it('you lead: you hear of it, and may undo it (a stronger neighbour: the tribe takes that badly)', () => {
    const { s, x, y, rh } = bots2(true);
    expect(rhRound(s, x, y)).toBe(true);
    expect(s.inbox?.some((m) => m.kind === 'info' && m.title.includes('stelt'))).toBe(true);
    const undo = s.inbox!.find((m) => m.kind === 'rhTreaty')!;
    expect(undo.status).toBe('open');
    // make them the stronger tribe
    for (const v of villagesOf(s, y.members[0]!)) v.units.axe = 100000;
    s.time += DAY / 2; // strength is cached for a while
    const mood = rh.bot!.mood ?? 60;
    expect(answerMessage(s, undo.id, true)).toBeNull();
    expect(x.relations[y.id]).toBeUndefined();
    expect(rh.bot!.mood).toBe(mood + UNJUST.rightHand);
  });

  it('you lead and say no to an alliance against a shared enemy: unjust', () => {
    const { s, x, y, rh } = bots2(true);
    x.relations[y.id] = 'nap'; y.relations[x.id] = 'nap';
    const z = Object.values(s.tribes!).find((t) => t.id !== x.id && t.id !== y.id) ?? found(s, s.players.find((p) => p.bot && p.tribe === undefined && villagesOf(s, p.id).length)!);
    x.relations[z.id] = 'war'; y.relations[z.id] = 'war';
    addMessage(s, { kind: 'rhAsk', rhAsk: 'ally', from: rh.id, tribe: y.id, title: 't', text: 't', status: 'open', expires: s.time + DAY });
    const m = s.inbox!.at(-1)!;
    const mood = rh.bot!.mood ?? 60;
    answerMessage(s, m.id, false);
    expect(rh.bot!.mood).toBe(mood + UNJUST.rightHand);
  });
});
