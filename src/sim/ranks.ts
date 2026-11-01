/**
 * Ranks in a tribe. Members earn merit by serving it (orders done, roles in joint attacks,
 * conquests on its enemies, support for mates) and lose it by failing (orders not done, lost
 * appeals). Merit fades slowly, so what you do now counts more than what you did weeks ago.
 *
 * The places are few and members compete for them: under the leader one right hand (the
 * intended successor), one captain, two veterans; the rest are warriors, and newcomers are
 * recruits for their first days. To take someone's place you need clearly more (OVERTAKE).
 * The rank counts where the leader weighs members: appeals about the nobles, and succession.
 */
import { DAY } from '../shared/time';
import type { RankRow } from '../shared/protocol';
import { HUMAN_ID, addLog, type WorldState } from './state';
import type { Tribe } from './tribes';

export type Rank = 'leider' | 'rechterhand' | 'kapitein' | 'veteraan' | 'krijger' | 'rekruut';
export const RANK_NAMES: Record<Rank, string> = { leider: 'Leider', rechterhand: 'Rechterhand', kapitein: 'Kapitein', veteraan: 'Veteraan', krijger: 'Krijger', rekruut: 'Rekruut' };

/** What earns (or costs) merit. */
export const MERIT = {
  order: 10, scoutOrder: 4, nuke: 8, nobles: 12, conquestWar: 15, conquest: 5, support: 3,
  orderFailed: -10, scoutFailed: -4, appealLost: -5,
} as const;
/** Merit halves in this many game days (on a normal world; shorter on a fast one). */
export const MERIT_HALF_LIFE_DAYS = 10;
/** Recruits for this many game days after joining (on a normal world). */
export const RECRUIT_DAYS = 3;
/** To take a place: more than this times the holder's merit (plus one point). */
export const OVERTAKE = 1.1;
/** Below this merit you stay a warrior, whatever your place in line. */
export const MIN_FOR_PLACE = 1;
/** The places under the leader, best first; the rest are warriors. */
const SLOTS: Rank[] = ['rechterhand', 'kapitein', 'veteraan', 'veteraan'];
/** How much a rank weighs where the leader decides (appeals). */
export const RANK_WEIGHT: Record<Rank, number> = { leider: 1.8, rechterhand: 1.6, kapitein: 1.4, veteraan: 1.2, krijger: 1, rekruut: 0.8 };

const halfLife = (state: WorldState) => (MERIT_HALF_LIFE_DAYS * DAY) / state.config.worldSpeed;

function tribeOfPlayer(state: WorldState, id: number): Tribe | undefined {
  const tid = state.players[id]?.tribe;
  return tid !== undefined ? state.tribes?.[tid] : undefined;
}

/** A member's merit now (faded). */
export function meritOf(state: WorldState, t: Tribe, id: number): number {
  const e = t.merit?.[id];
  if (!e) return 0;
  return e.p * 0.5 ** ((state.time - e.at) / halfLife(state));
}

function add(state: WorldState, t: Tribe, id: number, delta: number, at = state.time): void {
  const e = t.merit?.[id];
  // an older event (seeding) counts as faded as it would be now
  const now = e ? meritOf(state, t, id) : 0;
  const d = delta * 0.5 ** ((state.time - at) / halfLife(state));
  (t.merit ??= {})[id] = { p: Math.max(0, now + d), at: state.time };
}

/** Merit for something a member did for (or failed) his tribe. */
export function addMerit(state: WorldState, id: number, delta: number): void {
  const t = tribeOfPlayer(state, id);
  if (t) add(state, t, id, delta);
}

export function isRecruit(state: WorldState, t: Tribe, id: number): boolean {
  const at = t.joinedAt?.[id];
  return at !== undefined && state.time - at < (RECRUIT_DAYS * DAY) / state.config.worldSpeed;
}

export function rankOf(state: WorldState, t: Tribe, id: number): Rank {
  if (id === t.leader) return 'leider';
  if (isRecruit(state, t, id)) return 'rekruut';
  const i = (t.order ?? []).indexOf(id);
  // a place takes at least some merit: nobody is captain for doing nothing
  if (meritOf(state, t, id) < MIN_FOR_PLACE) return 'krijger';
  return (i >= 0 ? SLOTS[i] : undefined) ?? 'krijger';
}
export const rankWeight = (state: WorldState, t: Tribe, id: number): number => RANK_WEIGHT[rankOf(state, t, id)];

/** The right hand: the one the tribe looks at when the leader is gone. */
export function rightHand(state: WorldState, t: Tribe): number | undefined {
  const id = t.order?.[0];
  return id !== undefined && rankOf(state, t, id) === 'rechterhand' ? id : undefined;
}

