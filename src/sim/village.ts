import type { VillageManager } from './manager';
/**
 * Village simulation: resources, building queue, requirements, smithy and recruitment.
 *
 * Every action returns null on success or a Dutch error message for the player.
 * Every scheduled event carries a job id; when the event fires, the handler checks
 * the job still exists and is still due at exactly this time. Cancelling a job just
 * moves the others and schedules new events: the old events then find nothing to do.
 */
import { noblesAllowed, payPackages } from './nobles';
import { BONUS_FACTORS, type BarbType, type BonusKind } from '../shared/barbarianTypes';
import type { WorldConfig } from '../shared/config';
import {
  BUILDING_IDS,
  CHURCH_BUILDINGS,
  RECRUIT_BUILDINGS,
  UNIT_IDS,
  type BuildingId,
  type RecruitBuilding,
  type Res,
  type UnitCounts,
  type UnitId,
} from '../shared/gameData';
import { push } from './eventQueue';
import {
  buildTimeMs,
  buildingCost,
  buildingPopCost,
  buildingPopTotal,
  farmCapacity, farmCapacityIn,
  productionPerHour,
  recruitTimeMs,
  researchTimeMs,
  storageCapacity,
} from './formulas';
import { HUMAN_ID, addLog, nextId, type WorldState } from './state';
import { buildingReward } from './quests';
import { hasFirstChurch } from './church';

export interface BuildJob {
  id: number;
  building: BuildingId;
  /** Level the building reaches when this job finishes. */
  level: number;
  start: number;
  end: number;
  cost: Res;
  /** Tearing a level down instead of building one: `level` is the level after it. */
  demolish?: true;
}

/** HQ level needed to tear buildings down, like TW. */
export const DEMOLISH_HQ = 15;

/** The level whose build time a job takes: the new level, or the one being torn down. */
function jobTimeLevel(job: BuildJob): number {
  return job.demolish ? job.level + 1 : job.level;
}

export interface RecruitJob {
  id: number;
  unit: UnitId;
  total: number;
  done: number;
  /** Game ms per unit, fixed when ordered. */
  perUnit: number;
  /** When the next unit of this job is finished. */
  nextAt: number;
  costPer: Res;
}

export interface ResearchJob {
  id: number;
  unit: UnitId;
  /** Tech level this job reaches (research levels worlds; 1 = developed). */
  level?: number;
  end: number;
  cost: Res;
}

export interface Village {
  id: number;
  name: string;
  owner: number;
  x: number;
  y: number;
  buildings: Record<BuildingId, number>;
  /** Resources at `resAt`; read through currentResources(). */
  res: Res;
  resAt: number;
  /** Units at home. */
  units: Record<UnitId, number>;
  /** Units of this village that are on the road (they still use farm space). */
  outside: Record<UnitId, number>;
  researched: UnitId[];
  /** Research levels worlds: tech level per unit above 1 (developed units without an entry are level 1). */
  tech?: Partial<Record<UnitId, number>>;
  buildQueue: BuildJob[];
  recruitQueues: Record<RecruitBuilding, RecruitJob[]>;
  research: ResearchJob | null;
  /**
   * Barbarian villages only: how far lazy growth has progressed.
   * 'levels' mode: `since` is the time of the next unpaid interval.
   * 'points' mode: `since` is when growth started and `start` the points at that moment.
   */
  growth?: {
    step: number;
    since: number;
    start?: number;
    /** Points lost to rams/catapults at `at`; paid off at the normal growth speed. */
    debt?: { points: number; at: number };
    /** Wall broken by rams: rebuilt at the type's repair speed from `level` (at `at`) up to `peak`. */
    wallRepair?: { at: number; level: number; peak: number };
  };
  /** Barbarian type (new worlds). Only shown to a player who scouted the village. */
  barbType?: BarbType;
  /** Production bonus. Stays with the village when it is conquered. */
  bonus?: BonusKind;
  /** Troops of other villages stationed here, per village they come from. */
  support?: Record<number, UnitCounts>;
  /** Account manager settings (player villages). */
  manager?: VillageManager;
  /** Your village groups this village is in. */
  groups?: string[];
  /** Noble packages stored here (packages worlds). */
  packages?: number;
  /** Loyalty at `loyaltyAt`; regenerates over time. Missing = 100. */
  loyalty?: number;
  loyaltyAt?: number;
}

