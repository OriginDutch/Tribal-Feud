/**
 * Rooftocht (scavenging, TW): troops leave a village for a while and come back with resources.
 * Four levels (TW: lazy, humble, clever, great). Haul and duration follow TW's formulas.
 *
 * Our twist: the countryside is not empty. Each level has a safe strength (attack value);
 * send less and you lose a share of the troops and bring back less. Level n+1 opens after a
 * safe run at level n in that village. Troops on a run can't be called back.
 *
 * Human runs end with a 'scavenge' event (exact, for repeat and the overview). Bot runs have
 * no events: they are settled lazily whenever something looks at the village.
 */
import type { Res, UnitCounts, UnitId } from '../shared/gameData';
import { SCAV_LEVELS, SCAV_NAMES, SCAV_UNITS, planScav, previewScav, scavSum, type ScavParams, type ScavPreview, type ScavTemplate } from '../shared/scavenge';
import { push } from './eventQueue';
import { storageCapacity } from './formulas';
import { nextFloat } from './rng';
import { HUMAN_ID, addLog, reservedUnits, type WorldState } from './state';
import { isOperational, settle, type Village } from './village';

export { SCAV_LEVELS, SCAV_NAMES, SCAV_FACTORS, SCAV_SAFE, SCAV_MAX_LOSS, SCAV_UNITS } from '../shared/scavenge';

export interface ScavRun {
  level: number; // 0..3
  units: UnitCounts;
  sent: number;
  returns: number;
}

export interface ScavState {
  runs: ScavRun[];
  /** Highest open level (0 = only the first). */
  unlocked: number;
  /** Send the survivors out again when they come back. */
  repeat?: boolean;
  /** Last result per level, for the overview. */
  last?: { level: number; loot: Res; lost: UnitCounts; at: number }[];
}

export function scavEnabled(state: WorldState): boolean {
  return state.config.scavenging !== false;
}

export function scavOf(v: Village): ScavState {
  return (v.scav ??= { runs: [], unlocked: 0 });
}

export function scavParams(state: WorldState): ScavParams {
  return { worldSpeed: state.config.worldSpeed, productionMultiplier: state.config.productionMultiplier, units: state.config.units };
}

export function previewRun(state: WorldState, level: number, units: UnitCounts): ScavPreview {
  return previewScav(scavParams(state), level, units);
}

export function scavBlocker(state: WorldState, v: Village, level: number, units: UnitCounts): string | null {
  if (!scavEnabled(state)) return 'Rooftochten staan uit in deze wereld.';
  if (!isOperational(state.config, v, 'place')) return 'Je hebt een verzamelplaats nodig.';
  if (level < 0 || level >= SCAV_LEVELS) return 'Onbekend level.';
  const sc = scavOf(v);
  if (level > sc.unlocked) return `Rond eerst ${SCAV_NAMES[level - 1]} veilig af.`;
  if (sc.runs.some((r) => r.level === level)) return 'Dit level is al onderweg.';
  let any = false;
  const held = v.owner === HUMAN_ID ? reservedUnits(state, v.id) : {};
  for (const [u, n] of Object.entries(units) as [UnitId, number][]) {
    if (!n) continue;
    if (!SCAV_UNITS.includes(u)) return `${state.config.units[u].name} kan niet mee.`;
    if (n < 0 || !Number.isInteger(n)) return 'Ongeldig aantal.';
    if (v.units[u] - (held[u] ?? 0) < n) return held[u] && v.units[u] >= n ? `Te weinig ${state.config.units[u].name.toLowerCase()} vrij: ${held[u]} staan klaar voor een ingeplande aanval.` : `Te weinig ${state.config.units[u].name.toLowerCase()}.`;
    any = true;
  }
  if (!any) return 'Kies troepen.';
  if (scavSum(scavParams(state), units, 'carry') <= 0) return 'Deze troepen dragen niets.';
  return null;
}

/** Sends a run (troops leave now). */
export function sendScavenge(state: WorldState, villageId: number, level: number, units: UnitCounts, at = state.time): string | null {
  const v = state.villages[villageId];
  if (!v) return 'Dorp bestaat niet.';
  const error = scavBlocker(state, v, level, units);
  if (error) return error;
  const clean: UnitCounts = {};
  for (const u of SCAV_UNITS) {
    const n = units[u] ?? 0;
    if (n > 0) { clean[u] = n; v.units[u] -= n; v.outside[u] += n; }
  }
  const run: ScavRun = { level, units: clean, sent: at, returns: at + previewRun(state, level, clean).durationMs };
  scavOf(v).runs.push(run);
  if (v.owner === HUMAN_ID) push(state.queue, run.returns, { kind: 'scavenge', villageId });
  return null;
}

