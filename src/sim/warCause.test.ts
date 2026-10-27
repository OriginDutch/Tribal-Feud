import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY } from '../shared/time';
import { createWorld, villagesOf } from './state';
import { onDiplomacy, type Tribe } from './tribes';
import { addFriction, outclassed, WAR_FRICTION } from './warCause';

function setup() {
  const s = createWorld(createConfig('classic', 'W', 12, { bots: { count: 30 } }));
  s.time = 3 * DAY;
  const bots = s.players.filter((p) => p.isBot && villagesOf(s, p.id).length);
  const a = bots[0]!;
  const home = villagesOf(s, a.id)[0]!;
  const b = bots.slice(1).sort((x, y) => {
    const d = (id: number) => { const v = villagesOf(s, id)[0]!; return Math.hypot(v.x - home.x, v.y - home.y); };
    return d(x.id) - d(y.id);
  })[0]!;
  a.bot!.archetype = 'rusher';
  b.bot!.archetype = 'turtle';
  const ta: Tribe = { id: 9101, name: 'A', tag: 'A', color: '#fff', leader: a.id, members: [a.id], founded: 0, relations: {} };
  const tb: Tribe = { id: 9102, name: 'B', tag: 'B', color: '#000', leader: b.id, members: [b.id], founded: 0, relations: {} };
  s.tribes = { [ta.id]: ta, [tb.id]: tb };
  a.tribe = ta.id; b.tribe = tb.id;
  // A clearly stronger
  villagesOf(s, a.id)[0]!.units.axe = 3000;
  villagesOf(s, b.id)[0]!.units.spear = 200;
  return { s, a, b, ta, tb };
}

const ticks = (s: ReturnType<typeof setup>['s'], n: number) => { for (let i = 0; i < n; i++) onDiplomacy(s); };

describe('war needs a cause', () => {
  it('no friction: no war, even for a much stronger aggressive neighbour', () => {
    const { s, ta, tb } = setup();
    ta.friction = {}; tb.friction = {};
    ticks(s, 30);
    expect(ta.relations[tb.id]).not.toBe('war');
  });

  it('attacks and conquests build friction, and then the stronger side declares war', () => {
    const { s, a, b, ta, tb } = setup();
    for (let i = 0; i < 4; i++) addFriction(s, b.id, a.id, WAR_FRICTION / 2);
    ticks(s, 10);
    expect(ta.relations[tb.id]).toBe('war');
  });

  it('the weaker side does not start a war it would lose', () => {
    const { s, a, b, ta, tb } = setup();
    villagesOf(s, a.id)[0]!.units.axe = 0;
    villagesOf(s, b.id)[0]!.units.axe = 3000;
    b.bot!.archetype = 'turtle';
    a.bot!.archetype = 'rusher';
    // friction just above what a war needs, but not a bitter rivalry
    addFriction(s, a.id, b.id, WAR_FRICTION * 1.1);
    for (let i = 0; i < 3; i++) onDiplomacy(s);
    // if anyone declared, it was the strong turtle, never the weak rusher
    expect((s.tribeNews ?? []).some((n) => n.text.includes('[A] verklaart'))).toBe(false);
  });

  it('a small bot is outclassed by someone with more offensive villages than it has villages', () => {
    const { s, a, b } = setup();
    for (const v of villagesOf(s, a.id)) v.units.axe = 1000;
    expect(outclassed(s, b.id, a.id)).toBe(true);
    expect(outclassed(s, a.id, b.id)).toBe(false);
  });
});
