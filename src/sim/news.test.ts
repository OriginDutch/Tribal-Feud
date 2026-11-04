import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY } from '../shared/time';
import { conquer } from './movement';
import { NEWS_KEPT, addNews } from './news';
import { createWorld, villagesOf } from './state';
import { declareWar, onDiplomacy, setRelation, type Tribe } from './tribes';
import { addFriction, WAR_FRICTION } from './warCause';
import { txt } from '../shared/i18n';

function setup() {
  const s = createWorld(createConfig('classic', 'N', 12, { worldSpeed: 1, bots: { count: 30 } }));
  s.time = 3 * DAY;
  const bots = s.players.filter((p) => p.isBot && villagesOf(s, p.id).length);
  const a = bots[0]!, b = bots[1]!;
  const ta: Tribe = { id: 9101, name: 'A', tag: 'A', color: '#fff', leader: a.id, members: [a.id], founded: 0, relations: {} };
  const tb: Tribe = { id: 9102, name: 'B', tag: 'B', color: '#000', leader: b.id, members: [b.id], founded: 0, relations: {} };
  s.tribes = { [ta.id]: ta, [tb.id]: tb };
  a.tribe = ta.id; b.tribe = tb.id;
  return { s, a, b, ta, tb };
}

describe('world news', () => {
  it('a war says why: conquests weigh more than the border', () => {
    const { s, a, b, ta, tb } = setup();
    addFriction(s, a.id, b.id, WAR_FRICTION, 'conquest');
    addFriction(s, a.id, b.id, 1, 'border');
    declareWar(s, ta, tb);
    const n = s.news!.at(-1)!;
    expect(n.kind).toBe('war');
    expect(txt(n.dry)).toBe('[A] verklaart [B] de oorlog (na veroverde dorpen).');
    expect(n.tribes).toEqual([ta.id, tb.id]);
    expect(n.x).toBeTypeOf('number');
  });

  it('treaties make news, a quiet change does not, and peace ends a war', () => {
    const { s, ta, tb } = setup();
    setRelation(s, ta, tb, 'nap');
    setRelation(s, ta, tb, 'ally');
    setRelation(s, ta, tb, null);
    setRelation(s, ta, tb, 'nap', true);
    expect(s.news!.map((n) => n.kind)).toEqual(['nap', 'ally', 'allyEnd']);
    setRelation(s, ta, tb, 'war');
    setRelation(s, ta, tb, null);
    expect(s.news!.at(-1)!.kind).toBe('peace');
  });

  it('news never touches the game rng and keeps the last 2000', () => {
    const { s } = setup();
    const rng = JSON.stringify(s.rng);
    for (let i = 0; i < NEWS_KEPT + 50; i++) addNews(s, { kind: 'tribeNew', dry: `x${i}`, head: ['a', 'b', 'c'] });
    expect(JSON.stringify(s.rng)).toBe(rng);
    expect(s.news!.length).toBe(NEWS_KEPT);
    expect(s.news![0]!.dry).toBe('x50');
    expect(new Set(s.news!.map((n) => n.head)).size).toBeGreaterThan(1);
  });

  it('taking the last village of a player wipes him off the map', () => {
    const { s, a, b } = setup();
    for (const v of villagesOf(s, b.id).slice(1)) v.owner = -1;
    const last = villagesOf(s, b.id)[0]!;
    conquer(s, last, a.id);
    const n = s.news!.at(-1)!;
    expect(n.kind).toBe('wiped');
    expect(n.players).toEqual([b.id, a.id]);
    expect([n.x, n.y]).toEqual([last.x, last.y]);
  });

  it('the diplomacy tick keeps the top-10 and reports a new biggest tribe', () => {
    const { s, ta, tb } = setup();
    onDiplomacy(s);
    expect(s.newsTop?.players.length).toBe(10);
    const top = s.newsTop!.tribe!;
    // pretend another tribe was on top last time
    s.newsTop!.tribe = top === ta.id ? tb.id : ta.id;
    onDiplomacy(s);
    const n = s.news!.filter((x) => x.kind === 'ranking').at(-1)!;
    expect(txt(n.dry)).toContain('is nu de grootste stam');
  });
});
