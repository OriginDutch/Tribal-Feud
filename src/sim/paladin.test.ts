import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY } from '../shared/time';
import { battleBonus } from './battleBonus';
import { fight } from './combat';
import { equipItem, itemsTick } from './paladin';
import { BARBARIAN, HUMAN_ID, createWorld, playerVillage } from './state';

function world() {
  const s = createWorld(createConfig('classic', 'P', 4, { paladin: 'items', worldSpeed: 10, bots: { count: 0 } } as never));
  const v = playerVillage(s)!;
  v.buildings.statue = 1;
  return { s, v };
}

describe('paladin items', () => {
  it('the weapon chamber fills over time and finds items', () => {
    const { s } = world();
    itemsTick(s);
    s.time += 4 * DAY; // 3% x speed 10 x 4 days = 120%
    itemsTick(s);
    const it = s.players[HUMAN_ID]!.items!;
    expect(it.found.length).toBe(1);
    expect(it.progress).toBeCloseTo(0.2, 5);
    expect(equipItem(s, HUMAN_ID, it.found[0]!)).toBeNull();
    expect(equipItem(s, HUMAN_ID, it.found[0] === 'scepter' ? 'bonfire' : 'scepter')).toMatch(/niet/);
  });

  it('an equipped item works with the paladin in the attack', () => {
    const { s, v } = world();
    s.players[HUMAN_ID]!.items = { found: ['battleaxe', 'morningstar'], equipped: 'battleaxe', progress: 0, at: 0 };
    const target = Object.values(s.villages).find((x) => x.owner === BARBARIAN)!;
    expect(battleBonus(s, v, target, { axe: 100 }).attackerUnitBonus?.axe).toBeUndefined();
    expect(battleBonus(s, v, target, { axe: 100, knight: 1 }).attackerUnitBonus?.axe).toBeCloseTo(1.4);
    equipItem(s, HUMAN_ID, 'morningstar');
    expect(battleBonus(s, v, target, { ram: 50, knight: 1 }).ramFactor).toBe(2);
    const base = fight(s.config, { attacker: { axe: 2000, ram: 40 }, defender: {}, wall: 20, morale: 1, luck: 0 });
    const doubled = fight(s.config, { attacker: { axe: 2000, ram: 40 }, defender: {}, wall: 20, morale: 1, luck: 0, ramFactor: 2 });
    expect(doubled.wallAfter).toBeLessThan(base.wallAfter);
  });

  it('a defending paladin strengthens the units of its type in that village', () => {
    const { s, v } = world();
    s.players[HUMAN_ID]!.items = { found: ['halberd'], equipped: 'halberd', progress: 0, at: 0 };
    const other = Object.values(s.villages).find((x) => x.owner === BARBARIAN)!;
    v.units.knight = 1;
    expect(battleBonus(s, other, v, { axe: 10 }).defenderUnitBonus?.spear).toBeCloseTo(1.2);
    v.units.knight = 0;
    expect(battleBonus(s, other, v, { axe: 10 }).defenderUnitBonus?.spear).toBeUndefined();
  });
});
