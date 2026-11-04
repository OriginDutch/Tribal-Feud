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
import { changeMood, moodAll } from './loyalty';
import type { UnitCounts } from '../shared/gameData';
import type { WarFrontView } from '../shared/protocol';
import { DAY, HOUR, MINUTE } from '../shared/time';
import { push } from './eventQueue';
import { attackOf, effectiveAttack, freshScout, freshSighting, nobleEscorts, scout as sendScouts, spiesNeeded } from './botStrategy';
import { villagesNear } from './bots';
import { distance, fieldsWithin, moraleFor, sendAttack, sendNobleTrain, travelBudget, travelTimeMs } from './movement';
import { nextFloat } from './rng';
import { HUMAN_ID, nextId, villagesOf, type Player, type WorldState } from './state';
import { type Tribe } from './tribes';
import { addNews } from './news';
import { MAX_SCOUT_ORDERS, giveOpOrder, giveScoutOrder, scoutOrders } from './tribeOrders';
import { NOBLE_LAG, chooseNobles, nobleCandidates, offerAppeal } from './nobleRole';
import { MERIT, addMerit } from './ranks';
import type { Village } from './village';
import { isOperational } from './village';
import { T, tr } from '../shared/i18n';

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
  /** There was an appeal about the nobles (one per attack). */
  appealed?: true;
}

/**
 * How far an army may march to take part: 12 hours on a normal world (~40 fields for axes),
 * shorter on a fast world like all travel. Tribes in TW fight across that kind of distance.
 */
const OP_HOURS = 12;
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

