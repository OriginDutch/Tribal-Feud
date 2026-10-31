import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY } from '../shared/time';
import { pop } from './eventQueue';
import { defenseOf } from './botStrategy';
import { onArrive, sendNobleTrain } from './movement';
import { createWorld, villagesOf, type WorldState } from './state';
import type { Tribe } from './tribes';
import { onOpLaunch, warOpsTick } from './warOps';

/** Runs only launches and arrivals (no bot turns muddling the picture) until `until`. */
function run(s: WorldState, until: number): void {
  for (;;) {
    const next = s.queue.heap.length ? s.queue.heap.reduce((a, b) => (a.time < b.time || (a.time === b.time && a.seq < b.seq) ? a : b)) : undefined;
    if (!next || next.time > until) break;
    const item = pop(s.queue)!;
    s.time = item.time;
    if (item.event.kind === 'opLaunch') onOpLaunch(s, item.event.tribe, item.event.op, item.event.role);
    else if (item.event.kind === 'arrive') onArrive(s, item.event.movementId);
  }
  s.time = until;
}

function setup() {
  const s = createWorld(createConfig('classic', 'W', 21, { bots: { count: 30 } }));
  s.time = 6 * DAY;
  const bots = s.players.filter((p) => p.isBot && villagesOf(s, p.id).length);
  const target = villagesOf(s, bots[0]!.id)[0]!;
  const near = (id: number) => { const v = villagesOf(s, id)[0]!; return Math.hypot(v.x - target.x, v.y - target.y); };
  const [a1, a2] = bots.slice(1).sort((x, y) => near(x.id) - near(y.id));
  const enemy = bots[0]!;
  for (const p of [a1!, a2!]) p.bot!.tier = 'pro';
  const ta: Tribe = { id: 9201, name: 'A', tag: 'A', color: '#fff', leader: a1!.id, members: [a1!.id, a2!.id], founded: 0, relations: { 9202: 'war' } };
  const tb: Tribe = { id: 9202, name: 'B', tag: 'B', color: '#000', leader: enemy.id, members: [enemy.id], founded: 0, relations: { 9201: 'war' } };
  s.tribes = { [ta.id]: ta, [tb.id]: tb };
  a1!.tribe = ta.id; a2!.tribe = ta.id; enemy.tribe = tb.id;
  // a defended village behind a wall 20: one army is not enough, two together are
  target.units.spear = 2500; target.units.sword = 2500;
  target.buildings.wall = 20;
  for (const p of [a1!, a2!]) {
    const v = villagesOf(s, p.id)[0]!;
    v.buildings.place = Math.max(1, v.buildings.place);
    v.units.axe = 4000; v.units.light = 1300; v.units.ram = 250;
  }
  const nobleV = villagesOf(s, a1!.id)[0]!;
  nobleV.units.snob = 4;
  
  // the tribe scouted the target just now
  a1!.bot!.scouted = { [target.id]: { at: s.time, def: defenseOf(s, target.units, 20), owner: enemy.id } };
  return { s, ta, target, enemy, a1: a1!, a2: a2! };
}

describe('joint operations', () => {
  it('a tribe at war plans an op on a scouted front village, lands the armies together and takes it', () => {
    const { s, ta, target, a1 } = setup();
    warOpsTick(s);
    const op = ta.ops?.[0];
    expect(op).toBeDefined();
    expect(op!.target).toBe(target.id);
    expect(op!.roles.filter((r) => r.kind === 'nuke').length).toBeGreaterThanOrEqual(2);
    expect(op!.roles.some((r) => r.kind === 'nobles')).toBe(true);
    run(s, op!.landAt + 60 * 60_000);
    expect(op!.roles.every((r) => r.state === 'sent')).toBe(true);
    expect(target.owner).toBe(a1.id);
  });

  it('a noble train whose last nobles land in a village already ours just moves in', () => {
    const { s, target, a1 } = setup();
    target.units.spear = 0; target.units.sword = 0; target.buildings.wall = 0;
    target.loyalty = 10; target.loyaltyAt = s.time;
    const home = villagesOf(s, a1.id)[0]!;
    const axesBefore = home.units.axe;
    expect(sendNobleTrain(s, home.id, target.id, { axe: 1000 }, [{ axe: 100 }, { axe: 100 }, { axe: 100 }], undefined, true)).toBeNull();
    run(s, s.time + 2 * DAY);
    expect(target.owner).toBe(a1.id);
    // nobody died fighting their own garrison: all axes that went are still there or home
    const there = Object.values(target.support ?? {}).reduce((n, u) => n + (u.axe ?? 0), 0) + target.units.axe;
    expect(home.units.axe + there).toBeGreaterThanOrEqual(axesBefore - 50);
  });
});