/** Once, for tribes from before ranks: what we still know (your order notes, conquests). */
function seed(state: WorldState, t: Tribe): void {
  t.seeded = true;
  if (t.members.includes(HUMAN_ID) && t.leader !== HUMAN_ID) {
    for (const n of state.standingNotes ?? []) {
      if (n.delta <= 0) continue;
      if (/verkende/.test(n.why)) add(state, t, HUMAN_ID, MERIT.scoutOrder, n.time);
      else if (/order|edels|support die ik vroeg/.test(n.why)) add(state, t, HUMAN_ID, MERIT.order, n.time);
    }
  }
  for (const c of state.worldStats?.conquests ?? []) {
    if (!t.members.includes(c.to) || t.members.includes(c.from)) continue;
    const ft = state.players[c.from]?.tribe;
    add(state, t, c.to, ft !== undefined && t.relations[ft] === 'war' ? MERIT.conquestWar : MERIT.conquest, c.time);
  }
}

/** Places by merit, with a margin to take one; runs with the diplomacy tick. */
export function updateRanks(state: WorldState, t: Tribe): void {
  if (!t.seeded) seed(state, t);
  const before = new Map(t.members.map((m) => [m, rankOf(state, t, m)]));
  const eligible = t.members.filter((m) => m !== t.leader && !isRecruit(state, t, m));
  const m = (id: number) => meritOf(state, t, id);
  const order = (t.order ?? []).filter((id) => eligible.includes(id));
  for (const id of eligible.filter((x) => !order.includes(x)).sort((a, b) => m(b) - m(a))) order.push(id);
  // one bubble pass: you move up past someone only with clearly more
  for (let i = 1; i < order.length; i++) {
    for (let j = i; j > 0 && m(order[j]!) > m(order[j - 1]!) * OVERTAKE + 1; j--) [order[j], order[j - 1]] = [order[j - 1]!, order[j]!];
  }
  t.order = order;
  for (const id of t.members) {
    const was = before.get(id), now = rankOf(state, t, id);
    if (!was || was === now || was === 'leider' || now === 'leider') continue;
    const name = state.players[id]?.name ?? '?';
    const up = RANK_WEIGHT[now] > RANK_WEIGHT[was];
    if (id === HUMAN_ID) {
      addLog(state, { time: state.time, text: `${up ? 'Gepromoveerd' : 'Teruggezet'} in [${t.tag}]: je bent nu ${RANK_NAMES[now].toLowerCase()}.` });
      (state.tribeNews ??= []).push({ time: state.time, text: `Jij bent nu ${RANK_NAMES[now].toLowerCase()} van [${t.tag}].` });
    } else if (t.members.includes(HUMAN_ID) && up && (now === 'rechterhand' || now === 'kapitein')) {
      (state.tribeNews ??= []).push({ time: state.time, text: `${name} is nu ${RANK_NAMES[now].toLowerCase()} van [${t.tag}].` });
    }
  }
}

/** A member joins: a recruit for now. */
export function onJoin(state: WorldState, t: Tribe, id: number): void {
  (t.joinedAt ??= {})[id] = state.time;
}
/** A member leaves: his merit and place go. */
export function onLeave(t: Tribe, id: number): void {
  if (t.merit) delete t.merit[id];
  if (t.joinedAt) delete t.joinedAt[id];
  if (t.order) t.order = t.order.filter((x) => x !== id);
}

/** For the tribe screen: rank and merit of every member, best first. */
export function rankRows(state: WorldState, t: Tribe): RankRow[] {
  const order = [t.leader, ...(t.order ?? [])];
  return t.members
    .map((id) => ({ id, rank: rankOf(state, t, id), merit: Math.round(meritOf(state, t, id)) }))
    .sort((a, b) => {
      const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || RANK_WEIGHT[b.rank] - RANK_WEIGHT[a.rank] || b.merit - a.merit;
    });
}

/** For you: the merit you need to take the next place up (null at the top or as leader/recruit). */
export function nextPlace(state: WorldState, t: Tribe): { rank: Rank; need: number } | null {
  const order = t.order ?? [];
  const i = order.indexOf(HUMAN_ID);
  if (i <= 0) return null;
  // a warrior aims at the last veteran; anyone else at the place right above
  const j = Math.min(i - 1, SLOTS.length - 1);
  const above = order[j]!;
  return { rank: SLOTS[j]!, need: Math.ceil(meritOf(state, t, above) * OVERTAKE + 1) };
}
