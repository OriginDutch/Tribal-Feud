/**
 * The nobles of a joint attack. Every member with a noble train ready (NOBLE_MIN nobles within
 * noble range) is a candidate, you too; the closer, the likelier to be drawn, never certain.
 * A candidate who lost the draw may appeal (it costs standing or mood, won or lost); the leader
 * decides on sensible grounds (distance, nobles, how he gets on with you) and favours himself.
 * Whoever loses the appeal agrees, or leaves the tribe as an outlaw. You can also give your
 * nobles away to another candidate.
 */
import type { Archetype } from '../shared/botProfiles';
import { DAY, MINUTE, formatGameTime, gameTimeT } from '../shared/time';
import { T, tr, txt } from '../shared/i18n';
import { push } from './eventQueue';
import { addMessage, alertHuman } from './humanTribe';
import { betray, changeMood, changeStanding, moodOf } from './loyalty';
import { MERIT, addMerit, rankWeight } from './ranks';
import { distance, freeUnits, travelTimeMs } from './movement';
import { nextFloat } from './rng';
import { HUMAN_ID, addLog, type Player, type WorldState } from './state';
import { OUTLAW_DAYS } from './talks';
import { leave, type Tribe } from './tribes';
import type { TribeOp } from './warOps';
import { isOperational, type Village } from './village';

/** A noble train: at least this many nobles (you send as many as you like, up to a train of 5). */
export const NOBLE_MIN = 4;
/** The nobles land this long after the armies. */
export const NOBLE_LAG = 30_000;
/** What an appeal costs: standing (you) or mood (a bot), won or lost. */
export const APPEAL_COST = 5;
/** How likely a bot that lost the draw to you appeals. */
const APPEAL: Record<Archetype, number> = { rusher: 0.3, opportunist: 0.3, farmer: 0.1, turtle: 0.08, diplomat: 0.05, supporter: 0.02 };
/** A bot that lost its appeal and is unhappy (mood under REBEL_MOOD) may leave as an outlaw. */
const REBEL: Partial<Record<Archetype, number>> = { rusher: 0.15, opportunist: 0.15 };
const REBEL_MOOD = 30;
/** ...half as likely against a higher rank, 1.5x against a lower one. */
const REBEL_VS_HIGHER = 0.5;
const REBEL_VS_LOWER = 1.5;
/** The leader decides in his own favour this much more strongly. */
const LEADER_SELF = 3;
/** When you were drawn and the leader was a candidate too: the chance he takes them himself. */
const LEADER_TAKES = 0.25;
/** A bot you give your nobles to likes you this much more. */
const GIFT_MOOD = 3;

export interface NobleCandidate { member: number; village: number; d: number }

/** The closer, the likelier: never zero. */
export const nobleWeight = (d: number): number => 1 / (d + 5) ** 2;

const snobsOf = (state: WorldState, v: Village): number => (v.owner === HUMAN_ID ? freeUnits(state, v).snob : v.units.snob);
const tag = (t: Tribe) => `[${t.tag}]`;

/** Each member's nearest village with a noble train that lands by `deadline` (if given). */
export function nobleCandidates(state: WorldState, t: Tribe, target: Village, humanOk: boolean, deadline?: number): NobleCandidate[] {
  const out: NobleCandidate[] = [];
  for (const m of t.members) {
    if (m === HUMAN_ID ? !humanOk : !state.players[m]?.bot) continue;
    let best: NobleCandidate | undefined;
    for (const v of Object.values(state.villages)) {
      if (v.owner !== m || snobsOf(state, v) < NOBLE_MIN || !isOperational(state.config, v, 'place')) continue;
      const d = distance(v, target);
      if (d > state.config.conquest.maxDistance) continue;
      if (deadline !== undefined && state.time + travelTimeMs(state, { snob: 1 }, d) > deadline) continue;
      if (!best || d < best.d) best = { member: m, village: v.id, d };
    }
    if (best) out.push(best);
  }
  return out;
}

