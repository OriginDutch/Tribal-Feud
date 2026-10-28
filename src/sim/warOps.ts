/**
 * Joint operations: how a tribe at war actually fights.
 *
 * Every diplomacy tick the leader of a tribe at war looks at the front (enemy villages close to
 * his tribe), with the scouts of all his members. He picks a village the tribe can clearly break
 * together and hands out roles: a few members each send a full army, timed to land one after
 * the other at the same moment, and a member with a noble train lands right behind them.
 * Unknown front villages are scouted first.
 *
 * You: as a member you get the order to join (with the landing time); as a leader you choose the
 * front yourself (Tribe.front), and your bot members plan and fight it.
 *
 * Tiers: a pro leader plans every tick, a mid one now and then, a casual one rarely. Casual
 * members sometimes forget their part.
 */
import type { UnitCounts } from '../shared/gameData';
import { DAY, HOUR, MINUTE } from '../shared/time';
import { push } from './eventQueue';
import { attackOf, effectiveAttack, freshSighting, nobleEscorts, scout as sendScouts } from './botStrategy';
import { villagesNear } from './bots';
import { distance, moraleFor, sendAttack, sendNobleTrain, travelTimeMs } from './movement';
import { nextFloat } from './rng';
import { HUMAN_ID, nextId, villagesOf, type Player, type WorldState } from './state';
import { addTribeNews, type Tribe } from './tribes';
import { giveOpOrder } from './tribeOrders';
import type { Village } from './village';
import { isOperational } from './village';

export interface OpRole {
  member: number;
  village: number;
  kind: 'nuke' | 'nobles';
  launchAt: number;
  /** sent / forgot / could not (village lost, army gone) */
  state?: 'sent' | 'forgot' | 'failed';
}

export interface TribeOp {
  id: number;
  enemy: number;
  target: number;
  landAt: number;
  roles: OpRole[];
  /** You were asked to join. */
  human?: boolean;
}

/** How far the tribe reaches for a front village (fields). */
const FRONT_RANGE = 18;
/** Front villages the leader considers. */
const FRONT_SIZE = 8;
/** At most this many full armies per operation. */
const MAX_NUKES = 4;
/** Armies smaller than this don't take part. */
const MIN_NUKE = 3000;
const OFF: (keyof UnitCounts)[] = ['axe', 'light', 'marcher', 'ram'];
const PLAN_CHANCE = { pro: 1, mid: 0.5, casual: 0.2 } as const;
const FORGET = { pro: 0, mid: 0.08, casual: 0.3 } as const;

const tierOf = (p: Player | undefined) => p?.bot?.tier ?? 'pro';

function armyOf(v: Village): UnitCounts {
  const a: UnitCounts = {};
  for (const u of OFF) if (v.units[u] > 0) a[u] = v.units[u];
  return a;
}

/** The freshest scout of a village among the tribe's bots. */
function tribeIntel(state: WorldState, t: Tribe, villageId: number): number | undefined {
  let best: { at: number; def: number } | undefined;
  for (const m of t.members) {
    const p = state.players[m];
    if (!p?.bot) continue;
    const sc = freshSighting(state, p, villageId);
    if (sc && (!best || sc.at > best.at)) best = sc;
  }
  return best?.def;
}

/** Enemies this tribe fights now: every tribe at war with it, or only your chosen one when you lead. */
function enemiesOf(state: WorldState, t: Tribe): Tribe[] {
  if (t.leader === HUMAN_ID) {
    const e = t.front && t.relations[t.front.enemy] === 'war' ? state.tribes?.[t.front.enemy] : undefined;
    return e ? [e] : [];
  }
  return Object.entries(t.relations).filter(([, r]) => r === 'war').map(([id]) => state.tribes?.[Number(id)]).filter((x): x is Tribe => !!x);
}

/** Enemy villages along the front, nearest first, with the nearest of our villages. */
function front(state: WorldState, t: Tribe, enemy: Tribe, ours: Village[]): Village[] {
  const theirs = new Set(enemy.members);
  const seen = new Map<number, { v: Village; d: number }>();
  for (const o of ours) {
    for (const v of villagesNear(state, o, FRONT_RANGE)) {
      if (!theirs.has(v.owner)) continue;
      const d = distance(o, v);
      const had = seen.get(v.id);
      if (!had || d < had.d) seen.set(v.id, { v, d });
    }
  }
  return [...seen.values()].sort((a, b) => a.d - b.d).slice(0, FRONT_SIZE).map((x) => x.v);
}

