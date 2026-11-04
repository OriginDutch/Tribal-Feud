/**
 * Account manager: the player's villages can follow a build template and keep a troop
 * target by themselves, like TW's premium account manager. It plays by the same rules as
 * everything else (queueBuild, recruit, startResearch) and only does what the player set.
 */
import { BUILD_PRESETS } from '../shared/botProfiles';
import { BUILDING_IDS, UNIT_IDS, type BuildingId, type Res, type UnitCounts, type UnitId } from '../shared/gameData';
import { MINUTE } from '../shared/time';
import { tr } from '../shared/i18n';
import { autoBuild } from './bots';
import { push } from './eventQueue';
import { recruitTimeMs } from './formulas';
import { HUMAN_ID, villagesOf, type WorldState } from './state';
import { autoMint, sendSurplus } from './surplus';
import {
  currentResources,
  maxRecruitable,
  recruit,
  recruitBlocker,
  researchBlocker,
  researchCost,
  startResearch,
  techLevel,
  buildBlocker,
  demolishBlocker,
  plannedLevel,
  queueBuild,
  queueDemolish,
  type Village,
} from './village';
import { hasFaith, hasFirstChurch } from './church';
import { FLAG_TYPES, freeFlagsByLevel, setFlag, type FlagType } from './flags';

export interface BuildTemplate {
  id: string;
  name: string;
  steps: [BuildingId, number][];
  /** Once built: tear down what stands higher than the template has it (not the farm; buildings it doesn't name stay). */
  demolish?: true;
}

/** A named troop target the player can put on villages (only the player's own, no presets). */
export interface TroopTemplate {
  id: string;
  name: string;
  troops: UnitCounts;
}

/** A saved noble train: the first attack, an escort per extra nobleman (2..5 nobles) and the catapult target. */
export interface NobleTemplate {
  id: string;
  name: string;
  first: UnitCounts;
  escorts: UnitCounts[];
  catapultTarget?: BuildingId;
  /** The first wave is a pure clear, without a nobleman. */
  clearFirst?: boolean;
}

export interface VillageManager {
  /** Build template id (a preset or one of the player's own). */
  template?: string;
  /** Troop template id: when set, its troops are the target (and `troops` is ignored). */
  troopTemplate?: string;
  /** Troops to keep (home + away + in training). */
  troops?: UnitCounts;
  /** Most of the spare resources (0..1) the manager spends on troops per check. */
  troopShare: number;
  /** Churches worlds: build a church when the village has no faith. */
  church?: boolean;
  /** Research levels worlds: raise the levels of the troop target's units when money allows. */
  research?: boolean;
  /** Flags worlds: keep the best free flag of this kind in the village. */
  flag?: FlagType;
}

/** Game minutes between two manager checks at world speed 1 (scaled like bot turns). */
const CHECK_MINUTES = 5;

export function allTemplates(state: WorldState): BuildTemplate[] {
  // preset names are Dutch keys: shown in the reader's language (ids stay)
  return [...BUILD_PRESETS.map((t) => ({ ...t, name: tr(t.name) })), ...(state.templates ?? [])];
}

export function findTemplate(state: WorldState, id: string | undefined): BuildTemplate | undefined {
  return id ? allTemplates(state).find((t) => t.id === id) : undefined;
}

/**
 * How often the manager looks at your villages: every 5 game minutes on a normal world, faster on a
 * fast one, but never more often than once a game minute. Every 15 game seconds (speed 20) meant
 * walking all your villages 240 times a game hour; a slot that frees up waiting a minute costs nothing.
 */
function checkInterval(state: WorldState): number {
  const c = state.config;
  return Math.max(MINUTE, (CHECK_MINUTES * MINUTE) / (c.worldSpeed * Math.max(1, c.buildSpeed, c.recruitSpeed)));
}

/** Keeps exactly one manager check scheduled while any village has a manager. */
export function scheduleManager(state: WorldState): void {
  const active = villagesOf(state, HUMAN_ID).some((v) => v.manager);
  if (!active) {
    delete state.managerAt;
    return;
  }
  if (state.managerAt !== undefined && state.managerAt > state.time) return;
  state.managerAt = state.time + checkInterval(state);
  push(state.queue, state.managerAt, { kind: 'manager' });
}