// --- creation ---------------------------------------------------------------

export function createVillage(
  config: WorldConfig,
  id: number,
  owner: number,
  name: string,
  x: number,
  y: number,
  time: number,
): Village {
  const buildings = {} as Record<BuildingId, number>;
  for (const b of BUILDING_IDS) {
    buildings[b] = config.village.startLevels[b] ?? config.buildings[b]?.minLevel ?? 0;
  }
  // churches: a player's (first) village starts with the first church
  if (config.churches && owner >= 0) buildings.church_f = 1;
  const units = {} as Record<UnitId, number>;
  for (const u of UNIT_IDS) units[u] = 0;
  const recruitQueues = {} as Record<RecruitBuilding, RecruitJob[]>;
  for (const b of RECRUIT_BUILDINGS) recruitQueues[b] = [];
  return {
    id,
    name,
    owner,
    x,
    y,
    buildings,
    res: [...config.village.startResources],
    resAt: time,
    units,
    outside: { ...units },
    researched: UNIT_IDS.filter((u) => config.units[u].research === null),
    buildQueue: [],
    recruitQueues,
    research: null,
  };
}

// --- resources --------------------------------------------------------------

export function productionRates(config: WorldConfig, v: Village): Res {
  const f = v.bonus ? BONUS_FACTORS[v.bonus] : ([1, 1, 1] as const);
  return [
    productionPerHour(config, v.buildings.wood) * f[0],
    productionPerHour(config, v.buildings.stone) * f[1],
    productionPerHour(config, v.buildings.iron) * f[2],
  ];
}

/** Resources at `time`, without changing the village. */
export function currentResources(config: WorldConfig, v: Village, time: number): Res {
  const cap = storageCapacity(v.buildings.storage);
  const rates = productionRates(config, v);
  const hours = Math.max(0, time - v.resAt) / 3_600_000;
  return [0, 1, 2].map((i) => {
    const have = v.res[i as 0 | 1 | 2];
    // production never pushes past the cap, but resources already above it (e.g. refunds) are kept
    if (have >= cap) return have;
    return Math.min(cap, have + rates[i as 0 | 1 | 2] * hours);
  }) as Res;
}

/** Writes the produced resources into the village. Call before anything that changes rates, cap or stock. */
export function settle(config: WorldConfig, v: Village, time: number): void {
  v.res = currentResources(config, v, time);
  v.resAt = time;
}

function canAfford(have: Res, cost: Res): boolean {
  return have[0] >= cost[0] && have[1] >= cost[1] && have[2] >= cost[2];
}

function pay(v: Village, cost: Res, times = 1): void {
  for (const i of [0, 1, 2] as const) v.res[i] -= cost[i] * times;
}

function refund(v: Village, cost: Res, times: number, share: number): void {
  for (const i of [0, 1, 2] as const) v.res[i] += Math.floor(cost[i] * times * share);
}

// --- levels, population, requirements ---------------------------------------

/** Level a building will have once everything in the build queue is done (the last job wins). */
export function plannedLevel(v: Village, b: BuildingId): number {
  let level = v.buildings[b];
  for (const job of v.buildQueue) if (job.building === b) level = job.level;
  return level;
}

/**
 * Farm space used: buildings at their planned level + units at home + units in recruit queues.
 * A building being torn down keeps its farm space until it is actually gone.
 */
