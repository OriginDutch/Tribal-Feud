import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { bigEnough } from './botStrategy';
import { villageRole } from './bots';
import { createWorld, invalidateOwners, villagesOf } from './state';
import { createVillage, popMax } from './village';

describe('bot armies', () => {
  it('bot villages specialise: the first stays mixed, the rest offensive or defensive by kind', () => {
    const s = createWorld(createConfig('classic', 'Leger', 4, { bots: { count: 20 }, map: { barbarianCount: 200 } } as never));
    const p = s.players.find((x) => x.bot)!;
    p.bot!.archetype = 'rusher';
    const first = villagesOf(s, p.id)[0]!;
    for (let i = 1; i <= 30; i++) s.villages[800000 + i] = createVillage(s.config, 800000 + i, p.id, `v${i}`, first.x + i, first.y + 40, 0);
    invalidateOwners(s);
    expect(villageRole(s, p, first)).toBe('mixed');
    const roles = villagesOf(s, p.id).filter((v) => v.id !== first.id).map((v) => villageRole(s, p, v));
    const off = roles.filter((r) => r === 'off').length;
    expect(off / roles.length).toBeGreaterThan(0.5); // a rusher: mostly offensive
    expect(roles.includes('def')).toBe(true);
  });

  it('no handfuls: only an army that fills half the farm attacks a player', () => {
    const s = createWorld(createConfig('classic', 'Leger', 4, { bots: { count: 5 } } as never));
    const v = Object.values(s.villages).find((x) => x.owner > 0)!;
    v.buildings.farm = 20;
    const room = popMax(s.config, v);
    expect(bigEnough(s, v, { axe: Math.floor(room * 0.2) })).toBe(false);
    expect(bigEnough(s, v, { axe: Math.ceil(room * 0.5) })).toBe(true);
  });
});
