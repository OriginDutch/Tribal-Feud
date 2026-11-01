import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY } from '../shared/time';
import { pop } from './eventQueue';
import { defenseOf } from './botStrategy';
import { answerMessage } from './humanTribe';
import { distance, onArrive } from './movement';
import { NOBLE_LAG, answerAppeal, drawNobles, giveNobles, offerAppeal, type NobleCandidate } from './nobleRole';
import { onPlanned, planAttack } from './planned';
import { HUMAN_ID, createWorld, playerVillage, villagesOf, type WorldState } from './state';
import { isOutlaw } from './talks';
import type { Tribe } from './tribes';
import { onOpLaunch, warOpsTick } from './warOps';

/** Launches, arrivals and planned sends only. */
function run(s: WorldState, until: number): void {
  for (;;) {
    const next = s.queue.heap.length ? s.queue.heap.reduce((a, b) => (a.time < b.time || (a.time === b.time && a.seq < b.seq) ? a : b)) : undefined;
    if (!next || next.time > until) break;
    const item = pop(s.queue)!;
    s.time = item.time;
    if (item.event.kind === 'opLaunch') onOpLaunch(s, item.event.tribe, item.event.op, item.event.role);
    else if (item.event.kind === 'arrive') onArrive(s, item.event.movementId);
    else if (item.event.kind === 'planned') onPlanned(s, item.event.id);
  }
  s.time = until;
}

/** Tribe A (two bots, at war with B) can break B's village; you are in A with a noble train close by. */
function setup(youNobles = 5) {
  const s = createWorld(createConfig('classic', 'N', 21, { bots: { count: 30 } }));
  s.time = 6 * DAY;
  s.alertMode = 'off';
  const bots = s.players.filter((p) => p.isBot && villagesOf(s, p.id).length);
  const target = villagesOf(s, bots[0]!.id)[0]!;
  const near = (id: number) => { const v = villagesOf(s, id)[0]!; return Math.hypot(v.x - target.x, v.y - target.y); };
  const [a1, a2] = bots.slice(1).sort((x, y) => near(x.id) - near(y.id));
  const enemy = bots[0]!;
  for (const p of [a1!, a2!]) p.bot!.tier = 'pro';
  const ta: Tribe = { id: 9201, name: 'A', tag: 'A', color: '#fff', leader: a1!.id, members: [a1!.id, a2!.id, HUMAN_ID], founded: 0, relations: { 9202: 'war' } };
  const tb: Tribe = { id: 9202, name: 'B', tag: 'B', color: '#000', leader: enemy.id, members: [enemy.id], founded: 0, relations: { 9201: 'war' } };
  s.tribes = { [ta.id]: ta, [tb.id]: tb };
  a1!.tribe = ta.id; a2!.tribe = ta.id; enemy.tribe = tb.id; s.players[HUMAN_ID]!.tribe = ta.id;
  target.units.spear = 2500; target.units.sword = 2500; target.buildings.wall = 20;
  for (const p of [a1!, a2!]) {
    const v = villagesOf(s, p.id)[0]!;
    v.buildings.place = Math.max(1, v.buildings.place);
    v.units.axe = 4000; v.units.light = 1300; v.units.ram = 250; v.units.snob = 0;
  }
  a1!.bot!.scouted = { [target.id]: { at: s.time, def: defenseOf(s, target.units, 20), owner: enemy.id } };
  const home = playerVillage(s)!;
  home.x = target.x + 3; home.y = target.y;
  home.buildings.place = Math.max(1, home.buildings.place);
  home.units.snob = youNobles; home.units.axe = youNobles ? 3000 : 0;
  return { s, ta, target, a1: a1!, a2: a2!, home };
}

