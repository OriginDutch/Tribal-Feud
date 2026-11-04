/**
 * Phase 7c: working together in a tribe with you.
 *
 * - You ask your tribe for help against an attack; every mate decides on its own, when online.
 * - You give orders (as leader) or suggestions (as member): attack a village, leave a player alone,
 *   go after a player. Bots say yes, half or no.
 * - Mates ask you things: support, resources, permission to attack someone.
 * - Give and take: a bot remembers whether you helped it (favor). It helps you sooner when you do.
 *
 * Bots only act on all of this during their own (online) turn, with the same rules as always.
 */
import type { Archetype } from '../shared/botProfiles';
import type { LeaderOrderView } from '../shared/protocol';
import { UNIT_IDS, type Res, type UnitCounts, type UnitId } from '../shared/gameData';
import { DAY, HOUR, MINUTE, formatGameTime, gameTimeT } from '../shared/time';
import { T, tr, txt, type Txt } from '../shared/i18n';
import { villagesNear } from './bots';
import { addMessage, alertHuman, pauses } from './humanTribe';
import { distance, fieldsWithin, freeUnits, protectionBlocker, sendAttack, sendSupport, travelBudget, travelTimeMs } from './movement';
import { MERCHANT_CARRY, merchantsFree, sendResources } from './market';
import { nextFloat } from './rng';
import { BARBARIAN, HUMAN_ID, addLog, movementIndex, nextId, playSfx, villagesOf, type BotRequest, type BotState, type InboxMessage, type Player, type WorldState } from './state';
import { AGGRESSION, mayAttack, relationBetween, tribeOf } from './tribes';
import { changeStanding, mateEvent, moodAll } from './loyalty';
import { MERIT, addMerit } from './ranks';
import { NOBLE_LAG, NOBLE_MIN, answerAppeal, answerVerdict, giveOptions, passNobles } from './nobleRole';
import { storageCapacity } from './formulas';
import { currentResources, isOperational, type Village } from './village';

const DEFENSE: UnitId[] = ['spear', 'sword', 'archer', 'heavy'];
export const OFFENSE: UnitId[] = ['axe', 'light', 'marcher', 'ram', 'catapult'];
/** How far (fields) mates go to help, or to carry out an attack order. */
/**
 * How far mates go for each other, in marching time: 12 hours on a normal world (~32 fields for
 * swordsmen, ~40 for axes), shorter on a fast world like all travel. Help must also land in time.
 */
const REACH_HOURS = 12;
const reach = (state: WorldState) => travelBudget(state, REACH_HOURS);
/** Can defense from `from` reach `to` within the tribe's reach (swordsmen, the slowest defenders)? */
const helpReach = (state: WorldState, from: Village, to: Village) => travelTimeMs(state, { sword: 1 }, distance(from, to)) <= reach(state);
/** At war with the owner of this player's target: the tribe needs everyone now. */
const atWar = (state: WorldState, player: number, target: number) => target >= 0 && relationBetween(state, player, target) === 'war';
/** Orders and help asks run out after a fixed game day (your attention, not the world's tempo). */
const LIFETIME = DAY;

/** Keen to help others, per kind. */
const HELPFUL: Record<Archetype, number> = { supporter: 0.85, diplomat: 0.7, turtle: 0.55, farmer: 0.5, opportunist: 0.4, rusher: 0.35 };
/** Keen to follow orders, per kind. */
const OBEDIENT: Record<Archetype, number> = { diplomat: 0.85, supporter: 0.8, farmer: 0.65, turtle: 0.6, rusher: 0.55, opportunist: 0.4 };

const favorOf = (b: BotState) => b.favor ?? 0;
export function changeFavor(b: BotState, by: number): void {
  b.favor = Math.max(-2, Math.min(2, favorOf(b) + by));
}

/** Is this bot holding back from attacking that player (your order, or you said no)? */
export function spares(state: WorldState, b: BotState | undefined, player: number): boolean {
  const until = b?.spare?.[player];
  return until !== undefined && until > state.time;
}
/** Extra weight on a player you asked this bot to go after. */
export function focusWeight(state: WorldState, b: BotState | undefined, player: number): number {
  const until = b?.focus?.[player];
  return until !== undefined && until > state.time ? 3 : 1;
}

const sum = (u: UnitCounts) => UNIT_IDS.reduce((t, k) => t + (u[k] ?? 0), 0);
/** Kept text: a list of items ("a, b, c"). */
const listTxt = (items: Txt[]): Txt => items.slice(1).reduce<Txt>((a, b) => T('{a}, {b}', { a, b }), items[0] ?? '');
const unitText = (state: WorldState, u: UnitCounts): Txt =>
  listTxt(UNIT_IDS.filter((k) => (u[k] ?? 0) > 0).map((k) => T('{n} {unit}', { n: u[k]!, unit: state.config.units[k].name.toLowerCase() })));
const mates = (state: WorldState): Player[] => {
  const t = tribeOf(state, HUMAN_ID);
  return t ? t.members.map((m) => state.players[m]!).filter((p) => p?.bot) : [];
};

// --- your side ------------------------------------------------------------------------------

/** Ask your tribe for help against an attack on one of your villages. */
export function askTribeHelp(state: WorldState, movementId: number): string | null {
  if (!tribeOf(state, HUMAN_ID)) return tr('Je zit niet in een stam.');
  const m = state.movements[movementId];
  const v = m ? state.villages[m.to] : undefined;
  if (!m || m.kind !== 'attack' || !v || v.owner !== HUMAN_ID) return tr('Die aanval bestaat niet (meer).');
  if ((state.helpAsks ?? []).some((a) => a.movement === movementId)) return tr('Je hebt hier al om hulp gevraagd.');
  (state.helpAsks ??= []).push({ id: nextId(state), village: v.id, movement: m.id, arrives: m.arrives, at: state.time, answered: [] });
  addLog(state, { time: state.time, text: tr('Je vraagt je stam om hulp voor {village}.', { village: v.name }) });
  return null;
}