export function popUsed(config: WorldConfig, v: Village): number {
  let used = 0;
  for (const b of BUILDING_IDS) used += buildingPopTotal(config.buildings[b], Math.max(v.buildings[b], plannedLevel(v, b)));
  for (const u of UNIT_IDS) used += (v.units[u] + v.outside[u]) * config.units[u].pop;
  for (const b of RECRUIT_BUILDINGS) {
    for (const job of v.recruitQueues[b]) used += (job.total - job.done) * config.units[job.unit].pop;
  }
  return used;
}

export function popMax(config: WorldConfig, v: Village): number {
  return farmCapacityIn(config, v.buildings.farm);
}

export function missingRequirements(
  config: WorldConfig,
  v: Village,
  requires: Partial<Record<BuildingId, number>>,
): string[] {
  const missing: string[] = [];
  for (const [b, level] of Object.entries(requires) as [BuildingId, number][]) {
    if (v.buildings[b] < level) missing.push(`${config.buildings[b].name} ${level}`);
  }
  return missing;
}

/**
 * A building works only while its own requirements are met. If a requirement drops
 * (demolished, or hit by catapults), everything that depends on it stops until it is restored.
 */
export function isOperational(config: WorldConfig, v: Village, b: BuildingId): boolean {
  return v.buildings[b] > 0 && missingRequirements(config, v, config.buildings[b].requires).length === 0;
}

// --- building ---------------------------------------------------------------

/** Why the next level of `b` can't be ordered right now, or null if it can. */
export function buildBlocker(state: WorldState, v: Village, b: BuildingId): string | null {
  const { config } = state;
  const def = config.buildings[b];
  if (!def || (CHURCH_BUILDINGS.includes(b) && !config.churches)) return 'Niet actief op deze wereld';
  const target = plannedLevel(v, b) + 1;
  if (target > def.maxLevel) return 'Maximaal level bereikt';
  if (b === 'church_f' && hasFirstChurch(state, v.owner)) return 'Je hebt al een eerste kerk';
  if (b === 'church' && (v.buildings.church_f > 0 || v.buildQueue.some((j) => j.building === 'church_f'))) return 'Hier staat al de eerste kerk';
  if (b === 'church_f' && (v.buildings.church > 0 || v.buildQueue.some((j) => j.building === 'church'))) return 'Hier staat al een kerk';
  if (v.buildQueue.length >= config.village.buildQueueSlots) return 'Bouwqueue is vol';
  const missing = missingRequirements(config, v, def.requires);
  if (missing.length > 0) return `Vereist: ${missing.join(', ')}`;
  const cost = buildingCost(def, target);
  const cap = storageCapacity(v.buildings.storage);
  if (cost.some((c) => c > cap)) return 'Opslagplaats te klein';
  // farm and storage need no workers: they can always be built, also when the village is over its farm
  const workers = buildingPopCost(def, target);
  if (workers > 0 && popUsed(config, v) + workers > popMax(config, v)) return 'Boerderij is vol';
  if (!canAfford(currentResources(config, v, state.time), cost)) return 'Te weinig grondstoffen';
  return null;
}

/** Why `b` can't be torn down one more level right now, or null if it can. */
export function demolishBlocker(state: WorldState, v: Village, b: BuildingId): string | null {
  const { config } = state;
  const def = config.buildings[b];
  const target = plannedLevel(v, b) - 1;
  if (v.buildings.main < DEMOLISH_HQ) return `Hoofdgebouw ${DEMOLISH_HQ} nodig`;
  if (target < def.minLevel) return 'Kan niet lager';
  if (v.buildQueue.length >= config.village.buildQueueSlots) return 'Bouwqueue is vol';
  if (b === 'farm' && popUsed(config, v) > farmCapacityIn(config, target)) return 'Boerderij is te vol';
  if (target === 0 && (RECRUIT_BUILDINGS as readonly string[]).includes(b) && v.recruitQueues[b as RecruitBuilding].length > 0) {
    return 'Rekruteren loopt nog';
  }
  if (target === 0 && b === 'smith' && v.research) return 'Onderzoek loopt nog';
  return null;
}