describe('the front you choose as leader', () => {
  it('only a tribe you are at war with, only its villages', async () => {
    const { setFront, warFrontView } = await import('./warOps');
    const { HUMAN_ID } = await import('./state');
    const { s, ta, target, a1 } = setup();
    s.players[HUMAN_ID]!.tribe = ta.id;
    ta.members.push(HUMAN_ID);
    expect(setFront(s, 9202)).toMatch(/leider/);
    ta.leader = HUMAN_ID;
    expect(setFront(s, 12345)).toMatch(/niet in oorlog/);
    expect(setFront(s, 9202, villagesOf(s, a1.id)[0]!.id)).toMatch(/niet van/);
    expect(setFront(s, 9202, target.id)).toBeNull();
    expect(ta.front).toEqual({ enemy: 9202, target: target.id });
    warOpsTick(s);
    const view = warFrontView(s)!;
    expect(view.front?.target?.id).toBe(target.id);
    expect(view.ops[0]?.target.id).toBe(target.id);
    expect(setFront(s, null)).toBeNull();
    expect(ta.front).toBeUndefined();
  });
});

describe('joint operations with you', () => {
  it('your army counts: you get the order, your bots bring the nobles behind it, and you share your scouts', async () => {
    const { HUMAN_ID, playerVillage } = await import('./state');
    const { sendAttack, distance, travelTimeMs } = await import('./movement');
    const { humanOpSent } = await import('./warOps');
    const { s, ta, target, a1, a2 } = setup();
    // the bots' own armies are gone: only your army can break the target
    for (const p of [a1, a2]) { const v = villagesOf(s, p.id)[0]!; v.units.axe = 0; v.units.light = 0; v.units.ram = 0; }
    // spears and swords to escort the nobles past what is left of the wall (no army of their own)
    Object.assign(villagesOf(s, a1.id)[0]!.units, { spear: 3000, sword: 1500 });
    const home = playerVillage(s)!;
    home.x = target.x + 3; home.y = target.y;
    home.buildings.place = Math.max(1, home.buildings.place);
    home.units.axe = 20000; home.units.ram = 300;
    ta.members.push(HUMAN_ID);
    s.players[HUMAN_ID]!.tribe = ta.id;
    warOpsTick(s);
    const op = ta.ops?.[0];
    expect(op).toBeDefined();
    expect(op!.human).toBe(true);
    expect(op!.roles.some((r) => r.member === HUMAN_ID && r.kind === 'nuke')).toBe(true);
    expect(op!.roles.some((r) => r.kind === 'nobles' && r.member === a1.id)).toBe(true);
    const order = s.inbox!.at(-1)!;
    expect(order.request).toMatchObject({ type: 'order', order: 'attack', village: target.id, arrives: op!.landAt });
    // you send so it lands with the others
    const army = { axe: 20000, ram: 300 };
    run(s, op!.landAt - travelTimeMs(s, army, distance(home, target)));
    expect(sendAttack(s, home.id, target.id, army)).toBeNull();
    humanOpSent(s, target.id);
    expect(op!.roles.find((r) => r.member === HUMAN_ID)!.state).toBe('sent');
    run(s, op!.landAt + 60 * 60_000);
    expect(target.owner).toBe(a1.id);
  });

  it('no bot role, no joint attack: your army alone is a plain order', async () => {
    const { HUMAN_ID, playerVillage } = await import('./state');
    const { s, ta, target, a1, a2 } = setup();
    for (const p of [a1, a2]) { const v = villagesOf(s, p.id)[0]!; v.units.axe = 0; v.units.light = 0; v.units.ram = 0; v.units.snob = 0; }
    const home = playerVillage(s)!;
    home.x = target.x + 3; home.y = target.y;
    home.units.axe = 20000;
    ta.members.push(HUMAN_ID);
    s.players[HUMAN_ID]!.tribe = ta.id;
    warOpsTick(s);
    expect(ta.ops ?? []).toHaveLength(0);
  });
});

