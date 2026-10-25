/**
 * Barbarian village types: what a barbarian village grows into.
 * The type is fixed when the world is made and is only known to a player who scouted it.
 */
import type { BuildingId } from './gameData';

export const BARB_TYPES = ['resource', 'military', 'defensive', 'balanced'] as const;
export type BarbType = (typeof BARB_TYPES)[number];

export const BARB_TYPE_NAMES: Record<BarbType, string> = {
  resource: 'Grondstoffen',
  military: 'Militair',
  defensive: 'Verdedigend',
  balanced: 'Gebalanceerd',
};

export interface BarbTypeDef {
  /** Share of all barbarian villages of this type (the shares are normalised). */
  share: number;
  /** Which buildings it grows, as weights. Barbarians never build a hiding place. */
  weights: Partial<Record<BuildingId, number>>;
  maxWall: number;
  /** No wall below this many points. */
  wallFromPoints: number;
  /** The wall may only reach maxWall at this many points (linear before that). 0 = no ramp. */
  wallFullAtPoints: number;
}

export const DEFAULT_BARB_TYPES: Record<BarbType, BarbTypeDef> = {
  resource: {
    share: 0.45,
    weights: { wood: 4, stone: 4, iron: 4, storage: 3, farm: 1, main: 1, market: 1, wall: 1 },
    maxWall: 2,
    wallFromPoints: 1000,
    wallFullAtPoints: 0,
  },
  military: {
    share: 0.2,
    weights: { barracks: 3, stable: 3, garage: 2, smith: 2, main: 2, farm: 2, wood: 1, stone: 1, iron: 1, storage: 1, wall: 1 },
    maxWall: 8,
    wallFromPoints: 1000,
    wallFullAtPoints: 0,
  },
  defensive: {
    share: 0.15,
    weights: { wall: 4, farm: 2, main: 2, barracks: 1, smith: 1, wood: 1, stone: 1, iron: 1, storage: 1 },
    maxWall: 15,
    wallFromPoints: 0,
    wallFullAtPoints: 1500,
  },
  balanced: {
    share: 0.2,
    weights: { wood: 3, stone: 3, iron: 3, main: 2, storage: 2, farm: 2, wall: 1, barracks: 1, smith: 1, market: 1 },
    maxWall: 5,
    wallFromPoints: 1000,
    wallFullAtPoints: 0,
  },
};

/** Bonus villages: extra production, visible on the map. Kept when conquered (phase 4). */
export const BONUS_KINDS = ['wood', 'stone', 'iron', 'all'] as const;
export type BonusKind = (typeof BONUS_KINDS)[number];

export const BONUS_NAMES: Record<BonusKind, string> = {
  wood: '+100% hout',
  stone: '+100% leem',
  iron: '+100% ijzer',
  all: '+30% grondstoffen',
};

/** Production multipliers per resource for a bonus. */
export const BONUS_FACTORS: Record<BonusKind, [number, number, number]> = {
  wood: [2, 1, 1],
  stone: [1, 2, 1],
  iron: [1, 1, 2],
  all: [1.3, 1.3, 1.3],
};