/** Queues tearing down one level of `b`. Costs nothing and gives nothing back; frees farm space when done. */
export function queueDemolish(state: WorldState, villageId: number, b: BuildingId): string | null {
  const v = state.villages[villageId];
  if (!v) return 'Dorp bestaat niet.';
  const blocker = demolishBlocker(state, v, b);
  if (blocker) return blocker;
  const { config } = state;
  const level = plannedLevel(v, b) - 1;
  const start = buildQueueFreeAt(state, v);
  const end = start + buildTimeMs(config, config.buildings[b], level + 1, plannedLevel(v, 'main'));
  const job: BuildJob = { id: nextId(state), building: b, level, start, end, cost: [0, 0, 0], demolish: true };
  v.buildQueue.push(job);
  push(state.queue, end, { kind: 'build', villageId: v.id, jobId: job.id });
  return null;
}

export const VILLAGE_NAME_MAX = 32;

export function renameVillage(state: WorldState, villageId: number, name: string): string | null {
  const v = state.villages[villageId];
  if (!v) return 'Dorp bestaat niet.';
  const clean = name.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return 'Naam mag niet leeg zijn.';
  if (clean.length > VILLAGE_NAME_MAX) return `Naam mag maximaal ${VILLAGE_NAME_MAX} tekens zijn.`;
  v.name = clean;
  return null;
}

/** When the build queue is free for a new job. */
function buildQueueFreeAt(state: WorldState, v: Village): number {
  return v.buildQueue.at(-1)?.end ?? state.time;
}

export function queueBuild(state: WorldState, villageId: number, b: BuildingId): string | null {
  const v = state.villages[villageId];
  if (!v) return 'Dorp bestaat niet.';
  const { config } = state;
  const blocker = buildBlocker(state, v, b);
  if (blocker) return blocker;

  settle(config, v, state.time);
  const def = config.buildings[b];
  const level = plannedLevel(v, b) + 1;
  const cost = buildingCost(def, level);
  pay(v, cost);
  const start = buildQueueFreeAt(state, v);
  // an HQ upgrade already in the queue counts: it will be done when this job starts
  const end = start + buildTimeMs(config, def, level, plannedLevel(v, 'main'));
  const job: BuildJob = { id: nextId(state), building: b, level, start, end, cost };
  v.buildQueue.push(job);
  push(state.queue, end, { kind: 'build', villageId: v.id, jobId: job.id });
  return null;
}

/**
 * Re-times build jobs from `from` onward: each starts when the previous one ends and takes
 * as long as the HQ level at that moment allows (counting HQ upgrades earlier in the queue).
 * Old events become stale because their end time no longer matches.
 */
function retimeBuildQueue(state: WorldState, v: Village, from: number): void {
  const { config } = state;
  let hq = v.buildings.main;
  for (let i = 0; i < v.buildQueue.length; i++) {
    const job = v.buildQueue[i];
    if (!job) continue;
    if (i >= from) {
      const start = i === 0 ? state.time : (v.buildQueue[i - 1]?.end ?? state.time);
      const end = start + buildTimeMs(config, config.buildings[job.building], jobTimeLevel(job), hq);
      if (start !== job.start || end !== job.end) {
        job.start = start;
        job.end = end;
        push(state.queue, end, { kind: 'build', villageId: v.id, jobId: job.id });
      }
    }
    if (job.building === 'main') hq = job.level;
  }
}

/**
 * Cancels one level of a building. Clicking any job of a building removes its highest
 * queued level (later levels depend on earlier ones), so ordering 11-14 and cancelling 11
 * leaves 11-13. The rest of the queue moves up.
 */
