/**
 * Market: merchants carry resources between villages, and players (and bots) trade through
 * offers. TW rules: a merchant carries 1000, walks 6 minutes per field (divided by world
 * speed), and comes back empty. Resources of an open offer, and the merchants for it, are
 * set aside until the offer is taken or cancelled.
 */
import type { Res } from '../shared/gameData';
import { push } from './eventQueue';
import { storageCapacity } from './formulas';
import { distance, type Movement } from './movement';
import { HUMAN_ID, addLog, nextId, villagesOf, type WorldState } from './state';
import { currentResources, isOperational, settle, type Village } from './village';

export const MERCHANT_CARRY = 1000;
export const MERCHANT_MINUTES_PER_FIELD = 6;

/**
 * Merchants per market level. Levels 1-16 and 18-20 are TW's official values; 17 and 21-25
 * come from memory and still need checking against an official source.
 */
const MERCHANTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 19, 26, 35, 46, 59, 74, 91, 110, 131, 154, 179, 206, 235];

export const RES_NAMES = ['hout', 'leem', 'ijzer'] as const;

export interface TradeOffer {
  id: number;
  villageId: number;
  owner: number;
  /** What the offer gives: resource index and amount. */
  give: { res: 0 | 1 | 2; amount: number };
  /** What it wants in return. */
  want: { res: 0 | 1 | 2; amount: number };
  created: number;
}

export function merchantsTotal(v: Village): number {
  if (v.buildings.market <= 0) return 0;
  return MERCHANTS[v.buildings.market] ?? MERCHANTS[MERCHANTS.length - 1] ?? 0;
}

export function merchantsBusy(state: WorldState, v: Village): number {
  let busy = 0;
  for (const m of Object.values(state.movements)) {
    if ((m.kind === 'trade' && m.from === v.id) || (m.kind === 'tradeReturn' && m.to === v.id)) busy += m.merchants ?? 0;
  }
  for (const o of state.offers ?? []) if (o.villageId === v.id) busy += merchantsFor(o.give.amount);
  return busy;
}

export function merchantsFree(state: WorldState, v: Village): number {
  return Math.max(0, merchantsTotal(v) - merchantsBusy(state, v));
}

export function merchantsFor(amount: number): number {
  return Math.ceil(amount / MERCHANT_CARRY);
}

export function tradeTimeMs(state: WorldState, a: Village, b: Village): number {
  return Math.round((distance(a, b) * MERCHANT_MINUTES_PER_FIELD * 60_000) / state.config.worldSpeed);
}

function cleanRes(r: Res): Res {
  return r.map((x) => Math.max(0, Math.floor(x))) as Res;
}

/** Sends resources with merchants. Free trade to anyone's village (not to barbarians). */
export function sendResources(state: WorldState, fromId: number, toId: number, requested: Res): string | null {
  const from = state.villages[fromId];
  const to = state.villages[toId];
  if (!from || !to) return 'Dorp bestaat niet.';
  if (from.id === to.id) return 'Dat is hetzelfde dorp.';
  if (to.owner < 0) return 'Je kunt geen grondstoffen naar barbaren sturen.';
  if (!isOperational(state.config, from, 'market')) return 'Je hebt een werkende marktplaats nodig.';
  const res = cleanRes(requested);
  const total = res[0] + res[1] + res[2];
  if (total <= 0) return 'Kies minstens één grondstof.';
  settle(state.config, from, state.time);
  if ([0, 1, 2].some((i) => res[i as 0 | 1 | 2] > from.res[i as 0 | 1 | 2])) return 'Niet genoeg grondstoffen.';
  const merchants = merchantsFor(total);
  const free = merchantsFree(state, from);
  if (merchants > free) return `${merchants} handelaren nodig, ${free} beschikbaar.`;
  for (const i of [0, 1, 2] as const) from.res[i] -= res[i];
  launch(state, from, to, res, merchants);
  return null;
}