describe('scouting the front', () => {
  it('scouts that died there: the next group is more than double, from the member with the most spies', async () => {
    const { SCOUTS_DIED } = await import('./botStrategy');
    const { s, ta, target, a1, a2, enemy } = setup();
    a1.bot!.scouted = { [target.id]: { at: s.time, def: SCOUTS_DIED, owner: enemy.id, spies: 10 } };
    target.units.spy = 15;
    const v1 = villagesOf(s, a1.id)[0]!, v2 = villagesOf(s, a2.id)[0]!;
    v1.units.spy = 12; // not enough (needs 20)
    v2.units.spy = 30;
    warOpsTick(s);
    expect(ta.ops ?? []).toHaveLength(0);
    const out = Object.values(s.movements).filter((m) => m.to === target.id && m.kind === 'attack');
    expect(out).toHaveLength(1);
    expect(out[0]!.from).toBe(v2.id);
    expect(out[0]!.units.spy).toBe(30);
    // they get through (30 > 15) and the tribe knows what stands there
    run(s, out[0]!.arrives + 1);
    expect(a2.bot!.scouted?.[target.id]?.def).toBeLessThan(SCOUTS_DIED);
  });

  it('you have the most spies: you are the tribe\'s scout and get the order; your scouts count for it and for the plan', async () => {
    const { SCOUTS_DIED } = await import('./botStrategy');
    const { HUMAN_ID, playerVillage } = await import('./state');
    const { sendAttack } = await import('./movement');
    const { answerMessage } = await import('./humanTribe');
    const { s, ta, target, a1, enemy } = setup();
    a1.bot!.scouted = { [target.id]: { at: s.time, def: SCOUTS_DIED, owner: enemy.id, spies: 10 } };
    target.units.spy = 15;
    const home = playerVillage(s)!;
    home.x = target.x + 4; home.y = target.y;
    home.buildings.place = Math.max(1, home.buildings.place);
    home.units.spy = 100;
    ta.members.push(HUMAN_ID);
    s.players[HUMAN_ID]!.tribe = ta.id;
    warOpsTick(s);
    const order = s.inbox!.at(-1)!;
    expect(order.request).toMatchObject({ type: 'order', order: 'scout', village: target.id });
    expect(answerMessage(s, order.id, true)).toBeNull();
    expect(sendAttack(s, home.id, target.id, { spy: 100 })).toBeNull();
    const m = Object.values(s.movements).find((x) => x.owner === HUMAN_ID && x.to === target.id)!;
    run(s, m.arrives + 1);
    expect(s.leaderOrder).toBeUndefined();
    expect(s.standing).toBe(66);
    // what you saw went to your leader
    expect(a1.bot!.scouted?.[target.id]?.def).toBeLessThan(SCOUTS_DIED);
  });

  it('dead scouts are remembered with how many went, so the next group knows what it needs', async () => {
    const { SCOUTS_DIED, scout, spiesNeeded } = await import('./botStrategy');
    const { s, target, a1 } = setup();
    target.units.spy = 15;
    const v1 = villagesOf(s, a1.id)[0]!;
    v1.units.spy = 5;
    expect(scout(s, v1, target)).toBe(true);
    const m = Object.values(s.movements).find((x) => x.owner === a1.id && x.to === target.id)!;
    run(s, m.arrives + 1);
    const sc = a1.bot!.scouted?.[target.id];
    expect(sc).toMatchObject({ def: SCOUTS_DIED, spies: 5 });
    expect(spiesNeeded(sc)).toBe(10);
    // too few now: it waits instead of throwing more away
    v1.units.spy = 8;
    expect(scout(s, v1, target)).toBe(false);
  });
});
