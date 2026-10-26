import { describe, expect, it } from 'vitest';
import { createConfig, type ConfigOverrides } from '../shared/config';
import { DAY, HOUR, MINUTE } from '../shared/time';
import { coinsForSlots, mintCoins, noblesAllowed, slotCost, slotsForCoins, slotsUsed } from './nobles';
import { distance, loyaltyNow, returnSupport, sendAttack, sendNobleTrain, sendSupport } from './movement';
import { advance, setPaused } from './simulation';
import { BARBARIAN, HUMAN_ID, createWorld, invalidateOwners, playerVillage, villagesOf, type WorldState } from './state';
import { recruit, type Village } from './village';
import { fromSaveData, toSaveData } from './save';

function world(overrides: ConfigOverrides = {}) {
  const s = createWorld(createConfig('classic', 'Edel', 21, { luck: false, bots: { count: 2 }, ...overrides }));
  setPaused(s, false);
  const v = playerVillage(s);
  if (!v) throw new Error('no village');
  return { s, v };
}

function rich(v: Village, levels: Partial<Village['buildings']> = {}): void {
  Object.assign(v.buildings, { storage: 30, farm: 30, main: 20, smith: 20, market: 10, snob: 1, barracks: 25, stable: 20 }, levels);
  v.res = [400000, 400000, 400000];
}

function run(s: WorldState, ms: number): void {
  for (let left = ms; left > 0; left -= 10 * MINUTE) {
    const r = advance(s, Math.min(left, 10 * MINUTE));
    if (r.autoPaused) setPaused(s, false);
  }
}

const nearestBarb = (s: WorldState, v: Village) =>
  Object.values(s.villages)
    .filter((x) => x.owner === BARBARIAN)
    .sort((a, b) => distance(a, v) - distance(b, v))[0] as Village;

describe('coins and noble slots', () => {
  it('slot n costs n coins (classic and early tiered)', () => {
    for (const c of ['classic', 'tiered'] as const) {
      expect([1, 2, 3, 4].map((n) => coinsForSlots(n, c))).toEqual([1, 3, 6, 10]);
      expect([0, 1, 2, 3, 5, 6].map((n) => slotsForCoins(n, c))).toEqual([0, 1, 1, 2, 2, 3]);
    }
  });

  it('tiered: at most 25 per slot below 200, then 25 more per hundred', () => {
    expect([25, 26, 199, 200, 299, 300, 450].map((n) => slotCost(n))).toEqual([25, 25, 25, 50, 50, 75, 100]);
    // brute force agrees with the closed form
    let sum = 0;
    for (let n = 1; n <= 700; n++) {
      sum += slotCost(n);
      expect(coinsForSlots(n)).toBe(sum);
      expect(slotsForCoins(sum)).toBe(n);
      expect(slotsForCoins(sum - 1)).toBe(n - 1);
    }
    // Marcel's world: 772 coins, 36 slots used -> 42 slots
    expect(slotsForCoins(772)).toBe(42);
    expect(coinsForSlots(37)).toBe(325 + 12 * 25);
  });

  it('mints coins for the player and limits noblemen by slots', () => {
    const { s, v } = world();
    rich(v);
    expect(noblesAllowed(s, v)).toBe(0);
    expect(mintCoins(s, v.id, 3)).toBeNull();
    expect(s.players[HUMAN_ID]?.coins).toBe(3);
    expect(v.res).toEqual([400000 - 3 * 28000, 400000 - 3 * 30000, 400000 - 3 * 25000]);
    expect(noblesAllowed(s, v)).toBe(2);
    expect(recruit(s, v.id, 'snob', 3)).toBe('Maximaal 2 mogelijk');
    expect(recruit(s, v.id, 'snob', 2)).toBeNull();
    expect(slotsUsed(s, HUMAN_ID)).toBe(2);
    expect(noblesAllowed(s, v)).toBe(0);
  });

  it('packages are stored in the village and used up', () => {
    const { s, v } = world({ nobleCost: 'packages' });
    rich(v);
    expect(mintCoins(s, v.id, 3)).toBeNull();
    expect(v.packages).toBe(3);
    // first noble costs 1, second 2
    expect(noblesAllowed(s, v)).toBe(2);
    expect(recruit(s, v.id, 'snob', 1)).toBeNull();
    expect(v.packages).toBe(2);
    expect(noblesAllowed(s, v)).toBe(1);
  });
});