describe('the nobles of a joint attack', () => {
  it('the draw: the closer, the likelier, but never certain', () => {
    const { s } = setup();
    const cands: NobleCandidate[] = [{ member: 1, village: 1, d: 2 }, { member: 2, village: 2, d: 20 }];
    let near = 0;
    for (let i = 0; i < 2000; i++) if (drawNobles(s, cands)!.member === 1) near++;
    expect(near).toBeGreaterThan(1600);
    expect(near).toBeLessThan(2000);
  });

  it('you as the only one with a train: you get the nobles; your planned train lands right behind the armies and counts', () => {
    const { s, ta, target, home } = setup();
    warOpsTick(s);
    const op = ta.ops![0]!;
    expect(op.roles.find((r) => r.kind === 'nobles')?.member).toBe(HUMAN_ID);
    expect(op.roles.some((r) => r.kind === 'nuke' && r.member === HUMAN_ID)).toBe(false);
    const msg = s.inbox!.find((m) => m.request?.type === 'order' && m.request.nobles)!;
    expect(msg.request).toMatchObject({ arrives: op.landAt + NOBLE_LAG });
    expect(answerMessage(s, msg.id, true)).toBeNull();
    expect(s.leaderOrder).toMatchObject({ nobles: true, landAt: op.landAt + NOBLE_LAG });
    // five nobles: a train of five, the escorts of your choice
    expect(planAttack(s, { from: home.id, to: target.id, first: { axe: 1000 }, escorts: [{ axe: 500 }, { axe: 500 }, { axe: 500 }, { axe: 500 }], landAt: s.leaderOrder!.landAt! })).toBeNull();
    const before = s.standing ?? 60;
    run(s, op.landAt + 2 * 60 * 60_000);
    expect(op.roles.every((r) => r.state === 'sent' || r.member === HUMAN_ID)).toBe(true);
    expect(s.leaderOrder).toBeUndefined();
    expect(s.standing).toBe(before + 6);
    expect(target.owner).toBe(HUMAN_ID);
    expect(distance(home, target)).toBeLessThan(5);
  });

  it('an army of the tribe did not go: your planned train stays home, without blame', () => {
    const { s, ta, target, home } = setup();
    warOpsTick(s);
    const op = ta.ops![0]!;
    answerMessage(s, s.inbox!.find((m) => m.request?.type === 'order')!.id, true);
    planAttack(s, { from: home.id, to: target.id, first: { axe: 1000 }, escorts: [{ axe: 500 }, { axe: 500 }, { axe: 500 }], landAt: s.leaderOrder!.landAt! });
    for (const r of op.roles) if (r.kind === 'nuke') r.state = 'forgot';
    const before = s.standing ?? 60;
    run(s, op.landAt + 2 * 60 * 60_000);
    expect(home.units.snob).toBe(5);
    expect(s.leaderOrder).toBeUndefined();
    expect(s.standing ?? 60).toBe(before);
  });

  it('you can give your nobles to another candidate; he likes that', () => {
    const { s, ta, a2 } = setup();
    warOpsTick(s);
    const op = ta.ops![0]!;
    answerMessage(s, s.inbox!.find((m) => m.request?.type === 'order')!.id, true);
    villagesOf(s, a2.id)[0]!.units.snob = 4;
    const mood = a2.bot!.mood ?? 60;
    expect(giveNobles(s, op.id, a2.id)).toBeNull();
    expect(op.roles.find((r) => r.kind === 'nobles')?.member).toBe(a2.id);
    expect(s.leaderOrder).toBeUndefined();
    expect(a2.bot!.mood).toBe(mood + 3);
  });

  it('saying no passes the nobles to the next candidate', () => {
    const { s, ta, a2 } = setup();
    warOpsTick(s);
    const op = ta.ops![0]!;
    villagesOf(s, a2.id)[0]!.units.snob = 4;
    answerMessage(s, s.inbox!.find((m) => m.request?.type === 'order')!.id, false);
    expect(op.roles.find((r) => r.kind === 'nobles')?.member).toBe(a2.id);
  });

  it('an appeal costs standing; the leader decides; losing it means agree or leave as an outlaw', () => {
    const { s, ta, target, a2, home } = setup(0);
    const v2 = villagesOf(s, a2.id)[0]!;
    v2.units.snob = 4;
    warOpsTick(s);
    const op = ta.ops![0]!;
    expect(op.roles.find((r) => r.kind === 'nobles')?.member).toBe(a2.id);
    // now you have a train too, but far and not liked: you appeal and lose
    home.units.snob = 5;
    home.x = target.x + 12;
    v2.x = target.x - 2;
    s.standing = 10;
    a2.bot!.mood = 90;
    offerAppeal(s, ta, op, { member: a2.id, village: v2.id, d: distance(v2, target) }, { member: HUMAN_ID, village: home.id, d: distance(home, target) });
    const offer = s.inbox!.find((m) => m.request?.type === 'appeal')!;
    expect(answerMessage(s, offer.id, true)).toBeNull();
    expect(s.standing).toBe(5);
    expect(op.roles.find((r) => r.kind === 'nobles')?.member).toBe(a2.id);
    expect(answerAppeal(s, op.id, home.id, true)).toMatch(/al een beroep/);
    const verdict = s.inbox!.find((m) => m.request?.type === 'verdict')!;
    expect(answerMessage(s, verdict.id, false)).toBeNull();
    expect(ta.members).not.toContain(HUMAN_ID);
    expect(isOutlaw(s, HUMAN_ID)).toBe(true);
  });

  it('an appeal you win: close by and well liked, you bring the nobles', () => {
    const { s, ta, target, a2, home } = setup(0);
    const v2 = villagesOf(s, a2.id)[0]!;
    v2.units.snob = 4;
    warOpsTick(s);
    const op = ta.ops![0]!;
    home.units.snob = 5;
    s.standing = 100;
    a2.bot!.mood = 0;
    offerAppeal(s, ta, op, { member: a2.id, village: v2.id, d: distance(v2, target) }, { member: HUMAN_ID, village: home.id, d: distance(home, target) });
    answerMessage(s, s.inbox!.find((m) => m.request?.type === 'appeal')!.id, true);
    expect(op.roles.find((r) => r.kind === 'nobles')?.member).toBe(HUMAN_ID);
    expect(s.leaderOrder).toMatchObject({ nobles: true, op: op.id });
  });
});
