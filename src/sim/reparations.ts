/**
 * Reparations after peace talks: every member of the losing tribe pays his share of the agreed
 * resources (his share of the tribe's points, so it hurts everyone the same), with merchants, to
 * the members of the winning tribe in turn. Paid as fast as merchants and stock allow; what is not
 * paid within REPARATION_DAYS (world speed 1) is written off — whoever could, paid.
 */
import { DAY } from '../shared/time';
import type { Res } from '../shared/gameData';
import { villagePoints } from './barbarians';
import { distance } from './movement';
import { merchantsFree, sendResources } from './market';
import { HUMAN_ID, addLog, villagesOf, type WorldState } from './state';
import { currentResources, isOperational } from './village';
import type { Tribe } from './tribes';
import { tr } from '../shared/i18n';

export const REPARATION_DAYS = 7;
const PER_MERCHANT = 1000;

export interface Reparation {
  from: number;
  to: number;
  /** Resources still to pay (the three kinds together). */
  left: number;
  total: number;
  due: number;
  /** How many shipments went out (to spread them over the winner's members). */
  sent: number;
}

/** Splits `total` over the loser's members by points and starts paying. */
export function addReparations(state: WorldState, winner: Tribe, loser: Tribe, total: number): void {
  const pts = loser.members.map((m) => ({ m, p: villagesOf(state, m).reduce((s, v) => s + villagePoints(state.config, v), 0) }));
  const sum = pts.reduce((s, x) => s + x.p, 0);
  if (sum <= 0) return;
  for (const { m, p } of pts) {
    const share = Math.round((total * p) / sum);
    if (share <= 0) continue;
    const d: Reparation = { from: m, to: winner.id, left: share, total: share, due: state.time + (REPARATION_DAYS * DAY) / state.config.worldSpeed, sent: 0 };
    (state.reparations ??= []).push(d);
    if (m === HUMAN_ID) addLog(state, { time: state.time, text: tr('Jouw deel van de vrede: {n} grondstoffen aan [{tag}]. Je handelaren brengen het weg zodra ze kunnen.', { n: share, tag: winner.tag }) });
    pay(state, d);
  }
  state.reparations = (state.reparations ?? []).filter((x) => x.left > 0);
}

/** Sends what the payer's free merchants can carry right now. */
function pay(state: WorldState, d: Reparation): void {
  const winner = state.tribes?.[d.to];
  if (!winner?.members.length) { d.left = 0; return; }
  const own = villagesOf(state, d.from).filter((v) => isOperational(state.config, v, 'market'));
  for (const v of own) {
    if (d.left <= 0) return;
    const stock = currentResources(state.config, v, state.time);
    const cap = merchantsFree(state, v) * PER_MERCHANT;
    const have = stock[0] + stock[1] + stock[2];
    const amount = Math.min(d.left, cap, have);
    if (amount < PER_MERCHANT && amount < d.left) continue;
    // take from each kind in proportion to what the village has
    const res = stock.map((x) => Math.floor((x / have) * amount)) as Res;
    const sum = res[0] + res[1] + res[2];
    if (sum <= 0) continue;
    const member = winner.members[d.sent % winner.members.length]!;
    const to = villagesOf(state, member).sort((a, b) => distance(a, v) - distance(b, v))[0];
    if (!to) { d.sent++; continue; }
    if (sendResources(state, v.id, to.id, res) === null) {
      d.left -= sum;
      d.sent++;
    }
  }
}

/** Diplomacy tick: keep paying; drop what is paid, written off or whose tribes are gone. */
export function reparationsTick(state: WorldState): void {
  if (!state.reparations?.length) return;
  for (const d of state.reparations) {
    if (state.time > d.due) { d.left = 0; continue; }
    pay(state, d);
  }
  state.reparations = state.reparations.filter((d) => d.left > 0);
}

/** What a player still owes (for the view). */
export function owedBy(state: WorldState, id: number): number {
  return (state.reparations ?? []).filter((d) => d.from === id).reduce((s, d) => s + d.left, 0);
}