export function cancelBuild(state: WorldState, villageId: number, jobId: number): string | null {
  const v = state.villages[villageId];
  if (!v) return 'Dorp bestaat niet.';
  const clicked = v.buildQueue.find((j) => j.id === jobId);
  if (!clicked) return 'Bouwopdracht bestaat niet.';
  let index = -1;
  for (let i = v.buildQueue.length - 1; i >= 0; i--) {
    if (v.buildQueue[i]?.building === clicked.building) {
      index = i;
      break;
    }
  }
  const cancelled = v.buildQueue[index];
  if (!cancelled) return 'Bouwopdracht bestaat niet.';
  settle(state.config, v, state.time);
  refund(v, cancelled.cost, 1, state.config.village.cancelRefund);
  v.buildQueue.splice(index, 1);
  retimeBuildQueue(state, v, index);
  return null;
}

export function onBuildDone(state: WorldState, villageId: number, jobId: number): void {
  const v = state.villages[villageId];
  const job = v?.buildQueue[0];
  if (!v || !job || job.id !== jobId || job.end !== state.time) return; // stale event
  settle(state.config, v, state.time);
  v.buildings[job.building] = job.level;
  v.buildQueue.shift();
  // the next job starts now, at the speed of the (possibly new) HQ level
  retimeBuildQueue(state, v, 0);
  if ((RECRUIT_BUILDINGS as readonly string[]).includes(job.building)) {
    retimeRecruitQueue(state, v, job.building as RecruitBuilding);
  }
  if (job.demolish) {
    addLog(state, { time: state.time, text: `${v.name}: ${state.config.buildings[job.building].name} afgebroken tot level ${job.level}.` });
    return;
  }
  buildingReward(state, v, job.building, job.level, job.cost);
  addLog(state, { time: state.time, text: `${v.name}: ${state.config.buildings[job.building].name} level ${job.level} klaar.` });
}

// --- smithy -----------------------------------------------------------------

export function isUnitEnabled(config: WorldConfig, u: UnitId): boolean {
  if ((u === 'archer' || u === 'marcher') && !config.archers) return false;
  if (u === 'knight' && config.paladin === 'off') return false;
  return true;
}

// --- research levels (world setting) ---------------------------------------------

/** Highest tech level per unit: 1 (simple), 3 or 10. */
export function maxTech(config: WorldConfig): number {
  return config.research === 'levels3' ? 3 : config.research === 'levels10' ? 10 : 1;
}
/** A unit's tech level in a village: 0 = not developed. */
export function techLevel(config: WorldConfig, v: Village, u: UnitId): number {
  if (!v.researched.includes(u)) return 0;
  return config.research === 'simple' ? 1 : Math.min(maxTech(config), v.tech?.[u] ?? 1);
}
/** Strength multiplier of a tech level (TW: three levels 1 / 1.25 / 1.4, ten levels up to 1.5). */
export function techMultiplier(config: WorldConfig, level: number): number {
  if (level <= 1 || config.research === 'simple') return 1;
  if (config.research === 'levels3') return level >= 3 ? 1.4 : 1.25;
  return 1 + (Math.min(10, level) - 1) / 18;
}
/** What researching `level` of a unit costs (TW: x4 per level on three levels, x1.6 on ten). */
export function researchCost(config: WorldConfig, u: UnitId, level: number): Res {
  const base = config.units[u].research?.cost ?? (config.units[u].cost.map((c) => c * 4) as Res);
  const f = (config.research === 'levels3' ? 4 : 1.6) ** Math.max(0, level - 1);
  return base.map((c) => Math.round(c * f)) as Res;
}
/** Smithy level needed for a tech level above 1. */
export function smithForTech(config: WorldConfig, level: number): number {
  if (level <= 1) return 0;
  return config.research === 'levels3' ? (level === 2 ? 10 : 15) : Math.min(20, 2 * level);
}

