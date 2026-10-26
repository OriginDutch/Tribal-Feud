import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY, MINUTE } from '../shared/time';
import { sendAttack } from './movement';
import { fromSaveData, toSaveData } from './save';
import { advance, setPaused } from './simulation';
import { createWorld, villagesOf, type WorldState } from './state';
import { MAX_MEMBERS, fits, mayAttack, onDiplomacy, type Tribe } from './tribes';

function run(s: WorldState, ms: number): void {
  setPaused(s, false);
  for (let left = ms; left > 0; left -= 30 * MINUTE) {
    const r = advance(s, Math.min(left, 30 * MINUTE));
    if (r.autoPaused) setPaused(s, false);
  }
}

/** A world with bots and a hand-made tribe around the first bot. */
function setup() {
  const s = createWorld(createConfig('classic', 'T', 11, { bots: { count: 30 } }));
  const bots = s.players.filter((p) => p.isBot && villagesOf(s, p.id).length);
  const lead = bots[0]!;
  const t: Tribe = { id: 9001, name: 'Test', tag: 'TST', color: '#fff', leader: lead.id, members: [lead.id], founded: 0, relations: {} };
  s.tribes = { [t.id]: t };
  lead.tribe = t.id;
  const home = villagesOf(s, lead.id)[0]!;
  const byDist = bots.slice(1).sort((a, b) => {
    const d = (id: number) => { const v = villagesOf(s, id)[0]!; return Math.hypot(v.x - home.x, v.y - home.y); };
    return d(a.id) - d(b.id);
  });
  return { s, t, lead, home, byDist };
}

