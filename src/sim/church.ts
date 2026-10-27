/**
 * Churches (world setting). Troops from a village without faith fight at half strength, in
 * attack and in defense. A village has faith when one of its owner's churches is close enough:
 * church level 1 / 2 / 3 reaches 4 / 6 / 8 fields, the first church 6. Every player starts with
 * a first church in the first village; lose it and it can be built again (cheap) elsewhere.
 * Barbarians always fight at full strength.
 */
import type { WorldConfig } from '../shared/config';
import { villagesOf, type WorldState } from './state';
import type { Village } from './village';

export const CHURCH_RADIUS = [0, 4, 6, 8] as const;
export const FIRST_CHURCH_RADIUS = 6;
/** Strength of troops without faith. */
export const NO_FAITH = 0.5;

export function churchRadius(v: Village): number {
  return Math.max(CHURCH_RADIUS[Math.min(3, v.buildings.church ?? 0)] ?? 0, (v.buildings.church_f ?? 0) > 0 ? FIRST_CHURCH_RADIUS : 0);
}

/** Does this village have faith (its owner's church in reach)? Always true without churches. */
export function hasFaith(state: WorldState, v: Village | undefined): boolean {
  if (!state.config.churches || !v || v.owner < 0) return true;
  for (const c of villagesOf(state, v.owner)) {
    const r = churchRadius(c);
    if (r > 0 && Math.hypot(c.x - v.x, c.y - v.y) <= r) return true;
  }
  return false;
}

export function faithFactor(state: WorldState, v: Village | undefined): number {
  return hasFaith(state, v) ? 1 : NO_FAITH;
}

/** A player may have one first church (built or being built). */
export function hasFirstChurch(state: WorldState, owner: number): boolean {
  return villagesOf(state, owner).some((v) => (v.buildings.church_f ?? 0) > 0 || v.buildQueue.some((j) => j.building === 'church_f'));
}

export function churchesEnabled(config: WorldConfig): boolean {
  return !!config.churches;
}
