/**
 * Surplus to building villages: resources above a share of storage in any of your villages go,
 * with free merchants, to your villages whose account manager is building and runs short.
 * As a button (with a preview) and, when switched on, at every account-manager check.
 * Also: mint coins in every village whose build template is done (button only).
 */
import type { Res } from '../shared/gameData';
import { nextBuildCost } from './bots';
import { storageCapacity } from './formulas';
import { findTemplate } from './manager';
import { MERCHANT_CARRY, merchantsFree, sendResources, tradeTimeMs } from './market';
import { maxMintable, mintBlocker, mintCoins } from './nobles';
import { distance } from './movement';
import { HUMAN_ID, villagesOf, type WorldState } from './state';
import { currentResources, isOperational, type Village } from './village';

export interface SurplusSettings {
  /** Keep this share (0..1) of storage in every village; only what's above it may leave. */
  keep: number;
  /** Also do it at every account-manager check. */
  auto: boolean;
}
export const DEFAULT_SURPLUS: SurplusSettings = { keep: 0.5, auto: false };

export interface Shipment {
  from: number;
  to: number;
  res: Res;
  merchants: number;
  travel: number;
}

const ZERO = (): Res => [0, 0, 0];

/** Resources on the way to a village (your merchants walking there). */
function incoming(state: WorldState, v: Village): Res {
  const r = ZERO();
  for (const m of Object.values(state.movements)) {
    if (m.kind !== 'trade' || m.to !== v.id || !m.res) continue;
    for (const i of [0, 1, 2] as const) r[i] += m.res[i];
  }
  return r;
}

/**
 * What a building village still misses: two times its next building (so the queue keeps going
 * while merchants walk), minus what it has and what's on the way, never past its storage.
 * Zero when the village has no build template or its template is done.
 */
export function buildNeed(state: WorldState, v: Village, have = currentResources(state.config, v, state.time)): Res {
  const t = findTemplate(state, v.manager?.template);
  if (!t) return ZERO();
  const cost = nextBuildCost(state, v, t.steps, !t.id.startsWith('preset:'));
  if (cost[0] + cost[1] + cost[2] <= 0) return ZERO();
  const cap = storageCapacity(v.buildings.storage) * 0.95;
  const on = incoming(state, v);
  return [0, 1, 2].map((i) => {
    const k = i as 0 | 1 | 2;
    const target = Math.min(cap, cost[k] * 2);
    return Math.max(0, Math.floor(target - have[k] - on[k]));
  }) as Res;
}

