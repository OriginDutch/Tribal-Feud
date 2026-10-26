/**
 * Bots seeing an attack coming and doing something about it.
 *
 * A bot sees what a player sees: where it comes from, where it goes, when it lands. From the
 * walking time it works out the slowest unit that can be in it (noble, ram, sword, ...), never the
 * real troops. How likely it reacts depends on its tier and on how dangerous the attack looks;
 * reacting takes time in fixed game minutes, so on a fast world it is often too late (like for you).
 */
import { BOT_PROFILES, type Archetype } from '../shared/botProfiles';
import { UNIT_IDS, type UnitCounts, type UnitId } from '../shared/gameData';
import { MINUTE } from '../shared/time';
import { recruitDefense, villagesNear } from './bots';
import { distance, protectionBlocker, sendAttack, sendSupport, travelTimeMs } from './movement';
import { mayAttack } from './tribes';
import { spares } from './tribeOrders';
import { nextFloat } from './rng';
import { BARBARIAN, movementIndex, villagesOf, type BotTier, type Player, type WorldState } from './state';
import { isOperational, type Village } from './village';

export type AttackKind = 'noble' | 'siege' | 'sword' | 'infantry' | 'heavy' | 'cav' | 'scout';

/** Slowest unit kinds by walking speed (minutes per field), slowest first. */
const KIND_OF: Partial<Record<UnitId, AttackKind>> = {
  snob: 'noble', ram: 'siege', catapult: 'siege', sword: 'sword', spear: 'infantry', axe: 'infantry', archer: 'infantry',
  heavy: 'heavy', light: 'cav', marcher: 'cav', knight: 'cav', spy: 'scout',
};
/** How dangerous an attack of that speed looks (0..1). */
export const DANGER: Record<AttackKind, number> = { noble: 1, siege: 0.9, sword: 0.6, infantry: 0.5, heavy: 0.4, cav: 0.25, scout: 0.05 };

/** What the defender can tell from the walking time: the slowest unit that fits it. */
export function attackKind(state: WorldState, from: Village, to: Village, sent: number, arrives: number): AttackKind {
  const d = distance(from, to);
  const took = arrives - sent;
  let best: AttackKind = 'cav', bestDiff = Infinity;
  for (const u of UNIT_IDS) {
    const kind = KIND_OF[u];
    if (!kind) continue;
    const diff = Math.abs(travelTimeMs(state, { [u]: 1 }, d) - took);
    if (diff < bestDiff) { bestDiff = diff; best = kind; }
  }
  return best;
}

/** Chance to react, per tier, from the danger. Pros always (scouts aside). */
function reactChance(tier: BotTier, danger: number): number {
  if (tier === 'pro') return danger >= 0.25 ? 1 : 0;
  if (tier === 'mid') return 0.25 + 0.5 * danger;
  return 0.1 + 0.4 * danger;
}
/** Game minutes a bot needs before it can act (fixed: attention does not speed up with the world). */
const REACT_MINUTES: Record<BotTier, number> = { pro: 3, mid: 20, casual: 40 };

type Action = 'dodge' | 'restack' | 'recruit';
const ACTIONS: Record<Archetype, Action[]> = {
  turtle: ['restack', 'recruit'],
  rusher: ['dodge'],
  farmer: ['dodge', 'recruit'],
  diplomat: ['restack'],
  opportunist: ['dodge'],
  supporter: ['restack', 'recruit'],
};

const OFFENSE: UnitId[] = ['axe', 'light', 'marcher', 'ram', 'catapult', 'snob'];
const DEFENSE: UnitId[] = ['spear', 'sword', 'archer', 'heavy'];

/**
 * Called at the start of an online bot turn: looks at all incoming attacks on its villages it has
 * not judged yet, and reacts to some. Each attack is judged once.
 */
export function reactToIncoming(state: WorldState, player: Player): void {
  const bot = player.bot;
  if (!bot || bot.reference) return;
  const tier = bot.tier ?? 'pro';
  const ix = movementIndex(state);
  const seen = (bot.seen ??= {});
  const live = new Set<number>();
  for (const v of villagesOf(state, player.id)) {
    for (const id of ix.incoming.get(v.id) ?? []) {
      const m = state.movements[id];
      if (!m) continue;
      live.add(id);
      const known = seen[id];
      if (known) {
        // a planned dodge: go when the moment is there
        if (known.dodge && dodge(state, v, m.arrives) !== 'wait') delete known.dodge;
        continue;
      }
      const from = state.villages[m.from];
      if (!from) continue;
      const kind = attackKind(state, from, v, m.sent, m.arrives);
      const danger = DANGER[kind];
      const inTime = m.arrives - state.time >= REACT_MINUTES[tier] * MINUTE;
      const reacts = inTime && nextFloat(state.rng) < reactChance(tier, danger);
      seen[id] = { reacted: reacts };
      if (reacts && react(state, player, v, m.arrives, danger)) seen[id]!.dodge = true;
      // noticed at all (in time or not): it remembers who it was, and the sharp ones hit back
      if (inTime || tier === 'pro') {
        addGrudge(state, player, m.owner, danger);
        if (reacts) counter(state, player, v, from, m.sent, m.arrives, danger);
      }
    }
  }
  // forget attacks that landed or were called back
  for (const id of Object.keys(seen)) if (!live.has(Number(id))) delete seen[Number(id)];
}

/** Returns true when a dodge has to wait for its moment. */
function react(state: WorldState, player: Player, v: Village, arrives: number, danger: number): boolean {
  const profile = BOT_PROFILES[player.bot!.archetype];
  let wait = false;
  for (const action of ACTIONS[player.bot!.archetype]) {
    if (action === 'dodge' && danger >= 0.5) wait = dodge(state, v, arrives) === 'wait';
    if (action === 'restack') restack(state, player, v, arrives);
    if (action === 'recruit') recruitDefense(state, v, profile, [0, 0, 0], 1);
  }
  return wait;
}