/** The draw: weighted by distance. */
export function drawNobles(state: WorldState, cands: NobleCandidate[]): NobleCandidate | undefined {
  const total = cands.reduce((a, c) => a + nobleWeight(c.d), 0);
  let r = nextFloat(state.rng) * total;
  for (const c of cands) if ((r -= nobleWeight(c.d)) <= 0) return c;
  return cands[cands.length - 1];
}

/** A strong own army counts: whoever clears himself, nobles more safely. Full weight at this much attack. */
export const ARMY_FULL = 300_000;
/** ...worth at most this much extra (x1.5). */
export const ARMY_BONUS = 0.5;

/** Attack strength of a village's own offensive troops. */
function armyAttack(state: WorldState, v: Village): number {
  const free = v.owner === HUMAN_ID ? freeUnits(state, v) : v.units;
  let a = 0;
  for (const u of ['axe', 'light', 'marcher', 'ram', 'catapult'] as const) a += free[u] * state.config.units[u].attack;
  return a;
}

/**
 * The leader decides between two candidates: distance, nobles, how he gets on with them, their
 * rank in the tribe and their own army; himself first.
 */
export function leaderPicks(state: WorldState, t: Tribe, a: NobleCandidate, b: NobleCandidate): NobleCandidate {
  const score = (c: NobleCandidate) => {
    const v = state.villages[c.village];
    const nobles = v ? Math.min(2, snobsOf(state, v) / NOBLE_MIN) : 0;
    const rel = c.member === HUMAN_ID ? (state.standing ?? 60) : moodOf(state.players[c.member]!);
    const army = v ? 1 + ARMY_BONUS * Math.min(1, armyAttack(state, v) / ARMY_FULL) : 1;
    return nobleWeight(c.d) * nobles * (0.5 + rel / 100) * rankWeight(state, t, c.member) * army * (c.member === t.leader ? LEADER_SELF : 1) * (0.85 + 0.3 * nextFloat(state.rng));
  };
  return score(a) >= score(b) ? a : b;
}

/** Out of the tribe, hunted by it for a while (a ruling you would not accept). */
export function outlawFrom(state: WorldState, p: Player, t: Tribe): void {
  leave(state, p);
  (state.outlaws ??= {})[p.id] = { tribes: [t.id], until: state.time + (OUTLAW_DAYS * DAY) / state.config.worldSpeed };
}

const nameOf = (state: WorldState, id: number) => state.players[id]?.name ?? '?';

/**
 * At the launch of a joint attack: who brings the nobles. You were drawn and a bot appeals: the
 * leader decides at once (and you hear it). Returns the winner, and the losing candidates.
 */
export function chooseNobles(state: WorldState, t: Tribe, cands: NobleCandidate[]): NobleCandidate | undefined {
  let winner = drawNobles(state, cands);
  if (winner?.member !== HUMAN_ID) return winner;
  const lost = cands.filter((c) => c.member !== HUMAN_ID);
  const bot = lost.find((c) => { const p = state.players[c.member]; return p?.bot && c.member !== t.leader && nextFloat(state.rng) < APPEAL[p.bot.archetype]; })
    ?? lost.find((c) => c.member === t.leader && nextFloat(state.rng) < LEADER_TAKES);
  if (!bot) return winner;
  const p = state.players[bot.member]!;
  if (bot.member !== t.leader) changeMood(state, p, -APPEAL_COST, T('ging in beroep over de edels'));
  const ruling = bot.member === t.leader ? bot : leaderPicks(state, t, winner, bot);
  if (ruling.member === HUMAN_ID) {
    const text = tr('{name} ging in beroep tegen jou als edelaar, maar {leader} houdt het bij jou.', { name: p.name, leader: nameOf(state, t.leader) });
    addLog(state, { time: state.time, text });
    addMerit(state, p.id, MERIT.appealLost);
    rebelMaybe(state, t, p, winner.member);
    return winner;
  }
  winner = ruling;
  // you lose them: agree, or leave
  addMessage(state, {
    kind: 'request', from: t.leader, tribe: t.id, title: T('De edels gaan naar {name}', { name: p.name }), status: 'open', expires: state.time + DAY / 2,
    request: { type: 'verdict', op: -1, village: bot.village },
    text: bot.member === t.leader
      ? T('Je werd getrokken voor de edels, maar {name} neemt ze als leider zelf. Akkoord, of ben je het oneens? Oneens betekent: je verlaat {tag} en bent een tijd vogelvrij.', { name: p.name, tag: tag(t) })
      : T('Je werd getrokken voor de edels, maar {name} ging in beroep en {leader} gaf hem gelijk. Akkoord, of ben je het oneens? Oneens betekent: je verlaat {tag} en bent een tijd vogelvrij.', { name: p.name, leader: nameOf(state, t.leader), tag: tag(t) }),
  });
  alertHuman(state, tr('De edels gaan naar {name}', { name: p.name }));
  return winner;
}

