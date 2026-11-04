import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { txt } from '../shared/i18n';
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

describe('flag levels from the drop table', () => {
  it('the table: mostly level 1, each level up about three times rarer, never 9; a player conquest one higher', async () => {
    const { dropLevel, FLAG_DROP } = await import('../shared/flags');
    expect(FLAG_DROP.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(dropLevel(0)).toBe(1);
    expect(dropLevel(0.59)).toBe(1);
    expect(dropLevel(0.61)).toBe(2);
    expect(dropLevel(0.9999)).toBe(8);
    expect(dropLevel(0.59, 1)).toBe(2);
    const worth = FLAG_DROP.reduce((a, p, i) => a + p * 3 ** i, 0);
    expect(worth).toBeGreaterThan(5.5);
    expect(worth).toBeLessThan(6.2);
  });

  it('an old save: earned flags are drawn again once, only adding (and only once)', async () => {
    const { flagsTick } = await import('./flags');
    const s = createWorld(createConfig('classic', 'V', 9, { flags: true, bots: { count: 0 } } as never));
    const p = s.players[HUMAN_ID]!;
    p.flags = { have: { res: [200, 0, 0, 0, 0, 0, 0, 0, 0], recruit: [103, 0, 0, 0, 0, 0, 0, 0, 0], attack: Array(9).fill(0), defense: Array(9).fill(0), luck: Array(9).fill(0), pop: Array(9).fill(0), coin: Array(9).fill(0), haul: Array(9).fill(0) }, kills: 0 };
    s.worldStats = { days: [], conquests: [], players: { [HUMAN_ID]: { pvp: 0, barb: 0, took: 50, tookBarb: 0, lost: 0 } } };
    flagsTick(s);
    const worth = () => Object.values(p.flags!.have).reduce((a, l) => a + l.reduce((x, n, i) => x + n * 3 ** i, 0), 0);
    expect(p.flags!.have.res[0]).toBe(200); // kept
    const after = worth();
    expect(after).toBeGreaterThan(303 * 3); // ~5.8x on average, more for the 50 player conquests
    flagsTick(s);
    expect(worth()).toBe(after);
    expect(s.inbox?.some((m) => txt(m.title) === 'Vlaggen herzien')).toBe(true);
  });

  it('merging all keeps one flag for every village', async () => {
    const { mergeAll } = await import('./flags');
    const s = createWorld(createConfig('classic', 'V', 10, { flags: true, bots: { count: 0 } } as never));
    const p = s.players[HUMAN_ID]!;
    flagsTick(s);
    p.flags!.have.attack = [30, 0, 0, 0, 0, 0, 0, 0, 0];
    const count = () => Object.values(p.flags!.have).reduce((a, l) => a + l.reduce((x, n) => x + n, 0), 0);
    expect(mergeAll(s, p, 'attack')).toBeGreaterThan(0);
    expect(count()).toBeGreaterThanOrEqual(1);
    expect(p.flags!.have.attack.slice(0, 4)).toEqual([0, 1, 0, 1]); // 30 L1 → 10 L2 → 3 L3 (+1 L2) → 1 L4
  });
});
