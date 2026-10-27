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
import { defaultQuests, type QuestConfig } from './quests';
import { DEFAULT_BARB_TYPES, type BarbType, type BarbTypeDef } from './barbarianTypes';

export type ResearchMode = 'simple' | 'levels3' | 'levels10';
export type PaladinMode = 'off' | 'on' | 'items';
export type NobleCostMode = 'coins' | 'packages';
export type NobleCurve = 'tiered' | 'classic';
export type MoraleMode = 'off' | 'points' | 'pointsTime';
export type BotDifficulty = 'easy' | 'normal' | 'hard';

/**
 * What a difficulty does to bots. Same rules as the player; only how attentive and how
 * greedy they are differs. Values are tuned with the balance simulations (*.sim.test.ts).
 */
export interface DifficultyDef {
  /**
   * Game minutes between two moments a bot "looks at the game": farming, coins, noblemen
   * and attacks only happen then. Like a player's attention this does NOT scale with world
   * speed. Building and recruiting run all the time, like the player's account manager.
   * Active bots look more often, sleepy ones less (x0.5 .. x1.2 by activity).
   */
  attentionMinutes: number;
  /** Villages a bot looks at per turn. */
  villagesPerTurn: number;
  /**
   * Game hours (world speed 1) a bot waits after taking a village before it nobles again.
   * Active bots wait less, sleepy ones more (x0.5 .. x1.2 by activity), so they don't all grow alike.
   */
  conquestCooldownHours: number;
}

export const DIFFICULTIES: Record<BotDifficulty, DifficultyDef> = {
  easy: { attentionMinutes: 120, villagesPerTurn: 5, conquestCooldownHours: 0 },
  normal: { attentionMinutes: 45, villagesPerTurn: 5, conquestCooldownHours: 0 },
  hard: { attentionMinutes: 10, villagesPerTurn: 5, conquestCooldownHours: 0 },
};
/**
 * How kind bots are to YOU and your tribe (bots among themselves don't change):
 * accept: x chance they say yes to your invitation or application; reach: extra fields for
 * your tribe's reach; treaty: + chance they take your NAP/alliance/peace; war: x chance a
 * bot tribe declares war on yours; grudgeDecay: x how fast grudges against you fade.
 */
export interface Kindness { accept: number; reach: number; treaty: number; war: number; grudgeDecay: number }
export const KINDNESS: Record<BotDifficulty, Kindness> = {
  easy: { accept: 1.3, reach: 4, treaty: 0.2, war: 0.5, grudgeDecay: 2 },
  normal: { accept: 1, reach: 0, treaty: 0, war: 1, grudgeDecay: 1 },
  hard: { accept: 0.8, reach: -2, treaty: -0.1, war: 1.5, grudgeDecay: 1 },
};
export const kindness = (c: WorldConfig): Kindness => KINDNESS[c.bots.difficulty] ?? KINDNESS.normal;

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
  /** Fun option: population limit of the farm × this (0.5..3). Buildings keep their workers. */
  farmMultiplier: number;
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
  /**
   * Price per noble slot. tiered (default, also for old saves): slot n costs n, but at most
   * 25 below slot 200, 50 from 200, 75 from 300, ... classic: slot n costs n (TW).
   */
  nobleCurve?: NobleCurve;
  morale: MoraleMode;
  luck: boolean;
  nightBonus: boolean;

  barbarians: {
    /** Max points a barbarian village grows to. */
    growthCap: number;
    /** Relative growth speed. 1 = default. */
    growthRate: number;
    /** Points range a barbarian village starts with. */
    startPointsMin: number;
    startPointsMax: number;
    /** Game hours between two growth steps (one building level) at growthRate 1 and world speed 1. Old worlds only. */
    growthIntervalHours: number;
    /**
     * 'points': grow a fixed number of points per game day (new worlds).
     * 'levels': one building level per interval (worlds made before this existed).
     */
    growthMode: 'points' | 'levels';
    /** Points per game day at growthRate 1 and world speed 1 ('points' mode). */
    pointsPerDay: number;
    /** Village types ('points' mode). */
    types: Record<BarbType, BarbTypeDef>;
    /** Share of barbarian villages with a production bonus. */
    bonusShare: number;
    /** Hours of production a new barbarian village starts with in storage. */
    startStockHours: number;
  };

  /** Extra speed-up of troop movement (on top of worldSpeed and unitSpeed). */
  marchSpeed: number;

  map: {
    barbarianCount: number;
    /** Share of fields inside the village circle that hold a village. */
    density: number;
    /** Minimum distance between two player (or bot) villages. */
    minPlayerDistance: number;
  };

  combat: {
    baseDefense: number;
    wallDefensePerLevel: number;
    wallFactor: number;
    /** Luck range, e.g. 0.25 = between -25% and +25%. */
    luckRange: number;
  };

  bots: {
    count: number;
    difficulty: BotDifficulty;
    /** Game minutes between turns of the most active bot (world speed 1). */
    turnMinMinutes: number;
    /** Game minutes between turns of the least active bot (world speed 1). */
    turnMaxMinutes: number;
    /** Activity range bots get (0..1); higher = more turns. */
    activityMin: number;
    activityMax: number;
    /** How far (fields) bots look for barbarians to farm. */
    farmRadius: number;
    /** Most farm attacks a bot sends per turn. */
    farmAttacksPerTurn: number;
    /** A bot whose points don't grow for this many game days gives up and restarts at the edge. */
    abandonAfterDays: number;
    /**
     * Share of bots per tier; the rest is casual. Pros are always "online" (like you: the clock
     * only runs while you play), the others come and go at random moments.
     */
    tiers: { pro: number; mid: number };
  };

  winCondition: {
    /** Share of the villages a tribe must own to win, 0..1. */
    villageShare: number;
    /** Barbarian villages count in the total (default true). */
    countBarbarians?: boolean;
    /** Game days the share must be held (default 3). */
    holdDays?: number;
  };

  conquest: {
    /** Price of one coin (or package). */
    coinCost: Res;
    /** Furthest a nobleman may be sent, in fields. */
    maxDistance: number;
    /** Loyalty lost per surviving nobleman attack (random in this range). */
    loyaltyDropMin: number;
    loyaltyDropMax: number;
    /** Loyalty of a village right after it was conquered. */
    loyaltyAfterConquest: number;
    /** Loyalty regained per game hour at world speed 1. */
    loyaltyPerHour: number;
    /** Game days at world speed 1 in which no player can be attacked by another player. */
    protectionDays: number;
  };

  /** Building table (costs, factors, times, points, requirements). */
  buildings: Record<BuildingId, BuildingDef>;
  /** Unit table (costs, stats, recruit times, research). */
  units: Record<UnitId, UnitDef>;
  /** Quest chains and the reward per finished building. */
  quests: QuestConfig;

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

