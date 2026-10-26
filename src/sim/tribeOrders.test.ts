import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { answerMessage, foundTribe } from './humanTribe';
import { sendAttack } from './movement';
import { HUMAN_ID, createWorld, playerVillage, villagesOf, type Player, type WorldState } from './state';
import { askTribeHelp, giveOrder, spares, tribeDuties } from './tribeOrders';
import { join, tribeOf } from './tribes';

/** You lead a tribe; the nearest bot is a willing mate (pro, supporter, likes you). */
function setup(seed = 41) {
  const s = createWorld(createConfig('classic', 'O', seed, { bots: { tiers: { pro: 1, mid: 0 }, count: 30 }, conquest: { protectionDays: 0 } } as never));
  foundTribe(s, 'De Testers', 'TEST');
  const me = playerVillage(s)!;
  me.buildings.place = 1;
  const bots = s.players.filter((p) => p.bot && villagesOf(s, p.id).length).sort((a, b) => d(s, a, me) - d(s, b, me));
  const mate = bots[0]!;
  join(s, tribeOf(s, HUMAN_ID)!, mate);
  mate.bot!.archetype = 'supporter';
  mate.bot!.favor = 2;
  const mv = villagesOf(s, mate.id)[0]!;
  mv.buildings.place = 1;
  const enemy = bots[bots.length - 1]!;
  const ev = villagesOf(s, enemy.id)[0]!;
  ev.buildings.place = 1;
  return { s, me, mate, mv, enemy, ev };
}
const d = (s: WorldState, p: Player, v: { x: number; y: number }) => { const w = villagesOf(s, p.id)[0]!; return Math.hypot(w.x - v.x, w.y - v.y); };

describe('working together in your tribe', () => {
  it('asking for help: a mate in range sends defense and says when it arrives', () => {
    const { s, me, mate, mv, ev } = setup();
    mv.units.spear = 1000; mv.units.sword = 500;
    ev.units.axe = 2000;
    expect(sendAttack(s, ev.id, me.id, { axe: 2000 })).toBeNull();
    const attack = Object.values(s.movements).at(-1)!;
    expect(askTribeHelp(s, attack.id)).toBeNull();
    expect(askTribeHelp(s, attack.id)).toMatch(/al om hulp/);
    tribeDuties(s, mate);
    const support = Object.values(s.movements).find((m) => m.kind === 'support' && m.owner === mate.id && m.to === me.id);
    expect(support).toBeDefined();
    expect(support!.arrives).toBeLessThanOrEqual(attack.arrives);
    expect(s.inbox!.at(-1)!.text).toMatch(/voor de inslag/);
  });

  it('a mate that is under attack itself keeps its troops', () => {
    const { s, me, mate, mv, ev } = setup();
    mv.units.spear = 1000;
    ev.units.axe = 4000;
    sendAttack(s, ev.id, mv.id, { axe: 2000 });
    sendAttack(s, ev.id, me.id, { axe: 2000 });
    askTribeHelp(s, Object.values(s.movements).at(-1)!.id);
    tribeDuties(s, mate);
    expect(s.inbox!.at(-1)!.text).toMatch(/onder vuur/);
  });

  it('an attack order: a willing mate sends its army and reports it', () => {
    const { s, mate, mv } = setup();
    mv.units.axe = 800; mv.units.light = 200;
    const barb = Object.values(s.villages).filter((v) => v.owner < 0).sort((a, b) => Math.hypot(a.x - mv.x, a.y - mv.y) - Math.hypot(b.x - mv.x, b.y - mv.y))[0]!;
    expect(giveOrder(s, 'attack', barb.id)).toBeNull();
    expect(s.tribeOrders![0]!.binding).toBe(true);
    tribeDuties(s, mate);
    const answer = Object.values(s.tribeOrders![0]!.answers)[0];
    expect(['yes', 'half']).toContain(answer);
    expect(Object.values(s.movements).some((m) => m.kind === 'attack' && m.owner === mate.id && m.to === barb.id)).toBe(true);
  });

  it('a "leave alone" order makes the mate spare that player', () => {
    const { s, mate, enemy } = setup();
    giveOrder(s, 'spare', enemy.id);
    tribeDuties(s, mate);
    expect(spares(s, mate.bot, enemy.id)).toBe(true);
  });

  it('a mate under attack near you asks for support; answering changes how it feels about you', () => {
    const { s, me, mate, mv, ev } = setup();
    // put the mate's village next to yours
    mv.x = me.x + 2; mv.y = me.y + 1;
    ev.units.axe = 2000;
    sendAttack(s, ev.id, mv.id, { axe: 2000 });
    const attack = Object.values(s.movements).at(-1)!;
    mate.bot!.seen = { [attack.id]: { reacted: true } };
    mate.bot!.favor = 0;
    tribeDuties(s, mate);
    const req = s.inbox!.find((m) => m.kind === 'request');
    expect(req?.request?.type).toBe('support');
    expect(answerMessage(s, req!.id, false)).toBeNull();
    expect(mate.bot!.favor).toBeLessThan(0);
  });

  it('a resources request you accept goes out with your merchants', () => {
    const { s, me, mate, mv } = setup();
    Object.assign(me.buildings, { market: 25, storage: 30, main: 10 });
    me.res = [100000, 100000, 100000];
    me.resAt = s.time;
    const msg = answerMessageFor(s, mate, mv.id);
    expect(answerMessage(s, msg, true)).toBeNull();
    expect(Object.values(s.movements).some((m) => m.kind === 'trade' && m.to === mv.id)).toBe(true);
    expect(mate.bot!.favor).toBeGreaterThan(2 - 0.0001 - 0.5);
  });
});

function answerMessageFor(s: WorldState, mate: Player, village: number): number {
  s.inbox ??= [];
  s.inbox.push({ id: 999999, time: s.time, kind: 'request', from: mate.id, title: 'x', text: 'x', read: false, status: 'open', request: { type: 'resources', village, res: [10000, 10000, 10000] } });
  return 999999;
}