export function researchBlocker(state: WorldState, v: Village, u: UnitId): string | null {
  const { config } = state;
  const research = config.units[u].research;
  if (!isUnitEnabled(config, u)) return 'Niet actief op deze wereld';
  const level = techLevel(config, v, u);
  const next = level + 1;
  if (level >= maxTech(config) || (level === 0 && research === null)) return level >= maxTech(config) && maxTech(config) > 1 ? 'Maximaal level' : 'Al ontwikkeld';
  if (v.research) return 'Smederij is al bezig';
  if (v.buildings.smith === 0) return 'Bouw eerst een smederij';
  if (!isOperational(config, v, 'smith')) return 'Smederij werkt niet';
  if (next === 1 && research) {
    const missing = missingRequirements(config, v, research.requires);
    if (missing.length > 0) return `Vereist: ${missing.join(', ')}`;
  }
  if (v.buildings.smith < smithForTech(config, next)) return `Vereist: Smederij ${smithForTech(config, next)}`;
  const cost = researchCost(config, u, next);
  const cap = storageCapacity(v.buildings.storage);
  if (cost.some((c) => c > cap)) return 'Opslagplaats te klein';
  if (!canAfford(currentResources(config, v, state.time), cost)) return 'Te weinig grondstoffen';
  return null;
}

export function startResearch(state: WorldState, villageId: number, u: UnitId): string | null {
  const v = state.villages[villageId];
  if (!v) return 'Dorp bestaat niet.';
  const blocker = researchBlocker(state, v, u);
  if (blocker) return blocker;
  const level = techLevel(state.config, v, u) + 1;
  const cost = researchCost(state.config, u, level);
  settle(state.config, v, state.time);
  pay(v, cost);
  const end = state.time + Math.round(researchTimeMs(state.config, v.buildings.smith) * (1 + (level - 1) * 0.5));
  v.research = { id: nextId(state), unit: u, end, cost, ...(level > 1 ? { level } : {}) };
  push(state.queue, end, { kind: 'research', villageId: v.id, jobId: v.research.id });
  return null;
}

export function cancelResearch(state: WorldState, villageId: number): string | null {
  const v = state.villages[villageId];
  if (!v?.research) return 'Er loopt geen ontwikkeling.';
  settle(state.config, v, state.time);
  refund(v, v.research.cost, 1, state.config.village.cancelRefund);
  v.research = null;
  return null;
}

export function onResearchDone(state: WorldState, villageId: number, jobId: number): void {
  const v = state.villages[villageId];
  const job = v?.research;
  if (!v || !job || job.id !== jobId || job.end !== state.time) return;
  if ((job.level ?? 1) > 1) (v.tech ??= {})[job.unit] = job.level;
  else if (!v.researched.includes(job.unit)) v.researched.push(job.unit);
  v.research = null;
  addLog(state, { time: state.time, text: `${v.name}: ${state.config.units[job.unit].name} ${(job.level ?? 1) > 1 ? `level ${job.level}` : 'ontwikkeld'}.` });
}

// --- recruitment ------------------------------------------------------------

function jobEnd(job: RecruitJob): number {
  return job.nextAt + (job.total - job.done - 1) * job.perUnit;
}

/**
 * Recruiting is settled lazily: units count as done the moment their time has come, but they
 * are written into the village only when something looks at it (an event at the village, a bot
 * turn, a command). Same outcome as one event per unit, without the events.
 * The human player keeps an event per unit, so quests and the screen stay live; bots get one
 * event per job, at its last unit.
 *
 * `before`: count only units finished before now. Other events at time T run before the
 * recruits finishing at T (see eventQueue), so they must not see those units yet.
 */
export function settleRecruits(state: WorldState, v: Village, before = false): void {
  const limit = before ? state.time - 1 : state.time;
  for (const b of RECRUIT_BUILDINGS) {
    const queue = v.recruitQueues[b];
    for (let job = queue[0]; job && job.nextAt <= limit; job = queue[0]) {
      const n = Math.min(job.total - job.done, Math.floor((limit - job.nextAt) / job.perUnit) + 1);
      v.units[job.unit] += n;
      job.done += n;
      if (job.done < job.total) {
        job.nextAt += n * job.perUnit;
        break;
      }
      queue.shift();
      if (v.owner === HUMAN_ID) {
        const name = state.config.units[job.unit].name;
        addLog(state, { time: state.time, text: `${v.name}: ${job.total}× ${name} klaar.` });
      }
    }
  }
}

