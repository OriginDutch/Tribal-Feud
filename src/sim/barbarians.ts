/**
 * Barbarian villages grow lazily: nothing is scheduled. Whenever a barbarian village is
 * looked at or attacked, growBarbarian() catches it up to the current time.
 * Each step upgrades one building, chosen by a hash of (world seed, village id, step),
 * so the result is the same no matter when or in which order villages are caught up.
 * Barbarians never build a hiding place: that would make farming them pointless.
 *
 * Two growth modes:
 * - 'points' (new worlds): a village has a type (resource/military/defensive/balanced) that
 *   decides what it builds and how high its wall may go, and it grows a fixed number of
 *   points per game day.
 * - 'levels' (old worlds): one random level per interval, the original behaviour.
 */
import { BARB_TYPES, BONUS_KINDS, type BarbType, type BonusKind } from '../shared/barbarianTypes';
import type { WorldConfig } from '../shared/config';
import { BUILDING_IDS, type BuildingId } from '../shared/gameData';
import { buildingPoints, buildingPopTotal, farmCapacity, farmCapacityIn, storageCapacity } from './formulas';
import { hashFloat } from './rng';
import type { WorldState } from './state';
import { productionRates, settle, type Village } from './village';

const LEGACY_WEIGHTS: readonly [BuildingId, number][] = [
  ['wood', 3],
  ['stone', 3],
  ['iron', 3],
  ['main', 2],
  ['storage', 2],
  ['farm', 2],
  ['wall', 1],
  ['barracks', 1],
  ['smith', 1],
  ['market', 1],
];

const DAY = 86_400_000;

export function villagePoints(config: WorldConfig, v: Village): number {
  let points = 0;
  for (const b of BUILDING_IDS) points += buildingPoints(config.buildings[b], v.buildings[b]);
  return points;
}

function weightsFor(config: WorldConfig, v: Village): readonly [BuildingId, number][] {
  if (!v.barbType) return LEGACY_WEIGHTS;
  const w = config.barbarians.types[v.barbType].weights;
  return (Object.entries(w) as [BuildingId, number][]).filter(([b, n]) => b !== 'hide' && n > 0);
}

/** Whether a typed barbarian may raise its wall now. Untyped (old) villages have no limit. */
function wallAllowed(config: WorldConfig, v: Village, points: number): boolean {
  if (!v.barbType) return true;
  // a broken wall comes back only at the repair speed
  if (v.growth?.wallRepair) return false;
  const def = config.barbarians.types[v.barbType];
  if (points < def.wallFromPoints) return false;
  const cap = def.wallFullAtPoints > 0 ? Math.max(1, Math.ceil((def.maxWall * points) / def.wallFullAtPoints)) : def.maxWall;
  return v.buildings.wall < Math.min(def.maxWall, cap);
}

/** Workers the village's buildings need (barbarians have no troops). */
function buildingWorkers(config: WorldConfig, v: Village): number {
  let pop = 0;
  for (const b of BUILDING_IDS) pop += buildingPopTotal(config.buildings[b], v.buildings[b]);
  return pop;
}

/** Raises `b` one level, or the farm first when the village has no room for the workers. */
function raise(config: WorldConfig, v: Village, b: BuildingId): BuildingId {
  const def = config.buildings[b];
  const extra = buildingPopTotal(def, v.buildings[b] + 1) - buildingPopTotal(def, v.buildings[b]);
  if (b !== 'farm' && extra > 0 && v.buildings.farm < config.buildings.farm.maxLevel) {
    if (buildingWorkers(config, v) + extra > farmCapacityIn(config, v.buildings.farm)) b = 'farm';
  }
  v.buildings[b]++;
  return b;
}

/** Upgrades one building. Returns the building, or null if nothing could be upgraded. */
function growOneStep(config: WorldConfig, v: Village, step: number, points: number): BuildingId | null {
  const weights = weightsFor(config, v);
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  for (let attempt = 0; attempt < 8; attempt++) {
    let roll = hashFloat(config.seed, v.id, step, attempt) * total;
    let pick: BuildingId = 'wood';
    for (const [b, w] of weights) {
      roll -= w;
      if (roll < 0) {
        pick = b;
        break;
      }
    }
    if (pick === 'wall' && !wallAllowed(config, v, points)) continue;
    if (v.buildings[pick] < config.buildings[pick].maxLevel) return raise(config, v, pick);
  }
  // all rolls blocked: take the first building of the type that can still grow
  for (const [b] of weights) {
    if (b === 'wall' && !wallAllowed(config, v, points)) continue;
    if (v.buildings[b] < config.buildings[b].maxLevel) return raise(config, v, b);
  }
  return null;
}