/**
 * Gets the attack troops out of the way: off to a barbarian village far enough that they are
 * still away when the attack lands (they come back by themselves, with loot). Like a player it
 * goes shortly before the attack lands: while even the farthest barbarian would have them back
 * too early, it waits ('wait').
 */
function dodge(state: WorldState, v: Village, arrives: number): 'sent' | 'wait' | 'none' {
  if (!isOperational(state.config, v, 'place')) return 'none';
  const units: UnitCounts = {};
  let any = false;
  for (const u of OFFENSE) if (v.units[u] > 0) { units[u] = v.units[u]; any = true; }
  if (!any) return 'none';
  const left = arrives - state.time;
  if (left <= 0) return 'none';
  let farthest = 0;
  for (const b of villagesNear(state, v, 25)) {
    if (b.owner !== BARBARIAN) continue;
    const round = 2 * travelTimeMs(state, units, distance(v, b));
    farthest = Math.max(farthest, round);
    // back only after the attack has landed (plus a margin)
    if (round < left + 2 * MINUTE) continue;
    if (sendAttack(state, v.id, b.id, units) === null) return 'sent';
  }
  return farthest > 0 && farthest < left + 2 * MINUTE ? 'wait' : 'none';
}

/** Sends defense from its own villages nearby, if it gets there before the attack. */
function restack(state: WorldState, player: Player, v: Village, arrives: number): void {
  const share = player.bot!.archetype === 'turtle' || player.bot!.archetype === 'supporter' ? 0.5 : 0.3;
  let senders = 0;
  for (const o of villagesOf(state, player.id)) {
    if (senders >= 2) return;
    if (o.id === v.id || distance(o, v) > 12 || !isOperational(state.config, o, 'place')) continue;
    const units: UnitCounts = {};
    let any = false;
    for (const u of DEFENSE) { const n = Math.floor(o.units[u] * share); if (n > 0) { units[u] = n; any = true; } }
    if (!any || state.time + travelTimeMs(state, units, distance(o, v)) > arrives) continue;
    if (sendSupport(state, o.id, v.id, units) === null) senders++;
  }
}

// --- grudges and counters ------------------------------------------------------

/** Grudge fades to half in a (speed-adjusted) day. */
const GRUDGE_HALF_LIFE_MS = 24 * 60 * MINUTE;
export function grudge(state: WorldState, player: Player, against: number): number {
  const g = player.bot?.grudges?.[against];
  if (!g) return 0;
  const age = (state.time - g.at) * state.config.worldSpeed;
  return g.score * 0.5 ** (age / GRUDGE_HALF_LIFE_MS);
}
function addGrudge(state: WorldState, player: Player, against: number, danger: number): void {
  if (against < 0 || against === player.id) return;
  const now = grudge(state, player, against);
  (player.bot!.grudges ??= {})[against] = { score: now + danger, at: state.time };
  // forget the ones that faded out
  for (const id of Object.keys(player.bot!.grudges!)) if (grudge(state, player, Number(id)) < 0.05) delete player.bot!.grudges![Number(id)];
}

/** How often a tier hits back: pros always, a quarter of the middle group, casuals never. */
const COUNTER: Record<BotTier, number> = { pro: 1, mid: 0.25, casual: 0 };
/** And scouts back. */
const SCOUT_BACK: Record<BotTier, number> = { pro: 1, mid: 0.3, casual: 0 };

/**
 * Hits back like a player would. It scouts the village the attack came from, and when the
 * attack looks big, that village's army is on the road: it attacks it with ANOTHER village, timed
 * to land before that army is home again.
 */
function counter(state: WorldState, player: Player, target: Village, from: Village, sent: number, arrives: number, danger: number): void {
  const tier = player.bot!.tier ?? 'pro';
  if (from.owner < 0 || !mayAttack(state, player.id, from.owner) || protectionBlocker(state, player.id, from.owner) !== null || spares(state, player.bot, from.owner)) return;
  const mine = villagesOf(state, player.id).filter((o) => isOperational(state.config, o, 'place'));
  // scout back from the nearest village with scouts
  if (nextFloat(state.rng) < SCOUT_BACK[tier]) {
    const scout = mine.filter((o) => o.units.spy >= 3).sort((a, b) => distance(a, from) - distance(b, from))[0];
    if (scout) sendAttack(state, scout.id, from.id, { spy: Math.min(5, scout.units.spy) });
  }
  if (danger < 0.5 || nextFloat(state.rng) >= COUNTER[tier]) return;
  // their army is home again at about arrives + (arrives - sent)
  const home = arrives + (arrives - sent);
  let best: { v: Village; units: UnitCounts; at: number } | null = null;
  for (const o of mine) {
    if (o.id === target.id) continue; // that one is busy dodging or defending
    const units: UnitCounts = {};
    let n = 0;
    for (const u of OFFENSE) if (u !== 'snob' && o.units[u] > 0) { units[u] = o.units[u]; n += o.units[u]; }
    if (n < 100) continue;
    const at = state.time + travelTimeMs(state, units, distance(o, from));
    if (at >= home) continue; // too slow: their army would be back
    if (!best || at < best.at) best = { v: o, units, at };
  }
  if (best) sendAttack(state, best.v.id, from.id, best.units);
}

/** Did the owner of this village see (and act on) this attack? Tribe mates only help with those. */
export function sawAttack(state: WorldState, ownerId: number, movementId: number): boolean {
  return state.players[ownerId]?.bot?.seen?.[movementId]?.reacted === true;
}
