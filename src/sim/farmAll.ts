/**
 * "Farm alles": one click farms every barbarian village once, from the nearest of your villages
 * that can still pay the chosen template. Closest pairs go first until troops run out.
 */
import { UNIT_IDS, type UnitCounts } from '../shared/gameData';
import type { FarmKey } from '../shared/farmTemplates';
import { FARM_C_UNIT, estimateLoot } from './intel';
import { distance, freeUnits, sendAttack } from './movement';
import { push } from './eventQueue';
import { BARBARIAN, HUMAN_ID, playSfx, villagesOf, type WorldState } from './state';
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
  const reach = opts.maxDistance ?? Infinity;
  const canSend = own.filter((v) => { const p = pools.get(v.id)!; return template ? hasTemplate && fits(template, p) : (p[FARM_C_UNIT] ?? 0) > 0; });

  // Closest pairs first, as if every (village, target) pair were sorted by distance (ties: target
  // order, then village order). Instead of building and sorting all pairs, a heap holds each target's
  // nearest village still in play. A village that can't send any more never can again (its pool only
  // shrinks), so a target then moves on to the next nearest live village; once no village can send,
  // planning stops.
  const n = canSend.length;
  const ids: number[] = [];
  const dist: number[] = []; // target t, village i: dist[t * n + i] (Infinity beyond reach)
  for (const t of Object.values(state.villages)) {
    if (t.owner !== BARBARIAN) continue;
    const row = new Array<number>(n);
    let k = 0;
    for (let i = 0; i < n; i++) { const d = distance(canSend[i]!, t); row[i] = d <= reach ? d : Infinity; if (d <= reach) k++; }
    if (!k) continue;
    if (busy.has(t.id)) { skipped.busy++; continue; }
    if (opts.skipLost && state.lastAttack[t.id]?.result === 'loss') { skipped.lost++; continue; }
    const wall = state.intel[t.id]?.wall;
    if (opts.maxWall !== null && wall !== undefined && wall > opts.maxWall) { skipped.wall++; continue; }
    if (opts.template === '*' && estimateLoot(state, t.id) === undefined) { skipped.noScout++; continue; }
    ids.push(t.id);
    for (let i = 0; i < n; i++) dist.push(row[i]!);
  }
  const targets = ids.length;
  const dead = new Uint8Array(n);
  let alive = n;
  /** Target t's nearest live village after village `after` (by distance, then index); -1 = none. */
  const cur = new Int32Array(targets);
  const nextFor = (t: number, after: number): number => {
    const base = t * n;
    const da = after < 0 ? -Infinity : dist[base + after]!;
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (dead[i]) continue;
      const d = dist[base + i]!;
      if (d === Infinity || d < da || (d === da && i <= after)) continue;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const key = (t: number) => dist[t * n + cur[t]!]!;
  const heap: number[] = [];
  const less = (a: number, b: number) => { const ka = key(a), kb = key(b); return ka !== kb ? ka < kb : a < b; };
  const up = (i: number) => { while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i]!, heap[p]!)) break; [heap[i], heap[p]] = [heap[p]!, heap[i]!]; i = p; } };
  const down = (i: number) => {
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < heap.length && less(heap[l]!, heap[m]!)) m = l;
      if (r < heap.length && less(heap[r]!, heap[m]!)) m = r;
      if (m === i) return;
      [heap[i], heap[m]] = [heap[m]!, heap[i]!];
      i = m;
    }
  };
  for (let t = 0; t < targets; t++) { cur[t] = nextFor(t, -1); heap.push(t); up(heap.length - 1); }

  const sends: FarmAllPlan['sends'] = [];
  while (heap.length && alive > 0) {
    const t = heap[0]!;
    const vi = cur[t]!;
    let units: UnitCounts | null = null;
    if (!dead[vi]) {
      const pool = pools.get(canSend[vi]!.id)!;
      if (template) {
        if (fits(template, pool)) units = { ...template };
        else { dead[vi] = 1; alive--; }
      } else {
        const have = pool[FARM_C_UNIT] ?? 0;
        if (have > 0) {
          const need = Math.max(1, Math.ceil((estimateLoot(state, ids[t]!) ?? 0) / state.config.units[FARM_C_UNIT].carry));
          units = { [FARM_C_UNIT]: Math.min(need, have) };
        } else { dead[vi] = 1; alive--; }
      }
      if (units) {
        for (const u of UNIT_IDS) if (units[u]) pool[u] = (pool[u] ?? 0) - units[u]!;
        sends.push({ from: canSend[vi]!.id, to: ids[t]!, units, distance: dist[t * n + vi]! });
      }
    }
    if (!units) {
      const nx = nextFor(t, vi);
      if (nx >= 0) { cur[t] = nx; down(0); continue; } // same target, a village further away: it sinks
    }
    // this target is done (sent, or no village left for it)
    const last = heap.pop()!;
    if (heap.length) { heap[0] = last; down(0); }
  }
  return { sends, villages: own.length, able, skipped, left: targets - sends.length };
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
    markFarm(state, before, s.to, opts.template, auto);
  }
  // a template with notifications marches off like any attack
  if (sent > 0 && farmNotifies(state, opts.template)) playSfx(state, 'march');
  return { sent, error };
}

/** This template's runs count as normal attacks for you ("Meldingen tonen"). */
export const farmNotifies = (state: WorldState, key: FarmKey): boolean => !!state.farmNotify?.includes(key);

/**
 * Marks the attack sent since id `before` to `to` as a farm run (and auto-farm), unless its
 * template shows notifications: then it stays a normal attack for you in every way.
 */
export function markFarm(state: WorldState, before: number, to: number, key: FarmKey, auto = false): void {
  if (farmNotifies(state, key)) return;
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