/** The shipments a surplus run would send (nearest giver first, one shipment per pair). */
export function planSurplus(state: WorldState, settings: SurplusSettings = state.surplus ?? DEFAULT_SURPLUS, owner = HUMAN_ID): Shipment[] {
  const villages = villagesOf(state, owner);
  if (villages.length < 2) return [];
  const have = new Map(villages.map((v) => [v.id, currentResources(state.config, v, state.time)]));
  const needs = new Map(villages.map((v) => [v.id, buildNeed(state, v, have.get(v.id))]));
  // what each village can give: above `keep` of its storage and above its own building needs
  const spare = new Map<number, Res>();
  const merchants = new Map<number, number>();
  for (const v of villages) {
    if (!isOperational(state.config, v, 'market')) continue;
    const free = merchantsFree(state, v);
    if (free <= 0) continue;
    const h = have.get(v.id)!, own = needs.get(v.id)!;
    const floor = storageCapacity(v.buildings.storage) * settings.keep;
    // a resource the village itself runs short of for building stays home
    const s = [0, 1, 2].map((i) => (own[i as 0 | 1 | 2] > 0 ? 0 : Math.max(0, Math.floor(h[i as 0 | 1 | 2] - floor)))) as Res;
    if (s[0] + s[1] + s[2] < MERCHANT_CARRY) continue;
    spare.set(v.id, s);
    merchants.set(v.id, free);
  }
  const takers = villages
    .map((v) => ({ v, need: needs.get(v.id)! }))
    .filter((t) => t.need[0] + t.need[1] + t.need[2] >= MERCHANT_CARRY)
    .sort((a, b) => b.need[0] + b.need[1] + b.need[2] - (a.need[0] + a.need[1] + a.need[2]));

  const out: Shipment[] = [];
  for (const t of takers) {
    const givers = villages
      .filter((g) => g.id !== t.v.id && spare.has(g.id))
      .sort((a, b) => distance(a, t.v) - distance(b, t.v));
    for (const g of givers) {
      const left = t.need[0] + t.need[1] + t.need[2];
      if (left < MERCHANT_CARRY) break;
      const s = spare.get(g.id)!;
      const free = merchants.get(g.id)!;
      if (free <= 0) continue;
      const res = [0, 1, 2].map((i) => Math.min(s[i as 0 | 1 | 2], t.need[i as 0 | 1 | 2])) as Res;
      let total = res[0] + res[1] + res[2];
      if (total < MERCHANT_CARRY) continue;
      // not more than the free merchants carry: scale down evenly
      const max = free * MERCHANT_CARRY;
      if (total > max) {
        const f = max / total;
        for (const i of [0, 1, 2] as const) res[i] = Math.floor(res[i] * f);
        total = res[0] + res[1] + res[2];
      }
      const m = Math.ceil(total / MERCHANT_CARRY);
      for (const i of [0, 1, 2] as const) { s[i] -= res[i]; t.need[i] -= res[i]; }
      merchants.set(g.id, free - m);
      out.push({ from: g.id, to: t.v.id, res, merchants: m, travel: tradeTimeMs(state, g, t.v) });
    }
  }
  return out;
}

/** Sends the planned shipments; returns how many left. */
export function sendSurplus(state: WorldState, settings?: SurplusSettings, owner = HUMAN_ID): number {
  let n = 0;
  for (const sh of planSurplus(state, settings, owner)) if (sendResources(state, sh.from, sh.to, sh.res) === null) n++;
  return n;
}

export function setSurplus(state: WorldState, s: SurplusSettings): string | null {
  if (!(s.keep >= 0 && s.keep <= 1)) return 'Ongeldig percentage.';
  state.surplus = { keep: Math.round(s.keep * 100) / 100, auto: !!s.auto };
  return null;
}

// --- coins in finished villages ---------------------------------------------------

/** The village's build template is done: every step reached (built, not just queued). */
export function templateDone(state: WorldState, v: Village): boolean {
  const t = findTemplate(state, v.manager?.template);
  return !!t && t.steps.every(([b, level]) => v.buildings[b] >= level);
}

export interface MintPlan {
  village: number;
  coins: number;
}

/** Coins every finished village (own academy) can mint while keeping `keep` of its storage. */
export function planMintAll(state: WorldState, keep: number, owner = HUMAN_ID): MintPlan[] {
  const cost = state.config.conquest.coinCost;
  const out: MintPlan[] = [];
  for (const v of villagesOf(state, owner)) {
    if (!templateDone(state, v) || mintBlocker(state, v) !== null) continue;
    const have = currentResources(state.config, v, state.time);
    const floor = storageCapacity(v.buildings.storage) * keep;
    const n = Math.floor(Math.min(...([0, 1, 2] as const).map((i) => Math.max(0, have[i] - floor) / Math.max(1, cost[i]))));
    if (n > 0) out.push({ village: v.id, coins: Math.min(n, maxMintable(state, v)) });
  }
  return out;
}

/** Mints the planned coins; returns how many coins were made. */
export function mintAll(state: WorldState, keep: number, owner = HUMAN_ID): number {
  let made = 0;
  for (const p of planMintAll(state, keep, owner)) if (mintCoins(state, p.village, p.coins) === null) made += p.coins;
  return made;
}