/** Ask your tribe for resources for one of your villages; mates send what they can spare. */
export function askTribeResources(state: WorldState, villageId: number, res: Res): string | null {
  if (!tribeOf(state, HUMAN_ID)) return tr('Je zit niet in een stam.');
  const v = state.villages[villageId];
  if (!v || v.owner !== HUMAN_ID) return tr('Dat is niet jouw dorp.');
  const want = res.map((n) => Math.max(0, Math.floor(n))) as Res;
  if (want[0] + want[1] + want[2] < MERCHANT_CARRY) return tr('Vraag minstens {n} grondstoffen.', { n: 1000 });
  if ((state.resourceAsks ?? []).some((a) => a.at > state.time - DAY)) return tr('Je hebt vandaag al om grondstoffen gevraagd. Morgen weer.');
  (state.resourceAsks ??= []).push({ id: nextId(state), village: v.id, res: want, sent: [0, 0, 0], at: state.time, answered: [] });
  addLog(state, { time: state.time, text: tr('Je vraagt je stam om grondstoffen voor {village}.', { village: v.name }) });
  return null;
}

/** As a member of a bot tribe: ask your leader whether you may attack a player. */
export function askPermission(state: WorldState, target: number): string | null {
  const t = tribeOf(state, HUMAN_ID);
  if (!t) return tr('Je zit niet in een stam.');
  if (t.leader === HUMAN_ID) return tr('Jij bent de leider: je hoeft het niemand te vragen.');
  const p = state.players[target];
  if (!p || target === HUMAN_ID || p.tribe === t.id) return tr('Die speler kun je niet aanvallen.');
  const asked = state.permissions?.[target];
  if (asked && !asked.answer) return tr('Je hebt het al gevraagd; de leider antwoordt als hij online is.');
  (state.permissions ??= {})[target] = { at: state.time };
  return null;
}

/** You attack a player: if your leader said no, that costs standing (once per answer). */
export function attackedWithoutPermission(state: WorldState, target: number): void {
  const p = state.permissions?.[target];
  if (!p || p.answer !== 'no' || (p.until ?? 0) <= state.time || p.broken) return;
  p.broken = true;
  changeStanding(state, -15, T('je viel {name} aan terwijl ik nee zei', { name: state.players[target]?.name ?? '?' }));
}

/** Give an order (leader) or a suggestion (member). */
export function giveOrder(state: WorldState, kind: 'attack' | 'spare' | 'focus', target: number): string | null {
  const t = tribeOf(state, HUMAN_ID);
  if (!t) return tr('Je zit niet in een stam.');
  if (kind === 'attack') {
    const v = state.villages[target];
    if (!v) return tr('Dat dorp bestaat niet.');
    if (v.owner === HUMAN_ID || (v.owner >= 0 && state.players[v.owner]?.tribe === t.id)) return tr('Dat is een dorp van je eigen stam.');
  } else {
    const p = state.players[target];
    if (!p || target === HUMAN_ID) return tr('Die speler bestaat niet.');
    if (p.tribe === t.id) return tr('Die speler zit in je stam.');
  }
  if ((state.tribeOrders ?? []).some((o) => o.kind === kind && o.target === target && o.expires > state.time)) return tr('Die order loopt al.');
  (state.tribeOrders ??= []).push({ id: nextId(state), kind, target, binding: t.leader === HUMAN_ID, at: state.time, expires: state.time + LIFETIME, answers: {} });
  // too many orders at once wear people out
  if (t.leader === HUMAN_ID && (state.tribeOrders ?? []).filter((o) => o.expires > state.time).length > 3) moodAll(state, t, -3, T('te veel orders tegelijk'));
  return null;
}

export function cancelOrder(state: WorldState, id: number): string | null {
  const o = state.tribeOrders?.find((x) => x.id === id);
  if (!o) return tr('Die order bestaat niet.');
  o.expires = state.time;
  for (const p of mates(state)) {
    // a spare or focus order you take back ends for everyone
    if (o.kind === 'spare' && p.bot?.spare?.[o.target]) delete p.bot.spare[o.target];
    if (o.kind === 'focus' && p.bot?.focus?.[o.target]) delete p.bot.focus[o.target];
  }
  return null;
}

/** Your answer to a mate's request. Returns an error, or null. */
export function answerRequest(state: WorldState, m: InboxMessage, accept: boolean): string | null {
  const r = m.request;
  const p = state.players[m.from];
  if (!r || !p?.bot) return tr('Dit verzoek bestaat niet meer.');
  if (r.type === 'order') return answerLeaderOrder(state, m, r, p, accept);
  if (r.type === 'appeal') {
    const error = answerAppeal(state, r.op, r.village, accept);
    if (error) { m.status = 'expired'; return error; }
    m.status = accept ? 'accepted' : 'declined';
    return null;
  }
  if (r.type === 'verdict') {
    const error = answerVerdict(state, accept);
    m.status = accept ? 'accepted' : 'declined';
    return error;
  }
  if (!accept) {
    m.status = 'declined';
    mateEvent(state, p, r.type === 'support' ? -10 : -6, -3, r.type === 'support' ? T('je stuurde geen support') : r.type === 'resources' ? T('je hield je grondstoffen voor jezelf') : T('je gaf geen toestemming'));
    changeFavor(p.bot, r.type === 'permission' ? -0.1 : -0.3);
    if (r.type === 'permission') (p.bot.spare ??= {})[r.target] = state.time + 3 * DAY;
    // some take it badly
    if (r.type !== 'permission' && nextFloat(state.rng) < 0.4) {
      addMessage(state, { kind: 'info', from: p.id, title: T('{name} is teleurgesteld', { name: p.name }), text: r.type === 'support' ? T('{name}: ik had op je gerekend.', { name: p.name }) : T('{name}: dan red ik het wel alleen.', { name: p.name }) });
    }
    return null;
  }
  if (r.type === 'support') {
    // the support itself you send with the planner; agreeing already counts
    m.status = 'accepted';
    changeFavor(p.bot, 0.3);
    mateEvent(state, p, 4, 2, T('je beloofde support'));
    return null;
  }
  if (r.type === 'resources') {
    const to = state.villages[r.village];
    if (!to || to.owner !== p.id) { m.status = 'expired'; return tr('Dat dorp is niet meer van hem.'); }
    const need = r.res.reduce((a, b) => a + b, 0);
    const from = villagesOf(state, HUMAN_ID)
      .filter((v) => isOperational(state.config, v, 'market'))
      .filter((v) => { const have = currentResources(state.config, v, state.time); return r.res.every((n, i) => have[i]! >= n) && merchantsFree(state, v) * MERCHANT_CARRY >= need; })
      .sort((a, b) => distance(a, to) - distance(b, to))[0];
    if (!from) return tr('Geen dorp met een markt, genoeg grondstoffen en vrije handelaren.');
    const error = sendResources(state, from.id, to.id, r.res);
    if (error) return error;
    m.status = 'accepted';
    changeFavor(p.bot, 0.4);
    mateEvent(state, p, 8, 3, T('je stuurde grondstoffen'));
    return null;
  }
  // permission to attack
  m.status = 'accepted';
  if (p.bot.spare) delete p.bot.spare[r.target];
  changeFavor(p.bot, 0.1);
  mateEvent(state, p, 4, 1, T('je gaf toestemming'));
  return null;
}