function armyOf(v: Pick<Village, 'units'>): UnitCounts {
  const a: UnitCounts = {};
  for (const u of OFF) if ((v.units[u] ?? 0) > 0) a[u] = v.units[u];
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

/** Enemies this tribe fights now: every tribe at war with it, or only the front you chose when you lead. */
function enemiesOf(state: WorldState, t: Tribe): Tribe[] {
  if (t.leader === HUMAN_ID && t.front && t.relations[t.front.enemy] === 'war') {
    const e = state.tribes?.[t.front.enemy];
    if (e) return [e];
  }
  return Object.entries(t.relations).filter(([, r]) => r === 'war').map(([id]) => state.tribes?.[Number(id)]).filter((x): x is Tribe => !!x);
}

/** Enemy villages along the front, nearest first, with the nearest of our villages. */
function front(state: WorldState, t: Tribe, enemy: Tribe, ours: Village[]): Village[] {
  const theirs = new Set(enemy.members);
  const seen = new Map<number, { v: Village; d: number }>();
  for (const o of ours) {
    for (const v of villagesNear(state, o, fieldsWithin(state, travelBudget(state, OP_HOURS)))) {
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
    if (launch(state, t, enemy, target, roles, def)) return;
  }
  // nothing known that we can break: scout the nearest unknown front village. After scouts died
  // there, only a group of more than double gets through: the tribe's scout goes (the member with
  // the most spies in reach); that can be you, then you get the order.
  const leader = state.players[t.leader];
  const budget = travelBudget(state, OP_HOURS);
  for (const v of candidates) {
    if (tribeIntel(state, t, v.id) !== undefined) continue;
    const need = Math.max(...t.members.map((m) => { const p = state.players[m]; return spiesNeeded(p?.bot ? freshScout(state, p, v.id) : undefined); }));
    const you = humanScoutFree(state, t, v);
    // a first look: the nearest bot with a few spies. After a failed one: the tribe's scout
    const first = need <= spiesNeeded(undefined);
    const scouts = ours
      .filter((o) => (state.players[o.owner]?.bot || (o.owner === HUMAN_ID && you && !first)) && o.units.spy >= need && travelTimeMs(state, { spy: 1 }, distance(o, v)) <= budget)
      .sort((a, b) => (first ? distance(a, v) - distance(b, v) : b.units.spy - a.units.spy || distance(a, v) - distance(b, v)));
    const best = scouts[0];
    if (!best) continue;
    const lost = first ? 0 : need / 2;
    if (best.owner === HUMAN_ID) { if (leader && giveScoutOrder(state, leader, v, lost)) return; continue; }
    if (sendScouts(state, best, v, need)) return;
  }
}

/** You can take a part: a bot leads, and no other order of yours is running or waiting. */
function humanFree(state: WorldState, t: Tribe): boolean {
  if (t.leader === HUMAN_ID || !t.members.includes(HUMAN_ID) || state.leaderOrder) return false;
  return !(state.inbox ?? []).some((m) => m.request?.type === 'order' && m.request.order !== 'scout' && m.status === 'open');
}
/** You can take a scout order for this village: beside your normal order, up to MAX_SCOUT_ORDERS. */
function humanScoutFree(state: WorldState, t: Tribe, v: Village): boolean {
  if (t.leader === HUMAN_ID || !t.members.includes(HUMAN_ID)) return false;
  return scoutOrders(state) < MAX_SCOUT_ORDERS && scoutOrders(state, v.id) === 0;
}

/**
 * Armies that together clearly break the target (morale and bad luck included): your bots', and
 * yours when a bot leads (you get the order with the landing time). Each must land within the
 * tribe's reach (OP_HOURS of marching).
 */
function nukes(state: WorldState, t: Tribe, target: Village, def: number, withoutYou = false): OpRole[] | null {
  const need = def * 1.3;
  const busy = new Set((t.ops ?? []).flatMap((o) => o.roles.map((r) => r.village)));
  const budget = travelBudget(state, OP_HOURS);
  const you = !withoutYou && humanFree(state, t);
  const options = t.members
    .filter((m) => state.players[m]?.bot || (m === HUMAN_ID && you))
    .flatMap((m) => villagesOf(state, m))
    .filter((v) => !busy.has(v.id) && isOperational(state.config, v, 'place') && attackOf(state, armyOf(v)) >= MIN_NUKE && travelTimeMs(state, armyOf(v), distance(v, target)) <= budget)
    .map((v) => ({ v, power: effectiveAttack(state, v.owner, target.owner, armyOf(v)) }))
    .sort((a, b) => b.power - a.power);
  const roles: OpRole[] = [];
  let sum = 0;
  for (const o of options) {
    if (sum >= need || roles.length >= MAX_NUKES) break;
    // you send one army, from your strongest village in reach
    if (o.v.owner === HUMAN_ID && roles.some((r) => r.member === HUMAN_ID)) continue;
    roles.push({ member: o.v.owner, village: o.v.id, kind: 'nuke', launchAt: 0 });
    sum += o.power;
  }
  return sum >= need ? roles : null;
}

/** Hands out the roles; false when it is no joint attack after all (or your order could not go out). */
function launch(state: WorldState, t: Tribe, enemy: Tribe, target: Village, roles: OpRole[], def: number): boolean {
  const travel = (r: OpRole) => {
    const v = state.villages[r.village]!;
    return travelTimeMs(state, r.kind === 'nobles' ? { snob: 1 } : armyOf(v), distance(v, target));
  };
  // the nobles: drawn among everyone with a train in reach, the closer the likelier (see nobleRole).
  // You bring either an army or the nobles; drawn for the nobles, your army is left out if the
  // others still break it without you, else you keep your army and the draw is among the bots.
  let cands = nobleCandidates(state, t, target, humanFree(state, t));
  const yourArmy = roles.some((r) => r.member === HUMAN_ID);
  const without = yourArmy && cands.some((c) => c.member === HUMAN_ID) ? nukes(state, t, target, def, true) : null;
  if (yourArmy && !without) cands = cands.filter((c) => c.member !== HUMAN_ID);
  const draw = cands.length ? chooseNobles(state, t, cands) : undefined;
  if (draw?.member === HUMAN_ID && without) roles = without;
  if (draw) roles.push({ member: draw.member, village: draw.village, kind: 'nobles', launchAt: 0 });
  // your army alone is no joint attack: that is what a plain order is for
  if (!roles.some((r) => r.member !== HUMAN_ID)) return false;
  const leader = state.players[t.leader];
  const yours = roles.find((r) => r.member === HUMAN_ID);
  // with you in it: an hour (game time) to read the order and send
  const landAt = state.time + Math.max(...roles.map(travel)) + (yours ? HOUR : 15 * MINUTE);
  for (const r of roles) r.launchAt = landAt + (r.kind === 'nobles' ? NOBLE_LAG : 0) - travel(r);
  const op: TribeOp = { id: nextId(state), enemy: enemy.id, target: target.id, landAt, roles };
  if (yours) {
    if (!leader || !giveOpOrder(state, leader, target, yours.kind === 'nobles' ? landAt + NOBLE_LAG : landAt, yours.kind === 'nobles' ? op.id : undefined)) return false;
    op.human = true;
  }
  // you were a candidate but someone else brings them: you may appeal
  const you = cands.find((c) => c.member === HUMAN_ID);
  if (you && draw && draw.member !== HUMAN_ID && !yours && leader?.bot) offerAppeal(state, t, op, draw, you);
  (t.ops ??= []).push(op);
  // your part is yours to send: no event for it (see humanOpSent)
  roles.forEach((r, i) => { if (r.member !== HUMAN_ID) push(state.queue, r.launchAt, { kind: 'opLaunch', tribe: t.id, op: op.id, role: i }); });
  // you: join with your own army if you have one that gets there in time
  const budget = travelBudget(state, OP_HOURS);
  if (!yours && leader && humanFree(state, t) && villagesOf(state, HUMAN_ID).some((v) => attackOf(state, armyOf(v)) >= MIN_NUKE && travelTimeMs(state, armyOf(v), distance(v, target)) <= Math.min(budget, landAt - state.time))) {
    if (giveOpOrder(state, leader, target, landAt)) op.human = true;
  }
  return true;
}

/**
 * You sent an attack: if it is your part in a joint attack (a real army that lands before the
 * nobles), your role counts as sent.
 */
export function humanOpSent(state: WorldState, targetId: number): void {
  const tid = state.players[HUMAN_ID]?.tribe;
  const t = tid !== undefined ? state.tribes?.[tid] : undefined;
  for (const op of t?.ops ?? []) {
    if (op.target !== targetId) continue;
    const r = op.roles.find((x) => x.member === HUMAN_ID && !x.state);
    if (!r) continue;
    const ok = r.kind === 'nobles'
      // your train: a nobleman that lands right behind the armies
      ? Object.values(state.movements).some((m) => m.owner === HUMAN_ID && m.kind === 'attack' && m.to === targetId && (m.units.snob ?? 0) > 0 && m.arrives >= op.landAt && m.arrives <= op.landAt + NOBLE_LAG + 10 * MINUTE)
      : Object.values(state.movements).some((m) => m.owner === HUMAN_ID && m.kind === 'attack' && m.to === targetId && m.arrives <= op.landAt + 20_000 && attackOf(state, armyOf({ units: m.units as Village['units'] })) >= MIN_NUKE);
    if (ok) { r.state = 'sent'; addMerit(state, HUMAN_ID, r.kind === 'nobles' ? MERIT.nobles : MERIT.nuke); }
  }
}

/** An opLaunch event: this member's part leaves now. */
export function onOpLaunch(state: WorldState, tribeId: number, opId: number, role: number): void {
  const t = state.tribes?.[tribeId];
  const op = t?.ops?.find((o) => o.id === opId);
  const r = op?.roles[role];
  if (!t || !op || !r || r.state || r.member === HUMAN_ID) return;
  const v = state.villages[r.village];
  const target = state.villages[op.target];
  const enemy = state.tribes?.[op.enemy];
  // the village changed hands, the war is over, or the target is ours already
  if (!v || v.owner !== r.member || !target || !enemy?.members.includes(target.owner) || t.relations[enemy.id] !== 'war') { r.state = 'failed'; return; }
  if (nextFloat(state.rng) < FORGET[tierOf(state.players[r.member])]) {
    r.state = 'forgot';
    // the tribe noticed: whoever leaves his mates alone in an attack hears about it
    if (r.member !== t.leader) changeMood(state, state.players[r.member], -3, T('aangesproken op een gemiste gezamenlijke aanval'));
    return;
  }
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
  if (!error) addMerit(state, r.member, r.kind === 'nobles' ? MERIT.nobles : MERIT.nuke);
}

/** After an operation: news when it took the village. */
function report(state: WorldState, t: Tribe, op: TribeOp): void {
  const target = state.villages[op.target];
  const took = !!target && t.members.includes(target.owner);
  // taking part counts: a win together lifts everyone who went, a failed attack costs them a little
  const went = new Set(op.roles.filter((r) => r.state === 'sent').map((r) => r.member));
  for (const m of went) {
    if (m === t.leader || m === HUMAN_ID) continue;
    changeMood(state, state.players[m], took ? 4 : -2, took ? T('we namen {village} samen in', { village: target!.name }) : T('de gezamenlijke aanval mislukte'));
  }
  if (took) moodAll(state, t, 1, T('de stam nam {village} in', { village: target!.name }), undefined);
  if (!took || !target) return;
  const sent = op.roles.filter((r) => r.state === 'sent').length;
  addNews(state, { kind: 'conquest', tribes: [t.id], x: target.x, y: target.y, dry: T('[{tag}] neemt {village} ({x}|{y}) in met een gezamenlijke aanval van {n} legers.', { tag: t.tag, village: target.name, x: String(target.x), y: String(target.y), n: sent }),
    head: [T('Gecoördineerde klap: [{tag}] neemt {x}|{y} met {n} legers tegelijk', { tag: t.tag, x: String(target.x), y: String(target.y), n: sent }), T('[{tag}] laat zien hoe samenwerken werkt: {x}|{y} gevallen', { tag: t.tag, x: String(target.x), y: String(target.y) })] });
}

/** For views and tests: what this tribe is doing now. */
export function activeOps(state: WorldState, t: Tribe): TribeOp[] {
  return (t.ops ?? []).filter((o) => state.time <= o.landAt + DAY);
}

/** Leader: choose the front (or null to let your bots pick it). */
export function setFront(state: WorldState, enemy: number | null, target?: number): string | null {
  const tid = state.players[HUMAN_ID]?.tribe;
  const t = tid !== undefined ? state.tribes?.[tid] : undefined;
  if (!t) return tr('Je zit niet in een stam.');
  if (t.leader !== HUMAN_ID) return tr('Alleen de leider kiest het front.');
  if (enemy === null) {
    delete t.front;
    return null;
  }
  const e = state.tribes?.[enemy];
  if (!e || t.relations[enemy] !== 'war') return tr('Jullie zijn niet in oorlog met die stam.');
  if (target !== undefined) {
    const v = state.villages[target];
    if (!v || !e.members.includes(v.owner)) return tr('Dat dorp is niet van [{tag}].', { tag: e.tag });
  }
  t.front = target !== undefined ? { enemy, target } : { enemy };
  // a new target: the plan for the old one stays, the next plan follows the new front
  return null;
}

export function warFrontView(state: WorldState): WarFrontView | null {
  const tid = state.players[HUMAN_ID]?.tribe;
  const t = tid !== undefined ? state.tribes?.[tid] : undefined;
  if (!t) return null;
  const enemies = Object.entries(t.relations)
    .filter(([, r]) => r === 'war')
    .map(([id]) => state.tribes?.[Number(id)])
    .filter((x): x is Tribe => !!x)
    .map((e) => ({ id: e.id, tag: e.tag, name: e.name }));
  const ops = activeOps(state, t).map((o) => {
    const v = state.villages[o.target];
    return {
      id: o.id,
      enemyTag: state.tribes?.[o.enemy]?.tag ?? '?',
      target: { id: o.target, name: v?.name ?? '?', x: v?.x ?? 0, y: v?.y ?? 0, owner: v?.owner ?? -1, ownerName: v ? (state.players[v.owner]?.name ?? tr('barbaren')) : '?' },
      landAt: o.landAt,
      armies: o.roles.filter((r) => r.kind === 'nuke').length,
      nobles: o.roles.some((r) => r.kind === 'nobles'),
      you: !!o.human,
      sent: o.roles.filter((r) => r.state === 'sent').length,
      failed: o.roles.filter((r) => r.state === 'failed' || r.state === 'forgot').length,
    };
  });
  if (!enemies.length && !ops.length) return null;
  const fv = t.leader === HUMAN_ID && t.front ? state.villages[t.front.target ?? -1] : undefined;
  return {
    enemies,
    front: t.leader === HUMAN_ID && t.front ? { enemy: t.front.enemy, ...(fv ? { target: { id: fv.id, name: fv.name, x: fv.x, y: fv.y } } : {}) } : null,
    ops,
  };
}
