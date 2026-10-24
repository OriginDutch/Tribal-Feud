/**
 * Barbarian villages grow lazily: nothing is scheduled. Whenever a barbarian village is
 * looked at or attacked, growBarbarian() catches it up to the current time.
 * Each step upgrades one building, chosen by a hash of (world seed, village id, step),
 * so the result is the same no matter when or in which order villages are caught up.
 * Barbarians never build a hiding place: that would make farming them pointless.
 */
import type { WorldConfig } from '../shared/config';
import { BUILDING_IDS, type BuildingId } from '../shared/gameData';
import { buildingPoints } from './formulas';
import { hashFloat } from './rng';
import type { WorldState } from './state';
import { settle, type Village } from './village';

const WEIGHTS: readonly [BuildingId, number][] = [
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
const TOTAL_WEIGHT = WEIGHTS.reduce((sum, [, w]) => sum + w, 0);

export function villagePoints(config: WorldConfig, v: Village): number {
  let points = 0;
  for (const b of BUILDING_IDS) points += buildingPoints(config.buildings[b], v.buildings[b]);
  return points;
}

/** Upgrades one building. Returns false if nothing could be upgraded. */
function growOneStep(config: WorldConfig, v: Village, step: number): boolean {
  for (let attempt = 0; attempt < 8; attempt++) {
    let roll = hashFloat(config.seed, v.id, step, attempt) * TOTAL_WEIGHT;
    let pick: BuildingId = 'wood';
    for (const [b, w] of WEIGHTS) {
      roll -= w;
      if (roll < 0) {
        pick = b;
        break;
      }
    }
    if (v.buildings[pick] < config.buildings[pick].maxLevel) {
      v.buildings[pick]++;
      return true;
    }
  }
  return false;
}

/** Grows a fresh barbarian village to its (random) starting size. */
export function seedBarbarian(config: WorldConfig, v: Village, targetPoints: number): void {
  v.growth = { step: 0, since: 0 };
  while (villagePoints(config, v) < targetPoints) {
    if (!growOneStep(config, v, v.growth.step++)) break;
  }
}

export function growthIntervalMs(config: WorldConfig): number {
  return (config.barbarians.growthIntervalHours * 3_600_000) / (config.worldSpeed * config.barbarians.growthRate);
}

/** Catches a barbarian village up to `time`. Safe to call any number of times. */
export function growBarbarian(state: WorldState, v: Village, time: number): void {
  if (!v.growth) return;
  const { config } = state;
  const interval = growthIntervalMs(config);
  const steps = Math.floor((time - v.growth.since) / interval);
  if (steps <= 0) return;
  // resources up to now at the old production, then the new levels apply
  settle(config, v, time);
  for (let i = 0; i < steps; i++) {
    if (villagePoints(config, v) >= config.barbarians.growthCap) break;
    if (!growOneStep(config, v, v.growth.step++)) break;
  }
  v.growth.since += steps * interval;
}