describe('conquest', () => {
  it('noblemen lower loyalty; at 0 the village is yours, at 25 loyalty, bonus kept', () => {
    const { s, v } = world();
    rich(v);
    const target = nearestBarb(s, v);
    target.bonus = 'wood';
    target.units.spear = 0;
    v.units.axe = 5000;
    v.units.light = 1000;
    v.units.snob = 6;
    let attacks = 0;
    while (target.owner !== HUMAN_ID && attacks < 6) {
      expect(sendAttack(s, v.id, target.id, { axe: 500, light: 50, snob: 1 })).toBeNull();
      run(s, 3 * HOUR);
      attacks++;
      const r = s.reports.at(-1);
      expect(r?.loyalty).toBeDefined();
    }
    expect(target.owner).toBe(HUMAN_ID);
    expect(attacks).toBeGreaterThanOrEqual(3);
    expect(attacks).toBeLessThanOrEqual(5);
    expect(target.loyalty).toBe(25);
    expect(target.bonus).toBe('wood');
    expect(target.growth).toBeUndefined();
    expect(s.reports.at(-1)?.conquered).toBe(true);
    // the escort stays in the conquered village as support from the home village
    expect(target.support?.[v.id]?.axe).toBe(500);
    expect(villagesOf(s, HUMAN_ID)).toHaveLength(2);
    // loyalty comes back: +1 per hour
    expect(Math.floor(loyaltyNow(s.config, target, (target.loyaltyAt ?? 0) + 10 * HOUR))).toBe(35);
    expect(Math.floor(loyaltyNow(s.config, target, s.time + 200 * HOUR))).toBe(100);
  });

  it('a noble train arrives together, in order, and takes a village in one go on a fast world', () => {
    const { s, v } = world({ worldSpeed: 20 });
    rich(v);
    const target = nearestBarb(s, v);
    v.units.axe = 2000;
    v.units.snob = 5;
    const escort = { axe: 60 };
    expect(sendNobleTrain(s, v.id, target.id, { axe: 500 }, [escort, escort, escort, escort])).toBeNull();
    const arrivals = Object.values(s.movements).filter((m) => m.to === target.id).map((m) => m.arrives);
    expect(new Set(arrivals).size).toBe(1);
    run(s, 2 * HOUR);
    expect(target.owner).toBe(HUMAN_ID);
    // one nobleman used up, the others come home
    run(s, 2 * HOUR);
    expect(v.units.snob + v.outside.snob).toBe(4);
  });

  it('a noble train is all or nothing', () => {
    const { s, v } = world();
    rich(v);
    const target = nearestBarb(s, v);
    v.units.axe = 100;
    v.units.snob = 3;
    expect(sendNobleTrain(s, v.id, target.id, { axe: 80 }, [{ axe: 20 }, { axe: 20 }])).toContain('Niet genoeg bijlstrijder');
    expect(Object.keys(s.movements)).toHaveLength(0);
    expect(v.units.snob).toBe(3);
  });

  it('noblemen have a maximum distance', () => {
    const { s, v } = world({ conquest: { maxDistance: 2 } });
    rich(v);
    v.units.snob = 1;
    v.units.axe = 100;
    const far = Object.values(s.villages).find((x) => x.owner === BARBARIAN && distance(x, v) > 5);
    if (!far) throw new Error('no far barb');
    expect(sendAttack(s, v.id, far.id, { axe: 100, snob: 1 })).toBe('Een edelman loopt maximaal 2 velden.');
  });

  it('losing a village: alert, defense report, and its troops outside are gone', () => {
    const { s, v } = world({ unitSpeed: 50, conquest: { protectionDays: 0 } });
    const bot = s.players.find((p) => p.isBot);
    const botVillage = bot ? villagesOf(s, bot.id)[0] : undefined;
    if (!bot || !botVillage) throw new Error('no bot');
    // give the human a second village, and send its troops away
    const second = nearestBarb(s, v);
    second.owner = HUMAN_ID;
    delete second.growth;
    invalidateOwners(s);
    rich(second, { place: 1 });
    second.units.spear = 10;
    expect(sendSupport(s, second.id, v.id, { spear: 10 })).toBeNull();
    // the bot nobles it 5 times in one go
    rich(botVillage);
    botVillage.units.axe = 10000;
    botVillage.units.snob = 5;
    for (let i = 0; i < 5; i++) expect(sendAttack(s, botVillage.id, second.id, { axe: 1000, snob: 1 })).toBeNull();
    // incoming attack raises an alert
    expect(s.alert?.text).toContain('Inkomende aanval');
    const pausedAt: string[] = [];
    for (let left = 6 * HOUR; left > 0; left -= 10 * MINUTE) {
      const r = advance(s, 10 * MINUTE);
      if (r.autoPaused) {
        pausedAt.push(r.autoPaused.text);
        setPaused(s, false);
      }
    }
    expect(second.owner).toBe(bot.id);
    expect(pausedAt.some((t) => t.includes('veroverd'))).toBe(true);
    expect(s.reports.some((r) => r.defense && r.conquered)).toBe(true);
    // the spears supporting the first village came from the lost village: gone
    expect(v.support?.[second.id]).toBeUndefined();
    expect(Object.values(s.movements).some((m) => m.from === second.id && m.owner === HUMAN_ID)).toBe(false);
  });

  it('losing the last village starts you over at the edge', () => {
    const { s, v } = world({ unitSpeed: 50, conquest: { protectionDays: 0 } });
    const bot = s.players.find((p) => p.isBot);
    const botVillage = bot ? villagesOf(s, bot.id)[0] : undefined;
    if (!bot || !botVillage) throw new Error('no bot');
    rich(botVillage);
    botVillage.units.axe = 10000;
    botVillage.units.snob = 5;
    for (let i = 0; i < 5; i++) sendAttack(s, botVillage.id, v.id, { axe: 1000, snob: 1 });
    run(s, 10 * HOUR);
    expect(v.owner).toBe(bot.id);
    const mine = villagesOf(s, HUMAN_ID);
    expect(mine).toHaveLength(1);
    expect(playerVillage(s)?.id).toBe(mine[0]?.id);
  });
});

