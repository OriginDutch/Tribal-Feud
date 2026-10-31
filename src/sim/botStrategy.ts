/**
 * Why a bot attacks a player. No more farm runs at whoever is in range: every attack on a
 * player has a reason, and the bot looks first.
 *
 * - Farming a player: only a village the bot scouted recently and found (nearly) empty.
 *   A player whose village turned out strong is left alone for a while (all his villages).
 * - War and revenge ("strike"): enemies of its tribe at war, and players it holds a grudge
 *   against. It scouts their nearest villages and hits the weakest one it can beat with a
 *   real army. How quickly a grudge turns into an attack depends on the difficulty.
 * - Conquest (nobles) and the counter to an attack are handled elsewhere (bots.ts, botReact.ts).
 */
import { skillOf } from './bots';
import type { UnitCounts, UnitId } from '../shared/gameData';
import type { Archetype, BotProfile } from '../shared/botProfiles';
import { DAY, HOUR } from '../shared/time';
import { grudge } from './botReact';
import { distance, moraleFor, protectionBlocker, sendAttack } from './movement';
import { hashFloat, nextFloat } from './rng';
import { BARBARIAN, villagesOf, type Player, type WorldState } from './state';
import { mayAttack, relationBetween } from './tribes';
import { outclassed } from './warCause';
import type { Village } from './village';
import { isOperational, popMax } from './village';

/** A bot's scout of a village. `spies`: how many went when they died (the next ones come with more). */
export interface BotScout { at: number; def: number; owner: number; spies?: number }

/** Defense noted when the scouts were killed: unknown, treated as far too strong. */
export const SCOUTS_DIED = 1e12;
/**
 * Scouts a bot keeps per village: its own level within its tier's range, the same all game. Most
 * sit a little above the old fixed 15 / 6 / 3, a few far higher (a village you can't look into).
 * Farmers and opportunists like to look first, turtles less so. Hard worlds: half again as many.
 */
const SPY_RANGE = { pro: [8, 60], mid: [3, 25], casual: [1, 12] } as const;
const SPY_TASTE: Partial<Record<Archetype, number>> = { farmer: 1.25, opportunist: 1.25, rusher: 1.1, turtle: 0.75 };
/** In a war the scouts go up to this: three times its own level, at most 150 (hard: 225). */
const SPY_WAR_MAX = 150;
const spyHard = (state: WorldState) => (state.config.bots.difficulty === 'hard' ? 1.5 : 1);

/** The scouts a bot keeps per village in peace time (its own level; see SPY_RANGE). */
export function spyLevel(state: WorldState, player: Player): number {
  const b = player.bot;
  if (!b) return 0;
  const [lo, hi] = SPY_RANGE[b.tier ?? 'pro'];
  // its own draw, from the seed: no world randomness used, the same after every load
  const u = hashFloat(state.config.seed, player.id, 0x5917);
  const level = (lo + (hi - lo) * u ** 2.2) * (SPY_TASTE[b.archetype] ?? 1) * spyHard(state);
  return Math.round(Math.min(hi * spyHard(state), Math.max(lo, level)));
}

/** Scouts to keep now: its level, or more after an arms race in a war (see raiseSpies). */
export function spiesToKeep(state: WorldState, player: Player): number {
  return Math.max(spyLevel(state, player), player.bot?.spyWar ?? 0);
}

/**
 * Arms race: its scouts died at an enemy (it wants twice what that took), or an enemy's scouts got
 * into its village (it wants as many as came). Up to three times its own level, at most SPY_WAR_MAX.
 */
export function raiseSpies(state: WorldState, player: Player | undefined, want: number): void {
  const b = player?.bot;
  if (!b || want <= 0) return;
  const cap = Math.min(SPY_WAR_MAX * spyHard(state), 3 * spyLevel(state, player));
  b.spyWar = Math.min(cap, Math.max(b.spyWar ?? 0, Math.ceil(want)));
}
/** Scouts sent at a village; where they died before, everything that is home. */
const SCOUT_GROUP = 5;
/** How far a strike reaches (fields). */
const STRIKE_RADIUS = 25;
/** Units of a strike: the offensive army. */
const STRIKE_UNITS: UnitId[] = ['axe', 'light', 'marcher', 'ram'];

/**
 * A scout stays useful this long (game time): a day at world speed 1, at least 4 hours. A bot
 * with many villages comes back to one only every few turns, so a shorter life is wasted.
 */
export const scoutFresh = (state: WorldState) => Math.max(4 * HOUR, DAY / state.config.worldSpeed);
/** A strong target is left alone this long. */
const waryFor = (state: WorldState) => 2 * scoutFresh(state);
/** At most one strike per bot this often. */
export const strikeCooldown = (state: WorldState) => DAY / (2 * state.config.worldSpeed);

