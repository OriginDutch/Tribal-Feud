/**
 * WorldConfig: every world setting and every tunable number lives here.
 * It is fixed when a world is created and stored in the save.
 * Mechanics and bot layers read from it; nothing is hardcoded elsewhere.
 */

import {
  DEFAULT_BUILDINGS,
  DEFAULT_UNITS,
  type BuildingDef,
  type BuildingId,
  type Res,
  type UnitDef,
  type UnitId,
} from './gameData';

export type ResearchMode = 'simple' | 'levels3' | 'levels10';
export type PaladinMode = 'off' | 'on' | 'items';
export type NobleCostMode = 'coins' | 'packages';
export type MoraleMode = 'off' | 'points' | 'pointsTime';
export type BotDifficulty = 'easy' | 'normal' | 'hard';
export type PresetId = 'classic' | 'speed' | 'hardcore' | 'custom';

export interface WorldConfig {
  name: string;
  seed: number;
  preset: PresetId;

  /** Multiplies production, build and recruit speed. 1 = normal world. */
  worldSpeed: number;
  /** Multiplies troop movement speed. 1 = normal world. */
  unitSpeed: number;
  /** Extra multiplier on resource production only (on top of worldSpeed). */
  productionMultiplier: number;
  /** Extra speed-up of building and smithy research (on top of worldSpeed). */
  buildSpeed: number;
  /** Extra speed-up of recruiting (on top of worldSpeed). */
  recruitSpeed: number;

  churches: boolean;
  flags: boolean;
  research: ResearchMode;
  archers: boolean;
  paladin: PaladinMode;
  nobleCost: NobleCostMode;
  morale: MoraleMode;
  luck: boolean;
  nightBonus: boolean;

  barbarians: {
    /** Max points a barbarian village grows to. Placeholder, still to be decided. */
    growthCap: number;
    /** Relative growth speed. 1 = default. Placeholder. */
    growthRate: number;
  };

  bots: {
    count: number;
    difficulty: BotDifficulty;
  };

  winCondition: {
    /** Share of all villages your guild must own, 0..1. */
    villageShare: number;
  };

  /** Building table (costs, factors, times, points, requirements). */
  buildings: Record<BuildingId, BuildingDef>;
  /** Unit table (costs, stats, recruit times, research). */
  units: Record<UnitId, UnitDef>;

  village: {
    /** Building levels a new village starts with; missing = minLevel. */
    startLevels: Partial<Record<BuildingId, number>>;
    startResources: Res;
    buildQueueSlots: number;
    /** Share of the cost returned when cancelling a build or recruit order. */
    cancelRefund: number;
    /** TODO(open question): smithy research time not found yet; base seconds at world speed 1. */
    researchTime: number;
  };
}

type GameplayTables = 'buildings' | 'units' | 'village';
type PresetValues = Omit<WorldConfig, 'name' | 'seed' | 'preset' | GameplayTables>;

const BASE: PresetValues = {
  worldSpeed: 1,
  unitSpeed: 1,
  // No quest rewards (yet): without them the TW early game is far too slow.
  productionMultiplier: 10,
  buildSpeed: 1,
  recruitSpeed: 1,
  churches: false,
  flags: false,
  research: 'simple',
  archers: true,
  paladin: 'on',
  // TODO(open question): coins vs packages default.
  nobleCost: 'coins',
  // TODO(open question): morale / luck / night bonus defaults.
  morale: 'points',
  luck: true,
  nightBonus: false,
  barbarians: {
    // TODO(open question): barbarian points cap.
    growthCap: 3000,
    growthRate: 1,
  },
  bots: {
    count: 200,
    difficulty: 'normal',
  },
  winCondition: {
    villageShare: 0.75,
  },
};

/** Preset contents are placeholders until the presets are designed. */
export const PRESETS: Record<Exclude<PresetId, 'custom'>, PresetValues> = {
  classic: { ...BASE },
  speed: { ...BASE, worldSpeed: 5, unitSpeed: 2 },
  hardcore: {
    ...BASE,
    worldSpeed: 2,
    unitSpeed: 1,
    morale: 'off',
    bots: { count: 300, difficulty: 'hard' },
  },
};

export function defaultTables(): Pick<WorldConfig, GameplayTables> {
  return {
    buildings: structuredClone(DEFAULT_BUILDINGS),
    units: structuredClone(DEFAULT_UNITS),
    village: {
      startLevels: { main: 1, wood: 1, stone: 1, iron: 1, farm: 1, storage: 1 },
      startResources: [500, 500, 500],
      buildQueueSlots: 5,
      cancelRefund: 0.9,
      researchTime: 3600,
    },
  };
}

export type ConfigOverrides = Partial<Omit<WorldConfig, 'barbarians' | 'bots' | 'winCondition' | GameplayTables>> & {
  barbarians?: Partial<WorldConfig['barbarians']>;
  bots?: Partial<WorldConfig['bots']>;
  winCondition?: Partial<WorldConfig['winCondition']>;
};

export function createConfig(
  preset: Exclude<PresetId, 'custom'>,
  name: string,
  seed: number,
  overrides: ConfigOverrides = {},
): WorldConfig {
  const base = PRESETS[preset];
  const hasOverrides = Object.keys(overrides).length > 0;
  return {
    ...base,
    ...defaultTables(),
    ...overrides,
    name,
    seed,
    preset: hasOverrides ? 'custom' : preset,
    barbarians: { ...base.barbarians, ...overrides.barbarians },
    bots: { ...base.bots, ...overrides.bots },
    winCondition: { ...base.winCondition, ...overrides.winCondition },
  };
}

/**
 * Rule from the design doc: a setting only becomes selectable once the bots can play with it.
 * Until then, these values are rejected when creating a world.
 */
export const UNSUPPORTED_SETTINGS: ReadonlyArray<{ check: (c: WorldConfig) => boolean; message: string }> = [
  { check: (c) => c.churches, message: 'Kerken worden nog niet ondersteund (fase 9).' },
  { check: (c) => c.flags, message: 'Vlaggen worden nog niet ondersteund (fase 9).' },
  { check: (c) => c.research !== 'simple', message: 'Researchlevels worden nog niet ondersteund (fase 9).' },
  { check: (c) => c.paladin === 'items', message: 'Paladijn-items worden nog niet ondersteund (fase 9).' },
];

export function validateConfig(c: WorldConfig): string[] {
  const errors: string[] = [];
  if (!(c.worldSpeed > 0)) errors.push('Wereldsnelheid moet groter dan 0 zijn.');
  if (!(c.unitSpeed > 0)) errors.push('Unitsnelheid moet groter dan 0 zijn.');
  if (!(c.productionMultiplier > 0)) errors.push('Productie-multiplier moet groter dan 0 zijn.');
  if (!(c.buildSpeed > 0)) errors.push('Bouwsnelheid moet groter dan 0 zijn.');
  if (!(c.recruitSpeed > 0)) errors.push('Rekruteersnelheid moet groter dan 0 zijn.');
  if (!Number.isInteger(c.bots.count) || c.bots.count < 0) errors.push('Aantal bots moet een geheel getal >= 0 zijn.');
  if (!(c.winCondition.villageShare > 0 && c.winCondition.villageShare <= 1)) {
    errors.push('Winvoorwaarde moet tussen 0 en 1 liggen.');
  }
  if (!(c.barbarians.growthCap > 0)) errors.push('Groei-cap van barbaren moet groter dan 0 zijn.');
  for (const rule of UNSUPPORTED_SETTINGS) {
    if (rule.check(c)) errors.push(rule.message);
  }
  return errors;
}