/** Runs with the diplomacy tick. */
export function warOpsTick(state: WorldState): void {
  for (const t of Object.values(state.tribes ?? {})) {
    // forget operations that are over; tell what came of them
    if (t.ops?.length) {
      for (const op of t.ops.filter((o) => state.time > o.landAt + 2 * HOUR)) report(state, t, op);
      t.ops = t.ops.filter((o) => state.time <= o.landAt + 2 * HOUR);
    }
    const leader = state.players[t.leader];
    if (!leader) continue;
    // a bot leader plans by his tier; your bots plan your front every tick
    if (leader.bot && nextFloat(state.rng) > PLAN_CHANCE[tierOf(leader)]) continue;
    for (const enemy of enemiesOf(state, t)) {
      if (t.ops?.some((o) => o.enemy === enemy.id)) continue;
      plan(state, t, enemy);
    }
  }
}

function plan(state: WorldState, t: Tribe, enemy: Tribe): void {
  const ours = t.members.flatMap((m) => villagesOf(state, m)).filter((v) => isOperational(state.config, v, 'place'));
  if (!ours.length) return;
  // your chosen target first, else the front nearest first
  const wanted = t.leader === HUMAN_ID && t.front?.target !== undefined ? state.villages[t.front.target] : undefined;
  const candidates = wanted && enemy.members.includes(wanted.owner) ? [wanted] : front(state, t, enemy, ours);
  if (!candidates.length) return;
  for (const target of candidates) {
    const def = tribeIntel(state, t, target.id);
    if (def === undefined) continue;
    const roles = nukes(state, t, target, def);
    if (!roles) continue;
    launch(state, t, enemy, target, roles);
    return;
  }
  // nothing known that we can break: scout the nearest unknown front village
  const unknown = candidates.find((v) => tribeIntel(state, t, v.id) === undefined);
  if (!unknown) return;
  const from = ours.filter((v) => state.players[v.owner]?.bot && v.units.spy >= 5).sort((a, b) => distance(a, unknown) - distance(b, unknown))[0];
  if (from) sendScouts(state, from, unknown);
}

/** Bot armies near the target that together clearly break it (morale and bad luck included). */
function nukes(state: WorldState, t: Tribe, target: Village, def: number): OpRole[] | null {
  const need = def * 1.3;
  const busy = new Set((t.ops ?? []).flatMap((o) => o.roles.map((r) => r.village)));
  const options = t.members
    .filter((m) => state.players[m]?.bot)
    .flatMap((m) => villagesOf(state, m))
    .filter((v) => !busy.has(v.id) && distance(v, target) <= FRONT_RANGE && isOperational(state.config, v, 'place') && attackOf(state, armyOf(v)) >= MIN_NUKE)
    .map((v) => ({ v, power: effectiveAttack(state, v.owner, target.owner, armyOf(v)) }))
    .sort((a, b) => b.power - a.power);
  const roles: OpRole[] = [];
  let sum = 0;
  for (const o of options) {
    if (sum >= need || roles.length >= MAX_NUKES) break;
    roles.push({ member: o.v.owner, village: o.v.id, kind: 'nuke', launchAt: 0 });
    sum += o.power;
  }
  return sum >= need ? roles : null;
}

