/**
 * Tribal Wars formulas. Pure functions of the config tables + levels.
 * Times are returned in game milliseconds (already divided by world speed).
 */
import type { WorldConfig } from '../shared/config';
import type { BuildingDef, Res, UnitDef } from '../shared/gameData';

/** Cost to upgrade a building TO `level`. */
export function buildingCost(def: BuildingDef, level: number): Res {
  return [
    Math.round(def.cost[0] * def.costFactor[0] ** (level - 1)),
    Math.round(def.cost[1] * def.costFactor[1] ** (level - 1)),
    Math.round(def.cost[2] * def.costFactor[2] ** (level - 1)),
  ];
}

// The level tables below are hot (bots look at them thousands of times per game hour):
// each value is computed once per building definition and level, then looked up.
const popTables = new WeakMap<BuildingDef, number[]>();
const pointTables = new WeakMap<BuildingDef, number[]>();

function cached(tables: WeakMap<BuildingDef, number[]>, def: BuildingDef, level: number, f: (l: number) => number): number {
  let t = tables.get(def);
  if (!t) {
    t = [];
    tables.set(def, t);
  }
  let v = t[level];
  if (v === undefined) {
    v = f(level);
    t[level] = v;
  }
  return v;
}

/** Total workers a building uses at `level` (0 at level 0). */
export function buildingPopTotal(def: BuildingDef, level: number): number {
  if (level <= 0) return 0;
  return cached(popTables, def, level, (l) => Math.round(def.pop * def.popFactor ** (l - 1)));
}

/** Extra workers needed to go from level-1 to `level`. */
export function buildingPopCost(def: BuildingDef, level: number): number {
  return buildingPopTotal(def, level) - buildingPopTotal(def, level - 1);
}

/** Build time TO `level`, given the current headquarters level. */
export function buildTimeMs(config: WorldConfig, def: BuildingDef, level: number, mainLevel: number): number {
  // For level 1, 14 / 0 = Infinity, so the exponent clamps to -13 like in TW.
  const exponent = Math.max(-13, level - 1 - 14 / (level - 1));
  const seconds = def.buildTime * 1.18 * def.buildTimeFactor ** exponent * 1.05 ** -mainLevel;
  return Math.round((seconds * 1000) / (config.worldSpeed * config.buildSpeed));
}

/** Resource production per hour of one resource building (times world speed and production multiplier). */
const PRODUCTION = Array.from({ length: 61 }, (_, l) => (l <= 0 ? 0 : 30 * 1.163118 ** (l - 1)));
const STORAGE = Array.from({ length: 61 }, (_, l) => Math.round(1000 * 1.2294934 ** (l - 1)));
const FARM = Array.from({ length: 61 }, (_, l) => Math.round(240 * 1.172103 ** (l - 1)));

export function productionPerHour(config: WorldConfig, level: number): number {
  if (level <= 0) return 0;
  const base = PRODUCTION[level] ?? 30 * 1.163118 ** (level - 1);
  return base * config.worldSpeed * config.productionMultiplier;
}

export function storageCapacity(level: number): number {
  return STORAGE[level] ?? Math.round(1000 * 1.2294934 ** (level - 1));
}

export function farmCapacity(level: number): number {
  return FARM[level] ?? Math.round(240 * 1.172103 ** (level - 1));
}

/** Farm capacity on this world (the population fun option; old saves have none = 1). */
export function farmCapacityIn(config: { farmMultiplier?: number }, level: number): number {
  return Math.round(farmCapacity(level) * (config.farmMultiplier ?? 1));
}

export function hidingCapacity(level: number): number {
  if (level <= 0) return 0;
  return Math.round(150 * (4 / 3) ** (level - 1));
}

/** Total points a building gives at `level`. */
export function buildingPoints(def: BuildingDef, level: number): number {
  if (level <= 0) return 0;
  return cached(pointTables, def, level, (l) => Math.round(def.points * 1.2 ** (l - 1)));
}

/** Recruit time for ONE unit, given the level of its building. */
export function recruitTimeMs(config: WorldConfig, unit: UnitDef, buildingLevel: number): number {
  const seconds = (2 / 3) * unit.buildTime * 1.06 ** -buildingLevel;
  return Math.round((seconds * 1000) / (config.worldSpeed * config.recruitSpeed));
}

/** Smithy research time. Placeholder formula until real values are found. */
export function researchTimeMs(config: WorldConfig, smithLevel: number): number {
  const seconds = config.village.researchTime * 1.06 ** -smithLevel;
  return Math.round((seconds * 1000) / (config.worldSpeed * config.buildSpeed));
}
