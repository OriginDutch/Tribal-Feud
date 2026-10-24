/** Small UI helpers around units and travel. */
import { UNIT_IDS, type UnitCounts, type UnitId } from '../shared/gameData';
import type { UnitView } from '../sim/view';

export const UNIT_SHORT: Record<UnitId, string> = {
  spear: 'Speer',
  sword: 'Zwaard',
  axe: 'Bijl',
  archer: 'Boog',
  spy: 'Verk.',
  light: 'LC',
  marcher: 'BB',
  heavy: 'ZC',
  ram: 'Ram',
  catapult: 'Kata',
  knight: 'Pala',
  snob: 'Edel',
};

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Travel time preview in game ms (the worker computes the real one with the same formula). */
export function travelMs(units: UnitCounts, views: UnitView[], dist: number, marchFactor: number): number {
  let slowest = 0;
  for (const u of views) if ((units[u.id] ?? 0) > 0) slowest = Math.max(slowest, u.stats.speed);
  return Math.round(((dist * slowest) / marchFactor) * 60_000);
}

export function unitsText(units: UnitCounts): string {
  return UNIT_IDS.filter((u) => (units[u] ?? 0) > 0)
    .map((u) => `${units[u]} ${UNIT_SHORT[u]}`)
    .join(', ');
}