function launch(state: WorldState, from: Village, to: Village, res: Res, merchants: number): void {
  const duration = tradeTimeMs(state, from, to);
  const m: Movement = {
    id: nextId(state),
    kind: 'trade',
    owner: from.owner,
    from: from.id,
    to: to.id,
    units: {},
    sent: state.time,
    arrives: state.time + duration,
    res,
    merchants,
  };
  state.movements[m.id] = m;
  push(state.queue, m.arrives, { kind: 'arrive', movementId: m.id });
}

/** Merchants arrive: unload (what doesn't fit in storage is lost, like TW) and walk home. */
export function arriveTrade(state: WorldState, m: Movement): void {
  delete state.movements[m.id];
  const to = state.villages[m.to];
  if (to && m.res) {
    settle(state.config, to, state.time);
    const cap = storageCapacity(to.buildings.storage);
    for (const i of [0, 1, 2] as const) to.res[i] = Math.max(to.res[i], Math.min(cap, to.res[i] + (m.res[i] ?? 0)));
    if (to.owner === HUMAN_ID && m.owner !== HUMAN_ID) {
      addLog(state, { time: state.time, text: `${to.name} ontving grondstoffen van ${state.players[m.owner]?.name ?? '?'}.` });
    }
  }
  const back: Movement = {
    id: nextId(state),
    kind: 'tradeReturn',
    owner: m.owner,
    from: m.to,
    to: m.from,
    units: {},
    sent: state.time,
    arrives: state.time + (m.arrives - m.sent),
    merchants: m.merchants ?? 0,
  };
  state.movements[back.id] = back;
  push(state.queue, back.arrives, { kind: 'arrive', movementId: back.id });
}

export function arriveTradeReturn(state: WorldState, m: Movement): void {
  delete state.movements[m.id];
}

// --- offers --------------------------------------------------------------------

export function createOffer(
  state: WorldState,
  villageId: number,
  give: { res: 0 | 1 | 2; amount: number },
  want: { res: 0 | 1 | 2; amount: number },
): string | null {
  const v = state.villages[villageId];
  if (!v) return 'Dorp bestaat niet.';
  if (!isOperational(state.config, v, 'market')) return 'Je hebt een werkende marktplaats nodig.';
  const g = Math.floor(give.amount);
  const w = Math.floor(want.amount);
  if (g <= 0 || w <= 0) return 'Vul beide hoeveelheden in.';
  if (give.res === want.res) return 'Ruil twee verschillende grondstoffen.';
  settle(state.config, v, state.time);
  if (v.res[give.res] < g) return `Niet genoeg ${RES_NAMES[give.res]}.`;
  const need = merchantsFor(g);
  const free = merchantsFree(state, v);
  if (need > free) return `${need} handelaren nodig, ${free} beschikbaar.`;
  v.res[give.res] -= g;
  state.offers ??= [];
  state.offers.push({ id: nextId(state), villageId: v.id, owner: v.owner, give: { res: give.res, amount: g }, want: { res: want.res, amount: w }, created: state.time });
  return null;
}

export function cancelOffer(state: WorldState, offerId: number, by: number): string | null {
  const offer = state.offers?.find((o) => o.id === offerId);
  if (!offer) return 'Aanbod bestaat niet meer.';
  if (offer.owner !== by) return 'Dat is niet jouw aanbod.';
  removeOffer(state, offer, true);
  return null;
}

/** Removes an offer; with refund the set-aside resources go back. */
function removeOffer(state: WorldState, offer: TradeOffer, refund: boolean): void {
  state.offers = (state.offers ?? []).filter((o) => o.id !== offer.id);
  const v = state.villages[offer.villageId];
  if (!refund || !v) return;
  // like a cancelled building: the resources come back in full, even above the storage cap
  settle(state.config, v, state.time);
  v.res[offer.give.res] += offer.give.amount;
}