describe('support', () => {
  it('support fights along, shares the losses, and can be withdrawn', () => {
    const { s, v } = world({ unitSpeed: 50, conquest: { protectionDays: 0 } });
    const bot = s.players.find((p) => p.isBot);
    const botVillage = bot ? villagesOf(s, bot.id)[0] : undefined;
    if (!bot || !botVillage) throw new Error('no bot');
    // human supports the bot village
    rich(v);
    v.units.spear = 1000;
    expect(sendSupport(s, v.id, botVillage.id, { spear: 1000 })).toBeNull();
    run(s, 5 * HOUR);
    expect(botVillage.support?.[v.id]?.spear).toBe(1000);
    expect(v.outside.spear).toBe(1000);
    botVillage.units.spear = 1000;
    // someone attacks the bot village: human gets a report about his support
    const attacker = nearestBarb(s, botVillage);
    attacker.owner = s.players.find((p) => p.isBot && p.id !== bot.id)?.id ?? 99;
    invalidateOwners(s);
    attacker.buildings.place = 1;
    attacker.units.axe = 400;
    expect(sendAttack(s, attacker.id, botVillage.id, { axe: 400 })).toBeNull();
    run(s, 10 * HOUR);
    const report = s.reports.find((r) => r.defense && r.supportUnits);
    expect(report?.supportUnits?.present.spear).toBe(1000);
    // losses are shared in proportion to what everyone had there
    const totalPresent = report?.defenderUnits?.present.spear ?? 0;
    const totalLost = report?.defenderUnits?.lost.spear ?? 0;
    const lostSupport = report?.supportUnits?.lost.spear ?? 0;
    expect(totalLost).toBeGreaterThan(0);
    expect(Math.abs(lostSupport - (1000 * totalLost) / totalPresent)).toBeLessThanOrEqual(1);
    expect(botVillage.support?.[v.id]?.spear ?? 0).toBe(1000 - lostSupport);
    expect(v.outside.spear).toBe(1000 - lostSupport);
    // withdraw
    expect(returnSupport(s, HUMAN_ID, botVillage.id, v.id)).toBeNull();
    run(s, 5 * HOUR);
    expect(v.units.spear).toBe(1000 - lostSupport);
    expect(v.outside.spear).toBe(0);
  });
});

describe('beginner protection', () => {
  it('players cannot attack each other for 3 days / world speed', () => {
    const { s, v } = world({ worldSpeed: 2 });
    const bot = s.players.find((p) => p.isBot);
    const target = bot ? villagesOf(s, bot.id)[0] : undefined;
    if (!target) throw new Error('no bot');
    v.units.axe = 10;
    expect(sendAttack(s, v.id, target.id, { axe: 10 })).toContain('Beginnersbescherming');
    s.time = 1.5 * DAY;
    expect(sendAttack(s, v.id, target.id, { axe: 10 })).toBeNull();
  });
});

describe('saves', () => {
  it('a world with conquest data survives a save', () => {
    const { s, v } = world();
    rich(v);
    mintCoins(s, v.id, 1);
    const loaded = fromSaveData(JSON.parse(JSON.stringify(toSaveData(s, 0))));
    expect(loaded.players[HUMAN_ID]?.coins).toBe(1);
  });
});