/** Old saves: bot jobs had an event per unit; give each one an event at its end. */
export function rescheduleBotRecruits(state: WorldState): void {
  for (const v of Object.values(state.villages)) {
    if (v.owner === HUMAN_ID) continue;
    for (const b of RECRUIT_BUILDINGS) for (const job of v.recruitQueues[b]) scheduleRecruit(state, v, job);
  }
}

/** When a job needs its next event: every unit for the human, only the last one for bots. */
function scheduleRecruit(state: WorldState, v: Village, job: RecruitJob): void {
  push(state.queue, v.owner === HUMAN_ID ? job.nextAt : jobEnd(job), { kind: 'recruit', villageId: v.id, jobId: job.id });
}

function paladinsOwned(state: WorldState, owner: number): number {
  let n = 0;
  for (const v of Object.values(state.villages)) {
    if (v.owner !== owner) continue;
    n += v.units.knight + v.outside.knight;
    for (const job of v.recruitQueues.statue) n += job.total - job.done;
  }
  return n;
}

/** Most units of type `u` the village can recruit right now (0 if blocked). */
export function maxRecruitable(state: WorldState, v: Village, u: UnitId): number {
  const { config } = state;
  const def = config.units[u];
  const have = currentResources(config, v, state.time);
  let n = Math.floor(Math.min(...[0, 1, 2].map((i) => (def.cost[i as 0 | 1 | 2] > 0 ? have[i as 0 | 1 | 2] / def.cost[i as 0 | 1 | 2] : Infinity))));
  if (def.pop > 0) n = Math.min(n, Math.floor((popMax(config, v) - popUsed(config, v)) / def.pop));
  if (u === 'knight') n = Math.min(n, 1 - paladinsOwned(state, v.owner));
  if (u === 'snob') n = Math.min(n, noblesAllowed(state, v));
  return Math.max(0, n);
}

/** Why `u` can't be recruited at all right now (ignores amount), or null. */
export function recruitBlocker(state: WorldState, v: Village, u: UnitId): string | null {
  const { config } = state;
  const def = config.units[u];
  if (!isUnitEnabled(config, u)) return 'Niet actief op deze wereld';
  if (!isOperational(config, v, def.building)) {
    return v.buildings[def.building] > 0 ? `${config.buildings[def.building].name} werkt niet` : `Bouw eerst een ${config.buildings[def.building].name.toLowerCase()}`;
  }
  if (!v.researched.includes(u)) return 'Nog niet ontwikkeld in de smederij';
  if (u === 'knight' && paladinsOwned(state, v.owner) >= 1) return 'Je hebt al een paladijn';
  if (u === 'snob' && noblesAllowed(state, v) === 0) {
    return state.config.nobleCost === 'coins' ? 'Meer munten nodig' : 'Meer pakketten nodig';
  }
  return null;
}

export function recruit(state: WorldState, villageId: number, u: UnitId, count: number): string | null {
  const v = state.villages[villageId];
  if (!v) return 'Dorp bestaat niet.';
  if (!Number.isInteger(count) || count < 1) return 'Ongeldig aantal.';
  const blocker = recruitBlocker(state, v, u);
  if (blocker) return blocker;
  const max = maxRecruitable(state, v, u);
  if (count > max) return max === 0 ? 'Te weinig grondstoffen of boerderijruimte' : `Maximaal ${max} mogelijk`;

  const { config } = state;
  const def = config.units[u];
  settle(config, v, state.time);
  pay(v, def.cost, count);
  if (u === 'snob') payPackages(state, v, count);
  const queue = v.recruitQueues[def.building];
  const last = queue.at(-1);
  const perUnit = recruitTimeMs(config, def, v.buildings[def.building]);
  const job: RecruitJob = {
    id: nextId(state),
    unit: u,
    total: count,
    done: 0,
    perUnit,
    nextAt: (last ? jobEnd(last) : state.time) + perUnit,
    costPer: def.cost,
  };
  queue.push(job);
  scheduleRecruit(state, v, job);
  return null;
}