// --- the bots' side, during their own online turn -----------------------------------------------

// --- your bot leader gives you orders ------------------------------------------------------------

/** Scout orders run beside one normal order, at most this many at a time (open or said yes to). */
export const MAX_SCOUT_ORDERS = 3;
const isOrder = (m: InboxMessage) => m.request?.type === 'order' && m.status === 'open';
const isScout = (m: InboxMessage) => m.request?.type === 'order' && m.request.order === 'scout';
/** The normal order (attack or support) waiting in your inbox, if any. */
function openOrder(state: WorldState): InboxMessage | undefined {
  return (state.inbox ?? []).find((m) => isOrder(m) && !isScout(m));
}
/** Scout orders open or said yes to; with `village`: only for that village. */
export function scoutOrders(state: WorldState, village?: number): number {
  const open = (state.inbox ?? []).filter((m) => isOrder(m) && isScout(m) && (village === undefined || (m.request as { village: number }).village === village)).length;
  return open + (state.scoutOrders ?? []).filter((o) => village === undefined || o.village === village).length;
}

/** One order for the screens, accepted or still open in your inbox. */
function orderView(
  state: WorldState,
  o: { order: 'attack' | 'support' | 'scout'; village: number; until: number; from: number; landAt?: number; spies?: number; nobles?: true; op?: number } | undefined,
  open: InboxMessage | undefined,
): LeaderOrderView | null {
  const r = open?.request?.type === 'order' ? open.request : undefined;
  const village = o?.village ?? r?.village;
  const order = o?.order ?? r?.order;
  if (village === undefined || !order) return null;
  const v = state.villages[village];
  if (!v) return null;
  const from = state.players[o?.from ?? open?.from ?? -1]?.name ?? '?';
  const landAt = o ? o.landAt : r?.arrives;
  const until = o?.until ?? r?.arrives ?? open?.expires ?? state.time + DAY / 2;
  const nobles = !!(o?.nobles ?? r?.nobles);
  const opId = o?.op ?? r?.op;
  // attacks: from the movement index (no scan over every movement); supports are rare, a scan is fine
  const ids = order !== 'support' ? [...(movementIndex(state).incoming.get(v.id) ?? [])].map((id) => state.movements[id]) : Object.values(state.movements);
  const underway = ids
    .filter((m) => m !== undefined && m.owner === HUMAN_ID && m.kind === (order === 'support' ? 'support' : 'attack') && m.to === v.id && (order !== 'scout' || (m.units.spy ?? 0) > 0))
    .map((m) => m!)
    .map((m) => ({ attack: Math.round(orderAttack(state, m.units)), arrives: m.arrives, nobles: m.units.snob ?? 0 }));
  let best: LeaderOrderView['best'];
  if (order === 'attack' && nobles) {
    // the village with the most free nobles in noble range
    for (const h of villagesOf(state, HUMAN_ID)) {
      const snob = freeUnits(state, h).snob;
      if (snob <= 0 || distance(h, v) > state.config.conquest.maxDistance || (best && snob <= (best.nobles ?? 0))) continue;
      best = { id: h.id, name: h.name, attack: 0, nobles: snob, arrives: state.time + travelTimeMs(state, { snob: 1 }, distance(h, v)) };
    }
  }
  if (order === 'attack' && !nobles) {
    for (const h of villagesOf(state, HUMAN_ID)) {
      // what is free: troops held for a planned attack are spoken for
      const free = freeUnits(state, h);
      const army: UnitCounts = {};
      for (const u of OFFENSE) if (free[u] > 0) army[u] = free[u];
      const attack = orderAttack(state, army);
      if (attack <= 0 || (best && attack <= best.attack)) continue;
      best = { id: h.id, name: h.name, attack: Math.round(attack), arrives: state.time + travelTimeMs(state, army, distance(h, v)) };
    }
  }
  if (order === 'scout') {
    // the village with the most spies: a scout is all or nothing
    for (const h of villagesOf(state, HUMAN_ID)) {
      const spies = freeUnits(state, h).spy;
      if (spies <= 0 || (best && spies <= (best.spies ?? 0))) continue;
      best = { id: h.id, name: h.name, attack: 0, spies, arrives: state.time + travelTimeMs(state, { spy: 1 }, distance(h, v)) };
    }
  }
  return {
    order, status: o ? 'accepted' : 'open', ...(open && !o ? { message: open.id } : {}),
    target: { id: v.id, name: v.name, x: v.x, y: v.y, owner: v.owner, ownerName: state.players[v.owner]?.name ?? tr('barbaren') },
    until, ...(landAt !== undefined ? { landAt } : {}), from,
    ...(order === 'attack' && !nobles ? { minAttack: ORDER_MIN_ATTACK } : {}),
    ...(nobles ? { nobles: { min: NOBLE_MIN, op: opId ?? -1, giveTo: opId !== undefined ? giveOptions(state, opId).map((c) => ({ id: c.member, name: state.players[c.member]?.name ?? '?', d: Math.round(c.d * 10) / 10 })) : [] } } : {}),
    ...(order === 'scout' ? { minSpies: o?.spies ?? (r?.spies ?? 0) } : {}),
    underway, ...(best ? { best } : {}),
    planned: (state.planned ?? []).filter((p) => p.to === v.id).map((p) => ({ id: p.id, attack: Math.round(p.waves.reduce((a, w) => a + orderAttack(state, w), 0)), landAt: p.landAt, spies: p.waves.reduce((a, w) => a + (w.spy ?? 0), 0) })),
  };
}

