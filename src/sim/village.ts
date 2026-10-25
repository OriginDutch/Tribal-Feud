/**
 * Village simulation: resources, building queue, requirements, smithy and recruitment.
 *
 * Every action returns null on success or a Dutch error message for the player.
 * Every scheduled event carries a job id; when the event fires, the handler checks
 * the job still exists and is still due at exactly this time. Cancelling a job just
 * moves the others and schedules new events: the old events then find nothing to do.
 */
import { BONUS_FACTORS, type BarbType, type BonusKind } from '../shared/barbarianTypes';
import type { WorldConfig } from '../shared/config';
import {
  BUILDING_IDS,
  RECRUIT_BUILDINGS,
  UNIT_IDS,
  type BuildingId,
  type RecruitBuilding,
  type Res,
  type UnitId,
} from '../shared/gameData';
import { push } from './eventQueue';
import {
  buildTimeMs,
  buildingCost,
  buildingPopCost,
  buildingPopTotal,
  farmCapacity,
  productionPerHour,
  recruitTimeMs,
  researchTimeMs,
  storageCapacity,
} from './formulas';
import { addLog, nextId, type WorldState } from './state';
import { buildingReward } from './quests';

export interface BuildJob {
  id: number;
  building: BuildingId;
  /** Level the building reaches when this job finishes. */
  level: number;
  start: number;
  end: number;
  cost: Res;
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
  buildQueue: BuildJob[];
  recruitQueues: Record<RecruitBuilding, RecruitJob[]>;
  research: ResearchJob | null;
  /**
   * Barbarian villages only: how far lazy growth has progressed.
   * 'levels' mode: `since` is the time of the next unpaid interval.
   * 'points' mode: `since` is when growth started and `start` the points at that moment.
   */
  growth?: { step: number; since: number; start?: number };
  /** Barbarian type (new worlds). Only shown to a player who scouted the village. */
  barbType?: BarbType;
  /** Production bonus. Stays with the village when it is conquered. */
  bonus?: BonusKind;
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
    buildings[b] = config.village.startLevels[b] ?? config.buildings[b].minLevel;
  }
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

/** Level a building will have once everything in the build queue is done. */
export function plannedLevel(v: Village, b: BuildingId): number {
  let level = v.buildings[b];
  for (const job of v.buildQueue) if (job.building === b) level = Math.max(level, job.level);
  return level;
}

/** Farm space used: buildings at their planned level + units at home + units in recruit queues. */
export function popUsed(config: WorldConfig, v: Village): number {
  let used = 0;
  for (const b of BUILDING_IDS) used += buildingPopTotal(config.buildings[b], plannedLevel(v, b));
  for (const u of UNIT_IDS) used += (v.units[u] + v.outside[u]) * config.units[u].pop;
  for (const b of RECRUIT_BUILDINGS) {
    for (const job of v.recruitQueues[b]) used += (job.total - job.done) * config.units[job.unit].pop;
  }
  return used;
}

export function popMax(v: Village): number {
  return farmCapacity(v.buildings.farm);
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
  const target = plannedLevel(v, b) + 1;
  if (target > def.maxLevel) return 'Maximaal level bereikt';
  if (v.buildQueue.length >= config.village.buildQueueSlots) return 'Bouwqueue is vol';
  const missing = missingRequirements(config, v, def.requires);
  if (missing.length > 0) return `Vereist: ${missing.join(', ')}`;
  const cost = buildingCost(def, target);
  const cap = storageCapacity(v.buildings.storage);
  if (cost.some((c) => c > cap)) return 'Opslagplaats te klein';
  if (popUsed(config, v) + buildingPopCost(def, target) > popMax(v)) return 'Boerderij is vol';
  if (!canAfford(currentResources(config, v, state.time), cost)) return 'Te weinig grondstoffen';
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
  const end = start + buildTimeMs(config, def, level, v.buildings.main);
  const job: BuildJob = { id: nextId(state), building: b, level, start, end, cost };
  v.buildQueue.push(job);
  push(state.queue, end, { kind: 'build', villageId: v.id, jobId: job.id });
  return null;
}

/** Cancels a build job, plus later jobs for the same building (their level depends on it). */
export function cancelBuild(state: WorldState, villageId: number, jobId: number): string | null {
  const v = state.villages[villageId];
  if (!v) return 'Dorp bestaat niet.';
  const index = v.buildQueue.findIndex((j) => j.id === jobId);
  const cancelled = v.buildQueue[index];
  if (!cancelled) return 'Bouwopdracht bestaat niet.';
  settle(state.config, v, state.time);

  const keep: BuildJob[] = v.buildQueue.slice(0, index);
  for (const job of v.buildQueue.slice(index)) {
    if (job === cancelled || job.building === cancelled.building) {
      refund(v, job.cost, 1, state.config.village.cancelRefund);
    } else {
      keep.push(job);
    }
  }

  // re-time everything from the cancelled position onward; old events become stale
  for (let i = index; i < keep.length; i++) {
    const job = keep[i];
    if (!job) continue;
    const duration = job.end - job.start;
    job.start = i === 0 ? state.time : (keep[i - 1]?.end ?? state.time);
    job.end = job.start + duration;
    push(state.queue, job.end, { kind: 'build', villageId: v.id, jobId: job.id });
  }
  v.buildQueue = keep;
  return null;
}