function launch(state: WorldState, t: Tribe, enemy: Tribe, target: Village, roles: OpRole[]): void {
  const travel = (r: OpRole) => {
    const v = state.villages[r.village]!;
    return travelTimeMs(state, r.kind === 'nobles' ? { snob: 1 } : armyOf(v), distance(v, target));
  };
  // a bot member with a full noble train in reach lands right behind the armies
  const nobleVillage = t.members
    .filter((m) => state.players[m]?.bot)
    .flatMap((m) => villagesOf(state, m))
    .filter((v) => v.units.snob >= 4 && distance(v, target) <= state.config.conquest.maxDistance && isOperational(state.config, v, 'place'))
    // rather one that isn't sending an army too
    .sort((a, b) => Number(roles.some((r) => r.village === a.id)) - Number(roles.some((r) => r.village === b.id)) || distance(a, target) - distance(b, target))[0];
  if (nobleVillage) roles.push({ member: nobleVillage.owner, village: nobleVillage.id, kind: 'nobles', launchAt: 0 });
  const landAt = state.time + Math.max(...roles.map(travel)) + 15 * MINUTE;
  for (const r of roles) r.launchAt = landAt + (r.kind === 'nobles' ? 30_000 : 0) - travel(r);
  const op: TribeOp = { id: nextId(state), enemy: enemy.id, target: target.id, landAt, roles };
  (t.ops ??= []).push(op);
  roles.forEach((r, i) => push(state.queue, r.launchAt, { kind: 'opLaunch', tribe: t.id, op: op.id, role: i }));
  // you: join with your own army if you have a village in reach
  if (t.leader !== HUMAN_ID && t.members.includes(HUMAN_ID) && villagesOf(state, HUMAN_ID).some((v) => distance(v, target) <= FRONT_RANGE)) {
    const leader = state.players[t.leader];
    if (leader && giveOpOrder(state, leader, target, landAt)) op.human = true;
  }
}

/** An opLaunch event: this member's part leaves now. */
export function onOpLaunch(state: WorldState, tribeId: number, opId: number, role: number): void {
  const t = state.tribes?.[tribeId];
  const op = t?.ops?.find((o) => o.id === opId);
  const r = op?.roles[role];
  if (!t || !op || !r || r.state) return;
  const v = state.villages[r.village];
  const target = state.villages[op.target];
  const enemy = state.tribes?.[op.enemy];
  // the village changed hands, the war is over, or the target is ours already
  if (!v || v.owner !== r.member || !target || !enemy?.members.includes(target.owner) || t.relations[enemy.id] !== 'war') { r.state = 'failed'; return; }
  if (nextFloat(state.rng) < FORGET[tierOf(state.players[r.member])]) { r.state = 'forgot'; return; }
  let error: string | null;
  // the nobles only go when every army really left (a forgotten or missing army means a dead nobleman)
  // (an army still to leave later, from farther away or slower, is fine)
  if (r.kind === 'nobles' && op.roles.some((x) => x.kind === 'nuke' && x.launchAt <= state.time && x.state !== 'sent')) { r.state = 'failed'; return; }
  if (r.kind === 'nobles') {
    // the nukes cleared the troops, the wall may stand: each nobleman brings enough to beat it
    const pool: UnitCounts = {};
    // (if this village still sends its own army later, the escorts only take the few they need)
    for (const u of ['axe', 'light', 'marcher', 'heavy', 'spear', 'sword'] as const) if (v.units[u] > 0) pool[u] = v.units[u];
    const [e1 = {}, ...rest] = nobleEscorts(state, pool, target.buildings.wall, 4, moraleFor(state, v.owner, target.owner));
    error = sendNobleTrain(state, v.id, target.id, e1, rest, undefined, false, op.id);
  } else {
    // land exactly at landAt: never before (the armies arrive together), and if the army got
    // slower since the plan (new rams), the rams stay home rather than arrive after the nobles
    const army = armyOf(v);
    const left = op.landAt - state.time;
    if (travelTimeMs(state, army, distance(v, target)) > left) delete army.ram;
    if (travelTimeMs(state, army, distance(v, target)) > left + 5 * MINUTE) { r.state = 'failed'; return; }
    error = attackOf(state, army) >= MIN_NUKE / 2 ? sendAttack(state, v.id, target.id, army, undefined, undefined, Math.max(0, left), op.id) : 'te klein';
  }
  r.state = error ? 'failed' : 'sent';
}

/** After an operation: news when it took the village. */
function report(state: WorldState, t: Tribe, op: TribeOp): void {
  const target = state.villages[op.target];
  if (!target || !t.members.includes(target.owner)) return;
  const sent = op.roles.filter((r) => r.state === 'sent').length;
  addTribeNews(state, { time: state.time, text: `[${t.tag}] neemt ${target.name} (${target.x}|${target.y}) in met een gezamenlijke aanval van ${sent} legers.` });
}

/** For views and tests: what this tribe is doing now. */
export function activeOps(state: WorldState, t: Tribe): TribeOp[] {
  return (t.ops ?? []).filter((o) => state.time <= o.landAt + DAY);
}
