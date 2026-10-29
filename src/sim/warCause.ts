/**
 * Why tribes go to war, and when a bot knows better than to pick a fight.
 *
 * Military strength counts troops, not points: attack of the offensive units and defense of the
 * defensive ones, home and away. An "offensive village" holds a real army (OFF_VILLAGE attack).
 *
 * Self-preservation: a bot does not provoke a player who clearly outclasses it (more offensive
 * villages than it has villages and 1.5x its strength, or 4x its strength). Its tribe mates count for half,
 * so with a tribe behind it a bot dares more.
 *
 * Friction: tribes build up friction through attacks and conquests between their members and by
 * living close together. It fades over time. A war needs enough friction and a side that expects
 * to win (its strength with allies against the other's with allies).
 */
import type { UnitId } from '../shared/gameData';
import { BARBARIAN, villagesOf, type WorldState } from './state';
import { tribeOf, type Tribe } from './tribes';

/** Attack that makes a village an offensive village (a few hundred axes and light cavalry). */
export const OFF_VILLAGE = 20_000;
const OFF_UNITS: UnitId[] = ['axe', 'light', 'marcher', 'heavy', 'ram', 'catapult'];
const DEF_UNITS: UnitId[] = ['spear', 'sword', 'archer', 'heavy'];

export interface Strength {
  off: number;
  def: number;
  villages: number;
  offVillages: number;
}

const cache = new WeakMap<WorldState, { at: number; map: Map<number, Strength> }>();

/** Armies don't change much in a few minutes: strength is cached per 10 game minutes. */
const BUCKET = 10 * 60_000;

/** Military strength of a player (cached, see BUCKET). */
export function strengthOf(state: WorldState, id: number): Strength {
  const at = Math.floor(state.time / BUCKET);
  let c = cache.get(state);
  if (!c || c.at !== at) { c = { at, map: new Map() }; cache.set(state, c); }
  const hit = c.map.get(id);
  if (hit) return hit;
  const { units } = state.config;
  const s: Strength = { off: 0, def: 0, villages: 0, offVillages: 0 };
  for (const v of villagesOf(state, id)) {
    s.villages++;
    let off = 0;
    for (const u of OFF_UNITS) off += (v.units[u] + v.outside[u]) * units[u].attack * (u === 'heavy' ? 0.5 : 1);
    for (const u of DEF_UNITS) s.def += (v.units[u] + v.outside[u]) * ((units[u].defense + units[u].defenseCavalry) / 2) * (u === 'heavy' ? 0.5 : 1);
    s.off += off;
    if (off >= OFF_VILLAGE) s.offVillages++;
  }
  c.map.set(id, s);
  return s;
}

const power = (s: Strength) => s.off + s.def;

/** A player's strength with half of his tribe mates behind him. */
function backed(state: WorldState, id: number): Strength {
  const own = strengthOf(state, id);
  const t = tribeOf(state, id);
  if (!t) return own;
  const out = { ...own };
  for (const m of t.members) {
    if (m === id) continue;
    const s = strengthOf(state, m);
    out.off += s.off / 2; out.def += s.def / 2; out.villages += s.villages / 2; out.offVillages += s.offVillages / 2;
  }
  return out;
}

/**
 * Does `other` clearly outclass `me`? Then `me` leaves him alone (no farming, scouting, revenge,
 * counters or nobles). Against barbarians, never.
 */
export function outclassed(state: WorldState, me: number, other: number): boolean {
  if (other === BARBARIAN || other < 0) return false;
  const a = backed(state, me), b = backed(state, other);
  // more offensive villages than you have villages (and really stronger), or simply crushing
  return (b.offVillages > Math.max(1, a.villages) && power(b) > 1.5 * power(a)) || power(b) > 4 * Math.max(1, power(a));
}

/** Strength of a whole tribe plus half of its allies. */
export function tribeStrength(state: WorldState, t: Tribe): number {
  let p = 0;
  for (const m of t.members) p += power(strengthOf(state, m));
  for (const [other, rel] of Object.entries(t.relations)) {
    if (rel !== 'ally') continue;
    for (const m of state.tribes?.[Number(other)]?.members ?? []) p += power(strengthOf(state, m)) / 2;
  }
  return p;
}

