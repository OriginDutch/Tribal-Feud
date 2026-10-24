import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import {
  buildTimeMs,
  buildingCost,
  buildingPoints,
  buildingPopTotal,
  farmCapacity,
  hidingCapacity,
  productionPerHour,
  recruitTimeMs,
  storageCapacity,
} from './formulas';

const config = createConfig('classic', 'x', 1);
const B = config.buildings;

// Expected values are copied from the official Tribal Wars tables (see design doc sources).
describe('formulas match the official TW tables', () => {
  it('building costs', () => {
    expect(buildingCost(B.wood, 2)).toEqual([63, 77, 50]);
    expect(buildingCost(B.wood, 30)).toEqual([32312, 68857, 23013]);
    expect(buildingCost(B.main, 10)).toEqual([720, 712, 560]);
    expect(buildingCost(B.main, 30)).toEqual([73280, 91809, 56996]);
    expect(buildingCost(B.barracks, 25)).toEqual([51277, 63605, 23075]);
    expect(buildingCost(B.storage, 15)).toEqual([1612, 1420, 860]);
    expect(buildingCost(B.smith, 17)).toEqual([8879, 8779, 9686]);
  });

  it('population totals', () => {
    expect(buildingPopTotal(B.wood, 7)).toBe(12);
    expect(buildingPopTotal(B.wood, 30)).toBe(326);
    expect(buildingPopTotal(B.main, 30)).toBe(475);
    expect(buildingPopTotal(B.barracks, 25)).toBe(303);
    expect(buildingPopTotal(B.farm, 30)).toBe(0);
  });

  it('production, storage, farm, hiding place', () => {
    expect(Math.round(productionPerHour(config, 1))).toBe(30);
    expect(Math.round(productionPerHour(config, 10))).toBe(117);
    expect(Math.round(productionPerHour(config, 30))).toBe(2400);
    expect(storageCapacity(1)).toBe(1000);
    expect(storageCapacity(10)).toBe(6420);
    expect(storageCapacity(30)).toBe(400000);
    expect(farmCapacity(1)).toBe(240);
    expect(farmCapacity(30)).toBe(24000);
    expect(hidingCapacity(1)).toBe(150);
  });

  it('points', () => {
    expect(buildingPoints(B.main, 20)).toBe(319);
    expect(buildingPoints(B.main, 30)).toBe(1978);
    expect(buildingPoints(B.barracks, 25)).toBe(1272);
    expect(buildingPoints(B.wood, 30)).toBe(1187);
    expect(buildingPoints(B.wall, 20)).toBe(256);
    expect(buildingPoints(B.place, 1)).toBe(0);
  });

  it('headquarters speeds up building ~5% per level', () => {
    const atHq1 = buildTimeMs(config, B.barracks, 5, 1);
    const atHq10 = buildTimeMs(config, B.barracks, 5, 10);
    // HQ level 10 speed factor in TW is 61% vs 95% at level 1
    expect(atHq10 / atHq1).toBeCloseTo(0.614 / 0.952, 2);
  });

  it('world speed divides all times', () => {
    const fast = createConfig('classic', 'x', 1, { worldSpeed: 2 });
    expect(buildTimeMs(fast, B.main, 5, 1)).toBe(Math.round(buildTimeMs(config, B.main, 5, 1) / 2));
    expect(recruitTimeMs(fast, config.units.spear, 1)).toBe(Math.round(recruitTimeMs(config, config.units.spear, 1) / 2));
  });

  it('recruit time drops with building level', () => {
    expect(recruitTimeMs(config, config.units.spear, 25)).toBeLessThan(recruitTimeMs(config, config.units.spear, 1));
  });
});
