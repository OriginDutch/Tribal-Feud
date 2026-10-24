/**
 * Read-only views for the UI. Computed in the worker, sent in snapshots.
 * The UI never computes game rules itself: it only shows what is in here.
 */
import { BUILDING_IDS, RECRUIT_BUILDINGS, UNIT_IDS, type BuildingId, type RecruitBuilding, type Res, type UnitId } from '../shared/gameData';
import {
  buildTimeMs,
  buildingCost,
  buildingPoints,
  buildingPopCost,
  hidingCapacity,
  recruitTimeMs,
  researchTimeMs,
  storageCapacity,
} from './formulas';
import type { WorldState } from './state';
import {
  buildBlocker,
  currentResources,
  isOperational,
  isUnitEnabled,
  maxRecruitable,
  missingRequirements,
  plannedLevel,
  popMax,
  popUsed,
  productionRates,
  recruitBlocker,
  researchBlocker,
  type Village,
} from './village';

export interface BuildingView {
  id: BuildingId;
  name: string;
  level: number;
  planned: number;
  maxLevel: number;
  /** Requirements are met (a level-0 building counts as operational if it could be built). */
  operational: boolean;
  next: { level: number; cost: Res; pop: number; time: number } | null;
  blocker: string | null;
}

export interface UnitView {
  id: UnitId;
  name: string;
  building: RecruitBuilding;
  enabled: boolean;
  home: number;
  cost: Res;
  pop: number;
  stats: { attack: number; defense: number; defenseCavalry: number; defenseArcher: number; speed: number; carry: number };
  researched: boolean;
  research: { cost: Res; requires: string[]; time: number; blocker: string | null } | null;
  recruit: { perUnit: number; max: number; blocker: string | null };
}

export interface RecruitJobView {
  id: number;
  unit: UnitId;
  name: string;
  total: number;
  done: number;
  nextAt: number;
  end: number;
}

export interface VillageView {
  id: number;
  name: string;
  x: number;
  y: number;
  points: number;
  res: Res;
  storage: number;
  hide: number;
  /** Per hour. */
  rates: Res;
  pop: { used: number; max: number };
  buildings: BuildingView[];
  buildQueue: { id: number; building: BuildingId; name: string; level: number; start: number; end: number }[];
  units: UnitView[];
  recruitQueues: Record<RecruitBuilding, RecruitJobView[]>;
  research: { unit: UnitId; name: string; end: number } | null;
  buildQueueSlots: number;
}

export function villageView(state: WorldState, v: Village): VillageView {
  const { config } = state;

  const buildings: BuildingView[] = BUILDING_IDS.map((b) => {
    const def = config.buildings[b];
    const planned = plannedLevel(v, b);
    const nextLevel = planned + 1;
    const next =
      nextLevel <= def.maxLevel
        ? {
            level: nextLevel,
            cost: buildingCost(def, nextLevel),
            pop: buildingPopCost(def, nextLevel),
            time: buildTimeMs(config, def, nextLevel, v.buildings.main),
          }
        : null;
    return {
      id: b,
      name: def.name,
      level: v.buildings[b],
      planned,
      maxLevel: def.maxLevel,
      operational: missingRequirements(config, v, def.requires).length === 0,
      next,
      blocker: buildBlocker(state, v, b),
    };
  });

  const units: UnitView[] = UNIT_IDS.map((u) => {
    const def = config.units[u];
    return {
      id: u,
      name: def.name,
      building: def.building,
      enabled: isUnitEnabled(config, u),
      home: v.units[u],
      cost: def.cost,
      pop: def.pop,
      stats: {
        attack: def.attack,
        defense: def.defense,
        defenseCavalry: def.defenseCavalry,
        defenseArcher: def.defenseArcher,
        speed: def.speed,
        carry: def.carry,
      },
      researched: v.researched.includes(u),
      research: def.research
        ? {
            cost: def.research.cost,
            requires: missingRequirements(config, v, def.research.requires),
            time: researchTimeMs(config, v.buildings.smith),
            blocker: researchBlocker(state, v, u),
          }
        : null,
      recruit: {
        perUnit: recruitTimeMs(config, def, v.buildings[def.building]),
        max: recruitBlocker(state, v, u) ? 0 : maxRecruitable(state, v, u),
        blocker: recruitBlocker(state, v, u),
      },
    };
  });

  const recruitQueues = {} as Record<RecruitBuilding, RecruitJobView[]>;
  for (const b of RECRUIT_BUILDINGS) {
    recruitQueues[b] = v.recruitQueues[b].map((job) => ({
      id: job.id,
      unit: job.unit,
      name: config.units[job.unit].name,
      total: job.total,
      done: job.done,
      nextAt: job.nextAt,
      end: job.nextAt + (job.total - job.done - 1) * job.perUnit,
    }));
  }

  let points = 0;
  for (const b of BUILDING_IDS) points += buildingPoints(config.buildings[b], v.buildings[b]);

  return {
    id: v.id,
    name: v.name,
    x: v.x,
    y: v.y,
    points,
    res: currentResources(config, v, state.time),
    storage: storageCapacity(v.buildings.storage),
    hide: hidingCapacity(v.buildings.hide),
    rates: productionRates(config, v),
    pop: { used: popUsed(config, v), max: popMax(v) },
    buildings,
    buildQueue: v.buildQueue.map((j) => ({
      id: j.id,
      building: j.building,
      name: config.buildings[j.building].name,
      level: j.level,
      start: j.start,
      end: j.end,
    })),
    units,
    recruitQueues,
    research: v.research ? { unit: v.research.unit, name: config.units[v.research.unit].name, end: v.research.end } : null,
    buildQueueSlots: config.village.buildQueueSlots,
  };
}

export { isOperational };
