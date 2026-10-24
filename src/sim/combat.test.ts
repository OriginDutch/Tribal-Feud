import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { fight, morale } from './combat';

const config = createConfig('classic', 'x', 1);
const base = { wall: 0, morale: 1, luck: 0 };

describe('battle', () => {
  it('an empty village still has base defense 20', () => {
    // 1 spear attacks with 10: loses against base defense 20
    const r = fight(config, { ...base, attacker: { spear: 1 }, defender: {} });
    expect(r.attackerWon).toBe(false);
    expect(r.attackerLost.spear).toBe(1);
    // 3 spears (30) win
    const r2 = fight(config, { ...base, attacker: { spear: 3 }, defender: {} });
    expect(r2.attackerWon).toBe(true);
  });

  it('winner loses (loser/winner)^1.5 of its troops, loser loses everything', () => {
    // 100 axes = 4000 attack vs 50 spears (15 general def each = 750) + base 20 = 770
    const r = fight(config, { ...base, attacker: { axe: 100 }, defender: { spear: 50 } });
    expect(r.attackerWon).toBe(true);
    expect(r.defenderLost.spear).toBe(50);
    expect(r.attackerLost.axe).toBe(Math.round(100 * (770 / 4000) ** 1.5));
  });

  it('defense is weighted by the attacking unit classes', () => {
    // spears defend 45 vs cavalry: 100 light (13000) vs 200 spears (9000+20) -> win
    const cav = fight(config, { ...base, attacker: { light: 100 }, defender: { spear: 200 } });
    expect(cav.defenseStrength).toBeCloseTo(200 * 45 + 20);
    const inf = fight(config, { ...base, attacker: { axe: 100 }, defender: { spear: 200 } });
    expect(inf.defenseStrength).toBeCloseTo(200 * 15 + 20);
  });

  it('the wall multiplies defense and adds base defense', () => {
    const r = fight(config, { ...base, wall: 10, attacker: { axe: 10 }, defender: { sword: 10 } });
    expect(r.defenseStrength).toBeCloseTo((10 * 50 + 20 + 50 * 10) * 1.037 ** 10);
  });

  it('rams lower the wall before the battle (at most half) and break it after a win', () => {
    const r = fight(config, { ...base, wall: 20, attacker: { axe: 6000, ram: 300 }, defender: { sword: 100 } });
    expect(r.wallEffective).toBe(10);
    expect(r.attackerWon).toBe(true);
    expect(r.wallAfter).toBeLessThan(20);
    const few = fight(config, { ...base, wall: 20, attacker: { axe: 6000, ram: 1 }, defender: {} });
    expect(few.wallAfter).toBe(20);
  });

  it('catapults damage the target, but HQ, farm and storage stay at least level 1', () => {
    const r = fight(config, { ...base, wall: 0, attacker: { axe: 1000, catapult: 500 }, defender: {}, catapultTarget: 'main', targetLevel: 10 });
    expect(r.buildingAfter).toBe(1);
    const b = fight(config, { ...base, wall: 0, attacker: { axe: 1000, catapult: 500 }, defender: {}, catapultTarget: 'barracks', targetLevel: 10 });
    expect(b.buildingAfter).toBe(0);
  });

  it('luck and morale scale the attack', () => {
    const lucky = fight(config, { ...base, luck: 0.25, attacker: { axe: 10 }, defender: {} });
    expect(lucky.attackStrength).toBeCloseTo(400 * 1.25);
    const low = fight(config, { ...base, morale: 0.5, attacker: { axe: 10 }, defender: {} });
    expect(low.attackStrength).toBeCloseTo(200);
  });

  it('spies fight spies; survivors get through', () => {
    const r = fight(config, { ...base, attacker: { spy: 5 }, defender: { spy: 1, spear: 100 } });
    expect(r.spiesSurvived).toBeGreaterThan(0);
    expect(r.defenderLost.spear).toBeUndefined();
    const blocked = fight(config, { ...base, attacker: { spy: 2 }, defender: { spy: 5 } });
    expect(blocked.spiesSurvived).toBe(0);
  });
});

describe('morale', () => {
  it('follows 3 x defender/attacker + 0.3, between 30% and 100%', () => {
    expect(morale(config, 1000, 1000, false)).toBe(1);
    expect(morale(config, 10000, 1000, false)).toBeCloseTo(0.6);
    expect(morale(config, 100000, 10, false)).toBeCloseTo(0.3, 3);
    expect(morale(config, 100000, 0, false)).toBe(0.3);
    expect(morale(config, 100000, 10, true)).toBe(1);
  });
});