/**
 * Is this army worth an attack on a player? With strikeMinShare set, only an army that fills at
 * least that share of the village's farm goes: no handfuls of troops.
 */
export function bigEnough(state: WorldState, v: Village, army: UnitCounts): boolean {
  let min = state.config.bots.strikeMinShare ?? 0;
  if (min <= 0) return true;
  // graded: a pro waits for a full army (~0.6 of the farm), a sloppy casual goes with ~0.3
  const p = state.players[v.owner];
  if (state.config.bots.armyGrades && p?.bot) min = (min / 0.5) * (0.2 + 0.4 * skillOf(state, p.id, p.bot));
  const pop = Object.entries(army).reduce((n, [u, k]) => n + (k ?? 0) * state.config.units[u as UnitId].pop, 0);
  return pop >= min * popMax(state.config, v);
}

/** Defense strength of what stands in the village, roughly as the battle sees it. */
export function defenseOf(state: WorldState, present: UnitCounts, wall: number): number {
  const { units, combat } = state.config;
  let d = 0;
  for (const [u, n] of Object.entries(present) as [UnitId, number][]) {
    if (!n) continue;
    const def = units[u];
    d += n * (def.defense + def.defenseCavalry) / 2;
  }
  return (d + combat.baseDefense + combat.wallDefensePerLevel * wall) * combat.wallFactor ** wall;
}

export function attackOf(state: WorldState, units: UnitCounts): number {
  let a = 0;
  for (const [u, n] of Object.entries(units) as [UnitId, number][]) if (n) a += n * state.config.units[u].attack;
  return a;
}

/** Called after a bot's scouts got through. */
export function rememberScout(state: WorldState, owner: number, target: Village, present: UnitCounts | null, wall: number, spiesLost = 0): void {
  const bot = state.players[owner]?.bot;
  if (!bot || target.owner < 0) return;
  // present = null: the scouts died. Unknown counts as too strong (and stops re-scouting for a while)
  const def = present ? defenseOf(state, present, wall) : SCOUTS_DIED;
  // died again: the next ones need more than both groups that died
  const before = bot.scouted?.[target.id];
  const spies = present ? undefined : Math.max(spiesLost, before?.def === SCOUTS_DIED ? (before.spies ?? 0) : 0);
  (bot.scouted ??= {})[target.id] = spies ? { at: state.time, def, owner: target.owner, spies } : { at: state.time, def, owner: target.owner };
  // its scouts died: from now on it keeps more
  if (spies) raiseSpies(state, state.players[owner], 2 * spies);
  // forget old scouts
  for (const [id, sc] of Object.entries(bot.scouted)) if (state.time - sc.at > 6 * waryFor(state)) delete bot.scouted[Number(id)];
}

/**
 * Escorts for the noblemen of a train. A clear kills the troops but the wall often still stands,
 * and an empty village behind a wall 20 still has ~2000 defense: a nobleman with a few spears
 * dies against it. So every escort first gets enough axes / light cavalry to beat an empty
 * village behind this wall (with margin), then a share of the spears and swords.
 * `pool` is what may be used (the clear keeps the rest); used units are taken out of it.
 * Morale counts: against a much smaller player a nobleman alone can even lose to an empty village.
 */
export function nobleEscorts(state: WorldState, pool: UnitCounts, wall: number, n: number, morale = 1): UnitCounts[] {
  const { units } = state.config;
  // low morale (a much smaller target) weakens the escort too; bad luck on top
  const need = (1.5 * defenseOf(state, {}, wall)) / Math.max(0.1, morale);
  const out: UnitCounts[] = [];
  for (let i = 0; i < n; i++) {
    const e: UnitCounts = {};
    let left = need;
    for (const u of ['light', 'axe', 'marcher', 'heavy'] as const) {
      if (left <= 0) break;
      const have = pool[u] ?? 0;
      const take = Math.min(have, Math.ceil(left / units[u].attack));
      if (take <= 0) continue;
      e[u] = take;
      pool[u] = have - take;
      left -= take * units[u].attack;
    }
    out.push(e);
  }
  for (const u of ['spear', 'sword'] as const) {
    const share = Math.floor((pool[u] ?? 0) / n);
    if (share <= 0) continue;
    for (const e of out) e[u] = (e[u] ?? 0) + share;
    pool[u] = (pool[u] ?? 0) - share * n;
  }
  return out;
}

/** A fresh scout that saw something (scouts that died saw nothing). */
export function freshSighting(state: WorldState, player: Player, villageId: number): BotScout | undefined {
  const sc = freshScout(state, player, villageId);
  return sc && sc.def < SCOUTS_DIED ? sc : undefined;
}

export function freshScout(state: WorldState, player: Player, villageId: number): BotScout | undefined {
  const sc = player.bot?.scouted?.[villageId];
  return sc && state.time - sc.at <= scoutFresh(state) && state.villages[villageId]?.owner === sc.owner ? sc : undefined;
}

