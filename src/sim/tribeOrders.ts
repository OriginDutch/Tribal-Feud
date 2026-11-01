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
import { DAY, HOUR, MINUTE, formatGameTime } from '../shared/time';
import { villagesNear } from './bots';
import { addMessage, alertHuman, pauses } from './humanTribe';
import { distance, fieldsWithin, freeUnits, protectionBlocker, sendAttack, sendSupport, travelBudget, travelTimeMs } from './movement';
import { MERCHANT_CARRY, merchantsFree, sendResources } from './market';
import { nextFloat } from './rng';
import { BARBARIAN, HUMAN_ID, addLog, movementIndex, nextId, villagesOf, type BotRequest, type BotState, type InboxMessage, type Player, type WorldState } from './state';
import { AGGRESSION, mayAttack, relationBetween, tribeOf } from './tribes';
import { changeStanding, mateEvent, moodAll } from './loyalty';
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
const unitText = (state: WorldState, u: UnitCounts) =>
  UNIT_IDS.filter((k) => (u[k] ?? 0) > 0).map((k) => `${u[k]} ${state.config.units[k].name.toLowerCase()}`).join(', ');
const mates = (state: WorldState): Player[] => {
  const t = tribeOf(state, HUMAN_ID);
  return t ? t.members.map((m) => state.players[m]!).filter((p) => p?.bot) : [];
};

// --- your side ------------------------------------------------------------------------------

/** Ask your tribe for help against an attack on one of your villages. */
export function askTribeHelp(state: WorldState, movementId: number): string | null {
  if (!tribeOf(state, HUMAN_ID)) return 'Je zit niet in een stam.';
  const m = state.movements[movementId];
  const v = m ? state.villages[m.to] : undefined;
  if (!m || m.kind !== 'attack' || !v || v.owner !== HUMAN_ID) return 'Die aanval bestaat niet (meer).';
  if ((state.helpAsks ?? []).some((a) => a.movement === movementId)) return 'Je hebt hier al om hulp gevraagd.';
  (state.helpAsks ??= []).push({ id: nextId(state), village: v.id, movement: m.id, arrives: m.arrives, at: state.time, answered: [] });
  addLog(state, { time: state.time, text: `Je vraagt je stam om hulp voor ${v.name}.` });
  return null;
}

/** Ask your tribe for resources for one of your villages; mates send what they can spare. */
export function askTribeResources(state: WorldState, villageId: number, res: Res): string | null {
  if (!tribeOf(state, HUMAN_ID)) return 'Je zit niet in een stam.';
  const v = state.villages[villageId];
  if (!v || v.owner !== HUMAN_ID) return 'Dat is niet jouw dorp.';
  const want = res.map((n) => Math.max(0, Math.floor(n))) as Res;
  if (want[0] + want[1] + want[2] < MERCHANT_CARRY) return 'Vraag minstens 1.000 grondstoffen.';
  if ((state.resourceAsks ?? []).some((a) => a.at > state.time - DAY)) return 'Je hebt vandaag al om grondstoffen gevraagd. Morgen weer.';
  (state.resourceAsks ??= []).push({ id: nextId(state), village: v.id, res: want, sent: [0, 0, 0], at: state.time, answered: [] });
  addLog(state, { time: state.time, text: `Je vraagt je stam om grondstoffen voor ${v.name}.` });
  return null;
}

/** As a member of a bot tribe: ask your leader whether you may attack a player. */
export function askPermission(state: WorldState, target: number): string | null {
  const t = tribeOf(state, HUMAN_ID);
  if (!t) return 'Je zit niet in een stam.';
  if (t.leader === HUMAN_ID) return 'Jij bent de leider: je hoeft het niemand te vragen.';
  const p = state.players[target];
  if (!p || target === HUMAN_ID || p.tribe === t.id) return 'Die speler kun je niet aanvallen.';
  const asked = state.permissions?.[target];
  if (asked && !asked.answer) return 'Je hebt het al gevraagd; de leider antwoordt als hij online is.';
  (state.permissions ??= {})[target] = { at: state.time };
  return null;
}