export function onBuildDone(state: WorldState, villageId: number, jobId: number): void {
  const v = state.villages[villageId];
  const job = v?.buildQueue[0];
  if (!v || !job || job.id !== jobId || job.end !== state.time) return; // stale event
  settle(state.config, v, state.time);
  v.buildings[job.building] = job.level;
  v.buildQueue.shift();
  buildingReward(state, v, job.building, job.level, job.cost);
  addLog(state, { time: state.time, text: `${v.name}: ${state.config.buildings[job.building].name} level ${job.level} klaar.` });
}

// --- smithy -----------------------------------------------------------------

export function isUnitEnabled(config: WorldConfig, u: UnitId): boolean {
  if ((u === 'archer' || u === 'marcher') && !config.archers) return false;
  if (u === 'knight' && config.paladin === 'off') return false;
  return true;
}

export function researchBlocker(state: WorldState, v: Village, u: UnitId): string | null {
  const { config } = state;
  const research = config.units[u].research;
  if (!isUnitEnabled(config, u)) return 'Niet actief op deze wereld';
  if (research === null || v.researched.includes(u)) return 'Al ontwikkeld';
  if (v.research) return 'Smederij is al bezig';
  if (v.buildings.smith === 0) return 'Bouw eerst een smederij';
  if (!isOperational(config, v, 'smith')) return 'Smederij werkt niet';
  const missing = missingRequirements(config, v, research.requires);
  if (missing.length > 0) return `Vereist: ${missing.join(', ')}`;
  const cap = storageCapacity(v.buildings.storage);
  if (research.cost.some((c) => c > cap)) return 'Opslagplaats te klein';
  if (!canAfford(currentResources(config, v, state.time), research.cost)) return 'Te weinig grondstoffen';
  return null;
}

export function startResearch(state: WorldState, villageId: number, u: UnitId): string | null {
  const v = state.villages[villageId];
  if (!v) return 'Dorp bestaat niet.';
  const blocker = researchBlocker(state, v, u);
  if (blocker) return blocker;
  const research = state.config.units[u].research;
  if (!research) return 'Al ontwikkeld';
  settle(state.config, v, state.time);
  pay(v, research.cost);
  const end = state.time + researchTimeMs(state.config, v.buildings.smith);
  v.research = { id: nextId(state), unit: u, end, cost: research.cost };
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
  v.researched.push(job.unit);
  v.research = null;
  addLog(state, { time: state.time, text: `${v.name}: ${state.config.units[job.unit].name} ontwikkeld.` });
}

// --- recruitment ------------------------------------------------------------

function jobEnd(job: RecruitJob): number {
  return job.nextAt + (job.total - job.done - 1) * job.perUnit;
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
  if (def.pop > 0) n = Math.min(n, Math.floor((popMax(v) - popUsed(config, v)) / def.pop));
  if (u === 'knight') n = Math.min(n, 1 - paladinsOwned(state, v.owner));
  return Math.max(0, n);
}

/** Why `u` can't be recruited at all right now (ignores amount), or null. */
export function recruitBlocker(state: WorldState, v: Village, u: UnitId): string | null {
  const { config } = state;
  const def = config.units[u];
  if (!isUnitEnabled(config, u)) return 'Niet actief op deze wereld';
  if (u === 'snob') return 'Edelmannen komen in fase 4';
  if (!isOperational(config, v, def.building)) {
    return v.buildings[def.building] > 0 ? `${config.buildings[def.building].name} werkt niet` : `Bouw eerst een ${config.buildings[def.building].name.toLowerCase()}`;
  }
  if (!v.researched.includes(u)) return 'Nog niet ontwikkeld in de smederij';
  if (u === 'knight' && paladinsOwned(state, v.owner) >= 1) return 'Je hebt al een paladijn';
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
  push(state.queue, job.nextAt, { kind: 'recruit', villageId: v.id, jobId: job.id });
  return null;
}

export function cancelRecruit(state: WorldState, villageId: number, jobId: number): string | null {
  const v = state.villages[villageId];
  if (!v) return 'Dorp bestaat niet.';
  for (const b of RECRUIT_BUILDINGS) {
    const queue = v.recruitQueues[b];
    const index = queue.findIndex((j) => j.id === jobId);
    const job = queue[index];
    if (!job) continue;
    settle(state.config, v, state.time);
    refund(v, job.costPer, job.total - job.done, state.config.village.cancelRefund);
    queue.splice(index, 1);
    // re-time the jobs behind it
    for (let i = index; i < queue.length; i++) {
      const next = queue[i];
      if (!next) continue;
      const prev = queue[i - 1];
      next.nextAt = (i === 0 || !prev ? state.time : jobEnd(prev)) + next.perUnit;
      push(state.queue, next.nextAt, { kind: 'recruit', villageId: v.id, jobId: next.id });
    }
    return null;
  }
  return 'Rekruteeropdracht bestaat niet.';
}

export function onRecruitTick(state: WorldState, villageId: number, jobId: number): void {
  const v = state.villages[villageId];
  if (!v) return;
  for (const b of RECRUIT_BUILDINGS) {
    const queue = v.recruitQueues[b];
    const job = queue[0];
    if (!job || job.id !== jobId) continue;
    if (job.nextAt !== state.time) return; // stale event
    v.units[job.unit]++;
    job.done++;
    if (job.done >= job.total) {
      queue.shift();
      const name = state.config.units[job.unit].name;
      addLog(state, { time: state.time, text: `${v.name}: ${job.total}× ${name} klaar.` });
    } else {
      job.nextAt += job.perUnit;
      push(state.queue, job.nextAt, { kind: 'recruit', villageId: v.id, jobId: job.id });
    }
    return;
  }
}