/** Scouted lately, whatever it showed: look elsewhere first. */
function recentlyScouted(state: WorldState, player: Player, villageId: number): boolean {
  const sc = player.bot?.scouted?.[villageId];
  // scouts that died: that player watches his borders, so try again much later
  return !!sc && state.time - sc.at <= waryFor(state) * (sc.def >= SCOUTS_DIED ? 3 : 1);
}

export function isWary(state: WorldState, player: Player, of: number): boolean {
  return (player.bot?.wary?.[of] ?? 0) > state.time;
}

/** canTarget per (bot, player) pair, for the current game moment: many villages share an owner. */
const targetMemo = new WeakMap<WorldState, { at: number; map: Map<number, boolean> }>();

/** May this bot go after this player at all (tribe rules, protection, your orders, strength)? */
function canTarget(state: WorldState, player: Player, other: number): boolean {
  if (other < 0 || other === player.id) return false;
  let memo = targetMemo.get(state);
  if (!memo || memo.at !== state.time) { memo = { at: state.time, map: new Map() }; targetMemo.set(state, memo); }
  const key = player.id * 100_000 + other;
  const hit = memo.map.get(key);
  if (hit !== undefined) return hit;
  const ok = canTargetNow(state, player, other);
  memo.map.set(key, ok);
  return ok;
}

function canTargetNow(state: WorldState, player: Player, other: number): boolean {
  if (!mayAttack(state, player.id, other) || protectionBlocker(state, player.id, other) !== null) return false;
  // don't pick a fight with someone who clearly outclasses you
  if (outclassed(state, player.id, other)) return false;
  return !((player.bot?.spare?.[other] ?? 0) > state.time);
}

/**
 * Farming a player village: scouted lately and so weak that the farm group wins easily.
 * A village that turned out strong makes the bot leave that player alone for a while.
 */
export function farmablePlayerVillage(state: WorldState, player: Player, t: Village, group: UnitCounts): boolean {
  if (t.owner === BARBARIAN) return true;
  if (!canTarget(state, player, t.owner) || isWary(state, player, t.owner)) return false;
  const sc = freshScout(state, player, t.id);
  return !!sc && sc.def * 2.5 < effectiveAttack(state, player.id, t.owner, group);
}

/** Sends scouts from `v` to a player village nearby that the bot wants to know about. */
/**
 * Spies needed for a scout of `t`: a small group, or after scouts died there at least double what
 * died (only more spies than the defender has get through). Any bot's memory counts (`seen`).
 */
export function spiesNeeded(sc: BotScout | undefined): number {
  return sc && sc.def >= SCOUTS_DIED ? Math.max(2 * SCOUT_GROUP, 2 * (sc.spies ?? SCOUT_GROUP)) : SCOUT_GROUP;
}

export function scout(state: WorldState, v: Village, t: Village, need = spiesNeeded(state.players[v.owner]?.bot?.scouted?.[t.id])): boolean {
  if (v.units.spy < need) return false;
  // everything this village has: only more than the defender has gets through, and they come back
  return sendAttack(state, v.id, t.id, { spy: v.units.spy }) === null;
}

/** Farmers scout one unknown player village in farm range per turn, so they know who is weak. */
export function scoutForFarming(state: WorldState, player: Player, v: Village, profile: BotProfile, near: Village[]): void {
  if (!profile.attacksPlayers || v.units.spy < SCOUT_GROUP || !isOperational(state.config, v, 'place')) return;
  const t = near
    .filter((x) => x.owner >= 0 && x.owner !== player.id && canTarget(state, player, x.owner) && !isWary(state, player, x.owner) && !recentlyScouted(state, player, x.id) && !player.bot?.outgoing.includes(x.id))
    .sort((a, b) => distance(a, v) - distance(b, v))[0];
  if (t && scout(state, v, t)) player.bot!.outgoing.push(t.id);
}

/** After a scout report: a strong village makes a farming bot wary of that player. */
export function judgeScout(state: WorldState, player: Player, v: Village, target: Village): void {
  const sc = freshScout(state, player, target.id);
  if (!sc || !player.bot) return;
  const farmPower = attackOf(state, Object.fromEntries(STRIKE_UNITS.map((u) => [u, v.units[u] + v.outside[u]])));
  if (sc.def > Math.max(500, farmPower * 0.2)) (player.bot.wary ??= {})[target.owner] = state.time + waryFor(state) * (sc.def >= SCOUTS_DIED ? 3 : 1);
}

/**
 * What an army really brings against a player: its attack, times morale (a big attacker on a
 * small defender fights weaker) and with bad luck (-25%). Bots plan for the bad day.
 */
