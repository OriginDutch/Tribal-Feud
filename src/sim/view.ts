/**
 * Read-only views for the UI. Computed in the worker, sent in snapshots.
 * The UI never computes game rules itself: it only shows what is in here.
 */
import { loyaltyNow } from './movement';
import type { VillageManager } from './manager';
import { coinsForSlots, curveOf, maxMintable, mintBlocker, nextNobleNeed, noblesAllowed, slotCost, slotsForCoins, slotsUsed } from './nobles';
import { BUILDING_IDS, RECRUIT_BUILDINGS, UNIT_IDS, type BuildingId, type RecruitBuilding, type Res, type UnitCounts, type UnitId } from '../shared/gameData';
import {
  buildTimeMs,
  buildingCost,
  buildingPoints,
  buildingPopCost,
  farmCapacity, farmCapacityIn,
  hidingCapacity,
  productionPerHour,
  recruitTimeMs,
  researchTimeMs,
  storageCapacity,
} from './formulas';
import type { WorldState } from './state';
import { MERCHANTS } from './market';
import { BONUS_FACTORS } from '../shared/barbarianTypes';
import {
  buildBlocker,
  demolishBlocker,
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
  /** What the building does at its level, and at the next ones (for its info screen). */
  effect: BuildingEffect | null;
  /** Tearing one level down (from the planned level); null when it is already at its lowest. */
  demolish: { level: number; time: number; blocker: string | null } | null;
}

export interface BuildingEffect {
  /** What the number means, e.g. "Productie per uur". */
  label: string;
  unit: 'perHour' | 'amount' | 'percent';
  /** The value at the current level and at each level from 1 to the max. */
  byLevel: number[];
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
  buildQueue: { id: number; building: BuildingId; name: string; level: number; start: number; end: number; demolish?: true }[];
  units: UnitView[];
  recruitQueues: Record<RecruitBuilding, RecruitJobView[]>;
  research: { unit: UnitId; name: string; end: number } | null;
  buildQueueSlots: number;
  loyalty: number;
  nobles: {
    mode: 'coins' | 'packages';
    /** Coins of the player, or packages in this village. */
    have: number;
    /** Needed (in total for coins, extra for packages) for one more nobleman. */
    need: number;
    slotsUsed: number;
    /** Coins: the next slot you haven't paid for yet, what it costs on its own, and how many coins you still miss for it. */
    nextSlot: number;
    slotPrice: number;
    missing: number;
    curve: 'tiered' | 'classic';
    allowed: number;
    coinCost: Res;
    maxMint: number;
    mintBlocker: string | null;
    maxDistance: number;
  };
  /** Troops of other villages standing here. */
  supportHere: SupportView[];
  /** This village's troops standing elsewhere. */
  supportAway: SupportView[];
  manager: VillageManager | null;
}

export interface SupportView {
  /** The village the troops come from. */
  origin: { id: number; name: string; x: number; y: number; ownerName: string };
  /** The village they stand in. */
  host: { id: number; name: string; x: number; y: number; ownerName: string };
  units: UnitCounts;
}

