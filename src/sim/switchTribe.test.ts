import { beforeEach, describe, expect, it, vi } from 'vitest';

// the dice: a test says how they fall (null = real dice, for building the world)
const dice = vi.hoisted(() => ({ roll: null as number | null }));
vi.mock('./rng', async (orig) => {
  const real = await orig<typeof import('./rng')>();
  return { ...real, nextFloat: (st: Parameters<typeof real.nextFloat>[0]) => (dice.roll === null ? real.nextFloat(st) : dice.roll) };
});

// where everyone lives is not what this tests: every tribe fits
vi.mock('./tribes', async (orig) => ({ ...(await orig<typeof import('./tribes')>()), fits: () => true }));

import { createConfig } from '../shared/config';
import { grudge } from './botReact';
import { SWITCH_GRUDGE, applyToTribe, humanTribeTick } from './humanTribe';
import { HUMAN_ID, createWorld, villagesOf } from './state';
import { found, join } from './tribes';

/** You in a bot tribe `old`, and a tribe `next` right next to you with room. */
function setup() {
  const s = createWorld(createConfig('classic', 'S', 71, { worldSpeed: 1, bots: { tiers: { pro: 1, mid: 0 }, count: 40 } } as never));
  const me = s.players[HUMAN_ID]!;
  // nearest bots first: a tribe only takes you when you live close enough
  const home = villagesOf(s, HUMAN_ID)[0]!;
  const near = (id: number) => Math.min(...villagesOf(s, id).map((v) => Math.hypot(v.x - home.x, v.y - home.y)));
  const bots = s.players.filter((p) => p.bot && villagesOf(s, p.id).length).sort((a, b) => near(a.id) - near(b.id));
  const old = found(s, bots[0]!);
  join(s, old, me);
  const next = found(s, bots[1]!);
  bots[1]!.bot!.archetype = 'diplomat';
  dice.roll = 0;
  return { s, me, old, next, oldLeader: bots[0]!, nextLeader: bots[1]! };
}

describe('switching tribes', () => {
  beforeEach(() => { dice.roll = null; });

  it('you may apply while in a tribe, one application at a time', () => {
    const { s, old, next } = setup();
    expect(applyToTribe(s, old.id)).toMatch(/zit je al/);
    expect(applyToTribe(s, next.id)).toBeNull();
    const third = found(s, s.players.find((p) => p.bot && p.tribe === undefined && villagesOf(s, p.id).length)!);
    expect(applyToTribe(s, third.id)).toMatch(/al een aanmelding/);
  });

  it('taken: you leave your old tribe for the new one, and your old leader holds a grudge', () => {
    const { s, me, old, next, oldLeader } = setup();
    if (!applyToTribe(s, next.id)) humanTribeTick(s);
    expect(me.tribe).toBe(next.id);
    expect(old.members).not.toContain(HUMAN_ID);
    expect(grudge(s, oldLeader, HUMAN_ID)).toBeCloseTo(SWITCH_GRUDGE, 5);
  });

  it('turned down: nothing changes, your leader never knows', () => {
    const { s, me, old, next, oldLeader } = setup();
    dice.roll = 0.999;
    applyToTribe(s, next.id);
    humanTribeTick(s);
    expect(me.tribe).toBe(old.id);
    expect(grudge(s, oldLeader, HUMAN_ID)).toBe(0);
    expect(s.tribeAsks ?? []).toHaveLength(0);
    void next;
  });
});