export function effectiveAttack(state: WorldState, attacker: number, defender: number, army: UnitCounts): number {
  const luck = state.config.luck ? 1 - state.config.combat.luckRange : 1;
  return attackOf(state, army) * moraleFor(state, attacker, defender) * luck;
}

/** Conquest: a scouted player village the army of `v` clearly breaks (morale and bad luck included). */
export function beatable(state: WorldState, player: Player, t: Village, v: Village): boolean {
  const sc = freshScout(state, player, t.id);
  if (!sc) return false;
  const army: UnitCounts = {};
  for (const u of STRIKE_UNITS) if (v.units[u] > 0) army[u] = v.units[u];
  return sc.def * 1.2 < effectiveAttack(state, player.id, t.owner, army);
}

/** A noble train is ready but there is no target: scout the nearest unknown player village in reach. */
export function scoutForConquest(state: WorldState, player: Player, v: Village, near: Village[]): void {
  if (v.units.spy < SCOUT_GROUP) return;
  const t = near
    .filter((x) => x.owner >= 0 && x.owner !== player.id && canTarget(state, player, x.owner) && !recentlyScouted(state, player, x.id) && !player.bot?.outgoing.includes(x.id))
    .sort((a, b) => distance(a, v) - distance(b, v))[0];
  if (t && scout(state, v, t)) player.bot!.outgoing.push(t.id);
}

/** Difficulty: how readily a grudge becomes an attack. */
const REVENGE: Record<string, number> = { easy: 0.5, normal: 1, hard: 1.6 };

/** Who this bot wants to hit, and how badly (0 = nobody). */
function enemies(state: WorldState, player: Player): Map<number, number> {
  const out = new Map<number, number>();
  const bot = player.bot!;
  const factor = REVENGE[state.config.bots.difficulty] ?? 1;
  for (const id of Object.keys(bot.grudges ?? {}).map(Number)) {
    const g = grudge(state, player, id);
    if (g >= 0.5 && canTarget(state, player, id)) out.set(id, Math.min(2, g) * factor);
  }
  // tribe at war: every member of the enemy tribe
  const t = player.tribe !== undefined ? state.tribes?.[player.tribe] : undefined;
  if (t) {
    for (const [other, rel] of Object.entries(t.relations)) {
      if (rel !== 'war') continue;
      for (const m of state.tribes?.[Number(other)]?.members ?? []) if (canTarget(state, player, m)) out.set(m, (out.get(m) ?? 0) + 1);
    }
  }
  return out;
}

/**
 * War and revenge: now and then a bot picks an enemy, scouts his villages near one of its own,
 * and sends its army at the weakest one it can clearly beat. Nothing it can beat: no attack.
 */
export function strike(state: WorldState, player: Player, v: Village): void {
  const bot = player.bot;
  if (!bot || !isOperational(state.config, v, 'place')) return;
  if (bot.lastStrike !== undefined && state.time - bot.lastStrike < strikeCooldown(state)) return;
  const foes = enemies(state, player);
  if (!foes.size) return;
  // pick one, weighted by how badly; a turn without an attack is the normal case
  let total = 0;
  for (const w of foes.values()) total += w;
  if (nextFloat(state.rng) > Math.min(0.6, 0.15 * total)) return;
  let roll = nextFloat(state.rng) * total;
  let foe = -1;
  for (const [id, w] of foes) { roll -= w; if (roll <= 0) { foe = id; break; } }
  if (foe < 0) return;

  const army: UnitCounts = {};
  for (const u of STRIKE_UNITS) if (v.units[u] > 0) army[u] = v.units[u];
  if (attackOf(state, army) < 2000 || !bigEnough(state, v, army)) return;
  const power = effectiveAttack(state, player.id, foe, army);
  const theirs = villagesOf(state, foe).filter((t) => distance(t, v) <= STRIKE_RADIUS).sort((a, b) => distance(a, v) - distance(b, v)).slice(0, 6);
  // the weakest scouted village it can clearly beat
  let best: Village | null = null;
  let bestDef = Infinity;
  for (const t of theirs) {
    const sc = freshScout(state, player, t.id);
    if (sc && sc.def * 1.5 < power && sc.def < bestDef) { best = t; bestDef = sc.def; }
  }
  if (best) {
    if (sendAttack(state, v.id, best.id, army) === null) bot.lastStrike = state.time;
    return;
  }
  // nothing known yet: scout the nearest unscouted one
  const unknown = theirs.find((t) => !recentlyScouted(state, player, t.id));
  if (unknown) scout(state, v, unknown);
}

/** Is `other` someone this bot farms or fights for a reason? (for tests and debugging) */
export function reasonAgainst(state: WorldState, player: Player, other: number): 'war' | 'grudge' | null {
  if (relationBetween(state, player.id, other) === 'war') return 'war';
  return grudge(state, player, other) >= 0.5 ? 'grudge' : null;
}
