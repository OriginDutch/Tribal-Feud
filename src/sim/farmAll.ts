/**
 * "Farm alles": one click farms every barbarian village once, from the nearest of your villages
 * that can still pay the chosen template. Closest pairs go first until troops run out.
 */
import { UNIT_IDS, type UnitCounts } from '../shared/gameData';
import type { FarmKey } from '../shared/farmTemplates';
import { FARM_C_UNIT, estimateLoot } from './intel';
import { distance, freeUnits, sendAttack } from './movement';
import { push } from './eventQueue';
import { BARBARIAN, HUMAN_ID, villagesOf, type WorldState } from './state';
import { isOperational } from './village';

export interface FarmAllOptions {
  template: FarmKey;
  /** Skip targets whose last attack was lost. */
  skipLost: boolean;
  /** Skip targets with a known wall above this; null = no limit. */
  maxWall: number | null;
  /** Fields; null = no limit. */
  maxDistance: number | null;
}

export interface FarmAllPlan {
  sends: { from: number; to: number; units: UnitCounts; distance: number }[];
  /** Your villages (with a rally point) and how many can send the template at least once. */
  villages: number;
  able: number;
  skipped: { busy: number; lost: number; wall: number; noScout: number };
  /** Targets in range nobody could reach with troops left. */
  left: number;
}

function fits(units: UnitCounts, pool: UnitCounts): boolean {
  return UNIT_IDS.every((u) => (units[u] ?? 0) <= (pool[u] ?? 0));
}

export function planFarmAll(state: WorldState, opts: FarmAllOptions): FarmAllPlan {
  const own = villagesOf(state, HUMAN_ID).filter((v) => isOperational(state.config, v, 'place'));
  // troops held back for planned attacks are not there for farming
  const pools = new Map(own.map((v) => [v.id, freeUnits(state, v) as UnitCounts]));
  const template = opts.template === '*' ? null : (state.farmTemplates[opts.template] ?? {});
  const hasTemplate = template && Object.values(template).some((n) => n && n > 0);
  const able = own.filter((v) => { const p = pools.get(v.id)!; return template ? hasTemplate && fits(template, p) : (p[FARM_C_UNIT] ?? 0) > 0; }).length;

  const busy = new Set<number>();
  for (const m of Object.values(state.movements)) if (m.owner === HUMAN_ID && m.kind === 'attack') busy.add(m.to);

  const skipped = { busy: 0, lost: 0, wall: 0, noScout: 0 };
  const pairs: { from: number; to: number; d: number }[] = [];
  const reach = opts.maxDistance ?? Infinity;
  const canSend = own.filter((v) => { const p = pools.get(v.id)!; return template ? hasTemplate && fits(template, p) : (p[FARM_C_UNIT] ?? 0) > 0; });
  for (const t of Object.values(state.villages)) {
    if (t.owner !== BARBARIAN) continue;
    const local: { from: number; to: number; d: number }[] = [];
    for (const v of canSend) {
      const d = distance(v, t);
      if (d <= reach) local.push({ from: v.id, to: t.id, d });
    }
    if (!local.length) continue;
    if (busy.has(t.id)) { skipped.busy++; continue; }
    if (opts.skipLost && state.lastAttack[t.id]?.result === 'loss') { skipped.lost++; continue; }
    const wall = state.intel[t.id]?.wall;
    if (opts.maxWall !== null && wall !== undefined && wall > opts.maxWall) { skipped.wall++; continue; }
    if (opts.template === '*' && estimateLoot(state, t.id) === undefined) { skipped.noScout++; continue; }
    pairs.push(...local);
  }
  pairs.sort((a, b) => a.d - b.d);

  const done = new Set<number>();
  const targets = new Set(pairs.map((p) => p.to));
  const sends: FarmAllPlan['sends'] = [];
  for (const p of pairs) {
    if (done.has(p.to)) continue;
    const pool = pools.get(p.from)!;
    let units: UnitCounts;
    if (template) {
      if (!fits(template, pool)) continue;
      units = { ...template };
    } else {
      const have = pool[FARM_C_UNIT] ?? 0;
      if (have <= 0) continue;
      const need = Math.max(1, Math.ceil((estimateLoot(state, p.to) ?? 0) / state.config.units[FARM_C_UNIT].carry));
      units = { [FARM_C_UNIT]: Math.min(need, have) };
    }
    for (const u of UNIT_IDS) if (units[u]) pool[u] = (pool[u] ?? 0) - units[u]!;
    done.add(p.to);
    sends.push({ from: p.from, to: p.to, units, distance: p.d });
  }
  return { sends, villages: own.length, able, skipped, left: targets.size - done.size };
}

/** Sends the plan; returns how many attacks left and the first error. */
export function farmAll(state: WorldState, opts: FarmAllOptions, auto = false): { sent: number; error: string | null } {
  let sent = 0;
  let error: string | null = null;
  for (const s of planFarmAll(state, opts).sends) {
    const before = state.nextId;
    const e = sendAttack(state, s.from, s.to, s.units);
    if (e) { error ??= e; continue; }
    sent++;
    // the attack just sent is a farm run; with auto-farm its report goes to the auto-farm list
    markFarm(state, before, s.to, auto);
  }
  return { sent, error };
}

/** Marks the attack sent since id `before` to `to` as a farm run (and auto-farm). */
export function markFarm(state: WorldState, before: number, to: number, auto = false): void {
  for (let id = before; id < state.nextId; id++) {
    const m = state.movements[id];
    if (m && m.kind === 'attack' && m.to === to && m.owner === HUMAN_ID) { m.farm = true; if (auto) m.auto = true; }
  }
}

/** How often auto-farm runs: every 30 game minutes at world speed 1. */
export function autoFarmInterval(state: WorldState): number {
  return (30 * 60_000) / state.config.worldSpeed;
}

/** Switches auto-farm on (with these settings) or off; keeps exactly one event queued. */
export function setAutoFarm(state: WorldState, options: FarmAllOptions | null): void {
  if (!options) { delete state.autoFarm; return; }
  const had = state.autoFarm?.at !== undefined && state.autoFarm.at > state.time;
  state.autoFarm = { ...state.autoFarm, options };
  if (!had) {
    // the first round right away
    state.autoFarm.at = state.time;
    push(state.queue, state.time, { kind: 'autoFarm' });
  }
}

export function onAutoFarm(state: WorldState): void {
  const a = state.autoFarm;
  if (!a || a.at !== state.time) return; // off, or stale
  const r = farmAll(state, a.options, true);
  a.last = { time: state.time, sent: r.sent };
  a.at = state.time + autoFarmInterval(state);
  push(state.queue, a.at, { kind: 'autoFarm' });
}