/** You attack a player: if your leader said no, that costs standing (once per answer). */
export function attackedWithoutPermission(state: WorldState, target: number): void {
  const p = state.permissions?.[target];
  if (!p || p.answer !== 'no' || (p.until ?? 0) <= state.time || p.broken) return;
  p.broken = true;
  changeStanding(state, -15, `je viel ${state.players[target]?.name ?? '?'} aan terwijl ik nee zei`);
}

/** Give an order (leader) or a suggestion (member). */
export function giveOrder(state: WorldState, kind: 'attack' | 'spare' | 'focus', target: number): string | null {
  const t = tribeOf(state, HUMAN_ID);
  if (!t) return 'Je zit niet in een stam.';
  if (kind === 'attack') {
    const v = state.villages[target];
    if (!v) return 'Dat dorp bestaat niet.';
    if (v.owner === HUMAN_ID || (v.owner >= 0 && state.players[v.owner]?.tribe === t.id)) return 'Dat is een dorp van je eigen stam.';
  } else {
    const p = state.players[target];
    if (!p || target === HUMAN_ID) return 'Die speler bestaat niet.';
    if (p.tribe === t.id) return 'Die speler zit in je stam.';
  }
  if ((state.tribeOrders ?? []).some((o) => o.kind === kind && o.target === target && o.expires > state.time)) return 'Die order loopt al.';
  (state.tribeOrders ??= []).push({ id: nextId(state), kind, target, binding: t.leader === HUMAN_ID, at: state.time, expires: state.time + LIFETIME, answers: {} });
  // too many orders at once wear people out
  if (t.leader === HUMAN_ID && (state.tribeOrders ?? []).filter((o) => o.expires > state.time).length > 3) moodAll(state, t, -3, 'te veel orders tegelijk');
  return null;
}

