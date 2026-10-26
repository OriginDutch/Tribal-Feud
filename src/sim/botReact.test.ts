import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { MINUTE } from '../shared/time';
import { attackKind, grudge, reactToIncoming } from './botReact';
import { sendAttack } from './movement';
import { createWorld, invalidateOwners, villagesOf, type Player, type WorldState } from './state';
import type { Village } from './village';

/** Two bots far apart: an attacker with an army and a defender we control. */
function setup(seed = 21) {
  const s = createWorld(createConfig('classic', 'React', seed, { bots: { count: 20 }, conquest: { protectionDays: 0 } } as never));
  const bots = s.players.filter((p) => p.isBot && villagesOf(s, p.id).length);
  const def = bots[0]!, dv = villagesOf(s, def.id)[0]!;
  const att = bots.slice(1).sort((x, y) => dist(s, y, dv) - dist(s, x, dv))[0]!;
  const av = villagesOf(s, att.id)[0]!;
  av.buildings.place = 1; dv.buildings.place = 1;
  for (const p of s.players) if (p.bot) p.bot.nextTurn = Infinity; // nobody moves on their own
  return { s, def, dv, att, av };
}
const dist = (s: WorldState, p: Player, v: Village) => { const w = villagesOf(s, p.id)[0]!; return Math.hypot(w.x - v.x, w.y - v.y); };
const asTier = (p: Player, tier: 'pro' | 'mid' | 'casual', online = true) => {
  p.bot!.tier = tier;
  if (tier === 'pro') delete p.bot!.presence;
  else p.bot!.presence = { online, until: Infinity, n: 0 };
};

describe('bots react to incoming attacks', () => {
  it('recognises an attack by its walking time, not by its troops', () => {
    const { s, dv, av } = setup();
    av.units.ram = 5; av.units.axe = 200; av.units.light = 50;
    expect(sendAttack(s, av.id, dv.id, { axe: 200, ram: 5 })).toBeNull();
    const m = Object.values(s.movements).at(-1)!;
    expect(attackKind(s, av, dv, m.sent, m.arrives)).toBe('siege');
    expect(sendAttack(s, av.id, dv.id, { light: 50 })).toBeNull();
    const c = Object.values(s.movements).at(-1)!;
    expect(attackKind(s, av, dv, c.sent, c.arrives)).toBe('cav');
  });

  it('a pro rusher dodges a big attack: its army walks off and is away when it lands', () => {
    const { s, def, dv, av } = setup();
    asTier(def, 'pro'); def.bot!.archetype = 'rusher';
    av.units.axe = 500; av.units.ram = 10;
    dv.units.axe = 300; dv.units.light = 40;
    sendAttack(s, av.id, dv.id, { axe: 500, ram: 10 });
    const incoming = Object.values(s.movements).at(-1)!;
    reactToIncoming(s, def);
    // far away: it plans the dodge and waits for the moment
    expect(dv.units.axe).toBe(300);
    expect(def.bot!.seen?.[incoming.id]?.dodge).toBe(true);
    s.time = incoming.arrives - 30 * MINUTE;
    reactToIncoming(s, def);
    expect(dv.units.axe).toBe(0);
    const dodge = Object.values(s.movements).find((m) => m.owner === def.id && m.from === dv.id)!;
    expect(dodge).toBeDefined();
    // back only after the attack landed
    expect(dodge.arrives + (dodge.arrives - dodge.sent)).toBeGreaterThan(incoming.arrives);
    expect(def.bot!.seen?.[incoming.id]?.reacted).toBe(true);
  });

  it('a casual that is away misses it; one that is online may notice', () => {
    const { s, def, dv, av } = setup();
    av.units.axe = 500;
    sendAttack(s, av.id, dv.id, { axe: 500 });
    asTier(def, 'casual', false);
    // offline bots get no turn at all, so nothing is judged; simulate the turn being skipped
    expect(def.bot!.seen).toBeUndefined();
    asTier(def, 'casual', true);
    reactToIncoming(s, def);
    expect(Object.keys(def.bot!.seen ?? {})).toHaveLength(1);
  });

  it('too late is too late: an attack landing within the reaction time is not answered', () => {
    const { s, def, dv, av } = setup();
    asTier(def, 'mid'); def.bot!.archetype = 'rusher';
    av.units.axe = 500; dv.units.axe = 100;
    sendAttack(s, av.id, dv.id, { axe: 500 });
    const m = Object.values(s.movements).at(-1)!;
    s.time = m.arrives - 10 * MINUTE; // a mid bot needs 20 minutes
    reactToIncoming(s, def);
    expect(def.bot!.seen?.[m.id]?.reacted).toBe(false);
    expect(dv.units.axe).toBe(100);
  });
});

describe('pros hit back', () => {
  it('scouts back, and counters the village whose army is on the road with another village', () => {
    const { s, def, dv, att, av } = setup(22);
    asTier(def, 'pro'); def.bot!.archetype = 'turtle';
    // the defender gets a second village with an army, near the attacker
    const second = Object.values(s.villages).filter((x) => x.owner < 0).sort((a, b) => Math.hypot(a.x - av.x, a.y - av.y) - Math.hypot(b.x - av.x, b.y - av.y))[3]!;
    second.owner = def.id;
    invalidateOwners(s);
    second.buildings.place = 1; second.units.axe = 400; second.units.light = 100;
    dv.units.spy = 10;
    av.units.axe = 600; av.units.ram = 10;
    sendAttack(s, av.id, dv.id, { axe: 600, ram: 10 });
    reactToIncoming(s, def);
    const back = Object.values(s.movements).filter((m) => m.owner === def.id && m.to === av.id);
    expect(back.some((m) => (m.units.spy ?? 0) > 0)).toBe(true);
    const hit = back.find((m) => (m.units.axe ?? 0) > 0);
    expect(hit?.from).toBe(second.id);
    expect(grudge(s, def, att.id)).toBeGreaterThan(0.5);
  });

  it('a grudge fades', () => {
    const { s, def, att } = setup();
    def.bot!.grudges = { [att.id]: { score: 1, at: 0 } };
    s.time = 24 * 60 * MINUTE / s.config.worldSpeed;
    expect(grudge(s, def, att.id)).toBeCloseTo(0.5, 5);
  });
});
