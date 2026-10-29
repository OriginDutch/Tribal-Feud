/**
 * Peace with evacuation: carrying out the villages part of a peace agreed in the talks (see talks).
 *
 * The ceded villages are emptied: their troops march out to the owner's nearest other village and
 * support from others goes home. For a few game days the winner may take them without a fight;
 * after that (or when they are all taken) there is a NAP.
 * Breaking it (troops back in a ceded village, or attacking the winner) means war again, and a
 * dent in everybody's trust in the loser.
 */
import { DAY } from '../shared/time';
import { UNIT_IDS, type UnitCounts } from '../shared/gameData';
import { villagePoints } from './barbarians';
import { addMessage, alertHuman, pauses } from './humanTribe';
import { moodOf } from './loyalty';
import { distance, returnSupport, travelTimeMs } from './movement';
import { push } from './eventQueue';
import { nextFloat } from './rng';
import { HUMAN_ID, addLog, addMovement, nextId, villagesOf, type WorldState } from './state';
import { addNews } from './news';
import { AGGRESSION, between, declareWar, leave, setRelation, tribeCentre, tribeOf, type Tribe } from './tribes';
import { grudge } from './botReact';
import { addFriction } from './warCause';
import type { Village } from './village';

export interface Treaty {
  id: number;
  winner: number;
  loser: number;
  /** The ceded villages. */
  villages: number[];
  /** signed: evacuated, the window runs ('offered' only in saves from before the peace talks). */
  status: 'offered' | 'signed';
  /** End of the window for the winner (signed), or of the offer. */
  until: number;
  /** When it was signed: attacks sent before that were part of the war. */
  signedAt?: number;
  /** Your villages (as a member) waiting for your answer: in `villages` only once you agree. */
  yours?: number[];
}

const WINDOW_DAYS = 2;
const tag = (t: Tribe) => `[${t.tag}]`;
const where = (v: Village) => `${v.name} (${v.x}|${v.y})`;

/**
 * A signed peace (see talks): the ceded villages are emptied and the window starts in which the
 * winner may take them without a fight. Afterwards (or once all are taken) a NAP remains.
 */
export function cedeVillages(state: WorldState, winner: Tribe, loser: Tribe, villages: number[]): void {
  setRelation(state, winner, loser, 'nap', true);
  if (!villages.length) return;
  const treaty: Treaty = { id: nextId(state), winner: winner.id, loser: loser.id, villages, status: 'signed', until: state.time + (WINDOW_DAYS * DAY) / state.config.worldSpeed, signedAt: state.time };
  (state.treaties ??= []).push(treaty);
  for (const id of villages) {
    const v = state.villages[id];
    if (v) evacuate(state, v);
  }
  const mine = villages.map((id) => state.villages[id]).filter((v): v is Village => !!v && v.owner === HUMAN_ID);
  if (mine.length) addLog(state, { time: state.time, text: `Vrede met ${tag(winner)}: je ontruimt ${mine.map(where).join(', ')}.` });
}

function drop(state: WorldState, treaty: Treaty): void {
  state.treaties = (state.treaties ?? []).filter((t) => t.id !== treaty.id);
}

/** All troops out: the village's own march to the owner's nearest other village, support goes home. */
export function evacuate(state: WorldState, v: Village): void {
  for (const origin of Object.keys(v.support ?? {})) returnSupport(state, v.owner, v.id, Number(origin));
  const home = villagesOf(state, v.owner).filter((w) => w.id !== v.id).sort((a, b) => distance(a, v) - distance(b, v))[0];
  const units: UnitCounts = {};
  for (const u of UNIT_IDS) if (v.units[u] > 0) { units[u] = v.units[u]; v.units[u] = 0; }
  if (!home || !Object.keys(units).length) return;
  // a march home that does not depend on the ceded village (it may be taken before they arrive)
  for (const u of UNIT_IDS) home.outside[u] += units[u] ?? 0;
  const m = { id: nextId(state), kind: 'return' as const, owner: v.owner, from: home.id, to: home.id, units, sent: state.time, arrives: state.time + travelTimeMs(state, units, distance(v, home)) };
  addMovement(state, m);
  push(state.queue, m.arrives, { kind: 'arrive', movementId: m.id });
  for (const r of v.recruitQueues ? Object.values(v.recruitQueues) : []) r.length = 0;
}

