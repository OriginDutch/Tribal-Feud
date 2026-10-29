/**
 * Help in attacks, as a term of peace talks: every member of the losing tribe owes attacks on a
 * tribe the winner chose, at least `space` farm space of offensive troops in total (from all his
 * villages together, so 50 axes from one village don't count as help) within DUTY_DAYS.
 *
 * Who doesn't deliver while he could: his standing drops to just above the line where he is put
 * out of the tribe (a bot's mood, your standing with a bot leader). A second miss within
 * STRIKE_DAYS and he is out. Who couldn't do anything (not enough troops, or not allowed to attack
 * that tribe) gets nothing.
 */
import { DAY } from '../shared/time';
import type { UnitCounts, UnitId } from '../shared/gameData';
import { changeMood, changeStanding } from './loyalty';
import { distance, sendAttack } from './movement';
import { addNews } from './news';
import { HUMAN_ID, addLog, villagesOf, type WorldState } from './state';
import { between, leave, mayAttack, type Tribe } from './tribes';

export const DUTY_DAYS = 3;
export const STRIKE_DAYS = 7;
/** What counts as offensive troops. */
export const OFFENSIVE: UnitId[] = ['axe', 'light', 'marcher', 'ram', 'catapult'];
/** Just above the line: a bot leaves below 25, you are put out below 20. */
const BOT_FLOOR = 27;
const HUMAN_FLOOR = 22;

export interface Duty {
  id: number;
  /** The losing tribe, whose members owe the help. */
  tribe: number;
  winner: number;
  /** The tribe to attack. */
  target: number;
  /** Farm space of offensive troops each member owes. */
  space: number;
  due: number;
  /** Farm space sent so far, per member. */
  sent: Record<number, number>;
}

export function offensiveSpace(state: WorldState, units: UnitCounts): number {
  let sum = 0;
  for (const u of OFFENSIVE) sum += (units[u] ?? 0) * state.config.units[u].pop;
  return sum;
}

/** All offensive troops a player has at home. */
function homeSpace(state: WorldState, id: number): number {
  let sum = 0;
  for (const v of villagesOf(state, id)) sum += offensiveSpace(state, v.units);
  return sum;
}

export function addDuty(state: WorldState, winner: Tribe, loser: Tribe, target: number, space: number): void {
  if (space <= 0 || !state.tribes?.[target]) return;
  (state.duties ??= []).push({ id: state.nextId++, tribe: loser.id, winner: winner.id, target, space, due: state.time + (DUTY_DAYS * DAY) / state.config.worldSpeed, sent: {} });
  if (loser.members.includes(HUMAN_ID)) {
    const t = state.tribes[target]!;
    addLog(state, { time: state.time, text: `Vredesvoorwaarde: val [${t.tag}] aan met samen minstens ${space} boerderijplekken aan aanvalstroepen, binnen ${DUTY_DAYS} speldagen (snelheid 1).` });
  }
}

/** An attack went out: does it count for a duty? */
export function creditDuty(state: WorldState, owner: number, targetOwner: number, units: UnitCounts): void {
  if (!state.duties?.length) return;
  const mine = state.players[owner]?.tribe, theirs = state.players[targetOwner]?.tribe;
  if (mine === undefined || theirs === undefined) return;
  for (const d of state.duties) if (d.tribe === mine && d.target === theirs) d.sent[owner] = (d.sent[owner] ?? 0) + offensiveSpace(state, units);
}

