import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { HOUR } from '../shared/time';
import { fight } from './combat';
import { advance, setPaused } from './simulation';
import { createWorld, playerVillage } from './state';
import { researchBlocker, researchCost, startResearch, techLevel, techMultiplier } from './village';

describe('research levels', () => {
  it('three levels: x4 cost per level, stronger units, smithy requirement', () => {
    const s = createWorld(createConfig('classic', 'R', 3, { research: 'levels3', bots: { count: 0 } } as never));
    setPaused(s, false);
    const v = playerVillage(s)!;
    Object.assign(v.buildings, { main: 20, smith: 10, barracks: 10, storage: 25, farm: 20 });
    v.res = [200000, 200000, 200000];
    v.resAt = s.time;
    expect(techLevel(s.config, v, 'spear')).toBe(1);
    const c1 = researchCost(s.config, 'axe', 1), c2 = researchCost(s.config, 'axe', 2);
    expect(c2[0]).toBe(c1[0] * 4);
    expect(startResearch(s, v.id, 'spear')).toBeNull();
    for (let i = 0; i < 48 && v.research; i++) advance(s, HOUR);
    expect(techLevel(s.config, v, 'spear')).toBe(2);
    expect(researchBlocker(s, v, 'spear')).toBe('Vereist: Smederij 15');
    expect(techMultiplier(s.config, 2)).toBe(1.25);
    expect(techMultiplier(s.config, 3)).toBe(1.4);
  });

  it('a unit bonus makes the same army stronger', () => {
    const c = createConfig('classic', 'R', 3, { research: 'levels3' } as never);
    const base = fight(c, { attacker: { axe: 1000 }, defender: { spear: 1500 }, wall: 0, morale: 1, luck: 0 });
    const strong = fight(c, { attacker: { axe: 1000 }, defender: { spear: 1500 }, wall: 0, morale: 1, luck: 0, attackerUnitBonus: { axe: 1.4 } });
    expect(strong.attackStrength).toBeCloseTo(base.attackStrength * 1.4);
  });
});