/** May this player attack this village because it was ceded to his tribe? */
export function cededTo(state: WorldState, attacker: number, villageId: number): boolean {
  if (!state.treaties?.length) return false;
  const t = tribeOf(state, attacker);
  if (!t) return false;
  return state.treaties.some((x) => x.status === 'signed' && x.winner === t.id && x.villages.includes(villageId) && state.time <= x.until);
}

/** Diplomacy tick: offers that ran out, windows that closed, and broken treaties. */
export function treatiesTick(state: WorldState): void {
  for (const treaty of [...(state.treaties ?? [])]) {
    const winner = state.tribes?.[treaty.winner], loser = state.tribes?.[treaty.loser];
    if (!winner || !loser) { drop(state, treaty); continue; }
    if (treaty.status !== 'signed') { drop(state, treaty); continue; }
    const open = treaty.villages.filter((id) => tribeOf(state, state.villages[id]?.owner ?? -1)?.id === loser.id);
    // done: the window closed, or everything was taken
    if (state.time > treaty.until || !open.length) { drop(state, treaty); continue; }
    // troops that came home there (from farming, recruits) march out again; support sent there by
    // the losing side on purpose breaks the treaty
    let reinforced = false;
    for (const id of open) {
      const v = state.villages[id]!;
      for (const origin of Object.keys(v.support ?? {})) {
        const o = state.villages[Number(origin)];
        if (o && tribeOf(state, o.owner)?.id === loser.id && UNIT_IDS.some((u) => u !== 'spy' && (v.support![Number(origin)]![u] ?? 0) > 0)) reinforced = true;
      }
      if (!reinforced && UNIT_IDS.some((u) => v.units[u] > 0)) evacuate(state, v);
    }
    if (reinforced) breakTreaty(state, treaty, winner, loser, 'stuurde weer verdediging naar een ontruimd dorp');
  }
}

/** The loser attacked the winner during the window, or re-garrisoned: war again, and nobody trusts him. */
export function onTreatyAttack(state: WorldState, attacker: number, defender: number, sent: number): void {
  if (!state.treaties?.length) return;
  const ta = tribeOf(state, attacker), td = tribeOf(state, defender);
  if (!ta || !td) return;
  // attacks already underway when it was signed were part of the war
  const t = state.treaties.find((x) => x.status === 'signed' && x.loser === ta.id && x.winner === td.id && sent >= (x.signedAt ?? 0));
  if (t) breakTreaty(state, t, td, ta, 'viel aan tijdens het verdrag');
}

function breakTreaty(state: WorldState, treaty: Treaty, winner: Tribe, loser: Tribe, why: string): void {
  drop(state, treaty);
  addNews(state, { kind: 'talksFailed', tribes: [loser.id, winner.id], ...between(state, loser, winner), dry: `${tag(loser)} ${why}: het vredesverdrag met ${tag(winner)} is gebroken.`, head: [`Vrede van korte duur: ${tag(loser)} breekt het verdrag met ${tag(winner)}`] });
  declareWar(state, winner, loser, true, 'na een gebroken verdrag');
  // a dent in everybody's trust: friction with all its neighbours
  for (const other of Object.values(state.tribes ?? {})) if (other.id !== loser.id && other.leader !== undefined) addFriction(state, other.leader, loser.leader, 2, 'treaty');
}

/** Is this village ceded by its own tribe (the window is running)? Its owner leaves it alone. */
export function cededAway(state: WorldState, villageId: number): boolean {
  if (!state.treaties?.length) return false;
  return state.treaties.some((x) => x.status === 'signed' && x.villages.includes(villageId) && state.time <= x.until);
}
