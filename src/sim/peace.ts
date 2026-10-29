/**
 * Peace with evacuation (part d of "real wars").
 *
 * A war one side clearly lost ends in a treaty: the loser gives up N border villages (closest to
 * the winner; more the worse he lost). Their troops march out to the owner's nearest other village
 * and support from others goes home. For a few game days the winner may take those villages
 * without a fight; after that (or when they are all taken) there is a NAP.
 * Breaking it (troops back in a ceded village, or attacking the winner) means war again, and a
 * dent in everybody's trust in the loser.
 *
 * Refusing: a bot member who has to give up villages may refuse (small chance; more for an
 * aggressive one, his biggest village, an unhappy member, or a lot of grudge against the winner).
 * His leader then kicks him out (the peace holds, he stands alone) or the war goes on.
 * You: lose as leader and you get the terms in your inbox (sign and evacuate, or fight on); win as
 * leader and the loser's offer comes to you. A member whose villages are ceded gets asked too.
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
  /** signed: evacuated, the window runs. offered: waiting for your answer. */
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

/** How many villages the loser gives up: 1 for a clear defeat, up to 4 for a crushing one. */
export function cessionSize(power: number): number {
  return Math.max(1, Math.min(4, Math.round(power - 1.5)));
}

/** The loser's villages nearest the winner (never a member's last village). */
export function borderVillages(state: WorldState, winner: Tribe, loser: Tribe, n: number): Village[] {
  const c = tribeCentre(state, winner);
  if (!c) return [];
  const pool = loser.members.flatMap((m) => {
    const own = villagesOf(state, m);
    return own.length > 1 ? own : [];
  });
  return pool.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y)).slice(0, n);
}

/** The war ends with a treaty instead of a plain peace. Returns false if there is nothing to cede. */
export function offerTreaty(state: WorldState, winner: Tribe, loser: Tribe, power: number): boolean {
  const villages = borderVillages(state, winner, loser, cessionSize(power));
  if (!villages.length) return false;
  const treaty: Treaty = { id: nextId(state), winner: winner.id, loser: loser.id, villages: villages.map((v) => v.id), status: 'offered', until: state.time + DAY / state.config.worldSpeed };
  (state.treaties ??= []).push(treaty);
  const list = villages.map(where).join(', ');
  // you lead one of the sides: you decide
  if (loser.leader === HUMAN_ID || winner.leader === HUMAN_ID) {
    const youLose = loser.leader === HUMAN_ID;
    const other = youLose ? winner : loser;
    addMessage(state, {
      kind: 'treaty',
      from: other.leader,
      tribe: other.id,
      treaty: treaty.id,
      title: youLose ? `${tag(winner)} biedt vrede, tegen ${villages.length} dorp${villages.length === 1 ? '' : 'en'}` : `${tag(loser)} capituleert`,
      text: youLose
        ? `${tag(winner)} wint de oorlog. Vrede als jullie deze dorpen ontruimen: ${list}. Alle troepen gaan eruit, ${tag(winner)} mag ze ${WINDOW_DAYS} speldagen (snelheid 1) ongehinderd innemen, daarna geldt een NAP. Weigeren = doorvechten.`
        : `${tag(loser)} vraagt om vrede en geeft deze dorpen op: ${list}. Jullie mogen ze ${WINDOW_DAYS} speldagen (snelheid 1) innemen zonder tegenstand, daarna een NAP. Weigeren = de oorlog gaat door.`,
      status: 'open',
      expires: treaty.until,
    });
    if (pauses(state, 'war')) alertHuman(state, `Vredesvoorstel: ${tag(winner)} en ${tag(loser)}.`);
    return true;
  }
  return signTreaty(state, treaty);
}

/** Members asked to give up villages may refuse; the leader decides. Returns whether the treaty stands. */
function settleRefusals(state: WorldState, treaty: Treaty, winner: Tribe, loser: Tribe): boolean {
  const owners = new Set(treaty.villages.map((id) => state.villages[id]?.owner).filter((o): o is number => o !== undefined));
  for (const o of owners) {
    if (o === loser.leader) continue;
    const p = state.players[o];
    if (o === HUMAN_ID) {
      // you are a member: you are asked, and your villages are evacuated only if you agree
      const mine = treaty.villages.map((id) => state.villages[id]!).filter((v) => v.owner === HUMAN_ID);
      treaty.yours = mine.map((v) => v.id);
      treaty.villages = treaty.villages.filter((id) => !treaty.yours!.includes(id));
      addMessage(state, {
        kind: 'treaty',
        from: loser.leader,
        tribe: loser.id,
        treaty: treaty.id,
        title: `Vrede: jij moet ${mine.length} dorp${mine.length === 1 ? '' : 'en'} opgeven`,
        text: `${tag(loser)} sluit vrede met ${tag(winner)}. Jouw leider vraagt je ${mine.map(where).join(', ')} te ontruimen. Weigeren kan: dan zet je leider je misschien uit de stam.`,
        status: 'open',
        expires: treaty.until,
      });
      continue;
    }
    if (!p?.bot) continue;
    const own = villagesOf(state, o);
    const ceded = own.filter((v) => treaty.villages.includes(v.id));
    const biggest = own.reduce((a, b) => (villagePoints(state.config, a) >= villagePoints(state.config, b) ? a : b));
    const chance = 0.05 * (1 + AGGRESSION[p.bot.archetype])
      + (ceded.includes(biggest) ? 0.15 : 0)
      + (moodOf(p) < 40 ? 0.1 : 0)
      + 0.1 * Math.min(1, grudge(state, p, winner.leader));
    if (nextFloat(state.rng) >= chance) continue;
    // he refuses: kick him (the peace holds without his villages), or fight on
    const kick = nextFloat(state.rng) < 0.6;
    if (kick) {
      leave(state, p);
      treaty.villages = treaty.villages.filter((id) => state.villages[id]?.owner !== o);
      addNews(state, { kind: 'treaty', tribes: [loser.id, winner.id], players: [p.id], ...between(state, loser, winner), dry: `${p.name} weigert zijn dorpen op te geven: ${tag(loser)} zet hem uit de stam.`, head: [`${p.name} weigert te buigen en vliegt uit ${tag(loser)}`] });
    } else {
      addNews(state, { kind: 'talksFailed', tribes: [loser.id, winner.id], players: [p.id], ...between(state, loser, winner), dry: `${p.name} weigert zijn dorpen op te geven: ${tag(loser)} vecht door tegen ${tag(winner)}.`, head: [`Vrede op het laatste moment geklapt: ${p.name} houdt zijn dorpen`, `${tag(loser)} vecht door: ${p.name} weigert ook maar één dorp af te staan`] });
      return false;
    }
  }
  return true;
}

