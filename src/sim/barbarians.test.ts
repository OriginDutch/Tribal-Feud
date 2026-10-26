import { describe, expect, it } from 'vitest';
import { BARB_TYPES } from '../shared/barbarianTypes';
import { createConfig, type ConfigOverrides } from '../shared/config';
import { DAY, HOUR } from '../shared/time';
import { growBarbarian, onBarbarianDamaged, seedBarbarian, villagePoints } from './barbarians';
import { buildBlocker, popMax, popUsed } from './village';
import { abandonAndRestart, onBotTurn } from './bots';
import { estimateLoot, farmCUnits } from './intel';
import { distance, sendAttack } from './movement';
import { SAVE_VERSION, fromSaveData, toSaveData } from './save';
import { advance, setPaused } from './simulation';
import { BARBARIAN, createWorld, playerVillage, villagesOf, type WorldState } from './state';
import { currentResources, productionRates, type Village } from './village';
import { storageCapacity } from './formulas';

function world(overrides: ConfigOverrides = {}) {
  return createWorld(createConfig('classic', 'Barb', 5, { luck: false, bots: { count: 0 }, ...overrides }));
}

const barbs = (s: WorldState) => Object.values(s.villages).filter((v) => v.owner === BARBARIAN);

function run(s: WorldState, ms: number): void {
  setPaused(s, false);
  let left = ms;
  while (left > 0) {
    const step = Math.min(left, HOUR);
    advance(s, step);
    left -= step;
  }
}