/**
 * A bot that lost its appeal: an unhappy rusher or opportunist may leave. Against a higher rank
 * he gives in more easily. A rusher leaves as an outlaw; an opportunist defects to an enemy.
 */
function rebelMaybe(state: WorldState, t: Tribe, p: Player, winner: number): void {
  const base = REBEL[p.bot?.archetype ?? 'diplomat'] ?? 0;
  const chance = base * (rankWeight(state, t, winner) > rankWeight(state, t, p.id) ? REBEL_VS_HIGHER : REBEL_VS_LOWER);
  if (!chance || moodOf(p) >= REBEL_MOOD || nextFloat(state.rng) >= chance) return;
  if (p.bot?.archetype === 'opportunist') return betray(state, p, t, T('de edels gingen naar een ander'));
  outlawFrom(state, p, t);
  const text = T('{name} is het niet eens met de beslissing over de edels en verlaat {tag}: vogelvrij.', { name: p.name, tag: tag(t) });
  addLog(state, { time: state.time, text: txt(text) });
  (state.tribeNews ??= []).push({ time: state.time, text });
}

/** You lost the draw (or the leader took them): the appeal offer. */
export function offerAppeal(state: WorldState, t: Tribe, op: TribeOp, winner: NobleCandidate, you: NobleCandidate): void {
  const p = state.players[winner.member];
  const role = op.roles.find((r) => r.kind === 'nobles');
  const q = {
    village: state.villages[op.target]?.name ?? '?', time: gameTimeT(op.landAt), name: p?.name ?? '?',
    d: Math.round(winner.d * 10) / 10, you: Math.round(you.d * 10) / 10, cost: APPEAL_COST, leader: nameOf(state, t.leader),
  };
  addMessage(state, {
    kind: 'request', from: t.leader, tribe: t.id, title: T('{name} edelt {village}', { name: p?.name ?? '?', village: state.villages[op.target]?.name ?? '?' }), status: 'open',
    expires: role ? role.launchAt : op.landAt,
    request: { type: 'appeal', op: op.id, village: you.village },
    text: winner.member === t.leader
      ? T('Bij de gezamenlijke aanval op {village} ({time}) brengt {name} de edels: getrokken op afstand ({d} velden, jij {you}). Oneens? In beroep gaan kost {cost} aanzien, ook als je verliest; {leader} beslist, en hij is zelf de edelaar.', q)
      : T('Bij de gezamenlijke aanval op {village} ({time}) brengt {name} de edels: getrokken op afstand ({d} velden, jij {you}). Oneens? In beroep gaan kost {cost} aanzien, ook als je verliest; {leader} beslist.', q),
  });
}

function opOf(state: WorldState, opId: number): { t: Tribe; op: TribeOp } | undefined {
  const tid = state.players[HUMAN_ID]?.tribe;
  const t = tid !== undefined ? state.tribes?.[tid] : undefined;
  const op = t?.ops?.find((o) => o.id === opId);
  return t && op ? { t, op } : undefined;
}

