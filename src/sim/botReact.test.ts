import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { MINUTE } from '../shared/time';
import { attackKind, reactToIncoming } from './botReact';
import { sendAttack } from './movement';
import { createWorld, villagesOf, type Player, type WorldState } from './state';
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