describe('barbarian types', () => {
  it('every barbarian has a type, spread by the configured shares; ~3% has a bonus', () => {
    const s = world();
    const all = barbs(s);
    const count = Object.fromEntries(BARB_TYPES.map((t) => [t, 0]));
    for (const v of all) count[v.barbType ?? 'none'] = (count[v.barbType ?? 'none'] ?? 0) + 1;
    expect(count.none).toBeUndefined();
    for (const t of BARB_TYPES) {
      const share = (count[t] ?? 0) / all.length;
      expect(Math.abs(share - s.config.barbarians.types[t].share)).toBeLessThan(0.04);
    }
    const bonus = all.filter((v) => v.bonus).length / all.length;
    expect(bonus).toBeGreaterThan(0.015);
    expect(bonus).toBeLessThan(0.05);
  });

  it('grows ~100 points per game day up to the cap, respecting the wall rules per type', () => {
    const s = world();
    const all = barbs(s);
    const sample = all.slice(0, 400);
    const start = new Map(sample.map((v) => [v.id, villagePoints(s.config, v)]));
    for (const v of sample) growBarbarian(s, v, 10 * DAY);
    for (const v of sample) {
      const grown = villagePoints(s.config, v) - (start.get(v.id) ?? 0);
      expect(grown).toBeGreaterThanOrEqual(1000 - 1);
      expect(grown).toBeLessThan(1300); // at most one level past the target
    }
    for (const v of all) growBarbarian(s, v, 60 * DAY);
    for (const v of all) {
      const type = s.config.barbarians.types[v.barbType ?? 'balanced'];
      expect(villagePoints(s.config, v)).toBeGreaterThanOrEqual(2950);
      expect(villagePoints(s.config, v)).toBeLessThan(3400); // cap + at most one level
      expect(v.buildings.wall).toBeLessThanOrEqual(type.maxWall);
      expect(v.buildings.hide).toBe(0);
    }
    const defensive = all.filter((v) => v.barbType === 'defensive');
    expect(Math.max(...defensive.map((v) => v.buildings.wall))).toBeGreaterThan(8);
  });

  it('grows faster with a higher build speed', () => {
    const s = world({ buildSpeed: 20 });
    const v = barbs(s)[0];
    if (!v) throw new Error('no barb');
    const start = villagePoints(s.config, v);
    growBarbarian(s, v, DAY / 4);
    // 100/day x 20 = 500 points in 6 hours
    expect(villagePoints(s.config, v) - start).toBeGreaterThanOrEqual(499);
  });

  it('only defensive barbarians have a wall below 1000 points', () => {
    const s = world();
    for (const v of barbs(s)) {
      if (v.barbType !== 'defensive') expect(v.buildings.wall).toBe(0);
    }
    expect(barbs(s).some((v) => v.barbType === 'defensive' && v.buildings.wall > 0)).toBe(true);
  });

  it('a broken wall is rebuilt at the repair speed per type, and lost points are not regrown at once', () => {
    const s = world();
    const expected = { defensive: 2, military: 1, resource: 0.5, balanced: 0.5 } as const;
    for (const type of ['defensive', 'military', 'resource', 'balanced'] as const) {
      const v = barbs(s).find((x) => x.barbType === type);
      if (!v) throw new Error(`no ${type}`);
      growBarbarian(s, v, 30 * DAY);
      const peak = v.buildings.wall;
      expect(peak).toBeGreaterThan(0);
      const points = villagePoints(s.config, v);
      // rams take the wall to 0
      v.buildings.wall = 0;
      onBarbarianDamaged(s.config, v, 30 * DAY, points, peak);
      growBarbarian(s, v, 30 * DAY + HOUR);
      expect(v.buildings.wall).toBe(0);
      // a big wall (defensive) is worth enough points that nothing is regrown in an hour
      if (type === 'defensive') expect(villagePoints(s.config, v)).toBeLessThan(points);
      growBarbarian(s, v, 32 * DAY);
      expect(v.buildings.wall).toBe(Math.min(peak, Math.floor(2 * expected[type])));
      growBarbarian(s, v, 80 * DAY);
      expect(v.buildings.wall).toBe(peak);
      expect(v.growth?.wallRepair).toBeUndefined();
    }
  });

  it('growth is the same whether caught up at once or in steps', () => {
    const a = world();
    const b = world();
    const va = barbs(a).slice(0, 50);
    const vb = barbs(b).slice(0, 50);
    for (const v of va) growBarbarian(a, v, 20 * DAY);
    for (let t = DAY; t <= 20 * DAY; t += DAY / 3) for (const v of vb) growBarbarian(b, v, t);
    expect(va.map((v) => v.buildings)).toEqual(vb.map((v) => v.buildings));
  });

  it('starts with a stock of a few hours of production, within storage; bonus raises production', () => {
    const s = world();
    for (const v of barbs(s)) {
      const rates = productionRates(s.config, v);
      const cap = storageCapacity(v.buildings.storage);
      for (const i of [0, 1, 2] as const) {
        expect(v.res[i]).toBe(Math.min(cap, Math.round(rates[i] * s.config.barbarians.startStockHours)));
      }
    }
    const bonusWood = barbs(s).find((v) => v.bonus === 'wood');
    expect(bonusWood).toBeDefined();
    if (bonusWood) {
      const rates = productionRates(s.config, bonusWood);
      const plain = productionRates(s.config, { ...bonusWood, bonus: undefined } as Village);
      expect(rates[0]).toBeCloseTo(plain[0] * 2);
      expect(rates[1]).toBeCloseTo(plain[1]);
    }
  });

  it('old worlds keep the old level-based growth without types', () => {
    const s = world();
    const data = toSaveData(s, 0) as unknown as { version: number; state: Record<string, unknown> };
    data.version = 6;
    const st = data.state as unknown as WorldState;
    const cfg = st.config.barbarians as unknown as Record<string, unknown>;
    for (const k of ['growthMode', 'pointsPerDay', 'types', 'bonusShare', 'startStockHours']) delete cfg[k];
    for (const v of Object.values(st.villages)) {
      delete v.barbType;
      delete v.bonus;
    }
    delete (st as unknown as Record<string, unknown>).intel;
    const loaded = fromSaveData(data);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(7);
    expect(loaded.config.barbarians.growthMode).toBe('levels');
    expect(loaded.intel).toEqual({});
    const v = barbs(loaded)[0];
    if (!v) throw new Error('no barb');
    const before = villagePoints(loaded.config, v);
    growBarbarian(loaded, v, 3 * HOUR);
    // one level in 3 hours, the old rule
    expect(villagePoints(loaded.config, v)).toBeGreaterThan(before);
    expect(v.barbType).toBeUndefined();
  });
});

