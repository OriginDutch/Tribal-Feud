import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { battleBonus } from './battleBonus';
import { flagsTick, freeFlags, setFlag, upgradeFlag } from './flags';
import { coinCostIn } from './nobles';
import { BARBARIAN, HUMAN_ID, createWorld, playerVillage } from './state';
import { popMax, productionRates } from './village';

describe('flags', () => {
  it('start flags, upgrading three into one, one flag per village with its effect', () => {
    const s = createWorld(createConfig('classic', 'V', 8, { flags: true, bots: { count: 0 } } as never));
    const v = playerVillage(s)!;
    const p = s.players[HUMAN_ID]!;
    flagsTick(s);
    expect(Object.values(p.flags!.have).reduce((a, l) => a + l[0]!, 0)).toBe(3);
    p.flags!.have.res = [3, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(upgradeFlag(s, HUMAN_ID, 'res', 1)).toBeNull();
    expect(freeFlags(s, p, 'res', 2)).toBe(1);
    const before = productionRates(s.config, v)[0];
    expect(setFlag(s, HUMAN_ID, v.id, { type: 'res', level: 2 })).toBeNull();
    expect(productionRates(s.config, v)[0]).toBeCloseTo(before * 1.06);
    expect(freeFlags(s, p, 'res', 2)).toBe(0);
    expect(setFlag(s, HUMAN_ID, v.id, { type: 'attack', level: 5 })).toMatch(/niet/);
    // attack, defense, coins, population
    p.flags!.have.attack[0] = 1; p.flags!.have.coin[0] = 1; p.flags!.have.pop[0] = 1;
    setFlag(s, HUMAN_ID, v.id, { type: 'attack', level: 1 });
    const target = Object.values(s.villages).find((x) => x.owner === BARBARIAN)!;
    expect(battleBonus(s, v, target, { axe: 10 }).attackerFactor).toBeCloseTo(1.02);
    setFlag(s, HUMAN_ID, v.id, { type: 'coin', level: 1 });
    expect(coinCostIn(s, v)[0]).toBe(Math.round(28000 * 0.94));
    const cap = popMax(s.config, v);
    setFlag(s, HUMAN_ID, v.id, { type: 'pop', level: 1 });
    expect(popMax(s.config, v)).toBe(Math.round(cap * 1.02));
  });
});