function levelPoints(config: WorldConfig, v: Village, b: BuildingId): number {
  const def = config.buildings[b];
  return buildingPoints(def, v.buildings[b]) - buildingPoints(def, v.buildings[b] - 1);
}

function growTo(config: WorldConfig, v: Village, target: number): void {
  if (!v.growth) return;
  let points = villagePoints(config, v);
  while (points < target) {
    const b = growOneStep(config, v, v.growth.step++, points);
    if (!b) break;
    points += levelPoints(config, v, b);
  }
}

/** Picks a type by the configured shares, deterministically per village. */
export function pickBarbType(config: WorldConfig, villageId: number): BarbType {
  const types = config.barbarians.types;
  const total = BARB_TYPES.reduce((sum, t) => sum + types[t].share, 0);
  let roll = hashFloat(config.seed, villageId, 101) * total;
  for (const t of BARB_TYPES) {
    roll -= types[t].share;
    if (roll < 0) return t;
  }
  return 'balanced';
}

export function pickBonus(config: WorldConfig, villageId: number): BonusKind | undefined {
  if (hashFloat(config.seed, villageId, 102) >= config.barbarians.bonusShare) return undefined;
  const i = Math.floor(hashFloat(config.seed, villageId, 103) * BONUS_KINDS.length);
  return BONUS_KINDS[Math.min(i, BONUS_KINDS.length - 1)];
}

/** Guesses the type of an existing village from its buildings (for abandoned player villages). */
export function inferBarbType(v: Village): BarbType {
  const b = v.buildings;
  const eco = b.wood + b.stone + b.iron;
  const mil = b.barracks + b.stable + b.garage;
  if (b.wall >= 10) return 'defensive';
  if (mil * 2 > eco) return 'military';
  if (eco > (mil + b.wall) * 3) return 'resource';
  return 'balanced';
}

/** Stock a new barbarian village starts with: a few hours of production, at most a full storage. */
export function fillStartStock(config: WorldConfig, v: Village, time: number): void {
  const hours = config.barbarians.startStockHours;
  const cap = storageCapacity(v.buildings.storage);
  const rates = productionRates(config, v);
  v.res = [0, 1, 2].map((i) => Math.min(cap, Math.round(rates[i as 0 | 1 | 2] * hours))) as Village['res'];
  v.resAt = time;
}

/** Lowers buildings (never below their minimum) until the village is at most `target` points. */
function shrinkTo(config: WorldConfig, v: Village, target: number): void {
  let points = villagePoints(config, v);
  for (let step = 0; points > target && step < 200; step++) {
    const options = BUILDING_IDS.filter((b) => v.buildings[b] > (config.buildings[b].minLevel ?? 0) && v.buildings[b] > (b === 'main' ? 1 : 0));
    if (!options.length) return;
    const b = options[Math.floor(hashFloat(config.seed, v.id, 900 + step) * options.length)]!;
    points -= levelPoints(config, v, b);
    v.buildings[b]--;
  }
}

/**
 * Starting size of a new barbarian village: with startRelative, around a fresh player village
 * (that is what createVillage gives) ± that share; else the old fixed range.
 */
export function barbarianStartPoints(config: WorldConfig, fresh: Village, roll: number): number {
  const rel = config.barbarians.startRelative;
  if (rel === undefined) return Math.round(config.barbarians.startPointsMin + roll * (config.barbarians.startPointsMax - config.barbarians.startPointsMin));
  return Math.round(villagePoints(config, fresh) * (1 + (roll * 2 - 1) * rel));
}

/** Grows a fresh barbarian village to its (random) starting size and sets up its growth. */
export function seedBarbarian(config: WorldConfig, v: Village, targetPoints: number, time = 0): void {
  if (config.barbarians.growthMode === 'points') {
    v.barbType = pickBarbType(config, v.id);
    v.bonus = pickBonus(config, v.id);
  }
  v.growth = { step: 0, since: 0 };
  shrinkTo(config, v, targetPoints);
  growTo(config, v, targetPoints);
  if (config.barbarians.growthMode === 'points') {
    v.growth.since = time;
    v.growth.start = villagePoints(config, v);
    fillStartStock(config, v, time);
  } else {
    v.growth.since = time;
  }
}

/** Starts growth for a village that just became barbarian (an abandoned player village). */
export function startBarbarianGrowth(config: WorldConfig, v: Village, time: number): void {
  const step = v.growth?.step ?? 0;
  if (config.barbarians.growthMode === 'points') {
    v.barbType = inferBarbType(v);
    v.growth = { step, since: time, start: villagePoints(config, v) };
  } else {
    v.growth = { step, since: time };
  }
}

export function growthIntervalMs(config: WorldConfig): number {
  return (config.barbarians.growthIntervalHours * 3_600_000) / (config.worldSpeed * config.barbarians.growthRate);
}