/** Your normal order (accepted or open) for the screens. */
export function leaderOrderView(state: WorldState): LeaderOrderView | null {
  return orderView(state, state.leaderOrder, state.leaderOrder ? undefined : openOrder(state));
}
/** Your scout orders (accepted and open) for the screens. */
export function scoutOrderViews(state: WorldState): LeaderOrderView[] {
  const accepted = (state.scoutOrders ?? []).map((o) => orderView(state, { order: 'scout', ...o }, undefined));
  const open = (state.inbox ?? []).filter((m) => isOrder(m) && isScout(m)).map((m) => orderView(state, undefined, m));
  return [...open, ...accepted].filter((x): x is LeaderOrderView => !!x);
}

/** You answer your leader's order: yes means you have until the deadline to do it. */
function answerLeaderOrder(state: WorldState, m: InboxMessage, r: Extract<BotRequest, { type: 'order' }>, leader: Player, accept: boolean): string | null {
  if (!accept) {
    m.status = 'declined';
    changeStanding(state, -4, r.nobles ? T('je wilde de edels niet brengen') : r.order === 'attack' ? T('je weigerde mijn aanvalsorder') : r.order === 'scout' ? T('je weigerde te verkennen') : T('je weigerde support te sturen'));
    // the next candidate brings the nobles instead
    if (r.nobles && r.op !== undefined) passNobles(state, r.op);
    return null;
  }
  m.status = 'accepted';
  if (r.order === 'scout') {
    (state.scoutOrders ??= []).push({ village: r.village, until: state.time + DAY / 2, from: leader.id, ...(r.spies ? { spies: r.spies } : {}) });
    return null;
  }
  // a joint attack: landing a little after the others still counts
  state.leaderOrder = { order: r.order, village: r.village, until: r.arrives !== undefined ? r.arrives + 10 * MINUTE : state.time + DAY / 2, from: leader.id, ...(r.arrives !== undefined ? { landAt: r.arrives } : {}), ...(r.spies ? { spies: r.spies } : {}), ...(r.nobles ? { nobles: true as const } : {}), ...(r.op !== undefined ? { op: r.op } : {}), ...(r.asked ? { asked: true as const } : {}) };
  return null;
}

/** An attack order counts for a real attack: this much attack strength (scouts don't count), and it has to land. */
export const ORDER_MIN_ATTACK = 3000;
/** Attack strength of an army without its scouts. */
export function orderAttack(state: WorldState, units: UnitCounts): number {
  let a = 0;
  for (const u of UNIT_IDS) if (u !== 'spy') a += (units[u] ?? 0) * state.config.units[u].attack;
  return a;
}

/** Your attack landed: was it the one your leader ordered, and big enough? */
export function leaderOrderLanded(state: WorldState, villageId: number, units: UnitCounts): void {
  const o = state.leaderOrder;
  if (!o || o.order !== 'attack' || o.village !== villageId) return;
  const v = state.villages[villageId];
  if (o.nobles) {
    // the nobles: it counts once a nobleman lands (taking the village is up to loyalty)
    if (!(units.snob ?? 0)) return;
    delete state.leaderOrder;
    changeStanding(state, 6, T('je bracht de edels'));
    playSfx(state, 'mission-complete');
    addMerit(state, HUMAN_ID, MERIT.order);
    addLog(state, { time: state.time, text: tr('Order uitgevoerd: je edels zijn geland bij {village}.', { village: v?.name ?? '?' }) });
    return;
  }
  const a = orderAttack(state, units);
  if (a < ORDER_MIN_ATTACK) {
    addLog(state, { time: state.time, text: tr('Je aanval op {village} telt niet voor de order: {attack} aanvalskracht, de leider wil er minstens {min}.', { village: v?.name ?? '?', attack: Math.round(a), min: ORDER_MIN_ATTACK }) });
    return;
  }
  delete state.leaderOrder;
  changeStanding(state, 6, T('je voerde mijn order uit'));
  playSfx(state, 'mission-complete');
  addMerit(state, HUMAN_ID, MERIT.order);
  addLog(state, { time: state.time, text: tr('Order uitgevoerd: je aanval op {village} is geland.', { village: v?.name ?? '?' }) });
}
/** Your scouts got through: was it the village your leader wanted scouted? (Also counted: your attack that saw it.) */
export function leaderOrderScouted(state: WorldState, villageId: number): void {
  const i = (state.scoutOrders ?? []).findIndex((o) => o.village === villageId);
  const o = state.leaderOrder;
  if (i >= 0) state.scoutOrders!.splice(i, 1);
  else if (o && o.order === 'scout' && o.village === villageId) delete state.leaderOrder; // saves from before scout orders ran apart
  else return;
  changeStanding(state, 6, T('je verkende wat ik vroeg'));
  playSfx(state, 'mission-complete');
  addMerit(state, HUMAN_ID, MERIT.scoutOrder);
  addLog(state, { time: state.time, text: tr('Order uitgevoerd: je verkenners kwamen door bij {village}.', { village: state.villages[villageId]?.name ?? '?' }) });
}