export function cancelOrder(state: WorldState, id: number): string | null {
  const o = state.tribeOrders?.find((x) => x.id === id);
  if (!o) return 'Die order bestaat niet.';
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
  if (!r || !p?.bot) return 'Dit verzoek bestaat niet meer.';
  if (r.type === 'order') return answerLeaderOrder(state, m, r, p, accept);
  if (!accept) {
    m.status = 'declined';
    mateEvent(state, p, r.type === 'support' ? -10 : -6, -3, r.type === 'support' ? 'je stuurde geen support' : r.type === 'resources' ? 'je hield je grondstoffen voor jezelf' : 'je gaf geen toestemming');
    changeFavor(p.bot, r.type === 'permission' ? -0.1 : -0.3);
    if (r.type === 'permission') (p.bot.spare ??= {})[r.target] = state.time + 3 * DAY;
    // some take it badly
    if (r.type !== 'permission' && nextFloat(state.rng) < 0.4) {
      addMessage(state, { kind: 'info', from: p.id, title: `${p.name} is teleurgesteld`, text: r.type === 'support' ? `${p.name}: ik had op je gerekend.` : `${p.name}: dan red ik het wel alleen.` });
    }
    return null;
  }
  if (r.type === 'support') {
    // the support itself you send with the planner; agreeing already counts
    m.status = 'accepted';
    changeFavor(p.bot, 0.3);
    mateEvent(state, p, 4, 2, 'je beloofde support');
    return null;
  }
  if (r.type === 'resources') {
    const to = state.villages[r.village];
    if (!to || to.owner !== p.id) { m.status = 'expired'; return 'Dat dorp is niet meer van hem.'; }
    const need = r.res.reduce((a, b) => a + b, 0);
    const from = villagesOf(state, HUMAN_ID)
      .filter((v) => isOperational(state.config, v, 'market'))
      .filter((v) => { const have = currentResources(state.config, v, state.time); return r.res.every((n, i) => have[i]! >= n) && merchantsFree(state, v) * MERCHANT_CARRY >= need; })
      .sort((a, b) => distance(a, to) - distance(b, to))[0];
    if (!from) return 'Geen dorp met een markt, genoeg grondstoffen en vrije handelaren.';
    const error = sendResources(state, from.id, to.id, r.res);
    if (error) return error;
    m.status = 'accepted';
    changeFavor(p.bot, 0.4);
    mateEvent(state, p, 8, 3, 'je stuurde grondstoffen');
    return null;
  }
  // permission to attack
  m.status = 'accepted';
  if (p.bot.spare) delete p.bot.spare[r.target];
  changeFavor(p.bot, 0.1);
  mateEvent(state, p, 4, 1, 'je gaf toestemming');
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
  o: { order: 'attack' | 'support' | 'scout'; village: number; until: number; from: number; landAt?: number; spies?: number } | undefined,
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
  // attacks: from the movement index (no scan over every movement); supports are rare, a scan is fine
  const ids = order !== 'support' ? [...(movementIndex(state).incoming.get(v.id) ?? [])].map((id) => state.movements[id]) : Object.values(state.movements);
  const underway = ids
    .filter((m) => m !== undefined && m.owner === HUMAN_ID && m.kind === (order === 'support' ? 'support' : 'attack') && m.to === v.id && (order !== 'scout' || (m.units.spy ?? 0) > 0))
    .map((m) => m!)
    .map((m) => ({ attack: Math.round(orderAttack(state, m.units)), arrives: m.arrives }));
  let best: LeaderOrderView['best'];
  if (order === 'attack') {
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
    target: { id: v.id, name: v.name, x: v.x, y: v.y, owner: v.owner, ownerName: state.players[v.owner]?.name ?? 'barbaren' },
    until, ...(landAt !== undefined ? { landAt } : {}), from,
    ...(order === 'attack' ? { minAttack: ORDER_MIN_ATTACK } : {}),
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
    changeStanding(state, -4, r.order === 'attack' ? 'je weigerde mijn aanvalsorder' : r.order === 'scout' ? 'je weigerde te verkennen' : 'je weigerde support te sturen');
    return null;
  }
  m.status = 'accepted';
  if (r.order === 'scout') {
    (state.scoutOrders ??= []).push({ village: r.village, until: state.time + DAY / 2, from: leader.id, ...(r.spies ? { spies: r.spies } : {}) });
    return null;
  }
  // a joint attack: landing a little after the others still counts
  state.leaderOrder = { order: r.order, village: r.village, until: r.arrives !== undefined ? r.arrives + 10 * MINUTE : state.time + DAY / 2, from: leader.id, ...(r.arrives !== undefined ? { landAt: r.arrives } : {}), ...(r.spies ? { spies: r.spies } : {}) };
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
  const a = orderAttack(state, units);
  if (a < ORDER_MIN_ATTACK) {
    addLog(state, { time: state.time, text: `Je aanval op ${v?.name ?? '?'} telt niet voor de order: ${Math.round(a).toLocaleString('nl-NL')} aanvalskracht, de leider wil er minstens ${ORDER_MIN_ATTACK.toLocaleString('nl-NL')}.` });
    return;
  }
  delete state.leaderOrder;
  changeStanding(state, 6, 'je voerde mijn order uit');
  addLog(state, { time: state.time, text: `Order uitgevoerd: je aanval op ${v?.name ?? '?'} is geland.` });
}
/** Your scouts got through: was it the village your leader wanted scouted? (Also counted: your attack that saw it.) */
export function leaderOrderScouted(state: WorldState, villageId: number): void {
  const i = (state.scoutOrders ?? []).findIndex((o) => o.village === villageId);
  const o = state.leaderOrder;
  if (i >= 0) state.scoutOrders!.splice(i, 1);
  else if (o && o.order === 'scout' && o.village === villageId) delete state.leaderOrder; // saves from before scout orders ran apart
  else return;
  changeStanding(state, 6, 'je verkende wat ik vroeg');
  addLog(state, { time: state.time, text: `Order uitgevoerd: je verkenners kwamen door bij ${state.villages[villageId]?.name ?? '?'}.` });
}

/**
 * You are the tribe's scout (the most spies in reach): your bot leader asks you to scout a front
 * village his own scouts don't get into. `spies`: how many died there last (send more).
 */