/**
 * Barbarians build like players do: faster on fast worlds and with a higher build speed.
 * ('levels' mode, old worlds, keeps scaling with world speed only.)
 */
export function barbarianBuildSpeed(config: WorldConfig): number {
  const speed = config.worldSpeed * config.buildSpeed;
  return config.barbarians.speedScaling === 'sqrt' ? Math.sqrt(speed) : speed;
}

/** How far this village grows (points), see capMode. */
export function growthCapOf(config: WorldConfig, v: Village): number {
  const b = config.barbarians;
  switch (b.capMode ?? 'fixed') {
    case 'none': return v.growth?.start ?? 0;
    case 'full': return Infinity;
    case 'varied': return Math.round(b.growthCap + (hashFloat(config.seed, v.id, 104) * 2 - 1) * (b.capSpread ?? 0));
    default: return b.growthCap;
  }
}

function pointsPerMs(config: WorldConfig): number {
  const { pointsPerDay, growthRate } = config.barbarians;
  return (pointsPerDay * barbarianBuildSpeed(config) * growthRate) / DAY;
}

/** Damage not yet regrown at `time`. */
function currentDebt(config: WorldConfig, v: Village, time: number): number {
  const d = v.growth?.debt;
  if (!d) return 0;
  return Math.max(0, d.points - pointsPerMs(config) * Math.max(0, time - d.at));
}

/** Points a typed barbarian village should have at `time`. */
export function targetPoints(config: WorldConfig, v: Village, time: number): number {
  const g = v.growth;
  if (!g) return 0;
  const start = g.start ?? 0;
  const grown = Math.max(start, Math.min(growthCapOf(config, v), start + pointsPerMs(config) * Math.max(0, time - g.since)));
  return grown - currentDebt(config, v, time);
}

/**
 * Called after a battle that lowered buildings of a typed barbarian village: the lost points
 * come off the growth target (so they are not regrown at once), and a broken wall is rebuilt
 * at the type's repair speed. Old ('levels') worlds keep the old behaviour.
 */
export function onBarbarianDamaged(
  config: WorldConfig,
  v: Village,
  time: number,
  pointsBefore: number,
  wallBefore: number,
): void {
  const g = v.growth;
  if (!g || config.barbarians.growthMode !== 'points') return;
  const lost = pointsBefore - villagePoints(config, v);
  if (lost > 0) g.debt = { points: currentDebt(config, v, time) + lost, at: time };
  if (v.buildings.wall < wallBefore) {
    const peak = Math.max(wallBefore, g.wallRepair?.peak ?? 0);
    g.wallRepair = { at: time, level: v.buildings.wall, peak };
  }
}

/** Rebuilds the wall up to `time`; the rebuilt points go back on the growth target. */
function repairWall(config: WorldConfig, v: Village, time: number): void {
  const g = v.growth;
  const r = g?.wallRepair;
  if (!g || !r || !v.barbType) return;
  const rate = config.barbarians.types[v.barbType].wallRepairPerDay * barbarianBuildSpeed(config);
  const levels = Math.floor((Math.max(0, time - r.at) / DAY) * rate);
  const repaired = Math.min(r.peak, r.level + levels);
  const def = config.buildings.wall;
  if (repaired > v.buildings.wall) {
    const restored = buildingPoints(def, repaired) - buildingPoints(def, v.buildings.wall);
    v.buildings.wall = repaired;
    // repaired levels pay off the damage directly
    if (g.debt) g.debt.points = Math.max(0, g.debt.points - restored);
  }
  if (v.buildings.wall >= r.peak) delete g.wallRepair;
}

/** Catches a barbarian village up to `time`. Safe to call any number of times. */
export function growBarbarian(state: WorldState, v: Village, time: number): void {
  if (!v.growth) return;
  const { config } = state;
  if (config.barbarians.growthMode === 'points') {
    if (v.growth.wallRepair) {
      settle(config, v, time);
      repairWall(config, v, time);
    }
    const target = targetPoints(config, v, time);
    if (villagePoints(config, v) >= target) return;
    settle(config, v, time);
    growTo(config, v, target);
    return;
  }
  const interval = growthIntervalMs(config);
  const steps = Math.floor((time - v.growth.since) / interval);
  if (steps <= 0) return;
  // resources up to now at the old production, then the new levels apply
  settle(config, v, time);
  let points = villagePoints(config, v);
  for (let i = 0; i < steps; i++) {
    if (points >= config.barbarians.growthCap) break;
    const b = growOneStep(config, v, v.growth.step++, points);
    if (!b) break;
    points += levelPoints(config, v, b);
  }
  v.growth.since += steps * interval;
}