export function onManagerCheck(state: WorldState): void {
  if (state.managerAt !== state.time) return; // stale
  delete state.managerAt;
  for (const v of villagesOf(state, HUMAN_ID)) if (v.manager) manageVillage(state, v, v.manager);
  if (state.surplus?.auto) sendSurplus(state);
  if (state.mint?.auto) autoMint(state); // after the troops: they come first
  scheduleManager(state);
}

export function manageVillage(state: WorldState, v: Village, m: VillageManager): void {
  const template = findTemplate(state, m.template);
  // the presets play like the bots (keeping resources in balance); own templates are followed exactly
  const reserve: Res = template ? autoBuild(state, v, template.steps, [0, 0, 0], !template.id.startsWith('preset:')) : [0, 0, 0];
  if (template?.demolish && !template.id.startsWith('preset:')) tearDown(state, v, template.steps);
  const troops = m.troopTemplate ? state.troopTemplates?.find((t) => t.id === m.troopTemplate)?.troops : m.troops;
  if (troops) keepTroops(state, v, troops, m.troopShare, reserve);
  // churches: a village without faith gets one (the first church again if it was lost)
  if (m.church && state.config.churches && v.buildQueue.length < state.config.village.buildQueueSlots && !hasFaith(state, v)) {
    const b = hasFirstChurch(state, v.owner) ? 'church' : 'church_f';
    if (buildBlocker(state, v, b) === null) queueBuild(state, v.id, b);
  }
  // research levels: the units of the troop target, one level at a time, with money to spare
  if (m.research && troops && state.config.research !== 'simple' && !v.research) {
    const have = currentResources(state.config, v, state.time);
    for (const u of Object.keys(troops) as UnitId[]) {
      const next = techLevel(state.config, v, u) + 1;
      if (next < 2 || researchBlocker(state, v, u) !== null) continue;
      const cost = researchCost(state.config, u, next);
      if ([0, 1, 2].some((i) => have[i as 0 | 1 | 2] - reserve[i as 0 | 1 | 2] < cost[i as 0 | 1 | 2] * 1.5)) continue;
      startResearch(state, v.id, u);
      break;
    }
  }
  // flags: the best free flag of the chosen kind
  if (m.flag && state.config.flags) {
    const p = state.players[v.owner]!;
    const current = v.flag?.type === m.flag ? v.flag.level : 0;
    const free = freeFlagsByLevel(state, p, m.flag);
    for (let l = 9; l > current; l--) {
      if ((free[l - 1] ?? 0) > 0) { setFlag(state, v.owner, v.id, { type: m.flag, level: l }); break; }
    }
  }
}

/**
 * Own template with "afbreken": when every step is there, one level at a time comes off a building
 * that stands higher than the template's highest level for it. Not the farm, and buildings the
 * template doesn't name stay as they are.
 */
export function tearDown(state: WorldState, v: Village, steps: readonly (readonly [BuildingId, number])[]): void {
  if (steps.some(([b, l]) => plannedLevel(v, b) < l)) return; // first build, then tear down
  if (v.buildQueue.length >= state.config.village.buildQueueSlots) return;
  const want = new Map<BuildingId, number>();
  for (const [b, l] of steps) want.set(b, Math.max(want.get(b) ?? 0, l));
  for (const [b, l] of want) {
    if (b === 'farm' || plannedLevel(v, b) <= l) continue;
    if (demolishBlocker(state, v, b) !== null) continue;
    queueDemolish(state, v.id, b);
    return;
  }
}

/** Jobs per recruit building the manager keeps queued. */
const TROOP_JOBS = 4;
/** Most troops in one job: big orders when there are resources for them. */
const MAX_BATCH = 100;

/**
 * Grows the village towards its troop target. Units from the same building grow together: the
 * budget is split over the buildings by what is still missing, and inside a building the unit
 * that is furthest behind (owned / wanted) gets the next job. A job is as big as the resources
 * allow, up to MAX_BATCH, so the queue alternates in chunks (spear, sword, spear...) instead of
 * first all spears and then all swords.
 */