/** Hands the nobles role to a candidate (a bot): its launch is scheduled. False when it can't make it. */
function handTo(state: WorldState, t: Tribe, op: TribeOp, c: NobleCandidate): boolean {
  const i = op.roles.findIndex((r) => r.kind === 'nobles');
  const v = state.villages[c.village];
  if (i < 0 || !v) return false;
  const launchAt = op.landAt + NOBLE_LAG - travelTimeMs(state, { snob: 1 }, c.d);
  if (launchAt < state.time) return false;
  op.roles[i] = { member: c.member, village: c.village, kind: 'nobles', launchAt };
  push(state.queue, launchAt, { kind: 'opLaunch', tribe: t.id, op: op.id, role: i });
  return true;
}

/** Your nobles order is off the table without blame (given away, lost an appeal, the armies didn't go). */
export function dropNoblesOrder(state: WorldState, opId: number): void {
  if (state.leaderOrder?.nobles && state.leaderOrder.op === opId) delete state.leaderOrder;
  for (const m of state.inbox ?? []) if (m.status === 'open' && m.request?.type === 'order' && m.request.nobles && m.request.op === opId) m.status = 'expired';
  const target = opOf(state, opId)?.op.target;
  if (target !== undefined && state.planned?.length) state.planned = state.planned.filter((p) => !(p.to === target && p.waves.some((w) => w.snob)));
}

/** The others who could bring the nobles instead of you, nearest first (still in time). */
export function giveOptions(state: WorldState, opId: number): NobleCandidate[] {
  const x = opOf(state, opId);
  const target = x ? state.villages[x.op.target] : undefined;
  if (!x || !target) return [];
  return nobleCandidates(state, x.t, target, false, x.op.landAt + NOBLE_LAG).sort((a, b) => a.d - b.d);
}

/** You give your nobles to another candidate (no blame, he likes it). */
export function giveNobles(state: WorldState, opId: number, member: number): string | null {
  const x = opOf(state, opId);
  if (!x) return tr('Die aanval loopt niet meer.');
  const role = x.op.roles.find((r) => r.kind === 'nobles');
  if (!role || role.member !== HUMAN_ID || role.state) return tr('Jij brengt de edels niet (meer).');
  const c = giveOptions(state, opId).find((o) => o.member === member);
  if (!c || !handTo(state, x.t, x.op, c)) return tr('Die haalt het niet meer op tijd.');
  dropNoblesOrder(state, opId);
  const p = state.players[member];
  changeMood(state, p, GIFT_MOOD, T('je gaf hem de edels'));
  addLog(state, { time: state.time, text: tr('Je geeft de edels voor {village} aan {name}.', { village: state.villages[x.op.target]?.name ?? '?', name: p?.name ?? '?' }) });
  return null;
}

/** You said no to your nobles order: the next candidate takes them (the no costs as any no). */
export function passNobles(state: WorldState, opId: number): void {
  const x = opOf(state, opId);
  const role = x?.op.roles.find((r) => r.kind === 'nobles');
  if (!x || !role || role.member !== HUMAN_ID) return;
  const next = giveOptions(state, opId)[0];
  if (next && handTo(state, x.t, x.op, next)) return;
  x.op.roles = x.op.roles.filter((r) => r !== role);
}

