import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { allianceTick, creditAllyAttack, trustIn } from './alliances';
import { createWorld, villagesOf } from './state';
import { setRelation, type Tribe } from './tribes';

function setup() {
  const s = createWorld(createConfig('classic', 'Ally', 3, { bots: { count: 30 } } as never));
  const bots = s.players.filter((p) => p.bot && villagesOf(s, p.id).length);
  const mk = (id: number, tag: string, member: number): Tribe => ({ id, name: tag, tag, color: '#fff', leader: member, members: [member], founded: 0, relations: {} });
  const a = mk(1, 'A', bots[0]!.id), b = mk(2, 'B', bots[1]!.id), e = mk(3, 'E', bots[2]!.id);
  s.tribes = { 1: a, 2: b, 3: e };
  bots[0]!.tribe = 1; bots[1]!.tribe = 2; bots[2]!.tribe = 3;
  setRelation(s, a, b, 'ally');
  setRelation(s, a, e, 'war');
  const news: string[] = [];
  const hooks = (joins = false) => ({
    strength: () => 1000,
    social: () => (joins ? 100 : 0),
    declareWar: (by: Tribe, on: Tribe, reason: string) => { setRelation(s, by, on, 'war'); news.push(reason); },
    setRelation: (x: Tribe, y: Tribe, r: 'nap' | null) => setRelation(s, x, y, r, true),
    news: (_a: Tribe, _b: Tribe, t: string) => news.push(t),
  });
  return { s, a, b, e, bots, news, hooks };
}

describe('allies', () => {
  it('an ally that never helps in your war loses your trust: the alliance cools to a NAP, then ends', () => {
    const { s, a, b, hooks, news } = setup();
    let ticks = 0;
    while (a.relations[b.id] === 'ally' && ticks++ < 100) allianceTick(s, a, b, hooks());
    expect(a.relations[b.id]).toBe('nap');
    expect(ticks).toBeGreaterThan(10); // not at the first sign
    while (a.relations[b.id] === 'nap' && ticks++ < 200) allianceTick(s, a, b, hooks());
    expect(a.relations[b.id]).toBeUndefined();
    expect(news.some((n) => n.includes('NAP'))).toBe(true);
  });

  it('an ally that fights your enemy keeps your trust', () => {
    const { s, a, b, bots, hooks } = setup();
    for (let i = 0; i < 60; i++) {
      creditAllyAttack(s, bots[1]!.id, bots[2]!.id);
      creditAllyAttack(s, bots[1]!.id, bots[2]!.id);
      creditAllyAttack(s, bots[1]!.id, bots[2]!.id);
      allianceTick(s, a, b, hooks());
    }
    expect(a.relations[b.id]).toBe('ally');
    expect(trustIn(a, b.id)).toBeGreaterThan(50);
  });

  it('a social bot ally comes to help: it joins the war', () => {
    const { s, a, b, e, hooks, news } = setup();
    for (let i = 0; i < 20 && b.relations[e.id] !== 'war'; i++) allianceTick(s, a, b, hooks(true));
    expect(b.relations[e.id]).toBe('war');
    expect(news.some((n) => n.includes('bij te staan'))).toBe(true);
  });
});