/**
 * After a recruit building levelled up: the unit in production finishes at its current time,
 * every unit after it uses the new speed.
 */
function retimeRecruitQueue(state: WorldState, v: Village, b: RecruitBuilding): void {
  settleRecruits(state, v, true);
  const queue = v.recruitQueues[b];
  let prevEnd = state.time;
  for (let i = 0; i < queue.length; i++) {
    const job = queue[i];
    if (!job) continue;
    const perUnit = recruitTimeMs(state.config, state.config.units[job.unit], v.buildings[b]);
    const oldNext = job.nextAt, oldEnd = jobEnd(job);
    job.perUnit = perUnit;
    if (i > 0) job.nextAt = prevEnd + perUnit;
    // the old event becomes stale (a stale event only settles, which is harmless)
    if (v.owner === HUMAN_ID ? job.nextAt !== oldNext : jobEnd(job) !== oldEnd) scheduleRecruit(state, v, job);
    prevEnd = jobEnd(job);
  }
}

export function cancelRecruit(state: WorldState, villageId: number, jobId: number): string | null {
  const v = state.villages[villageId];
  if (!v) return 'Dorp bestaat niet.';
  for (const b of RECRUIT_BUILDINGS) {
    const queue = v.recruitQueues[b];
    const index = queue.findIndex((j) => j.id === jobId);
    const job = queue[index];
    if (!job) continue;
    settleRecruits(state, v);
    if (!queue.includes(job)) return 'Deze opdracht is al klaar.';
    settle(state.config, v, state.time);
    refund(v, job.costPer, job.total - job.done, state.config.village.cancelRefund);
    queue.splice(index, 1);
    // re-time the jobs behind it
    for (let i = index; i < queue.length; i++) {
      const next = queue[i];
      if (!next) continue;
      const prev = queue[i - 1];
      next.nextAt = (i === 0 || !prev ? state.time : jobEnd(prev)) + next.perUnit;
      scheduleRecruit(state, v, next);
    }
    return null;
  }
  return 'Rekruteeropdracht bestaat niet.';
}

/** Dismisses troops at home for good: no refund. Only your own villages. */
export function dismissUnits(state: WorldState, villageId: number, units: UnitCounts): string | null {
  const v = state.villages[villageId];
  if (!v || v.owner !== HUMAN_ID) return 'Dat is niet jouw dorp.';
  let any = false;
  for (const u of UNIT_IDS) {
    const n = Math.floor(units[u] ?? 0);
    if (n < 0) return 'Ongeldig aantal.';
    if (n > v.units[u]) return `Er staan niet zoveel ${state.config.units[u].name.toLowerCase()} thuis.`;
    if (n > 0) any = true;
  }
  if (!any) return 'Kies minstens één eenheid.';
  const gone: string[] = [];
  for (const u of UNIT_IDS) {
    const n = Math.floor(units[u] ?? 0);
    if (n > 0) { v.units[u] -= n; gone.push(`${n}× ${state.config.units[u].name}`); }
  }
  addLog(state, { time: state.time, text: `${v.name}: ${gone.join(', ')} weggestuurd.` });
  return null;
}

export function onRecruitTick(state: WorldState, villageId: number, jobId: number): void {
  const v = state.villages[villageId];
  if (!v) return;
  for (const b of RECRUIT_BUILDINGS) {
    const queue = v.recruitQueues[b];
    const job = queue[0];
    if (!job || job.id !== jobId) continue;
    // the human gets an event per unit: is this the live one? (bots: one per job, any event just settles)
    const live = v.owner === HUMAN_ID && job.nextAt === state.time;
    settleRecruits(state, v);
    if (live && queue[0] === job) scheduleRecruit(state, v, job);
    return;
  }
  settleRecruits(state, v);
}