export function giveScoutOrder(state: WorldState, leader: Player, target: Village, spies: number): boolean {
  if (scoutOrders(state) >= MAX_SCOUT_ORDERS || scoutOrders(state, target.id) > 0) return false;
  const request: Extract<BotRequest, { type: 'order' }> = { type: 'order', order: 'scout', village: target.id, x: target.x, y: target.y, ...(spies ? { spies } : {}) };
  const title = `${leader.name}: verken ${target.name}`;
  addMessage(state, {
    kind: 'request', from: leader.id, title, request, status: 'open', expires: state.time + DAY / 2,
    text: `${leader.name}: we moeten weten wat er in ${target.name} (${target.x}|${target.y}) van ${state.players[target.owner]?.name ?? '?'} staat. ${spies ? `Onze verkenners kwamen er niet door (${spies} gesneuveld): stuur er meer.` : 'Jij hebt de meeste verkenners.'} Dan plannen we de aanval.`,
  });
  if (pauses(state, 'requests')) alertHuman(state, title);
  return true;
}

/** Your support arrived: was it where your leader wanted it? */
export function leaderOrderSupport(state: WorldState, villageId: number): void {
  const o = state.leaderOrder;
  if (!o || o.order !== 'support' || o.village !== villageId) return;
  delete state.leaderOrder;
  changeStanding(state, 6, 'je stuurde de support die ik vroeg');
}
/** A yes that was never done costs more than a no. */
export function checkLeaderOrder(state: WorldState): void {
  // scout orders: a smaller job, a smaller penalty
  const late = (state.scoutOrders ?? []).filter((o) => o.until <= state.time);
  if (late.length) {
    state.scoutOrders = state.scoutOrders!.filter((o) => o.until > state.time);
    changeStanding(state, -4 * late.length, 'je zou verkennen maar deed het niet');
  }
  const o = state.leaderOrder;
  if (!o || o.until > state.time) return;
  delete state.leaderOrder;
  changeStanding(state, -8, 'je zei ja maar deed het niet');
}

/**
 * A joint operation of your bot tribe includes you: attack `target`, landing at `landAt`.
 * Only when no order of yours is open. Returns whether the order went out.
 */
export function giveOpOrder(state: WorldState, leader: Player, target: Village, landAt: number): boolean {
  const open = !!openOrder(state);
  if (open || state.leaderOrder) return false;
  const request: Extract<BotRequest, { type: 'order' }> = { type: 'order', order: 'attack', village: target.id, x: target.x, y: target.y, arrives: landAt };
  const title = `${leader.name}: gezamenlijke aanval op ${target.name}`;
  state.leaderOrderAt = state.time;
  addMessage(state, {
    kind: 'request', from: leader.id, title, request, status: 'open', expires: landAt,
    text: `${leader.name}: we vallen ${target.name} (${target.x}|${target.y}) van ${state.players[target.owner]?.name ?? '?'} samen aan. De legers landen om ${formatGameTime(landAt)}. Stuur je leger zodat het rond die tijd aankomt; de edels komen er direct achteraan.`,
  });
  if (pauses(state, 'requests')) alertHuman(state, title);
  return true;
}