/** The effect of a building per level, for its info screen; null when it has no single number. */
function buildingEffect(state: WorldState, v: Village, b: BuildingId): BuildingEffect | null {
  const { config } = state;
  const max = config.buildings[b].maxLevel;
  const levels = (fn: (level: number) => number) => Array.from({ length: max + 1 }, (_, l) => fn(l));
  const bonus = v.bonus ? BONUS_FACTORS[v.bonus] : ([1, 1, 1] as const);
  switch (b) {
    case 'wood':
    case 'stone':
    case 'iron': {
      const i = b === 'wood' ? 0 : b === 'stone' ? 1 : 2;
      return { label: 'Productie per uur', unit: 'perHour', byLevel: levels((l) => productionPerHour(config, l) * bonus[i]) };
    }
    case 'storage':
      return { label: 'Opslag per grondstof', unit: 'amount', byLevel: levels((l) => storageCapacity(l)) };
    case 'farm':
      return { label: 'Inwoners', unit: 'amount', byLevel: levels((l) => farmCapacityIn(config, l)) };
    case 'hide':
      return { label: 'Verborgen per grondstof', unit: 'amount', byLevel: levels((l) => hidingCapacity(l)) };
    case 'wall':
      return { label: 'Verdedigingsbonus', unit: 'percent', byLevel: levels((l) => (config.combat.wallFactor ** l - 1) * 100) };
    case 'main':
      return { label: 'Sneller bouwen', unit: 'percent', byLevel: levels((l) => (1 - 1.05 ** -l) * 100) };
    case 'barracks':
    case 'stable':
    case 'garage':
      return { label: 'Sneller rekruteren', unit: 'percent', byLevel: levels((l) => (l <= 0 ? 0 : (1 - 1.06 ** -l) * 100)) };
    case 'market':
      return { label: 'Handelaren', unit: 'amount', byLevel: levels((l) => MERCHANTS[l] ?? 0) };
    default:
      return null;
  }
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
      effect: buildingEffect(state, v, b),
      demolish:
        planned > def.minLevel
          ? { level: planned - 1, time: buildTimeMs(config, def, planned, v.buildings.main), blocker: demolishBlocker(state, v, b) }
          : null,
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
    pop: { used: popUsed(config, v), max: popMax(config, v) },
    buildings,
    buildQueue: v.buildQueue.map((j) => ({
      id: j.id,
      building: j.building,
      name: config.buildings[j.building].name,
      level: j.level,
      start: j.start,
      end: j.end,
      ...(j.demolish ? { demolish: true as const } : {}),
    })),
    units,
    recruitQueues,
    research: v.research ? { unit: v.research.unit, name: config.units[v.research.unit].name, end: v.research.end } : null,
    buildQueueSlots: config.village.buildQueueSlots,
    loyalty: Math.floor(loyaltyNow(config, v, state.time)),
    nobles: (() => {
      const next = nextNobleNeed(state, v);
      const curve = curveOf(state);
      const used = slotsUsed(state, v.owner);
      const nextSlot = Math.max(used, config.nobleCost === 'coins' ? slotsForCoins(next.have, curve) : used) + 1;
      return {
        nextSlot,
        slotPrice: slotCost(nextSlot, curve),
        missing: config.nobleCost === 'coins' ? Math.max(0, coinsForSlots(nextSlot, curve) - next.have) : Math.max(0, next.need - next.have),
        curve,
        mode: config.nobleCost,
        have: next.have,
        need: next.need,
        slotsUsed: slotsUsed(state, v.owner),
        allowed: noblesAllowed(state, v),
        coinCost: config.conquest.coinCost,
        maxMint: maxMintable(state, v),
        mintBlocker: mintBlocker(state, v),
        maxDistance: config.conquest.maxDistance,
      };
    })(),
    supportHere: Object.entries(v.support ?? {}).flatMap(([originId, units]) => {
      const origin = state.villages[Number(originId)];
      return origin ? [{ origin: brief(state, origin), host: brief(state, v), units }] : [];
    }),
    supportAway: supportAwayOf(state, v),
    manager: v.manager ?? null,
  };
}

function brief(state: WorldState, v: Village): SupportView['origin'] {
  const owner = v.owner < 0 ? 'Barbaren' : (state.players[v.owner]?.name ?? '?');
  return { id: v.id, name: v.name, x: v.x, y: v.y, ownerName: owner };
}

/** Where this village's troops stand as support. Only looks if some troops are outside. */
function supportAwayOf(state: WorldState, v: Village): SupportView[] {
  if (!UNIT_IDS.some((u) => v.outside[u] > 0)) return [];
  const out: SupportView[] = [];
  for (const host of Object.values(state.villages)) {
    const units = host.support?.[v.id];
    if (units && Object.keys(units).length > 0) out.push({ origin: brief(state, v), host: brief(state, host), units });
  }
  return out;
}

export { isOperational };