/**
 * You are the tribe's scout (the most spies in reach): your bot leader asks you to scout a front
 * village his own scouts don't get into. `spies`: how many died there last (send more).
 */
export function giveScoutOrder(state: WorldState, leader: Player, target: Village, spies: number): boolean {
  if (scoutOrders(state) >= MAX_SCOUT_ORDERS || scoutOrders(state, target.id) > 0) return false;
  const request: Extract<BotRequest, { type: 'order' }> = { type: 'order', order: 'scout', village: target.id, x: target.x, y: target.y, ...(spies ? { spies } : {}) };
  const title = T('{leader}: verken {village}', { leader: leader.name, village: target.name });
  const q = { leader: leader.name, village: target.name, x: String(target.x), y: String(target.y), owner: state.players[target.owner]?.name ?? '?', spies };
  addMessage(state, {
    kind: 'request', from: leader.id, title, request, status: 'open', expires: state.time + DAY / 2,
    text: spies
      ? T('{leader}: we moeten weten wat er in {village} ({x}|{y}) van {owner} staat. Onze verkenners kwamen er niet door ({spies} gesneuveld): stuur er meer. Dan plannen we de aanval.', q)
      : T('{leader}: we moeten weten wat er in {village} ({x}|{y}) van {owner} staat. Jij hebt de meeste verkenners. Dan plannen we de aanval.', q),
  });
  if (pauses(state, 'requests')) alertHuman(state, txt(title));
  return true;
}

/** Your support arrived: was it where your leader wanted it? */
export function leaderOrderSupport(state: WorldState, villageId: number): void {
  const o = state.leaderOrder;
  if (!o || o.order !== 'support' || o.village !== villageId) return;
  delete state.leaderOrder;
  changeStanding(state, 6, T('je stuurde de support die ik vroeg'));
  playSfx(state, 'mission-complete');
  addMerit(state, HUMAN_ID, MERIT.order);
}
/** A yes that was never done costs more than a no. */
export function checkLeaderOrder(state: WorldState): void {
  // scout orders: a smaller job, a smaller penalty
  const late = (state.scoutOrders ?? []).filter((o) => o.until <= state.time);
  if (late.length) {
    state.scoutOrders = state.scoutOrders!.filter((o) => o.until > state.time);
    changeStanding(state, -4 * late.length, T('je zou verkennen maar deed het niet'));
    playSfx(state, 'mission-failed');
    addMerit(state, HUMAN_ID, MERIT.scoutFailed * late.length);
  }
  const o = state.leaderOrder;
  if (!o || o.until > state.time) return;
  delete state.leaderOrder;
  // an order you asked for yourself and then let lapse costs more
  playSfx(state, 'mission-failed');
  changeStanding(state, o.asked ? -12 : -8, o.asked ? T('je vroeg zelf om een opdracht en deed hem niet') : T('je zei ja maar deed het niet'));
  addMerit(state, HUMAN_ID, MERIT.orderFailed);
}

/** Between two asks for an order (game time). */
export const ORDER_ASK_COOLDOWN = DAY / 2;

/** You ask your bot leader for an order: he gives one if he has something, else says so. */
export function askForOrder(state: WorldState): string | null {
  const t = tribeOf(state, HUMAN_ID);
  if (!t) return tr('Je zit niet in een stam.');
  const leader = state.players[t.leader];
  if (!leader?.bot) return tr('Jij bent de leider.');
  if (openOrder(state) || state.leaderOrder) return tr('Je hebt al een opdracht.');
  if (state.orderAskAt !== undefined && state.time - state.orderAskAt < ORDER_ASK_COOLDOWN) return tr('Je vroeg net al. Opnieuw vragen kan vanaf {time}.', { time: formatGameTime(state.orderAskAt + ORDER_ASK_COOLDOWN) });
  state.orderAskAt = state.time;
  if (leaderOrders(state, leader, true)) return null;
  addMessage(state, { kind: 'info', from: leader.id, tribe: t.id, title: T('{name}: nu niks', { name: leader.name }), text: T('{name}: ik heb nu niks voor je. Geen stamgenoot die wordt aangevallen binnen jouw bereik, en geen vijandelijk dorp om op af te gaan.', { name: leader.name }) });
  return null;
}

/**
 * A joint operation of your bot tribe includes you: attack `target`, landing at `landAt`.
 * Only when no order of yours is open. Returns whether the order went out.
 */
export function giveOpOrder(state: WorldState, leader: Player, target: Village, landAt: number, noblesOp?: number): boolean {
  const open = !!openOrder(state);
  if (open || state.leaderOrder) return false;
  const nobles = noblesOp !== undefined;
  const request: Extract<BotRequest, { type: 'order' }> = { type: 'order', order: 'attack', village: target.id, x: target.x, y: target.y, arrives: landAt, ...(nobles ? { nobles: true as const, op: noblesOp } : {}) };
  const title = nobles ? T('{leader}: jij brengt de edels naar {village}', { leader: leader.name, village: target.name }) : T('{leader}: gezamenlijke aanval op {village}', { leader: leader.name, village: target.name });
  state.leaderOrderAt = state.time;
  const q = { leader: leader.name, village: target.name, x: String(target.x), y: String(target.y), owner: state.players[target.owner]?.name ?? '?', armies: gameTimeT(landAt - NOBLE_LAG), land: gameTimeT(landAt), min: NOBLE_MIN };
  addMessage(state, {
    kind: 'request', from: leader.id, title, request, status: 'open', expires: landAt,
    text: nobles
      ? T('{leader}: we vallen {village} ({x}|{y}) van {owner} samen aan, en jij bent getrokken voor de edels. De legers landen om {armies}; laat je edeltrein (minstens {min} edels) landen om {land}. Niet jouw ding? Geef de edels aan een ander of zeg nee, dan gaan ze naar de volgende.', q)
      : T('{leader}: we vallen {village} ({x}|{y}) van {owner} samen aan. De legers landen om {land}. Stuur je leger zodat het rond die tijd aankomt; de edels komen er direct achteraan.', q),
  });
  if (pauses(state, 'requests')) alertHuman(state, txt(title));
  return true;
}