function keepTroops(state: WorldState, v: Village, target: UnitCounts, share: number, reserve: Res): void {
  const { config } = state;
  const have = currentResources(config, v, state.time);
  const budget: Res = [0, 1, 2].map((i) => Math.max(0, have[i as 0 | 1 | 2] - reserve[i as 0 | 1 | 2]) * share) as Res;
  const owned = (u: UnitId) => {
    let n = v.units[u] + v.outside[u];
    for (const job of v.recruitQueues[config.units[u].building]) if (job.unit === u) n += job.total - job.done;
    return n;
  };
  // what is wanted and can be recruited here, per building
  const byBuilding = new Map<string, UnitId[]>();
  for (const u of UNIT_IDS) {
    const want = target[u] ?? 0;
    if (want <= 0) continue;
    if (!v.researched.includes(u)) {
      if (!v.research && researchBlocker(state, v, u) === null) startResearch(state, v.id, u);
      continue;
    }
    if (owned(u) >= want || recruitBlocker(state, v, u) !== null) continue;
    const b = config.units[u].building;
    byBuilding.set(b, [...(byBuilding.get(b) ?? []), u]);
  }
  if (!byBuilding.size) return;
  const missingCost = (u: UnitId) => Math.max(0, (target[u] ?? 0) - owned(u)) * config.units[u].cost.reduce((a, b) => a + b, 0);
  const weights = new Map([...byBuilding].map(([b, us]) => [b, us.reduce((t, u) => t + missingCost(u), 0)]));
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  for (const [b, units] of byBuilding) {
    const part = (weights.get(b) ?? 0) / Math.max(1, total);
    const left: Res = budget.map((r) => r * part) as Res;
    const queue = v.recruitQueues[b as keyof typeof v.recruitQueues];
    while (queue.length < TROOP_JOBS) {
      // the unit furthest behind its target that we can still afford
      const next = units
        .filter((u) => owned(u) < (target[u] ?? 0))
        .sort((a, c) => owned(a) / (target[a] ?? 1) - owned(c) / (target[c] ?? 1))
        .find((u) => config.units[u].cost.every((c, i) => left[i as 0 | 1 | 2] >= c));
      if (!next) break;
      const def = config.units[next];
      const affordable = Math.floor(Math.min(...[0, 1, 2].map((i) => left[i as 0 | 1 | 2] / Math.max(1, def.cost[i as 0 | 1 | 2]))));
      const n = Math.min((target[next] ?? 0) - owned(next), affordable, maxRecruitable(state, v, next), MAX_BATCH);
      if (n < 1 || recruit(state, v.id, next, n) !== null) break;
      for (const i of [0, 1, 2] as const) left[i] -= def.cost[i] * n;
    }
  }
}

/** Sets (or clears with null) the manager of one of the player's villages. */
export function setManager(state: WorldState, villageId: number, m: VillageManager | null): string | null {
  const v = state.villages[villageId];
  if (!v || v.owner !== HUMAN_ID) return tr('Dat is niet jouw dorp.');
  if (!m) {
    delete v.manager;
    scheduleManager(state);
    return null;
  }
  if (m.template && !findTemplate(state, m.template)) return tr('Sjabloon bestaat niet.');
  if (m.troopTemplate && !state.troopTemplates?.some((t) => t.id === m.troopTemplate)) return tr('Troepensjabloon bestaat niet.');
  const troops: UnitCounts = {};
  for (const u of UNIT_IDS) {
    const n = Math.floor(m.troops?.[u] ?? 0);
    if (n > 0) troops[u] = n;
  }
  v.manager = { troopShare: Math.min(1, Math.max(0, m.troopShare)) };
  if (m.template) v.manager.template = m.template;
  if (m.troopTemplate) v.manager.troopTemplate = m.troopTemplate;
  if (Object.keys(troops).length > 0) v.manager.troops = troops;
  if (m.church) v.manager.church = true;
  if (m.research) v.manager.research = true;
  if (m.flag && FLAG_TYPES.includes(m.flag)) v.manager.flag = m.flag;
  scheduleManager(state);
  manageVillage(state, v, v.manager);
  return null;
}

/** Adds or replaces one of the player's own templates. */
export function saveTemplate(state: WorldState, t: BuildTemplate): string | null {
  if (t.id.startsWith('preset:')) return tr('Voorbeeldsjablonen kun je niet aanpassen; maak een kopie.');
  const name = t.name.trim().slice(0, 40);
  if (!name) return tr('Geef het sjabloon een naam.');
  const steps: [BuildingId, number][] = [];
  for (const [b, level] of t.steps) {
    if (!BUILDING_IDS.includes(b)) return tr('Onbekend gebouw: {id}', { id: b });
    const max = state.config.buildings[b].maxLevel;
    if (!Number.isInteger(level) || level < 1 || level > max) return tr('{building}: level 1 t/m {max}.', { building: state.config.buildings[b].name, max });
    steps.push([b, level]);
  }
  if (steps.length === 0) return tr('Een sjabloon heeft minstens één stap.');
  state.templates ??= [];
  const i = state.templates.findIndex((x) => x.id === t.id);
  const clean: BuildTemplate = { id: t.id, name, steps, ...(t.demolish ? { demolish: true as const } : {}) };
  if (i >= 0) state.templates[i] = clean;
  else state.templates.push(clean);
  return null;
}

