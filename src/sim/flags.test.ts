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
  it('the table: generous, every level about half as likely as the one below, never 9; a player conquest one higher', async () => {
    const { dropLevel, FLAG_DROP } = await import('../shared/flags');
    expect(FLAG_DROP.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(dropLevel(0)).toBe(1);
    expect(dropLevel(0.29)).toBe(1);
    expect(dropLevel(0.31)).toBe(2);
    expect(dropLevel(0.9999)).toBe(8);
    expect(dropLevel(0.29, 1)).toBe(2);
    const worth = FLAG_DROP.reduce((a, p, i) => a + p * 3 ** i, 0);
    expect(worth).toBeGreaterThan(35);
    expect(worth).toBeLessThan(42);
  });

  it('new rules: the whole stock, hung flags included, is drawn again once; villages keep their kind', async () => {
    const s = createWorld(createConfig('classic', 'V', 9, { flags: true, bots: { count: 0 } } as never));
    const p = s.players[HUMAN_ID]!;
    const v = playerVillage(s)!;
    const none = () => Array(9).fill(0);
    // version 1, worth 3 + 10 player conquests × 17.6 + 20 kill flags × 5.84 ≈ 296
    p.flags = { have: { res: [296, 0, 0, 0, 0, 0, 0, 0, 0], recruit: none(), attack: none(), defense: none(), luck: none(), pop: none(), coin: none(), haul: none() }, kills: 0, drops: 1 };
    v.flag = { type: 'res', level: 1 };
    s.worldStats = { days: [], conquests: [], players: { [HUMAN_ID]: { pvp: 0, barb: 0, took: 10, tookBarb: 0, lost: 0 } } };
    flagsTick(s);
    const count = Object.values(p.flags!.have).reduce((a, l) => a + l.reduce((x, n) => x + n, 0), 0);
    expect(count).toBe(3 + 10 + 60); // 20 kill flags at 1,500 are 60 at 500
    expect(p.flags!.drops).toBe(2);
    expect(v.flag?.type).toBe('res'); // the kind it had, now the best drawn
    expect(v.flag!.level).toBe(Math.max(...p.flags!.have.res.map((n, i) => (n ? i + 1 : 0))));
    const again = JSON.stringify(p.flags!.have);
    flagsTick(s);
    expect(JSON.stringify(p.flags!.have)).toBe(again);
    expect(s.inbox?.some((m) => txt(m.title) === 'Vlaggen opnieuw getrokken')).toBe(true);
  });

  it('melting: three of a level, any kind, make one of the chosen kind', async () => {
    const { meltAll } = await import('./flags');
    const s = createWorld(createConfig('classic', 'V', 11, { flags: true, bots: { count: 0 } } as never));
    const p = s.players[HUMAN_ID]!;
    flagsTick(s);
    for (const t of Object.keys(p.flags!.have) as (keyof NonNullable<typeof p.flags>["have"])[]) p.flags!.have[t] = Array(9).fill(0);
    p.flags!.have.luck = [0, 0, 0, 0, 2, 0, 0, 0, 0];
    p.flags!.have.haul = [0, 0, 0, 0, 2, 0, 0, 0, 0];
    p.flags!.have.attack = [4, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(meltAll(s, p, 'recruit')).toBe(2);
    expect(p.flags!.have.recruit[4]).toBe(1);
    expect(p.flags!.have.recruit[0]).toBe(1);
    expect(p.flags!.have.attack[0]).toBe(1);
  });

  it('hanging by itself: every village the chosen kind, the best first; the own kind upgrades', async () => {
    const { autoHang } = await import('./flags');
    const s = createWorld(createConfig('classic', 'V', 12, { flags: true, bots: { count: 0 } } as never));
    const p = s.players[HUMAN_ID]!;
    const v = playerVillage(s)!;
    flagsTick(s);
    for (const t of Object.keys(p.flags!.have) as (keyof NonNullable<typeof p.flags>["have"])[]) p.flags!.have[t] = Array(9).fill(0);
    p.flags!.have.attack = [0, 1, 0, 0, 0, 0, 0, 0, 0];
    p.flags!.have.recruit = [1, 0, 0, 1, 0, 0, 0, 0, 0];
    v.flag = { type: 'attack', level: 2 };
    p.flags!.hang = 'keep';
    expect(autoHang(s, p)).toBe(0); // no better attack flag
    p.flags!.have.attack[5] = 1;
    autoHang(s, p);
    expect(v.flag).toEqual({ type: 'attack', level: 6 });
    p.flags!.hang = 'recruit';
    autoHang(s, p);
    expect(v.flag).toEqual({ type: 'recruit', level: 4 });
  });

  it('kills from one battle: one message with every flag in it', async () => {
    const { flagKills } = await import('./flags');
    const s = createWorld(createConfig('classic', 'V', 13, { flags: true, bots: { count: 0 } } as never));
    flagsTick(s);
    const before = s.inbox?.length ?? 0;
    flagKills(s, HUMAN_ID, 2600);
    expect((s.inbox?.length ?? 0) - before).toBe(1);
    expect(s.players[HUMAN_ID]!.flags!.kills).toBe(100);
    expect(txt(s.inbox!.at(-1)!.text)).toMatch(/^Voor 2[.,]500 verslagen vijanden:\n1?\d× L/);
  });

  it('kill flags under the old rule count three times now', async () => {
    const s = createWorld(createConfig('classic', 'V', 9, { flags: true, bots: { count: 0 } } as never));
    const p = s.players[HUMAN_ID]!;
    const none = () => Array(9).fill(0);
    // 1,003 level-1 flags from before any table: 3 to start, 1,000 earned with kills
    p.flags = { have: { res: [1003, 0, 0, 0, 0, 0, 0, 0, 0], recruit: none(), attack: none(), defense: none(), luck: none(), pop: none(), coin: none(), haul: none() }, kills: 0 };
    flagsTick(s);
    const count = Object.values(p.flags!.have).reduce((a, l) => a + l.reduce((x, n) => x + n, 0), 0);
    expect(count).toBe(3 + 3000);
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

  it('merging fills up to L5 first and then pushes the top', async () => {
    const { mergeAll } = await import('./flags');
    const s = createWorld(createConfig('classic', 'V', 10, { flags: true, bots: { count: 0 } } as never));
    const p = s.players[HUMAN_ID]!;
    flagsTick(s);
    for (const t of Object.keys(p.flags!.have) as (keyof NonNullable<typeof p.flags>["have"])[]) p.flags!.have[t] = Array(9).fill(0);
    // one village: 9 L1 and 3 L8; low first alone would spend the room on the L1s
    p.flags!.have.attack = [9, 0, 0, 0, 0, 0, 0, 3, 0];
    mergeAll(s, p, 'attack');
    expect(p.flags!.have.attack[8]).toBe(1);
  });
});