/** A bot leader of your tribe gives you an order now and then: support a mate, or attack an enemy. */
function leaderOrders(state: WorldState, leader: Player, asked = false): boolean {
  const open = !!openOrder(state);
  if (open || state.leaderOrder) return false;
  if (!asked && ((state.leaderOrderAt !== undefined && state.time - state.leaderOrderAt < 12 * HOUR) || nextFloat(state.rng) > 0.05)) return false;
  const t = tribeOf(state, HUMAN_ID);
  const mine = villagesOf(state, HUMAN_ID);
  if (!t || !mine.length) return false;
  const give = (request: Extract<BotRequest, { type: 'order' }>, title: Txt, text: Txt) => {
    if (asked) request.asked = true;
    state.leaderOrderAt = state.time;
    addMessage(state, { kind: 'request', from: leader.id, title, text, request, status: 'open', expires: request.arrives ?? state.time + DAY / 2 });
    if (pauses(state, 'requests')) alertHuman(state, txt(title));
  };
  // 1. support: a mate's village under attack that you can reach in time
  const ix = movementIndex(state);
  for (const id of t.members) {
    if (id === HUMAN_ID) continue;
    for (const v of villagesOf(state, id)) {
      const hits = [...(ix.attacks.get(v.id)?.values() ?? [])].filter((a) => a > state.time + 15 * MINUTE);
      if (!hits.length || !mine.some((o) => helpReach(state, o, v))) continue;
      const arrives = Math.min(...hits);
      give({ type: 'order', order: 'support', village: v.id, x: v.x, y: v.y, arrives }, T('{leader}: support naar {village}', { leader: leader.name, village: v.name }), T('{leader}: {village} ({x}|{y}) van {owner} wordt aangevallen. Stuur verdediging, het moet er zijn voor {min} min.', { leader: leader.name, village: v.name, x: String(v.x), y: String(v.y), owner: state.players[id]?.name ?? '?', min: Math.max(1, Math.round((arrives - state.time) / MINUTE)) }));
      return true;
    }
  }
  // 2. attack: the nearest village of a tribe we are at war with
  const enemies = new Set(Object.entries(t.relations).filter(([, r]) => r === 'war').flatMap(([tid]) => state.tribes?.[Number(tid)]?.members ?? []));
  if (!enemies.size) return false;
  let best: Village | null = null, bestD = Infinity;
  for (const o of mine) {
    for (const v of villagesNear(state, o, fieldsWithin(state, reach(state)))) {
      if (!enemies.has(v.owner)) continue;
      const d = distance(o, v);
      if (d < bestD) { bestD = d; best = v; }
    }
  }
  if (!best) return false;
  give({ type: 'order', order: 'attack', village: best.id, x: best.x, y: best.y }, T('{leader}: val {village} aan', { leader: leader.name, village: best.name }), T('{leader}: we zijn in oorlog met {owner}. Val {village} ({x}|{y}) aan, liefst binnen een halve speldag.', { leader: leader.name, owner: state.players[best.owner]?.name ?? '?', village: best.name, x: String(best.x), y: String(best.y) }));
  return true;
}

/** What a bot that shares a tribe with you does for (and asks of) you this turn. */
export function tribeDuties(state: WorldState, player: Player): void {
  const bot = player.bot;
  const t = tribeOf(state, HUMAN_ID);
  if (!bot || !t || player.tribe !== t.id) return;
  answerHelpAsks(state, player);
  answerResourceAsks(state, player);
  if (t.leader === player.id) { answerPermissions(state, player); leaderOrders(state, player); }
  answerOrders(state, player);
  askHuman(state, player);
}

function answerHelpAsks(state: WorldState, player: Player): void {
  const bot = player.bot!;
  for (const ask of state.helpAsks ?? []) {
    if (ask.arrives <= state.time || ask.answered.includes(player.id)) continue;
    ask.answered.push(player.id);
    const target = state.villages[ask.village];
    if (!target) continue;
    const reply = (title: Txt, text: Txt) => addMessage(state, { kind: 'answer', from: player.id, title, text });
    const me = { name: player.name };
    // under fire itself? then it keeps its troops
    const ix = movementIndex(state);
    const busy = villagesOf(state, player.id).some((v) => [...(ix.attacks.get(v.id)?.values() ?? [])].some((a) => a > state.time));
    if (busy) { reply(T('{name} kan niet helpen', me), T('{name}: ik zit zelf onder vuur.', me)); continue; }
    // in a war against the attacker the tribe stands together: much keener to help
    const attacker = state.movements[ask.movement]?.owner ?? -1;
    const chance = HELPFUL[bot.archetype] + favorOf(bot) * 0.15 + (atWar(state, player.id, attacker) ? 0.3 : 0);
    if (nextFloat(state.rng) >= chance) { reply(T('{name} helpt niet', me), T('{name}: deze keer niet, sorry.', me)); continue; }
    const share = 0.25 + HELPFUL[bot.archetype] * 0.35 + Math.max(0, favorOf(bot)) * 0.05;
    let sent: UnitCounts | null = null, margin = 0, late = false, empty = true;
    for (const v of villagesOf(state, player.id).sort((a, b) => distance(a, target) - distance(b, target))) {
      if (!helpReach(state, v, target) || !isOperational(state.config, v, 'place')) continue;
      const units: UnitCounts = {};
      for (const u of DEFENSE) { const n = Math.floor(v.units[u] * share); if (n > 0) units[u] = n; }
      if (sum(units) < 20) continue;
      empty = false;
      const arrive = state.time + travelTimeMs(state, units, distance(v, target));
      if (arrive > ask.arrives) { late = true; continue; }
      if (sendSupport(state, v.id, target.id, units) === null) { sent = units; margin = ask.arrives - arrive; break; }
    }
    if (sent) {
      reply(T('{name} stuurt hulp', me), T('{name} stuurt {units} naar {village}; komt {min} min voor de inslag aan.', { name: player.name, units: unitText(state, sent), village: target.name, min: Math.max(1, Math.round(margin / MINUTE)) }));
    } else {
      reply(T('{name} kan niet helpen', me), late ? T('{name}: ik kom niet op tijd.', me) : empty ? T('{name}: ik heb geen verdediging over (of zit te ver weg).', me) : T('{name}: het lukt niet.', me));
    }
  }
  // forget asks whose attack has landed
  state.helpAsks = (state.helpAsks ?? []).filter((a) => a.arrives > state.time - HOUR);
}

