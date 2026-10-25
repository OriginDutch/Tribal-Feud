/**
 * Account manager: the player's villages can follow a build template and keep a troop
 * target by themselves, like TW's premium account manager. It plays by the same rules as
 * everything else (queueBuild, recruit, startResearch) and only does what the player set.
 */
import { BUILD_PRESETS } from '../shared/botProfiles';
import { BUILDING_IDS, UNIT_IDS, type BuildingId, type Res, type UnitCounts, type UnitId } from '../shared/gameData';
import { MINUTE } from '../shared/time';
import { autoBuild } from './bots';
import { push } from './eventQueue';
import { HUMAN_ID, villagesOf, type WorldState } from './state';
import {
  currentResources,
  maxRecruitable,
  recruit,
  recruitBlocker,
  researchBlocker,
  startResearch,
  type Village,
} from './village';

export interface BuildTemplate {
  id: string;
  name: string;
  steps: [BuildingId, number][];
}

export interface VillageManager {
  /** Build template id (a preset or one of the player's own). */
  template?: string;
  /** Troops to keep (home + away + in training). */
  troops?: UnitCounts;
  /** Most of the spare resources (0..1) the manager spends on troops per check. */
  troopShare: number;
}

/** Game minutes between two manager checks at world speed 1 (scaled like bot turns). */
const CHECK_MINUTES = 5;

export function allTemplates(state: WorldState): BuildTemplate[] {
  return [...BUILD_PRESETS, ...(state.templates ?? [])];
}

export function findTemplate(state: WorldState, id: string | undefined): BuildTemplate | undefined {
  return id ? allTemplates(state).find((t) => t.id === id) : undefined;
}

function checkInterval(state: WorldState): number {
  const c = state.config;
  return (CHECK_MINUTES * MINUTE) / (c.worldSpeed * Math.max(1, c.buildSpeed, c.recruitSpeed));
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
  scheduleManager(state);
}

export function manageVillage(state: WorldState, v: Village, m: VillageManager): void {
  const template = findTemplate(state, m.template);
  // the presets play like the bots (keeping resources in balance); own templates are followed exactly
  const reserve: Res = template ? autoBuild(state, v, template.steps, [0, 0, 0], !template.id.startsWith('preset:')) : [0, 0, 0];
  if (m.troops) keepTroops(state, v, m.troops, m.troopShare, reserve);
}

function keepTroops(state: WorldState, v: Village, target: UnitCounts, share: number, reserve: Res): void {
  const { config } = state;
  const have = currentResources(config, v, state.time);
  const budget: Res = [0, 1, 2].map((i) => Math.max(0, have[i as 0 | 1 | 2] - reserve[i as 0 | 1 | 2]) * share) as Res;
  for (const u of UNIT_IDS) {
    const want = target[u] ?? 0;
    if (want <= 0) continue;
    const def = config.units[u];
    // research first if needed
    if (!v.researched.includes(u)) {
      if (!v.research && researchBlocker(state, v, u) === null) startResearch(state, v.id, u);
      continue;
    }
    let owned = v.units[u] + v.outside[u];
    for (const job of v.recruitQueues[def.building]) if (job.unit === u) owned += job.total - job.done;
    const missing = want - owned;
    if (missing <= 0 || recruitBlocker(state, v, u) !== null) continue;
    if (v.recruitQueues[def.building].length >= 2) continue;
    const affordable = Math.floor(Math.min(...[0, 1, 2].map((i) => budget[i as 0 | 1 | 2] / Math.max(1, def.cost[i as 0 | 1 | 2]))));
    const n = Math.min(missing, affordable, maxRecruitable(state, v, u));
    if (n < 1) continue;
    if (recruit(state, v.id, u, n) === null) for (const i of [0, 1, 2] as const) budget[i] -= def.cost[i] * n;
  }
}

/** Sets (or clears with null) the manager of one of the player's villages. */
export function setManager(state: WorldState, villageId: number, m: VillageManager | null): string | null {
  const v = state.villages[villageId];
  if (!v || v.owner !== HUMAN_ID) return 'Dat is niet jouw dorp.';
  if (!m) {
    delete v.manager;
    scheduleManager(state);
    return null;
  }
  if (m.template && !findTemplate(state, m.template)) return 'Sjabloon bestaat niet.';
  const troops: UnitCounts = {};
  for (const u of UNIT_IDS) {
    const n = Math.floor(m.troops?.[u] ?? 0);
    if (n > 0) troops[u] = n;
  }
  v.manager = { troopShare: Math.min(1, Math.max(0, m.troopShare)) };
  if (m.template) v.manager.template = m.template;
  if (Object.keys(troops).length > 0) v.manager.troops = troops;
  scheduleManager(state);
  manageVillage(state, v, v.manager);
  return null;
}

/** Adds or replaces one of the player's own templates. */
export function saveTemplate(state: WorldState, t: BuildTemplate): string | null {
  if (t.id.startsWith('preset:')) return 'Voorbeeldsjablonen kun je niet aanpassen; maak een kopie.';
  const name = t.name.trim().slice(0, 40);
  if (!name) return 'Geef het sjabloon een naam.';
  const steps: [BuildingId, number][] = [];
  for (const [b, level] of t.steps) {
    if (!BUILDING_IDS.includes(b)) return `Onbekend gebouw: ${b}`;
    const max = state.config.buildings[b].maxLevel;
    if (!Number.isInteger(level) || level < 1 || level > max) return `${state.config.buildings[b].name}: level 1 t/m ${max}.`;
    steps.push([b, level]);
  }
  if (steps.length === 0) return 'Een sjabloon heeft minstens één stap.';
  state.templates ??= [];
  const i = state.templates.findIndex((x) => x.id === t.id);
  const clean = { id: t.id, name, steps };
  if (i >= 0) state.templates[i] = clean;
  else state.templates.push(clean);
  return null;
}

export function deleteTemplate(state: WorldState, id: string): string | null {
  if (id.startsWith('preset:')) return 'Voorbeeldsjablonen kun je niet verwijderen.';
  state.templates = (state.templates ?? []).filter((t) => t.id !== id);
  for (const v of villagesOf(state, HUMAN_ID)) if (v.manager?.template === id) delete v.manager.template;
  return null;
}

export type { UnitId };