/** A bot leader of your tribe gives you an order now and then: support a mate, or attack an enemy. */
function leaderOrders(state: WorldState, leader: Player): void {
  const open = !!openOrder(state);
  if (open || state.leaderOrder || (state.leaderOrderAt !== undefined && state.time - state.leaderOrderAt < 12 * HOUR)) return;
  if (nextFloat(state.rng) > 0.05) return;
  const t = tribeOf(state, HUMAN_ID);
  const mine = villagesOf(state, HUMAN_ID);
  if (!t || !mine.length) return;
  const give = (request: Extract<BotRequest, { type: 'order' }>, title: string, text: string) => {
    state.leaderOrderAt = state.time;
    addMessage(state, { kind: 'request', from: leader.id, title, text, request, status: 'open', expires: request.arrives ?? state.time + DAY / 2 });
    if (pauses(state, 'requests')) alertHuman(state, title);
  };
  // 1. support: a mate's village under attack that you can reach in time
  const ix = movementIndex(state);
  for (const id of t.members) {
    if (id === HUMAN_ID) continue;
    for (const v of villagesOf(state, id)) {
      const hits = [...(ix.attacks.get(v.id)?.values() ?? [])].filter((a) => a > state.time + 15 * MINUTE);
      if (!hits.length || !mine.some((o) => helpReach(state, o, v))) continue;
      const arrives = Math.min(...hits);
      give({ type: 'order', order: 'support', village: v.id, x: v.x, y: v.y, arrives }, `${leader.name}: support naar ${v.name}`, `${leader.name}: ${v.name} (${v.x}|${v.y}) van ${state.players[id]?.name ?? '?'} wordt aangevallen. Stuur verdediging, het moet er zijn voor ${Math.max(1, Math.round((arrives - state.time) / MINUTE))} min.`);
      return;
    }
  }
  // 2. attack: the nearest village of a tribe we are at war with
  const enemies = new Set(Object.entries(t.relations).filter(([, r]) => r === 'war').flatMap(([tid]) => state.tribes?.[Number(tid)]?.members ?? []));
  if (!enemies.size) return;
  let best: Village | null = null, bestD = Infinity;
  for (const o of mine) {
    for (const v of villagesNear(state, o, fieldsWithin(state, reach(state)))) {
      if (!enemies.has(v.owner)) continue;
      const d = distance(o, v);
      if (d < bestD) { bestD = d; best = v; }
    }
  }
  if (best) give({ type: 'order', order: 'attack', village: best.id, x: best.x, y: best.y }, `${leader.name}: val ${best.name} aan`, `${leader.name}: we zijn in oorlog met ${state.players[best.owner]?.name ?? '?'}. Val ${best.name} (${best.x}|${best.y}) aan, liefst binnen een halve speldag.`);
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
    const reply = (title: string, text: string) => addMessage(state, { kind: 'answer', from: player.id, title, text });
    // under fire itself? then it keeps its troops
    const ix = movementIndex(state);
    const busy = villagesOf(state, player.id).some((v) => [...(ix.attacks.get(v.id)?.values() ?? [])].some((a) => a > state.time));
    if (busy) { reply(`${player.name} kan niet helpen`, `${player.name}: ik zit zelf onder vuur.`); continue; }
    // in a war against the attacker the tribe stands together: much keener to help
    const attacker = state.movements[ask.movement]?.owner ?? -1;
    const chance = HELPFUL[bot.archetype] + favorOf(bot) * 0.15 + (atWar(state, player.id, attacker) ? 0.3 : 0);
    if (nextFloat(state.rng) >= chance) { reply(`${player.name} helpt niet`, `${player.name}: deze keer niet, sorry.`); continue; }
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
      reply(`${player.name} stuurt hulp`, `${player.name} stuurt ${unitText(state, sent)} naar ${target.name}; komt ${Math.max(1, Math.round(margin / MINUTE))} min voor de inslag aan.`);
    } else {
      reply(`${player.name} kan niet helpen`, `${player.name}: ${late ? 'ik kom niet op tijd.' : empty ? 'ik heb geen verdediging over (of zit te ver weg).' : 'het lukt niet.'}`);
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
    const reply = (title: string, text: string) => addMessage(state, { kind: 'answer', from: player.id, title, text });
    if (nextFloat(state.rng) >= HELPFUL[bot.archetype] + favorOf(bot) * 0.15) { reply(`${player.name} stuurt niets`, `${player.name}: ik heb het zelf nodig, sorry.`); continue; }
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
    if (!gave) { reply(`${player.name} kan niets missen`, `${player.name}: ik heb niets over (of geen vrije handelaren).`); continue; }
    for (const i of [0, 1, 2] as const) ask.sent[i] += gave[i];
    changeFavor(bot, -0.1);
    reply(`${player.name} stuurt grondstoffen`, `${player.name} stuurt ${gave.map((n) => n.toLocaleString('nl-NL')).join(' / ')} (hout / leem / ijzer) naar ${to.name}.`);
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
    changeStanding(state, 1, 'je vroeg eerst toestemming');
    addMessage(state, {
      kind: 'answer', from: leader.id,
      title: yes ? `${leader.name}: ga je gang` : `${leader.name}: liever niet`,
      text: yes ? `${leader.name}: ${name} aanvallen? Ga je gang.` : `${leader.name}: laat ${name} met rust${allowed ? '' : ', we hebben een verdrag'}. Doe je het toch, dan onthoud ik dat.`,
    });
  }
}