type GameplayTables = 'buildings' | 'units' | 'village' | 'quests';
type PresetValues = Omit<WorldConfig, 'name' | 'seed' | 'preset' | GameplayTables>;

const BASE: PresetValues = {
  worldSpeed: 1,
  unitSpeed: 1,
  // No quest rewards (yet): without them the TW early game is far too slow.
  productionMultiplier: 10,
  farmMultiplier: 1,
  buildSpeed: 1,
  recruitSpeed: 1,
  churches: false,
  flags: false,
  research: 'simple',
  archers: true,
  paladin: 'on',
  // coins: minted coins count for the whole player; packages: stored per village
  nobleCost: 'coins',
  // TODO(open question): morale / luck / night bonus defaults.
  morale: 'points',
  luck: true,
  nightBonus: false,
  barbarians: {
    growthCap: 3000,
    growthRate: 1,
    startPointsMin: 30,
    startPointsMax: 300,
    growthIntervalHours: 3,
    growthMode: 'points',
    pointsPerDay: 100,
    types: structuredClone(DEFAULT_BARB_TYPES),
    bonusShare: 0.03,
    startStockHours: 6,
  },
  marchSpeed: 1,
  map: {
    barbarianCount: 3000,
    density: 0.3,
    minPlayerDistance: 3,
  },
  combat: {
    baseDefense: 20,
    wallDefensePerLevel: 50,
    wallFactor: 1.037,
    luckRange: 0.25,
  },
  bots: {
    count: 200,
    difficulty: 'normal',
    turnMinMinutes: 5,
    turnMaxMinutes: 30,
    activityMin: 0.3,
    activityMax: 1,
    farmRadius: 15,
    farmAttacksPerTurn: 5,
    abandonAfterDays: 3,
    tiers: { pro: 0.1, mid: 0.3 },
  },
  winCondition: {
    villageShare: 0.75,
    countBarbarians: true,
    holdDays: 3,
  },
  conquest: {
    coinCost: [28000, 30000, 25000],
    maxDistance: 100,
    loyaltyDropMin: 20,
    loyaltyDropMax: 35,
    loyaltyAfterConquest: 25,
    loyaltyPerHour: 1,
    protectionDays: 3,
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
    bots: { ...BASE.bots, count: 300, difficulty: 'hard' },
  },
};

export function defaultTables(): Pick<WorldConfig, GameplayTables> {
  return {
    buildings: structuredClone(DEFAULT_BUILDINGS),
    units: structuredClone(DEFAULT_UNITS),
    quests: defaultQuests(),
    village: {
      startLevels: { main: 1, wood: 1, stone: 1, iron: 1, farm: 1, storage: 1, place: 1 },
      startResources: [500, 500, 500],
      buildQueueSlots: 5,
      cancelRefund: 0.9,
      researchTime: 3600,
    },
  };
}

export type ConfigOverrides = Partial<
  Omit<WorldConfig, 'barbarians' | 'bots' | 'winCondition' | 'map' | 'combat' | 'conquest' | GameplayTables>
> & {
  barbarians?: Partial<WorldConfig['barbarians']>;
  map?: Partial<WorldConfig['map']>;
  combat?: Partial<WorldConfig['combat']>;
  bots?: Partial<WorldConfig['bots']>;
  winCondition?: Partial<WorldConfig['winCondition']>;
  conquest?: Partial<WorldConfig['conquest']>;
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
    barbarians: {
      ...base.barbarians,
      ...overrides.barbarians,
      types: structuredClone(overrides.barbarians?.types ?? base.barbarians.types),
    },
    map: { ...base.map, ...overrides.map },
    combat: { ...base.combat, ...overrides.combat },
    bots: { ...base.bots, ...overrides.bots },
    winCondition: { ...base.winCondition, ...overrides.winCondition },
    conquest: { ...base.conquest, ...overrides.conquest, coinCost: [...(overrides.conquest?.coinCost ?? base.conquest.coinCost)] as Res },
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
  if (!(c.farmMultiplier >= 0.5 && c.farmMultiplier <= 3)) errors.push('Bevolking × moet tussen 0,5 en 3 liggen.');
  if (!(c.buildSpeed > 0)) errors.push('Bouwsnelheid moet groter dan 0 zijn.');
  if (!(c.recruitSpeed > 0)) errors.push('Rekruteersnelheid moet groter dan 0 zijn.');
  if (!(c.marchSpeed > 0)) errors.push('Loopsnelheid moet groter dan 0 zijn.');
  if (!(c.map.density > 0 && c.map.density <= 1)) errors.push('Dichtheid moet tussen 0 en 1 liggen.');
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