/** Bots do their part: their offensive troops go to the nearest village of the target tribe. */
function botsHelp(state: WorldState, d: Duty): void {
  const tribe = state.tribes?.[d.tribe], target = state.tribes?.[d.target];
  if (!tribe || !target) return;
  const targets = target.members.flatMap((m) => villagesOf(state, m));
  if (!targets.length) return;
  for (const m of tribe.members) {
    const p = state.players[m];
    if (!p?.bot || (d.sent[m] ?? 0) >= d.space) continue;
    if (p.bot.awayUntil !== undefined && p.bot.awayUntil > state.time) continue;
    for (const v of villagesOf(state, m)) {
      if ((d.sent[m] ?? 0) >= d.space) break;
      const army: UnitCounts = {};
      for (const u of OFFENSIVE) if (v.units[u] > 0) army[u] = v.units[u];
      if (offensiveSpace(state, army) < 50) continue;
      const to = targets.filter((x) => mayAttack(state, m, x.owner)).sort((a, b) => distance(a, v) - distance(b, v))[0];
      if (!to) break;
      sendAttack(state, v.id, to.id, army);
    }
  }
}

/** Diplomacy tick: bots help, and at the deadline everybody is judged. */
export function dutiesTick(state: WorldState): void {
  if (!state.duties?.length) return;
  for (const d of [...state.duties]) {
    const tribe = state.tribes?.[d.tribe];
    if (!tribe || !state.tribes?.[d.target]) { drop(state, d); continue; }
    if (state.time <= d.due) { botsHelp(state, d); continue; }
    drop(state, d);
    for (const m of [...tribe.members]) judge(state, d, tribe, m);
  }
}

function drop(state: WorldState, d: Duty): void {
  state.duties = (state.duties ?? []).filter((x) => x.id !== d.id);
}

function judge(state: WorldState, d: Duty, tribe: Tribe, m: number): void {
  if ((d.sent[m] ?? 0) >= d.space) return;
  const target = state.tribes![d.target]!;
  const p = state.players[m];
  if (!p) return;
  // couldn't: not enough troops (also what he already sent counts), or not allowed to attack them
  const allowed = target.members.some((x) => mayAttack(state, m, x));
  if (!allowed || homeSpace(state, m) + (d.sent[m] ?? 0) < d.space) return;
  const strikes = (state.dutyStrikes ??= {});
  const again = strikes[m] !== undefined && state.time - strikes[m]! <= (STRIKE_DAYS * DAY) / state.config.worldSpeed;
  strikes[m] = state.time;
  if (again && m !== tribe.leader) {
    leave(state, p);
    const v = villagesOf(state, m)[0];
    addNews(state, { kind: 'leader', tribes: [tribe.id], players: [m], ...(v ? { x: v.x, y: v.y } : between(state, tribe, target)),
      dry: `[${tribe.tag}] zet ${p.name} uit de stam: hij hielp weer niet bij de aanvallen op [${target.tag}].`,
      head: [`Geduld op bij [${tribe.tag}]: ${p.name} eruit gegooid`, `${p.name} komt zijn belofte niet na en vliegt uit [${tribe.tag}]`] });
    if (m === HUMAN_ID) addLog(state, { time: state.time, text: `Je hielp opnieuw niet bij de aanvallen op [${target.tag}]: [${tribe.tag}] zet je uit de stam.` });
    return;
  }
  if (m === HUMAN_ID) {
    const now = state.standing ?? 60;
    if (now > HUMAN_FLOOR) changeStanding(state, HUMAN_FLOOR - now, `je hielp niet bij de aanvallen op [${target.tag}]`);
    addLog(state, { time: state.time, text: `Je hielp niet (genoeg) bij de aanvallen op [${target.tag}]. Je aanzien in [${tribe.tag}] is bijna op: nog één keer en je ligt eruit.` });
  } else if (p.bot) {
    const now = p.bot.mood ?? 60;
    if (now > BOT_FLOOR) changeMood(state, p, BOT_FLOOR - now, `hielp niet bij de aanvallen op [${target.tag}]`);
  }
}

/** For the view: your open duty. */
export function dutyOf(state: WorldState, id: number): { target: number; space: number; sent: number; due: number } | null {
  const t = state.players[id]?.tribe;
  const d = (state.duties ?? []).find((x) => x.tribe === t);
  return d ? { target: d.target, space: d.space, sent: d.sent[id] ?? 0, due: d.due } : null;
}