export function deleteTemplate(state: WorldState, id: string): string | null {
  if (id.startsWith('preset:')) return tr('Voorbeeldsjablonen kun je niet verwijderen.');
  state.templates = (state.templates ?? []).filter((t) => t.id !== id);
  for (const v of villagesOf(state, HUMAN_ID)) if (v.manager?.template === id) delete v.manager.template;
  return null;
}

/** Adds or replaces one of the player's troop templates. */
export function saveTroopTemplate(state: WorldState, t: TroopTemplate): string | null {
  const name = t.name.trim().slice(0, 40);
  if (!name) return tr('Geef het sjabloon een naam.');
  const troops: UnitCounts = {};
  for (const u of UNIT_IDS) {
    const n = Math.floor(t.troops[u] ?? 0);
    if (n < 0 || !Number.isFinite(n)) return tr('Aantallen moeten 0 of meer zijn.');
    if (n > 0) troops[u] = n;
  }
  if (Object.keys(troops).length === 0) return tr('Een troepensjabloon heeft minstens één eenheid.');
  state.troopTemplates ??= [];
  const i = state.troopTemplates.findIndex((x) => x.id === t.id);
  const clean = { id: t.id, name, troops };
  if (i >= 0) state.troopTemplates[i] = clean;
  else state.troopTemplates.push(clean);
  return null;
}

/** Deletes a troop template; villages that used it keep its numbers as their own. */
export function deleteTroopTemplate(state: WorldState, id: string): string | null {
  const t = state.troopTemplates?.find((x) => x.id === id);
  if (!t) return tr('Dat sjabloon bestaat niet.');
  state.troopTemplates = state.troopTemplates!.filter((x) => x.id !== id);
  for (const v of villagesOf(state, HUMAN_ID)) {
    if (v.manager?.troopTemplate !== id) continue;
    delete v.manager.troopTemplate;
    v.manager.troops = { ...t.troops };
  }
  return null;
}

const cleanUnits = (u: UnitCounts): UnitCounts => {
  const out: UnitCounts = {};
  for (const id of UNIT_IDS) {
    if (id === 'snob') continue; // nobles are added by the train itself
    const n = Math.floor(u[id] ?? 0);
    if (n > 0) out[id] = n;
  }
  return out;
};

/** Adds or replaces a noble train template. */
export function saveNobleTemplate(state: WorldState, t: NobleTemplate): string | null {
  const name = t.name.trim().slice(0, 40);
  if (!name) return tr('Geef het sjabloon een naam.');
  if (t.escorts.length < 1 || t.escorts.length > 4) return tr('Een edeltrein heeft 2 tot 5 edels.');
  if (t.catapultTarget && !BUILDING_IDS.includes(t.catapultTarget)) return tr('Ongeldig katapultdoel.');
  const clean: NobleTemplate = { id: t.id, name, first: cleanUnits(t.first), escorts: t.escorts.map(cleanUnits) };
  if (t.catapultTarget) clean.catapultTarget = t.catapultTarget;
  if (t.clearFirst) clean.clearFirst = true;
  state.nobleTemplates ??= [];
  const i = state.nobleTemplates.findIndex((x) => x.id === t.id);
  if (i >= 0) state.nobleTemplates[i] = clean;
  else state.nobleTemplates.push(clean);
  return null;
}

export function deleteNobleTemplate(state: WorldState, id: string): string | null {
  if (!state.nobleTemplates?.some((x) => x.id === id)) return tr('Dat sjabloon bestaat niet.');
  state.nobleTemplates = state.nobleTemplates.filter((x) => x.id !== id);
  return null;
}

/** How many of the player's villages use each template (build and troop). */
export function templateUse(state: WorldState): Record<string, number> {
  const use: Record<string, number> = {};
  for (const v of villagesOf(state, HUMAN_ID)) {
    for (const id of [v.manager?.template, v.manager?.troopTemplate]) if (id) use[id] = (use[id] ?? 0) + 1;
  }
  return use;
}

export type { UnitId };