describe('tribes', () => {
  it('members, allies and NAP partners do not attack each other; enemies and loners do', () => {
    const { s, t, lead, byDist } = setup();
    const mate = byDist[0]!, other = byDist[1]!, loner = byDist[2]!;
    t.members.push(mate.id); mate.tribe = t.id;
    const o: Tribe = { id: 9002, name: 'O', tag: 'O', color: '#000', leader: other.id, members: [other.id], founded: 0, relations: { [t.id]: 'nap' } };
    t.relations[o.id] = 'nap';
    s.tribes![o.id] = o; other.tribe = o.id;
    expect(mayAttack(s, lead.id, mate.id)).toBe(false);
    expect(mayAttack(s, lead.id, other.id)).toBe(false);
    expect(mayAttack(s, lead.id, loner.id)).toBe(true);
    t.relations[o.id] = 'war'; o.relations[t.id] = 'war';
    expect(mayAttack(s, lead.id, other.id)).toBe(true);
  });

  it('accepts a neighbour, refuses one far away and a full tribe', () => {
    const { s, t, byDist } = setup();
    expect(fits(s, t, byDist[0]!.id)).toBe(true);
    expect(fits(s, t, byDist[byDist.length - 1]!.id)).toBe(false);
    t.members = Array.from({ length: MAX_MEMBERS }, (_, i) => t.members[0]! + i * 0);
    expect(fits(s, t, byDist[0]!.id)).toBe(false);
  });

  it('refuses a candidate behind an enemy tribe', () => {
    const { s, t, home, byDist } = setup();
    const cand = byDist.find((p) => { const v = villagesOf(s, p.id)[0]!; return Math.hypot(v.x - home.x, v.y - home.y) > 6; })!;
    expect(fits(s, t, cand.id)).toBe(true);
    // put an enemy halfway between
    const cv = villagesOf(s, cand.id)[0]!;
    const enemy = byDist.find((p) => p.id !== cand.id)!;
    const ev = villagesOf(s, enemy.id)[0]!;
    ev.x = Math.round((cv.x + home.x) / 2); ev.y = Math.round((cv.y + home.y) / 2);
    const e: Tribe = { id: 9003, name: 'E', tag: 'E', color: '#000', leader: enemy.id, members: [enemy.id], founded: 0, relations: { [t.id]: 'war' } };
    t.relations[e.id] = 'war';
    s.tribes![e.id] = e; enemy.tribe = e.id;
    expect(fits(s, t, cand.id)).toBe(false);
  });

  it('refuses a much weaker village in the middle of its own ground (prey)', () => {
    const { s, t, lead, home, byDist } = setup();
    const weak = byDist[0]!;
    const wv = villagesOf(s, weak.id)[0]!;
    wv.x = home.x + 2; wv.y = home.y + 1;
    const lv = villagesOf(s, lead.id)[0]!;
    Object.assign(lv.buildings, { main: 20, barracks: 15, farm: 20, storage: 20, wood: 20, stone: 20, iron: 20, wall: 15 });
    expect(fits(s, t, weak.id)).toBe(false);
  });

  it('bots form tribes over time, no tribe is over the limit, members live close together', () => {
    const s = createWorld(createConfig('classic', 'T', 7, { bots: { count: 40 } }));
    run(s, 6 * DAY);
    const list = Object.values(s.tribes ?? {});
    expect(list.length).toBeGreaterThan(2);
    for (const t of list) {
      expect(t.members.length).toBeLessThanOrEqual(MAX_MEMBERS);
      for (const m of t.members) expect(s.players[m]!.tribe).toBe(t.id);
      // relations are symmetric
      for (const [o, r] of Object.entries(t.relations)) expect(s.tribes![Number(o)]!.relations[t.id]).toBe(r);
    }
    expect(s.players.filter((p) => p.tribe !== undefined).length).toBeGreaterThan(10);
  });

  it('an old save without tribes starts the diplomacy layer', () => {
    const s = createWorld(createConfig('classic', 'T', 3, { bots: { count: 10 } }));
    const data = JSON.parse(JSON.stringify(toSaveData(s, 0))) as { version: number; state: WorldState };
    delete data.state.tribes;
    data.state.queue.heap = data.state.queue.heap.filter((i) => (i.event as { kind: string }).kind !== 'diplomacy');
    data.version = 11;
    const back = fromSaveData(data);
    expect(back.tribes).toEqual({});
    expect(back.queue.heap.some((i) => (i.event as { kind: string }).kind === 'diplomacy')).toBe(true);
    onDiplomacy(back);
  });

  it('a tribe mate sends support to a member under a real attack', () => {
    const s = createWorld(createConfig('classic', 'T', 11, { bots: { count: 30 }, unitSpeed: 1, conquest: { protectionDays: 0 } }));
    const bots = s.players.filter((p) => p.isBot && villagesOf(s, p.id).length);
    const a = bots[0]!, home = villagesOf(s, a.id)[0]!;
    const near = bots.slice(1).sort((x, y) => { const d = (id: number) => { const v = villagesOf(s, id)[0]!; return Math.hypot(v.x - home.x, v.y - home.y); }; return d(x.id) - d(y.id); });
    const mate = near[0]!, foe = near[near.length - 1]!;
    s.tribes = { 1: { id: 1, name: 'T', tag: 'T', color: '#fff', leader: a.id, members: [a.id, mate.id], founded: 0, relations: {} } };
    a.tribe = 1; mate.tribe = 1; a.bot!.archetype = 'supporter'; a.bot!.activity = 1;
    // the victim must see the attack itself: a pro, always online
    for (const p of [a, mate]) { p.bot!.tier = 'pro'; delete p.bot!.presence; }
    home.units.spear = 400; home.buildings.place = 1;
    const fv = villagesOf(s, foe.id)[0]!; fv.units.axe = 500; fv.buildings.place = 1;
    const target = villagesOf(s, mate.id)[0]!;
    const err = sendAttack(s, fv.id, target.id, { axe: 500 }); expect(err).toBeNull();
    setPaused(s, false);
    let sent = false;
    for (let i = 0; i < 24 && !sent; i++) { advance(s, 30 * MINUTE); setPaused(s, false); sent = Object.values(s.movements).some((m) => m.kind === 'support' && m.owner === a.id && m.to === target.id); }
    expect(sent).toBe(true);
  });
});