describe('intel and template C', () => {
  it('a scout reveals the type and the wall; template C sends LC for the estimated loot', () => {
    const s = world();
    const home = playerVillage(s);
    if (!home) throw new Error('no village');
    home.units.spy = 5;
    home.units.light = 100;
    const target = barbs(s).sort((a, b) => distance(a, home) - distance(b, home))[0];
    if (!target) throw new Error('no barb');
    expect(farmCUnits(s, home.id, target.id)).toBe('Template C heeft een verkenning van dit dorp nodig.');

    expect(sendAttack(s, home.id, target.id, { spy: 1 })).toBeNull();
    run(s, 3 * HOUR);
    const report = s.reports.at(-1);
    expect(report?.scouted?.barbType).toBe(target.barbType);
    expect(report?.wall?.after).toBe(target.buildings.wall);
    expect(s.intel[target.id]?.type).toBe(target.barbType);

    const estimate = estimateLoot(s, target.id);
    expect(estimate).toBeDefined();
    const actual = currentResources(s.config, target, s.time).reduce((a, b) => a + Math.floor(b), 0);
    // levels may have grown since the scout, so the estimate is at most a bit low
    expect(estimate).toBeLessThanOrEqual(actual + 3);
    expect(estimate).toBeGreaterThan(actual * 0.7);
    const units = farmCUnits(s, home.id, target.id);
    expect(units).toEqual({ light: Math.min(100, Math.ceil((estimate ?? 0) / 80)) });
  });
});

describe('abandoned bots', () => {
  it('a stalled bot gives its village to the barbarians and restarts at the edge', () => {
    const s = createWorld(createConfig('classic', 'Quit', 7, { bots: { tiers: { pro: 1, mid: 0 }, count: 5 } }));
    const bot = s.players.find((p) => p.isBot);
    if (!bot?.bot) throw new Error('no bot');
    const [oldVillage] = villagesOf(s, bot.id);
    if (!oldVillage) throw new Error('no village');
    const maxR = Math.max(...Object.values(s.villages).map((v) => Math.hypot(v.x - 500, v.y - 500)));

    // pretend it hasn't grown for a long time
    bot.bot.peak = { points: 1e9, at: -100 * DAY };
    s.time = 0;
    bot.bot.nextTurn = 0;
    onBotTurn(s, bot.id);

    expect(oldVillage.owner).toBe(BARBARIAN);
    expect(oldVillage.name).toBe('Barbarendorp');
    expect(oldVillage.barbType).toBeDefined();
    expect(oldVillage.growth?.start).toBe(villagePoints(s.config, oldVillage));
    const fresh = villagesOf(s, bot.id);
    expect(fresh).toHaveLength(1);
    const r = Math.hypot((fresh[0]?.x ?? 0) - 500, (fresh[0]?.y ?? 0) - 500);
    expect(r).toBeGreaterThan(maxR);
    expect(r).toBeLessThan(maxR + 6);
    expect(s.log.at(-1)?.text).toContain('Begint opnieuw aan de rand');
  });

  it('works for a bot with troops on the road', () => {
    const s = createWorld(createConfig('classic', 'Quit', 8, { bots: { count: 3 } }));
    run(s, 2 * DAY);
    const bot = s.players.find((p) => p.isBot);
    if (!bot) throw new Error('no bot');
    abandonAndRestart(s, bot);
    expect(Object.values(s.movements).some((m) => m.owner === bot.id)).toBe(false);
    run(s, DAY); // nothing breaks afterwards
    expect(villagesOf(s, bot.id).length).toBe(1);
  });
});

describe('barbarian farms', () => {
  it('a grown barbarian has room on its farm for its buildings', () => {
    const s = createWorld(createConfig('classic', 'Boer', 9));
    const barbs = Object.values(s.villages).filter((v) => v.owner === BARBARIAN).slice(0, 40);
    for (const v of barbs) {
      seedBarbarian(s.config, v, 4000);
      expect(popUsed(s.config, v)).toBeLessThanOrEqual(popMax(v));
    }
  });

  it('farm and storage can be built even when a village is over its farm', () => {
    const s = createWorld(createConfig('classic', 'Boer', 9));
    const v = Object.values(s.villages).find((x) => x.owner === BARBARIAN);
    if (!v) throw new Error('no barb');
    Object.assign(v.buildings, { farm: 9, wood: 27, stone: 29, iron: 30, main: 7, storage: 18 });
    v.res = [100000, 100000, 100000];
    v.resAt = s.time;
    expect(popUsed(s.config, v)).toBeGreaterThan(popMax(v));
    expect(buildBlocker(s, v, 'farm')).toBeNull();
    expect(buildBlocker(s, v, 'storage')).toBeNull();
    expect(buildBlocker(s, v, 'main')).toBe('Boerderij is vol');
  });
});