/** Brings back every run that is due (and sends repeats). Safe to call any time. */
export function settleScavenge(state: WorldState, v: Village): void {
  const sc = v.scav;
  if (!sc || !sc.runs.length) return;
  for (;;) {
    const due = sc.runs.filter((r) => r.returns <= state.time).sort((a, b) => a.returns - b.returns)[0];
    if (!due) return;
    sc.runs.splice(sc.runs.indexOf(due), 1);
    const survivors = finish(state, v, due);
    if (sc.repeat && v.owner === HUMAN_ID && Object.keys(survivors).length) {
      sendScavenge(state, v.id, due.level, survivors, due.returns);
    }
  }
}

function finish(state: WorldState, v: Village, run: ScavRun): UnitCounts {
  const p = previewRun(state, run.level, run.units);
  const lost: UnitCounts = {};
  const survivors: UnitCounts = {};
  for (const u of SCAV_UNITS) {
    const n = run.units[u] ?? 0;
    if (!n) continue;
    // whole units: the fraction is a chance
    const exact = n * p.lossShare;
    const dead = Math.min(n, Math.floor(exact) + (nextFloat(state.rng) < exact % 1 ? 1 : 0));
    v.outside[u] -= n;
    v.units[u] += n - dead;
    if (dead) lost[u] = dead;
    if (n - dead) survivors[u] = n - dead;
  }
  settle(state.config, v, state.time);
  const cap = storageCapacity(v.buildings.storage);
  const each = Math.floor(p.loot / 3);
  const loot: Res = [0, 0, 0];
  for (const i of [0, 1, 2] as const) {
    loot[i] = Math.max(0, Math.min(each, cap - v.res[i]));
    v.res[i] += loot[i];
  }
  const sc = scavOf(v);
  if (p.ratio >= 1 && sc.unlocked === run.level && run.level < SCAV_LEVELS - 1) {
    sc.unlocked = run.level + 1;
    if (v.owner === HUMAN_ID) addLog(state, { time: state.time, text: `${v.name}: rooftocht ${SCAV_NAMES[run.level + 1]} vrijgespeeld.` });
  }
  if (v.owner === HUMAN_ID) {
    sc.last = (sc.last ?? []).filter((l) => l.level !== run.level);
    sc.last.push({ level: run.level, loot, lost, at: state.time });
    const deaths = Object.entries(lost).map(([u, n]) => `${n} ${state.config.units[u as UnitId].name.toLowerCase()}`);
    if (deaths.length) addLog(state, { time: state.time, text: `${v.name}: rooftocht ${SCAV_NAMES[run.level]} verloor ${deaths.join(', ')}.` });
  }
  return survivors;
}

/** The village changed owner: whatever was out is gone with the old owner. */
export function dropScavenge(v: Village): void {
  delete v.scav;
}

/** The template's split for this village right now. */
export function planFor(state: WorldState, v: Village, tpl: ScavTemplate): UnitCounts[] {
  const sc = scavOf(v);
  // troops held back for planned attacks don't go scavenging
  const held = v.owner === HUMAN_ID ? reservedUnits(state, v.id) : {};
  const free = { ...v.units };
  for (const [u, n] of Object.entries(held) as [UnitId, number][]) free[u] = Math.max(0, free[u] - n);
  return planScav(scavParams(state), free, sc.unlocked, sc.runs.map((r) => r.level), tpl);
}

/** Sends a plan (units per level); returns how many runs left, and the first error if any. */
export function sendPlan(state: WorldState, villageId: number, plan: UnitCounts[]): { sent: number; error: string | null } {
  let sent = 0;
  let error: string | null = null;
  plan.forEach((units, level) => {
    if (!Object.values(units).some((n) => n && n > 0)) return;
    const e = sendScavenge(state, villageId, level, units);
    if (e) error ??= e;
    else sent++;
  });
  return { sent, error };
}

/** Bots: half of the farm troops still at home go out, safe runs only. */
export function botScavenge(state: WorldState, v: Village, farmUnits: UnitId[]): void {
  if (!scavEnabled(state) || !isOperational(state.config, v, 'place')) return;
  const units: ScavTemplate['units'] = {};
  for (const u of farmUnits) if (SCAV_UNITS.includes(u)) units[u] = { use: true, keep: Math.ceil(v.units[u] / 2) };
  const plan = planFor(state, v, { id: 'bot', name: 'bot', units, levels: [true, true, true, true], safeOnly: true });
  sendPlan(state, v.id, plan);
}
