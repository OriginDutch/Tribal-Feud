/**
 * Coins, packages and noble slots.
 *
 * Coins (TW default): coins are minted in an academy and count for the whole player.
 * Every village you own beyond the first and every nobleman you have (at home, on the road
 * or in training) takes a slot; slot n costs n coins, so s slots need 1+2+..+s coins in total.
 * Coins are never used up: a nobleman that dies frees his slot.
 *
 * Packages (world option): the same price, but stored in one village and used up when a
 * nobleman is trained there; the next nobleman costs slotCost(slots in use + 1) packages.
 *
 * Tiered curve (default): slot n costs n, at most 25 below slot 200, 50 from 200, 75 from 300...
 */
import type { NobleCurve } from '../shared/config';
import type { Res } from '../shared/gameData';
import { storageCapacity } from './formulas';
import { villagesOf, type WorldState } from './state';
import { currentResources, isOperational, settle, type Village } from './village';

/** Coins (or packages) slot n costs. Tiered: n, capped at 25 below slot 200, then 25 per started hundred. */
export function slotCost(n: number, curve: NobleCurve = 'tiered'): number {
  if (curve === 'classic') return n;
  return Math.min(n, 25 * Math.max(1, Math.floor(n / 100)));
}

/** Coins all slots 1..s cost together. */
export function coinsForSlots(slots: number, curve: NobleCurve = 'tiered'): number {
  if (slots <= 0) return 0;
  if (curve === 'classic') return (slots * (slots + 1)) / 2;
  const a = Math.min(slots, 25);
  let total = (a * (a + 1)) / 2;
  if (slots <= 25) return total;
  total += (Math.min(slots, 199) - 25) * 25;
  for (let start = 200; start <= slots; start += 100) total += (Math.min(slots, start + 99) - start + 1) * slotCost(start, curve);
  return total;
}

/** Most slots `coins` pays for. */
export function slotsForCoins(coins: number, curve: NobleCurve = 'tiered'): number {
  let lo = 0, hi = 1;
  while (coinsForSlots(hi, curve) <= coins) hi *= 2;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (coinsForSlots(mid, curve) <= coins) lo = mid; else hi = mid; }
  return lo;
}

export const curveOf = (state: WorldState): NobleCurve => state.config.nobleCurve ?? 'tiered';

/** Slots in use: extra villages plus every nobleman (home, on the road, in training). */
export function slotsUsed(state: WorldState, owner: number): number {
  const villages = villagesOf(state, owner);
  let used = Math.max(0, villages.length - 1);
  for (const v of villages) {
    used += v.units.snob + v.outside.snob;
    for (const job of v.recruitQueues.snob) used += job.total - job.done;
  }
  return used;
}

export function playerCoins(state: WorldState, owner: number): number {
  return state.players[owner]?.coins ?? 0;
}

/** How many more noblemen `v` may train right now as far as coins/packages go. */
export function noblesAllowed(state: WorldState, v: Village): number {
  const used = slotsUsed(state, v.owner);
  if (state.config.nobleCost === 'coins') {
    return Math.max(0, slotsForCoins(playerCoins(state, v.owner), curveOf(state)) - used);
  }
  // packages: n-th extra noble costs (used + n) packages
  let left = v.packages ?? 0;
  let n = 0;
  while (left >= slotCost(used + n + 1, curveOf(state))) {
    left -= slotCost(used + n + 1, curveOf(state));
    n++;
  }
  return n;
}

/** Called when nobles are ordered: packages are used up (coins are not). */
export function payPackages(state: WorldState, v: Village, count: number): void {
  if (state.config.nobleCost !== 'packages') return;
  const used = slotsUsed(state, v.owner);
  let cost = 0;
  for (let i = 1; i <= count; i++) cost += slotCost(used + i, curveOf(state));
  v.packages = Math.max(0, (v.packages ?? 0) - cost);
}

/** What's needed for the next nobleman, for display. */
export function nextNobleNeed(state: WorldState, v: Village): { have: number; need: number } {
  const used = slotsUsed(state, v.owner);
  if (state.config.nobleCost === 'coins') return { have: playerCoins(state, v.owner), need: coinsForSlots(used + 1, curveOf(state)) };
  return { have: v.packages ?? 0, need: slotCost(used + 1, curveOf(state)) };
}

export function maxMintable(state: WorldState, v: Village): number {
  const cost = state.config.conquest.coinCost;
  const have = currentResources(state.config, v, state.time);
  return Math.max(0, Math.floor(Math.min(...[0, 1, 2].map((i) => have[i as 0 | 1 | 2] / Math.max(1, cost[i as 0 | 1 | 2])))));
}

export function mintBlocker(state: WorldState, v: Village): string | null {
  if (v.buildings.snob === 0) return 'Bouw eerst een adelshoeve';
  if (!isOperational(state.config, v, 'snob')) return 'Adelshoeve werkt niet';
  const cost = state.config.conquest.coinCost;
  if (cost.some((c) => c > storageCapacity(v.buildings.storage))) return 'Opslagplaats te klein';
  if (maxMintable(state, v) === 0) return 'Te weinig grondstoffen';
  return null;
}

/** Mints coins (or stores packages) in village `villageId`. */
export function mintCoins(state: WorldState, villageId: number, count: number): string | null {
  const v = state.villages[villageId];
  if (!v) return 'Dorp bestaat niet.';
  if (!Number.isInteger(count) || count < 1) return 'Ongeldig aantal.';
  const blocker = mintBlocker(state, v);
  if (blocker) return blocker;
  const max = maxMintable(state, v);
  if (count > max) return `Maximaal ${max} mogelijk`;
  settle(state.config, v, state.time);
  const cost = state.config.conquest.coinCost;
  for (const i of [0, 1, 2] as const) v.res[i] -= cost[i] * count;
  if (state.config.nobleCost === 'coins') {
    const player = state.players[v.owner];
    if (player) player.coins = (player.coins ?? 0) + count;
  } else {
    v.packages = (v.packages ?? 0) + count;
  }
  return null;
}

export type { Res };
