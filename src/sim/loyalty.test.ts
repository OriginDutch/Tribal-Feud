import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { foundTribe } from './humanTribe';
import { changeMood, humanBetray, loyaltyTick, moodOf, trustFactor } from './loyalty';
import { HUMAN_ID, createWorld, villagesOf, type Player, type WorldState } from './state';
import { found, join, setRelation, tribeOf } from './tribes';

function world(): WorldState {
  return createWorld(createConfig('classic', 'Trouw', 91, { bots: { tiers: { pro: 1, mid: 0 }, count: 30 } } as never));
}
const bots = (s: WorldState): Player[] => s.players.filter((p) => p.bot && villagesOf(s, p.id).length);

describe('satisfaction and betrayal', () => {
  it('a mate you neglect complains, then leaves or betrays you', () => {
    const s = world();
    expect(foundTribe(s, 'Leeuwen', 'LEEUW')).toBeNull();
    const t = tribeOf(s, HUMAN_ID)!;
    const mate = bots(s)[0]!;
    mate.bot!.archetype = 'opportunist';
    join(s, t, mate);
    expect(moodOf(mate)).toBe(60);
    changeMood(s, mate, -55, 'je liet me in de steek');
    expect(mate.bot!.moodNotes?.at(-1)?.why).toBe('je liet me in de steek');
    for (let i = 0; i < 300 && mate.tribe === t.id; i++) { mate.bot!.mood = 5; loyaltyTick(s); }
    expect(mate.tribe).not.toBe(t.id);
    expect((s.inbox ?? []).some((m) => m.title.includes('ontevreden'))).toBe(true);
  });

  it('as a member of a bot tribe, a leader who thinks little of you throws you out', () => {
    const s = world();
    const lead = bots(s)[0]!;
    const t = found(s, lead);
    join(s, t, s.players[HUMAN_ID]!);
    for (let i = 0; i < 200 && s.players[HUMAN_ID]!.tribe === t.id; i++) { s.standing = 5; loyaltyTick(s); }
    expect(s.players[HUMAN_ID]!.tribe).toBeUndefined();
  });

  it('a bot leader nobody likes is replaced', () => {
    const s = world();
    const [a, b, c] = bots(s);
    const t = found(s, a!);
    join(s, t, b!);
    join(s, t, c!);
    for (let i = 0; i < 200 && t.leader === a!.id; i++) { b!.bot!.mood = 27; c!.bot!.mood = 27; loyaltyTick(s); }
    expect(t.leader).not.toBe(a!.id);
  });

  it('you betray: a mate (as leader) or a NAP partner (war), and tribes trust you less', () => {
    const s = world();
    expect(foundTribe(s, 'Leeuwen', 'LEEUW')).toBeNull();
    const t = tribeOf(s, HUMAN_ID)!;
    const [mate, other] = bots(s);
    join(s, t, mate!);
    expect(humanBetray(s, mate!.id)).toBeNull();
    expect(mate!.tribe).toBeUndefined();
    expect(mate!.bot!.grudges?.[HUMAN_ID]?.why).toBe('verraad');
    expect(trustFactor(s)).toBeCloseTo(0.75);
    const o = found(s, other!);
    expect(humanBetray(s, other!.id)).toMatch(/geen band/);
    setRelation(s, t, o, 'nap');
    expect(humanBetray(s, other!.id)).toBeNull();
    expect(t.relations[o.id]).toBe('war');
  });

  it('as a member, betraying a mate gets you thrown out', () => {
    const s = world();
    const [lead, mate] = bots(s);
    const t = found(s, lead!);
    join(s, t, mate!);
    join(s, t, s.players[HUMAN_ID]!);
    expect(humanBetray(s, mate!.id)).toBeNull();
    expect(s.players[HUMAN_ID]!.tribe).toBeUndefined();
    expect(lead!.bot!.grudges?.[HUMAN_ID]?.score).toBeGreaterThan(0);
  });
});

describe('tribes merge and fall apart', () => {
  it('two allied bot tribes close together merge into the bigger one', () => {
    const s = world();
    const [a, b, c] = bots(s);
    const ta = found(s, a!);
    join(s, ta, c!);
    const tb = found(s, b!);
    setRelation(s, ta, tb, 'ally');
    for (let i = 0; i < 2000 && s.tribes?.[tb.id] && s.tribes?.[ta.id]; i++) loyaltyTick(s);
    const left = [ta, tb].filter((t) => s.tribes?.[t.id]);
    expect(left.length).toBe(1);
    expect(left[0]!.members.length).toBe(3);
  });

  it('an unhappy tribe falls apart: the unhappiest starts a new one', () => {
    const s = world();
    const list = bots(s).slice(0, 6);
    const t = found(s, list[0]!);
    for (const p of list.slice(1)) join(s, t, p);
    const before = Object.keys(s.tribes!).length;
    for (let i = 0; i < 400 && Object.keys(s.tribes!).length === before; i++) {
      for (const p of list.slice(1)) if (p.tribe === t.id) p.bot!.mood = 30;
      loyaltyTick(s);
    }
    expect(Object.keys(s.tribes!).length).toBeGreaterThan(before);
  });
});