/** Your answer to the appeal offer: yes = appeal (the leader decides now). */
export function answerAppeal(state: WorldState, opId: number, village: number, accept: boolean): string | null {
  if (!accept) return null;
  const x = opOf(state, opId);
  const role = x?.op.roles.find((r) => r.kind === 'nobles');
  const target = x ? state.villages[x.op.target] : undefined;
  if (!x || !role || !target || role.state || role.member === HUMAN_ID) return tr('Daar valt niets meer over te beslissen.');
  if (x.op.appealed) return tr('Over deze edels is al een beroep geweest.');
  if (state.leaderOrder || (state.inbox ?? []).some((m) => m.status === 'open' && m.request?.type === 'order' && m.request.order !== 'scout')) return tr('Je hebt al een opdracht lopen.');
  const deadline = x.op.landAt + NOBLE_LAG;
  const you = nobleCandidates(state, x.t, target, true, deadline).find((c) => c.member === HUMAN_ID && c.village === village)
    ?? nobleCandidates(state, x.t, target, true, deadline).find((c) => c.member === HUMAN_ID);
  if (!you) return tr('Je haalt het niet meer op tijd met een volle trein.');
  x.op.appealed = true;
  changeStanding(state, -APPEAL_COST, T('je ging in beroep over de edels'));
  const holder: NobleCandidate = { member: role.member, village: role.village, d: distance(state.villages[role.village] ?? target, target) };
  const leader = nameOf(state, x.t.leader);
  if (leaderPicks(state, x.t, you, holder).member === HUMAN_ID) {
    const p = state.players[holder.member];
    const i = x.op.roles.indexOf(role);
    x.op.roles[i] = { member: HUMAN_ID, village: you.village, kind: 'nobles', launchAt: deadline - travelTimeMs(state, { snob: 1 }, you.d) };
    x.op.human = true;
    state.leaderOrder = { order: 'attack', village: target.id, until: deadline + 10 * MINUTE, from: x.t.leader, landAt: deadline, nobles: true, op: x.op.id };
    state.leaderOrderAt = state.time;
    if (p) { changeMood(state, p, -3, T('verloor het beroep over de edels')); addMerit(state, p.id, MERIT.appealLost); rebelMaybe(state, x.t, p, HUMAN_ID); }
    addLog(state, { time: state.time, text: tr('{leader} geeft je gelijk: jij brengt de edels naar {village}, landen om {time}.', { leader, village: target.name, time: formatGameTime(deadline) }) });
    return null;
  }
  addMerit(state, HUMAN_ID, MERIT.appealLost);
  addMessage(state, {
    kind: 'request', from: x.t.leader, tribe: x.t.id, title: T('{leader} houdt het bij {name}', { leader, name: nameOf(state, holder.member) }), status: 'open', expires: state.time + DAY / 2,
    request: { type: 'verdict', op: x.op.id, village },
    text: T('{leader} heeft je beroep afgewezen: {name} brengt de edels. Akkoord, of ben je het oneens? Oneens betekent: je verlaat {tag} en bent een tijd vogelvrij.', { leader, name: nameOf(state, holder.member), tag: tag(x.t) }),
  });
  return null;
}

/** The ruling went against you: agree, or leave as an outlaw. */
export function answerVerdict(state: WorldState, accept: boolean): string | null {
  if (accept) return null;
  const tid = state.players[HUMAN_ID]?.tribe;
  const t = tid !== undefined ? state.tribes?.[tid] : undefined;
  if (!t) return tr('Je zit niet meer in een stam.');
  outlawFrom(state, state.players[HUMAN_ID]!, t);
  delete state.standing; delete state.standingNotes; delete state.leaderOrder; delete state.scoutOrders;
  const text = T('Je bent het niet eens met {leader} en verlaat {tag}. Voorlopig ben je vogelvrij.', { leader: nameOf(state, t.leader), tag: tag(t) });
  addLog(state, { time: state.time, text: txt(text) });
  (state.tribeNews ??= []).push({ time: state.time, text });
  return null;
}

/** Your train for a joint attack is about to leave: did every army that should have left really go? */
export function nobleArmiesMissing(state: WorldState, targetId: number): TribeOp | undefined {
  const tid = state.players[HUMAN_ID]?.tribe;
  const t = tid !== undefined ? state.tribes?.[tid] : undefined;
  return t?.ops?.find((op) => op.target === targetId && op.roles.some((r) => r.kind === 'nobles' && r.member === HUMAN_ID && !r.state)
    && op.roles.some((r) => r.kind === 'nuke' && r.launchAt <= state.time && r.state !== 'sent'));
}