function answerOrders(state: WorldState, player: Player): void {
  const bot = player.bot!;
  for (const o of state.tribeOrders ?? []) {
    if (o.expires <= state.time || o.answers[player.id]) continue;
    const reply = (answer: 'yes' | 'half' | 'no', text: string) => {
      o.answers[player.id] = answer;
      addMessage(state, { kind: 'answer', from: player.id, title: `${player.name}: ${answer === 'yes' ? 'akkoord' : answer === 'half' ? 'deels' : 'nee'}`, text: `${player.name}: ${text}` });
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
        reply('yes', o.kind === 'spare' ? `ik laat ${name} met rust.` : `ik richt me op ${name}.`);
      } else reply('no', o.kind === 'spare' ? `${name} is mijn doelwit, daar kom ik niet aan.` : `ik heb mijn eigen plannen.`);
      continue;
    }
    // attack a village
    const target = state.villages[o.target];
    if (!target) { reply('no', 'dat dorp bestaat niet meer.'); continue; }
    if (target.owner >= 0 && (!mayAttack(state, player.id, target.owner) || protectionBlocker(state, player.id, target.owner) !== null)) {
      reply('no', 'dat dorp mag ik niet aanvallen (verdrag of beginnersbescherming).');
      continue;
    }
    if (roll >= keen) { reply('no', 'daar heb ik nu geen troepen voor over.'); continue; }
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
    if (!from) { reply('no', 'ik heb geen aanvalsleger in de buurt.'); continue; }
    if (sendAttack(state, from.v.id, target.id, from.units) !== null) { reply('no', 'het lukte niet om te sturen.'); continue; }
    reply(half ? 'half' : 'yes', `ik stuur ${unitText(state, from.units)} naar ${target.name} (${target.x}|${target.y}).`);
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
  const ask = (request: NonNullable<InboxMessage['request']>, title: string, text: string) => {
    bot.lastAsk = state.time;
    addMessage(state, { kind: 'request', from: player.id, title, text, request, status: 'open', expires: request.type === 'support' ? request.arrives : state.time + DAY });
    if (pauses(state, 'requests')) alertHuman(state, title);
  };

  // 1. support: an attack on one of its villages that it has seen, with you close enough to help
  for (const [id, seen] of Object.entries(bot.seen ?? {})) {
    if (!seen.reacted) continue;
    const m = state.movements[Number(id)];
    const v = m ? state.villages[m.to] : undefined;
    if (!m || !v || v.owner !== player.id || m.arrives - state.time < 10 * MINUTE) continue;
    if (!mine.some((o) => helpReach(state, o, v))) continue;
    ask({ type: 'support', village: v.id, movement: m.id, arrives: m.arrives }, `${player.name} vraagt support`, `${player.name}: ${v.name} (${v.x}|${v.y}) wordt aangevallen. Kun je verdediging sturen?`);
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
      ask({ type: 'resources', village: v.id, res: short }, `${player.name} vraagt grondstoffen`, `${player.name}: ik spaar voor een edelman in ${v.name}. Kun je ${short.map((n) => n.toLocaleString('nl-NL')).join(' / ')} (hout / leem / ijzer) missen?`);
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
    ask({ type: 'permission', target: prey.owner }, `${player.name} vraagt toestemming`, `${player.name}: mag ik ${name} aanvallen? Hij zit vlak bij mij.`);
    return;
  }
}
