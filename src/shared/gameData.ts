/**
 * Default game data (Tribal Wars values, world speed 1).
 * These tables are copied into WorldConfig when a world is created, so a save
 * always keeps the numbers it was started with. Sources: see the design doc,
 * tab "Spelwaardes fase 2".
 */

export type Res = [wood: number, stone: number, iron: number];

export const BUILDING_IDS = [
  'main',
  'barracks',
  'stable',
  'garage',
  'snob',
  'smith',
  'place',
  'statue',
  'market',
  'wood',
  'stone',
  'iron',
  'farm',
  'storage',
  'hide',
  'wall',
  'church',
  'church_f',
] as const;
export type BuildingId = (typeof BUILDING_IDS)[number];

export interface BuildingDef {
  name: string;
  maxLevel: number;
  minLevel: number;
  cost: Res;
  costFactor: Res;
  /** Workers (farm space) at level 1. */
  pop: number;
  popFactor: number;
  /** Base build time in seconds (world speed 1). */
  buildTime: number;
  buildTimeFactor: number;
  /** Points at level 1; total at level L = points * 1.2^(L-1). */
  points: number;
  requires: Partial<Record<BuildingId, number>>;
}

const F_STD: Res = [1.26, 1.275, 1.26];
const F_MIL: Res = [1.26, 1.28, 1.26];

export const DEFAULT_BUILDINGS: Record<BuildingId, BuildingDef> = {
  main: { name: 'Hoofdgebouw', maxLevel: 30, minLevel: 1, cost: [90, 80, 70], costFactor: F_STD, pop: 5, popFactor: 1.17, buildTime: 900, buildTimeFactor: 1.2, points: 10, requires: {} },
  barracks: { name: 'Kazerne', maxLevel: 25, minLevel: 0, cost: [200, 170, 90], costFactor: F_MIL, pop: 7, popFactor: 1.17, buildTime: 1800, buildTimeFactor: 1.2, points: 16, requires: { main: 3 } },
  stable: { name: 'Stal', maxLevel: 20, minLevel: 0, cost: [270, 240, 260], costFactor: F_MIL, pop: 8, popFactor: 1.17, buildTime: 6000, buildTimeFactor: 1.2, points: 20, requires: { main: 10, barracks: 5, smith: 5 } },
  garage: { name: 'Werkplaats', maxLevel: 15, minLevel: 0, cost: [300, 240, 260], costFactor: F_MIL, pop: 8, popFactor: 1.17, buildTime: 6000, buildTimeFactor: 1.2, points: 24, requires: { main: 10, smith: 10 } },
  snob: { name: 'Adelshoeve', maxLevel: 1, minLevel: 0, cost: [15000, 25000, 10000], costFactor: [2, 2, 2], pop: 80, popFactor: 1.17, buildTime: 586800, buildTimeFactor: 1.2, points: 512, requires: { main: 20, smith: 20, market: 10 } },
  smith: { name: 'Smederij', maxLevel: 20, minLevel: 0, cost: [220, 180, 240], costFactor: F_STD, pop: 20, popFactor: 1.17, buildTime: 6000, buildTimeFactor: 1.2, points: 19, requires: { main: 5, barracks: 1 } },
  place: { name: 'Verzamelplaats', maxLevel: 1, minLevel: 0, cost: [10, 40, 30], costFactor: F_STD, pop: 0, popFactor: 1.17, buildTime: 10860, buildTimeFactor: 1.2, points: 0, requires: {} },
  statue: { name: 'Standbeeld', maxLevel: 1, minLevel: 0, cost: [220, 220, 220], costFactor: F_STD, pop: 10, popFactor: 1.17, buildTime: 1500, buildTimeFactor: 1.2, points: 24, requires: {} },
  market: { name: 'Marktplaats', maxLevel: 25, minLevel: 0, cost: [100, 100, 100], costFactor: F_STD, pop: 20, popFactor: 1.17, buildTime: 2700, buildTimeFactor: 1.2, points: 10, requires: { main: 3, storage: 2 } },
  wood: { name: 'Houthakker', maxLevel: 30, minLevel: 0, cost: [50, 60, 40], costFactor: [1.25, 1.275, 1.245], pop: 5, popFactor: 1.155, buildTime: 900, buildTimeFactor: 1.2, points: 6, requires: {} },
  stone: { name: 'Leemgroeve', maxLevel: 30, minLevel: 0, cost: [65, 50, 40], costFactor: [1.27, 1.265, 1.24], pop: 10, popFactor: 1.14, buildTime: 900, buildTimeFactor: 1.2, points: 6, requires: {} },
  iron: { name: 'IJzermijn', maxLevel: 30, minLevel: 0, cost: [75, 65, 70], costFactor: [1.252, 1.275, 1.24], pop: 10, popFactor: 1.17, buildTime: 1080, buildTimeFactor: 1.2, points: 6, requires: {} },
  farm: { name: 'Boerderij', maxLevel: 30, minLevel: 1, cost: [45, 40, 30], costFactor: [1.3, 1.32, 1.29], pop: 0, popFactor: 1, buildTime: 1200, buildTimeFactor: 1.2, points: 5, requires: {} },
  storage: { name: 'Opslagplaats', maxLevel: 30, minLevel: 1, cost: [60, 50, 40], costFactor: [1.265, 1.27, 1.245], pop: 0, popFactor: 1.15, buildTime: 1020, buildTimeFactor: 1.2, points: 6, requires: {} },
  hide: { name: 'Schuilplaats', maxLevel: 10, minLevel: 0, cost: [50, 60, 50], costFactor: [1.25, 1.25, 1.25], pop: 2, popFactor: 1.17, buildTime: 1800, buildTimeFactor: 1.2, points: 5, requires: {} },
  wall: { name: 'Muur', maxLevel: 20, minLevel: 0, cost: [50, 100, 20], costFactor: F_STD, pop: 5, popFactor: 1.17, buildTime: 3600, buildTimeFactor: 1.2, points: 8, requires: { barracks: 1 } },
  // churches (world setting): TW costs and workers; radius 4 / 6 / 8 fields
  church: { name: 'Kerk', maxLevel: 3, minLevel: 0, cost: [16000, 20000, 5000], costFactor: F_MIL, pop: 5000, popFactor: 1.55, buildTime: 21600, buildTimeFactor: 1.6, points: 10, requires: { main: 5, farm: 5 } },
  church_f: { name: 'Eerste kerk', maxLevel: 1, minLevel: 0, cost: [160, 200, 50], costFactor: F_STD, pop: 5, popFactor: 1, buildTime: 30, buildTimeFactor: 1, points: 10, requires: {} },
};
/** Buildings that only exist on worlds with churches. */
export const CHURCH_BUILDINGS: readonly BuildingId[] = ['church', 'church_f'];