function answerResourceAsks(state: WorldState, player: Player): void {
  const bot = player.bot!;
  for (const ask of state.resourceAsks ?? []) {
    if (ask.answered.includes(player.id) || ask.at < state.time - DAY) continue;
    ask.answered.push(player.id);
    const to = state.villages[ask.village];
    const left = ask.res.map((n, i) => Math.max(0, n - ask.sent[i]!)) as Res;
    if (!to || to.owner !== HUMAN_ID || left[0] + left[1] + left[2] < MERCHANT_CARRY) continue;
    const reply = (title: Txt, text: Txt) => addMessage(state, { kind: 'answer', from: player.id, title, text });
    const me = { name: player.name };
    if (nextFloat(state.rng) >= HELPFUL[bot.archetype] + favorOf(bot) * 0.15) { reply(T('{name} stuurt niets', me), T('{name}: ik heb het zelf nodig, sorry.', me)); continue; }
    let gave: Res | null = null;
    for (const v of villagesOf(state, player.id).sort((a, b) => distance(a, to) - distance(b, to))) {
      if (!isOperational(state.config, v, 'market')) continue;
      const have = currentResources(state.config, v, state.time);
      const floor = storageCapacity(v.buildings.storage) * 0.4;
      const res = left.map((n, i) => Math.min(n, Math.max(0, Math.floor(have[i]! - floor)))) as Res;
      let total = res[0] + res[1] + res[2];
      const max = merchantsFree(state, v) * MERCHANT_CARRY;
      if (total > max) { const f = max / total; for (const i of [0, 1, 2] as const) res[i] = Math.floor(res[i] * f); total = res[0] + res[1] + res[2]; }
      if (total < MERCHANT_CARRY) continue;
      if (sendResources(state, v.id, to.id, res) === null) { gave = res; break; }
    }
    if (!gave) { reply(T('{name} kan niets missen', me), T('{name}: ik heb niets over (of geen vrije handelaren).', me)); continue; }
    for (const i of [0, 1, 2] as const) ask.sent[i] += gave[i];
    changeFavor(bot, -0.1);
    reply(T('{name} stuurt grondstoffen', me), T('{name} stuurt {wood} / {clay} / {iron} (hout / leem / ijzer) naar {village}.', { name: player.name, wood: gave[0], clay: gave[1], iron: gave[2], village: to.name }));
  }
  state.resourceAsks = (state.resourceAsks ?? []).filter((a) => a.at > state.time - DAY);
}

/** Your leader answers whether you may attack a player. */
function answerPermissions(state: WorldState, leader: Player): void {
  const bot = leader.bot!;
  for (const [id, ask] of Object.entries(state.permissions ?? {})) {
    const target = Number(id);
    if (ask.answer) { if ((ask.until ?? 0) < state.time) delete state.permissions![target]; continue; }
    const name = state.players[target]?.name ?? '?';
    const allowed = mayAttack(state, leader.id, target) && !spares(state, bot, target);
    const chance = 0.35 + AGGRESSION[bot.archetype] * 0.5 + ((state.standing ?? 60) - 60) / 100;
    const yes = allowed && nextFloat(state.rng) < chance;
    ask.answer = yes ? 'yes' : 'no';
    ask.until = state.time + 3 * DAY;
    changeStanding(state, 1, T('je vroeg eerst toestemming'));
    addMessage(state, {
      kind: 'answer', from: leader.id,
      title: yes ? T('{leader}: ga je gang', { leader: leader.name }) : T('{leader}: liever niet', { leader: leader.name }),
      text: yes
        ? T('{leader}: {name} aanvallen? Ga je gang.', { leader: leader.name, name })
        : allowed
          ? T('{leader}: laat {name} met rust. Doe je het toch, dan onthoud ik dat.', { leader: leader.name, name })
          : T('{leader}: laat {name} met rust, we hebben een verdrag. Doe je het toch, dan onthoud ik dat.', { leader: leader.name, name }),
    });
  }
}

