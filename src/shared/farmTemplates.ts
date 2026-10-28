/**
 * Farm templates: letters A to J, each a fixed set of troops, plus "*": as much light cavalry as
 * the scouted loot needs (the old template C).
 */
import type { UnitCounts } from './gameData';

export const FARM_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;
export type FarmLetter = (typeof FARM_LETTERS)[number];
/** A letter, or "*" (light cavalry by the scouted loot). */
export type FarmKey = FarmLetter | '*';
export type FarmTemplates = Partial<Record<FarmLetter, UnitCounts>>;

export const isFarmLetter = (x: unknown): x is FarmLetter => typeof x === 'string' && (FARM_LETTERS as readonly string[]).includes(x);

/** The letters that hold troops, in order. */
export function definedLetters(t: FarmTemplates | undefined): FarmLetter[] {
  return FARM_LETTERS.filter((l) => Object.values(t?.[l] ?? {}).some((n) => (n ?? 0) > 0));
}
