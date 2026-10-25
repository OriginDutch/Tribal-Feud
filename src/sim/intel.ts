/**
 * What the human player knows about other villages: the wall seen in the last fight,
 * the barbarian type and the last scout. Bonus villages are public (visible on the map).
 */
import type { BarbType } from '../shared/barbarianTypes';
import type { BuildingId, Res, UnitCounts } from '../shared/gameData';
import { hidingCapacity, storageCapacity } from './formulas';
import type { WorldState } from './state';
import { productionRates, type Village } from './village';

export interface Intel {
  /** Barbarian type, known after a successful scout. */
  type?: BarbType;
  wall?: number;
  wallAt?: number;
  scout?: { time: number; res: Res; buildings: Partial<Record<BuildingId, number>> };
}

/** Light cavalry carry, used by template C. */
export const FARM_C_UNIT = 'light';

export function recordIntel(
  state: WorldState,
  target: Village,
  seen: { wall?: number; scouted?: { res: Res; buildings: Partial<Record<BuildingId, number>> } },
): void {
  const intel = (state.intel[target.id] ??= {});
  if (seen.wall !== undefined) {
    intel.wall = seen.wall;
    intel.wallAt = state.time;
  }
  if (seen.scouted) {
    intel.scout = { time: state.time, res: seen.scouted.res, buildings: seen.scouted.buildings };
    if (target.barbType) intel.type = target.barbType;
    else delete intel.type;
  }
}

/**
 * Estimated lootable resources now, from the last scout plus production since then
 * (using the scouted levels, so growth after the scout is not counted).
 */
export function estimateLoot(state: WorldState, villageId: number): number | undefined {
  const intel = state.intel[villageId];
  const v = state.villages[villageId];
  if (!intel?.scout || !v) return undefined;
  const b = intel.scout.buildings;
  const ghost = {
    ...v,
    buildings: { ...v.buildings, wood: b.wood ?? 0, stone: b.stone ?? 0, iron: b.iron ?? 0 },
  } as Village;
  const rates = productionRates(state.config, ghost);
  const hours = Math.max(0, state.time - intel.scout.time) / 3_600_000;
  const cap = storageCapacity(b.storage ?? 1);
  const hide = hidingCapacity(b.hide ?? 0);
  let total = 0;
  for (const i of [0, 1, 2] as const) {
    const have = Math.min(cap, intel.scout.res[i] + rates[i] * hours);
    total += Math.max(0, Math.floor(have - hide));
  }
  return total;
}

/** Template C: enough light cavalry for the estimated loot. Returns an error text if impossible. */
export function farmCUnits(state: WorldState, fromId: number, toId: number): UnitCounts | string {
  const from = state.villages[fromId];
  if (!from) return 'Dorp bestaat niet.';
  const estimate = estimateLoot(state, toId);
  if (estimate === undefined) return 'Template C heeft een verkenning van dit dorp nodig.';
  const carry = state.config.units[FARM_C_UNIT].carry;
  const needed = Math.max(1, Math.ceil(estimate / carry));
  const home = from.units[FARM_C_UNIT];
  if (home <= 0) return 'Geen lichte cavalerie thuis.';
  return { [FARM_C_UNIT]: Math.min(needed, home) };
}