function answerOrders(state: WorldState, player: Player): void {
  const bot = player.bot!;
  for (const o of state.tribeOrders ?? []) {
    if (o.expires <= state.time || o.answers[player.id]) continue;
    const reply = (answer: 'yes' | 'half' | 'no', text: Txt) => {
      o.answers[player.id] = answer;
      const me = { name: player.name };
      addMessage(state, { kind: 'answer', from: player.id, title: answer === 'yes' ? T('{name}: akkoord', me) : answer === 'half' ? T('{name}: deels', me) : T('{name}: nee', me), text: T('{name}: {text}', { name: player.name, text }) });
    };
    // in a war, an attack or focus on the enemy is what the tribe needs: far keener (a bot that sits
    // still while one mate does everything loses that mate, or the war)
    const enemy = o.kind === 'attack' ? (state.villages[o.target]?.owner ?? -1) : o.kind === 'focus' ? o.target : -1;
    const war = atWar(state, player.id, enemy);
    const keen = Math.min(0.95, ((o.binding ? 0.85 : 0.45) * OBEDIENT[bot.archetype] + favorOf(bot) * 0.12) * (war ? 1.5 : 1) + (war ? 0.2 : 0));
    const roll = nextFloat(state.rng);
    if (o.kind === 'spare' || o.kind === 'focus') {
      const name = state.players[o.target]?.name ?? '?';
      if (roll < keen) {
        (o.kind === 'spare' ? (bot.spare ??= {}) : (bot.focus ??= {}))[o.target] = o.expires;
        reply('yes', o.kind === 'spare' ? T('ik laat {name} met rust.', { name }) : T('ik richt me op {name}.', { name }));
      } else reply('no', o.kind === 'spare' ? T('{name} is mijn doelwit, daar kom ik niet aan.', { name }) : T('ik heb mijn eigen plannen.'));
      continue;
    }
    // attack a village
    const target = state.villages[o.target];
    if (!target) { reply('no', T('dat dorp bestaat niet meer.')); continue; }
    if (target.owner >= 0 && (!mayAttack(state, player.id, target.owner) || protectionBlocker(state, player.id, target.owner) !== null)) {
      reply('no', T('dat dorp mag ik niet aanvallen (verdrag of beginnersbescherming).'));
      continue;
    }
    if (roll >= keen) { reply('no', T('daar heb ik nu geen troepen voor over.')); continue; }
    const half = roll > keen * 0.6;
    const from = villagesOf(state, player.id)
      .filter((v) => isOperational(state.config, v, 'place'))
      .map((v) => {
        const units: UnitCounts = {};
        for (const u of OFFENSE) { const n = Math.floor(v.units[u] * (half ? 0.5 : 1)); if (n > 0) units[u] = n; }
        return { v, units };
      })
      .filter((x) => sum(x.units) >= 50 && travelTimeMs(state, x.units, distance(x.v, target)) <= reach(state))
      .sort((a, b) => sum(b.units) - sum(a.units))[0];
    if (!from) { reply('no', T('ik heb geen aanvalsleger in de buurt.')); continue; }
    if (sendAttack(state, from.v.id, target.id, from.units) !== null) { reply('no', T('het lukte niet om te sturen.')); continue; }
    reply(half ? 'half' : 'yes', T('ik stuur {units} naar {village} ({x}|{y}).', { units: unitText(state, from.units), village: target.name, x: String(target.x), y: String(target.y) }));
  }
  state.tribeOrders = (state.tribeOrders ?? []).filter((o) => o.expires > state.time - DAY);
}

/** A mate asks you something now and then: one open request at a time, not too often. */
function askHuman(state: WorldState, player: Player): void {
  const bot = player.bot!;
  const open = (state.inbox ?? []).some((m) => m.kind === 'request' && m.from === player.id && m.status === 'open');
  // a fixed game time, like your attention: at most ~2 requests per mate per game day
  const cooldown = 12 * HOUR;
  if (open || (bot.lastAsk !== undefined && state.time - bot.lastAsk < cooldown)) return;
  const mine = villagesOf(state, HUMAN_ID);
  if (!mine.length) return;
  const ask = (request: NonNullable<InboxMessage['request']>, title: Txt, text: Txt) => {
    bot.lastAsk = state.time;
    addMessage(state, { kind: 'request', from: player.id, title, text, request, status: 'open', expires: request.type === 'support' ? request.arrives : state.time + DAY });
    if (pauses(state, 'requests')) alertHuman(state, txt(title));
  };

  // 1. support: an attack on one of its villages that it has seen, with you close enough to help
  for (const [id, seen] of Object.entries(bot.seen ?? {})) {
    if (!seen.reacted) continue;
    const m = state.movements[Number(id)];
    const v = m ? state.villages[m.to] : undefined;
    if (!m || !v || v.owner !== player.id || m.arrives - state.time < 10 * MINUTE) continue;
    if (!mine.some((o) => helpReach(state, o, v))) continue;
    ask({ type: 'support', village: v.id, movement: m.id, arrives: m.arrives }, T('{name} vraagt support', { name: player.name }), T('{name}: {village} ({x}|{y}) wordt aangevallen. Kun je verdediging sturen?', { name: player.name, village: v.name, x: String(v.x), y: String(v.y) }));
    return;
  }

  // 2. resources: saving for a nobleman and short of it
  if (nextFloat(state.rng) < 0.03) {
    for (const v of villagesOf(state, player.id)) {
      if (!isOperational(state.config, v, 'snob')) continue;
      const need = state.config.units.snob.cost;
      const have = currentResources(state.config, v, state.time);
      const short = need.map((n, i) => Math.max(0, Math.ceil((n - have[i]!) / 1000) * 1000)) as Res;
      const total = short.reduce((a, b) => a + b, 0);
      if (total < 5000 || total > 60000) continue;
      ask({ type: 'resources', village: v.id, res: short }, T('{name} vraagt grondstoffen', { name: player.name }), T('{name}: ik spaar voor een edelman in {village}. Kun je {wood} / {clay} / {iron} (hout / leem / ijzer) missen?', { name: player.name, village: v.name, wood: short[0], clay: short[1], iron: short[2] }));
      return;
    }
  }

  // 3. permission: when you lead, it asks before going after a player
  const t = tribeOf(state, HUMAN_ID);
  if (t?.leader !== HUMAN_ID || nextFloat(state.rng) > 0.02) return;
  for (const v of villagesOf(state, player.id)) {
    const prey = villagesNear(state, v, 12).find((x) => x.owner >= 0 && x.owner !== player.id && x.owner !== HUMAN_ID && x.owner !== BARBARIAN && mayAttack(state, player.id, x.owner) && !spares(state, bot, x.owner));
    if (!prey) continue;
    const name = state.players[prey.owner]?.name ?? '?';
    (bot.spare ??= {})[prey.owner] = state.time + DAY; // waits for your answer
    ask({ type: 'permission', target: prey.owner }, T('{name} vraagt toestemming', { name: player.name }), T('{name}: mag ik {target} aanvallen? Hij zit vlak bij mij.', { name: player.name, target: name }));
    return;
  }
}