/** Takes an offer from village `villageId`: both sides send their merchants at once. */
export function acceptOffer(state: WorldState, offerId: number, villageId: number): string | null {
  const offer = state.offers?.find((o) => o.id === offerId);
  const v = state.villages[villageId];
  if (!offer) return 'Aanbod bestaat niet meer.';
  if (!v) return 'Dorp bestaat niet.';
  const seller = state.villages[offer.villageId];
  if (!seller || seller.owner !== offer.owner) {
    removeOffer(state, offer, false);
    return 'Aanbod bestaat niet meer.';
  }
  if (seller.owner === v.owner) return 'Dat is je eigen aanbod.';
  if (!isOperational(state.config, v, 'market')) return 'Je hebt een werkende marktplaats nodig.';
  settle(state.config, v, state.time);
  if (v.res[offer.want.res] < offer.want.amount) return `Niet genoeg ${RES_NAMES[offer.want.res]}.`;
  const need = merchantsFor(offer.want.amount);
  const free = merchantsFree(state, v);
  if (need > free) return `${need} handelaren nodig, ${free} beschikbaar.`;
  v.res[offer.want.res] -= offer.want.amount;
  removeOffer(state, offer, false);
  const toBuyer: Res = [0, 0, 0];
  toBuyer[offer.give.res] = offer.give.amount;
  const toSeller: Res = [0, 0, 0];
  toSeller[offer.want.res] = offer.want.amount;
  launch(state, seller, v, toBuyer, merchantsFor(offer.give.amount));
  launch(state, v, seller, toSeller, need);
  if (offer.owner === HUMAN_ID) {
    addLog(state, {
      time: state.time,
      text: `Je aanbod ${offer.give.amount} ${RES_NAMES[offer.give.res]} voor ${offer.want.amount} ${RES_NAMES[offer.want.res]} is aangenomen door ${state.players[v.owner]?.name ?? '?'}.`,
    });
  }
  return null;
}

/** Offers a village has open. */
export function offersOf(state: WorldState, villageId: number): TradeOffer[] {
  return (state.offers ?? []).filter((o) => o.villageId === villageId);
}

// --- balancing your own villages ------------------------------------------------

/**
 * Spreads resources over a player's villages: each resource moves from villages filled
 * above the average (as a share of their storage) to villages below it, as far as free
 * merchants allow. Returns how many shipments left.
 */
export function balanceVillages(state: WorldState, owner: number): number {
  const villages = villagesOf(state, owner);
  if (villages.length < 2) return 0;
  let shipments = 0;
  for (const i of [0, 1, 2] as const) {
    const fill = villages.map((v) => {
      const cap = storageCapacity(v.buildings.storage);
      return { v, cap, have: currentResources(state.config, v, state.time)[i] };
    });
    const share = fill.reduce((a, f) => a + f.have, 0) / Math.max(1, fill.reduce((a, f) => a + f.cap, 0));
    const givers = fill.filter((f) => f.have > f.cap * share + MERCHANT_CARRY && isOperational(state.config, f.v, 'market'));
    const takers = fill.filter((f) => f.have < f.cap * share - MERCHANT_CARRY);
    for (const t of takers) {
      let need = Math.floor(t.cap * share - t.have);
      for (const g of givers.sort((a, b) => distance(a.v, t.v) - distance(b.v, t.v))) {
        if (need < MERCHANT_CARRY) break;
        const spare = Math.floor(g.have - g.cap * share);
        const merchants = Math.min(merchantsFree(state, g.v), Math.floor(Math.min(spare, need) / MERCHANT_CARRY));
        if (merchants <= 0) continue;
        const amount = merchants * MERCHANT_CARRY;
        const res: Res = [0, 0, 0];
        res[i] = amount;
        if (sendResources(state, g.v.id, t.v.id, res) === null) {
          g.have -= amount;
          need -= amount;
          shipments++;
        }
      }
    }
  }
  return shipments;
}