export const UNIT_IDS = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult', 'knight', 'snob'] as const;
export type UnitId = (typeof UNIT_IDS)[number];

export type RecruitBuilding = 'barracks' | 'stable' | 'garage' | 'statue' | 'snob';
export const RECRUIT_BUILDINGS: readonly RecruitBuilding[] = ['barracks', 'stable', 'garage', 'statue', 'snob'];

export interface UnitDef {
  name: string;
  cost: Res;
  pop: number;
  attack: number;
  defense: number;
  defenseCavalry: number;
  defenseArcher: number;
  /** Minutes per field at unit speed 1. */
  speed: number;
  carry: number;
  /** Base recruit time in seconds (world speed 1). */
  buildTime: number;
  building: RecruitBuilding;
  /**
   * Smithy research (simple system). null = available from the start, no research.
   * requires = building levels needed before research is possible.
   */
  research: { requires: Partial<Record<BuildingId, number>>; cost: Res } | null;
}

export const DEFAULT_UNITS: Record<UnitId, UnitDef> = {
  spear: { name: 'Speerdrager', cost: [50, 30, 10], pop: 1, attack: 10, defense: 15, defenseCavalry: 45, defenseArcher: 20, speed: 18, carry: 25, buildTime: 1020, building: 'barracks', research: null },
  sword: { name: 'Zwaardvechter', cost: [30, 30, 70], pop: 1, attack: 25, defense: 50, defenseCavalry: 15, defenseArcher: 40, speed: 22, carry: 15, buildTime: 1500, building: 'barracks', research: null },
  axe: { name: 'Bijlstrijder', cost: [60, 30, 40], pop: 1, attack: 40, defense: 10, defenseCavalry: 5, defenseArcher: 10, speed: 18, carry: 10, buildTime: 1320, building: 'barracks', research: { requires: { smith: 2 }, cost: [700, 840, 820] } },
  archer: { name: 'Boogschutter', cost: [100, 30, 60], pop: 1, attack: 15, defense: 50, defenseCavalry: 40, defenseArcher: 5, speed: 18, carry: 10, buildTime: 1800, building: 'barracks', research: { requires: { barracks: 5, smith: 5 }, cost: [640, 560, 740] } },
  spy: { name: 'Verkenner', cost: [50, 50, 20], pop: 2, attack: 0, defense: 2, defenseCavalry: 1, defenseArcher: 2, speed: 9, carry: 0, buildTime: 900, building: 'stable', research: { requires: { stable: 1 }, cost: [560, 480, 480] } },
  light: { name: 'Lichte cavalerie', cost: [125, 100, 250], pop: 4, attack: 130, defense: 30, defenseCavalry: 40, defenseArcher: 30, speed: 10, carry: 80, buildTime: 1800, building: 'stable', research: { requires: { stable: 3 }, cost: [2200, 2400, 2000] } },
  marcher: { name: 'Bereden boogschutter', cost: [250, 100, 150], pop: 5, attack: 120, defense: 40, defenseCavalry: 30, defenseArcher: 50, speed: 10, carry: 50, buildTime: 2700, building: 'stable', research: { requires: { stable: 5 }, cost: [3000, 2400, 2000] } },
  // TODO(open question): heavy cavalry research cost not found yet; placeholder.
  heavy: { name: 'Zware cavalerie', cost: [200, 150, 600], pop: 6, attack: 150, defense: 200, defenseCavalry: 80, defenseArcher: 180, speed: 11, carry: 50, buildTime: 3600, building: 'stable', research: { requires: { stable: 10, smith: 15 }, cost: [3000, 2400, 6000] } },
  ram: { name: 'Ram', cost: [300, 200, 200], pop: 5, attack: 2, defense: 20, defenseCavalry: 50, defenseArcher: 20, speed: 30, carry: 0, buildTime: 4800, building: 'garage', research: { requires: { garage: 1 }, cost: [1200, 1600, 800] } },
  catapult: { name: 'Katapult', cost: [320, 400, 100], pop: 8, attack: 100, defense: 100, defenseCavalry: 50, defenseArcher: 100, speed: 30, carry: 0, buildTime: 7200, building: 'garage', research: { requires: { garage: 2, smith: 12 }, cost: [1600, 2000, 1200] } },
  knight: { name: 'Paladijn', cost: [20, 20, 40], pop: 10, attack: 150, defense: 250, defenseCavalry: 400, defenseArcher: 150, speed: 10, carry: 100, buildTime: 21600, building: 'statue', research: null },
  snob: { name: 'Edelman', cost: [40000, 50000, 50000], pop: 100, attack: 30, defense: 100, defenseCavalry: 50, defenseArcher: 100, speed: 35, carry: 0, buildTime: 12000, building: 'snob', research: null },
};

export const RES_NAMES = ['Hout', 'Leem', 'IJzer'] as const;

/** Combat class of a unit: which defense value it attacks against. */
export type UnitClass = 'infantry' | 'cavalry' | 'archer';
export const UNIT_CLASS: Record<UnitId, UnitClass> = {
  spear: 'infantry',
  sword: 'infantry',
  axe: 'infantry',
  archer: 'archer',
  spy: 'cavalry',
  light: 'cavalry',
  marcher: 'archer',
  heavy: 'cavalry',
  ram: 'infantry',
  catapult: 'infantry',
  knight: 'cavalry',
  snob: 'infantry',
};

export type UnitCounts = Partial<Record<UnitId, number>>;

/** Buildings catapults can target (the hiding place can't be hit). */
export const CATAPULT_TARGETS: readonly BuildingId[] = BUILDING_IDS.filter((b) => b !== 'hide' && b !== 'church_f');
/** Buildings catapults can't destroy below level 1. */
export const MIN_LEVEL_ONE: readonly BuildingId[] = ['main', 'farm', 'storage'];