/** Both sides agree: the ceded villages are emptied and the window starts. */
export function signTreaty(state: WorldState, treaty: Treaty): boolean {
  const winner = state.tribes?.[treaty.winner], loser = state.tribes?.[treaty.loser];
  if (!winner || !loser) { drop(state, treaty); return false; }
  if (!settleRefusals(state, treaty, winner, loser)) { drop(state, treaty); return false; }
  // your own villages wait for your answer (if you are a member)
  for (const id of treaty.villages) {
    const v = state.villages[id];
    if (v) evacuate(state, v);
  }
  treaty.status = 'signed';
  treaty.signedAt = state.time;
  treaty.until = state.time + (WINDOW_DAYS * DAY) / state.config.worldSpeed;
  setRelation(state, winner, loser, 'nap', true);
  const names = treaty.villages.map((id) => state.villages[id]).filter((v): v is Village => !!v).map(where).join(', ');
  const n = treaty.villages.length;
  addNews(state, { kind: 'treaty', tribes: [winner.id, loser.id], ...between(state, winner, loser), dry: `Vrede tussen ${tag(winner)} en ${tag(loser)}: ${tag(loser)} ontruimt ${names}.`,
    head: [`Vrede getekend: ${tag(loser)} betaalt met ${n} dorp${n === 1 ? '' : 'en'} aan ${tag(winner)}`, `${tag(winner)} dicteert de vrede, ${tag(loser)} moet ${n} dorp${n === 1 ? '' : 'en'} opgeven`] });
  return true;
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
    if (treaty.status === 'offered') {
      if (state.time > treaty.until) drop(state, treaty);
      continue;
    }
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

/** Your answer to a treaty in the inbox (leader of either side, or a member asked to evacuate). */
export function answerTreaty(state: WorldState, treatyId: number, accept: boolean): string | null {
  const treaty = state.treaties?.find((t) => t.id === treatyId);
  if (!treaty) return 'Dit verdrag bestaat niet meer.';
  const winner = state.tribes?.[treaty.winner], loser = state.tribes?.[treaty.loser];
  if (!winner || !loser) { drop(state, treaty); return 'Een van de stammen bestaat niet meer.'; }
  if (treaty.status === 'offered') {
    // you lead a side
    if (!accept) {
      drop(state, treaty);
      addLog(state, { time: state.time, text: `Je wijst de vrede af: de oorlog tussen ${tag(winner)} en ${tag(loser)} gaat door.` });
      return null;
    }
    return signTreaty(state, treaty) ? null : 'Het verdrag ging niet door (iemand weigerde zijn dorpen op te geven).';
  }
  // signed, and you are a member whose villages are asked
  const mine = (treaty.yours ?? []).map((id) => state.villages[id]).filter((v): v is Village => !!v && v.owner === HUMAN_ID);
  delete treaty.yours;
  if (!mine.length) return 'Die dorpen zijn niet meer van jou.';
  if (accept) {
    for (const v of mine) evacuate(state, v);
    treaty.villages.push(...mine.map((v) => v.id));
    addLog(state, { time: state.time, text: `Je ontruimt ${mine.map(where).join(', ')}.` });
    return null;
  }
  // you refuse: your bot leader decides (mostly: out)
  const me = state.players[HUMAN_ID]!;
  if (nextFloat(state.rng) < 0.6) {
    leave(state, me);
    addLog(state, { time: state.time, text: `Je weigert je dorpen op te geven. ${tag(loser)} zet je uit de stam.` });
  } else {
    addLog(state, { time: state.time, text: `Je weigert je dorpen op te geven. ${tag(loser)} laat het zo, maar je aanzien daalt.` });
    state.standing = Math.max(0, (state.standing ?? 60) - 15);
  }
  return null;
}

/** Is this village ceded by its own tribe (the window is running)? Its owner leaves it alone. */
export function cededAway(state: WorldState, villageId: number): boolean {
  if (!state.treaties?.length) return false;
  return state.treaties.some((x) => x.status === 'signed' && x.villages.includes(villageId) && state.time <= x.until);
}
