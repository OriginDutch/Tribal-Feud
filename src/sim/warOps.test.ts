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
