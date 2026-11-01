/**
 * Bot portraits: one painted pool per archetype (public/faces/<archetype>.webp, an atlas of
 * 96 px faces, FACES_PER_ROW to a row). A bot's face says something about how it plays: raiders
 * snarl, fortress keepers look wary, diplomats smile.
 */
import type { Archetype } from './botProfiles';

export const FACE_COUNTS: Record<Archetype, number> = { rusher: 48, diplomat: 54, farmer: 48, turtle: 54, opportunist: 54, supporter: 48 };
export const FACES_PER_ROW = 8;
export const FACE_PX = 96;

/** A face in a pool. */
export interface Face {
  pool: Archetype;
  index: number;
}