// --- friction ------------------------------------------------------------------

/** Friction from one real attack between members, and from a conquest. */
export const FRICTION_ATTACK = 0.25;
export const FRICTION_CONQUEST = 4;
/** Friction needed for a war (scaled by the leader's aggression and your difficulty). */
export const WAR_FRICTION = 10;
/** Per diplomacy tick (90 game minutes): what is left of the friction. */
const FADE = 0.96;

/** Where friction comes from (for the reason of a war, in the news). */
export type FrictionWhy = 'attack' | 'conquest' | 'treaty' | 'border';

function addWhy(ta: Tribe, tb: Tribe, why: FrictionWhy, amount: number): void {
  for (const [x, y] of [[ta, tb], [tb, ta]] as const) {
    const w = ((x.frictionWhy ??= {})[y.id] ??= {});
    w[why] = (w[why] ?? 0) + amount;
  }
}

/** Adds friction between the tribes of two players (nothing if either has no tribe, or the same one). */
export function addFriction(state: WorldState, a: number, b: number, amount: number, why: FrictionWhy = 'attack'): void {
  if (a < 0 || b < 0) return;
  const ta = tribeOf(state, a), tb = tribeOf(state, b);
  if (!ta || !tb || ta.id === tb.id) return;
  ta.friction ??= {};
  tb.friction ??= {};
  ta.friction[tb.id] = (ta.friction[tb.id] ?? 0) + amount;
  tb.friction[ta.id] = ta.friction[tb.id]!;
  addWhy(ta, tb, why, amount);
}

const WHY_TEXT: Record<FrictionWhy, string> = {
  attack: 'na aanhoudende aanvallen',
  conquest: 'na veroverde dorpen',
  treaty: 'na een gebroken verdrag',
  border: 'om de grens',
};

/** The main source of the friction between two tribes, as a few words ("na veroverde dorpen"). */
export function warReason(a: Tribe, b: Tribe): string {
  const w = a.frictionWhy?.[b.id];
  if (!w) return '';
  const top = (Object.entries(w) as [FrictionWhy, number][]).sort((x, y) => y[1] - x[1])[0];
  return top && top[1] > 0 ? WHY_TEXT[top[0]] : '';
}

export function frictionBetween(a: Tribe, b: Tribe): number {
  return a.friction?.[b.id] ?? 0;
}

/** Diplomacy tick: friction fades; neighbours rub each other a little. */
export function frictionTick(state: WorldState, pairs: { a: Tribe; b: Tribe; closeness: number }[]): void {
  for (const t of Object.values(state.tribes ?? {})) {
    for (const [id, f] of Object.entries(t.friction ?? {})) {
      const left = f * FADE;
      if (left < 0.05 || !state.tribes?.[Number(id)]) { delete t.friction![Number(id)]; if (t.frictionWhy) delete t.frictionWhy[Number(id)]; }
      else t.friction![Number(id)] = left;
    }
    for (const w of Object.values(t.frictionWhy ?? {})) for (const k of Object.keys(w) as FrictionWhy[]) w[k] = w[k]! * FADE;
  }
  for (const { a, b, closeness } of pairs) {
    if (closeness <= 0) continue;
    a.friction ??= {};
    b.friction ??= {};
    a.friction[b.id] = (a.friction[b.id] ?? 0) + 0.15 * closeness;
    b.friction[a.id] = a.friction[b.id]!;
    addWhy(a, b, 'border', 0.15 * closeness);
  }
}

/** After peace the slate is clean. */
export function clearFriction(a: Tribe, b: Tribe): void {
  if (a.friction) delete a.friction[b.id];
  if (b.friction) delete b.friction[a.id];
  if (a.frictionWhy) delete a.frictionWhy[b.id];
  if (b.frictionWhy) delete b.frictionWhy[a.id];
}
