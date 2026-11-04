/**
 * You and tribes: founding, applying, leaving, inviting, kicking and treaties, plus the inbox.
 *
 * Bots answer when they are online (at the diplomacy tick), with the same rules they use among
 * themselves: the position rule (not too far, not behind an enemy, not prey in the middle),
 * the leader's view of your strength, their personality and any grudge against you.
 */
import { kindness } from '../shared/config';
import { T, tr, txt, type Txt } from '../shared/i18n';
import { humanStartTalks, isOutlaw } from './talks';
import { mateEvent, moodAll, trustFactor } from './loyalty';
import { MAX_MEMBERS } from '../shared/tribes';
import { DAY } from '../shared/time';
import { isOnline } from './bots';
import { answerRequest } from './tribeOrders';
import { grudge } from './botReact';
import { nextFloat } from './rng';
import { rankWeight } from './ranks';
import { answerRh, answerRhAsk, myRightHandTribe, rhTreatyAnswered, rhTreatyTick } from './rightHand';
import type { FrictionRow, WarAskInfo } from '../shared/protocol';
import { WAR_FRICTION, frictionBetween, topWhy, tribeStrength } from './warCause';
import {
  HUMAN_ID,
  addLog,
  nextId,
  playSfx,
  type InboxMessage,
  type Player,
  type TribeAsk,
  type WorldState,
} from './state';
import {
  AGGRESSION,
  SOCIAL,
  declareWar,
  fitCheck,
  fits,
  found,
  contactKey,
  inContact,
  tribeContacts,
  warNeed,
  join,
  bumpCandidate,
  setLeader,
  leaderAccepts,
  leave,
  playerCentre,
  setRelation,
  tribeCentre,
  tribeOf,
  type Tribe,
} from './tribes';

const MAX_ALLIES = 2;
/**
 * Open invitations, applications and proposals expire after a fixed game day: it is about your
 * attention, which does not speed up with the world (like the bots' reaction time).
 */
const expiry = (state: WorldState) => state.time + DAY;

// --- inbox -----------------------------------------------------------------------

export function addMessage(state: WorldState, m: Omit<InboxMessage, 'id' | 'time' | 'read'>): InboxMessage {
  const msg: InboxMessage = { id: nextId(state), time: state.time, read: false, ...m };
  (state.inbox ??= []).push(msg);
  // a new order from your leader
  if (m.request?.type === 'order') playSfx(state, 'mission-received');
  if (m.request?.type === 'verdict') playSfx(state, 'mission-failed');
  // keep the inbox finite: drop the oldest answered/info messages
  if (state.inbox.length > 200) {
    const i = state.inbox.findIndex((x) => x.status !== 'open');
    state.inbox.splice(i >= 0 ? i : 0, 1);
  }
  return msg;
}

export function pauses(state: WorldState, kind: 'war' | 'requests'): boolean {
  return (state.tribePause ?? { war: true, requests: true })[kind];
}

/** Raises an auto-pause alert (same mechanism as incoming attacks). */
export function alertHuman(state: WorldState, text: string): void {
  if (state.alert) state.alert.text = `${state.alert.text} · ${text}`;
  else state.alert = { time: state.time, text, autoPause: true };
}

const tag = (t: Tribe) => `[${t.tag}]`;
const leaderName = (state: WorldState, t: Tribe) => state.players[t.leader]?.name ?? '?';
const REL_NAME = { nap: 'een niet-aanvalsverdrag', ally: 'een bondgenootschap', peace: 'vrede' } as const;

// --- called from the bots' diplomacy -------------------------------------------------

/** A bot tribe wants a treaty with the tribe you lead: it asks you. */
export function proposeToHuman(state: WorldState, from: Tribe, relation: 'nap' | 'ally' | 'peace'): void {
  const open = (state.inbox ?? []).some((m) => m.status === 'open' && m.kind === 'proposal' && m.tribe === from.id);
  if (open) return;
  addMessage(state, {
    kind: 'proposal',
    from: from.leader,
    tribe: from.id,
    relation,
    title: T('{tag} stelt {rel} voor', { tag: tag(from), rel: REL_NAME[relation] }),
    text: T('{leader}, leider van {tag} {name}, stelt {rel} voor met jouw stam.', { leader: leaderName(state, from), tag: tag(from), name: from.name, rel: REL_NAME[relation] }),
    status: 'open',
    expires: expiry(state),
  });
}

/** War was declared on your tribe. */
export function warOnHuman(state: WorldState, by: Tribe, on: Tribe, breaksTreaty: boolean): void {
  const text = breaksTreaty
    ? T('{tag} {name} verbreekt het verdrag en verklaart {on} de oorlog.', { tag: tag(by), name: by.name, on: tag(on) })
    : T('{tag} {name} verklaart {on} de oorlog.', { tag: tag(by), name: by.name, on: tag(on) });
  addMessage(state, { kind: 'war', from: by.leader, tribe: by.id, title: T('Oorlog: {tag}', { tag: tag(by) }), text });
  if (pauses(state, 'war')) alertHuman(state, txt(text));
}

/** A bot wants to join the tribe you lead. */
export function applyToHuman(state: WorldState, p: Player, t: Tribe): void {
  const open = (state.inbox ?? []).some((m) => m.kind === 'application' && m.from === p.id && (m.status === 'open' || state.time - m.time < DAY / state.config.worldSpeed));
  if (open) return;
  const pts = Math.round(playerCentre(state, p.id)?.points ?? 0);
  addMessage(state, {
    kind: 'application',
    from: p.id,
    tribe: t.id,
    title: T('{name} wil bij {tag}', { name: p.name, tag: tag(t) }),
    text: T('{name} ({points} punten) vraagt of hij lid mag worden van {tag}.', { name: p.name, points: pts, tag: tag(t) }),
    status: 'open',
    expires: expiry(state),
  });
  if (pauses(state, 'requests')) alertHuman(state, tr('{name} wil lid worden van {tag}.', { name: p.name, tag: tag(t) }));
}

// --- your actions ------------------------------------------------------------------------

const human = (state: WorldState): Player => state.players[HUMAN_ID]!;

export function foundTribe(state: WorldState, name: string, tagIn: string): string | null {
  const me = human(state);
  if (me.tribe !== undefined) return tr('Je zit al in een stam.');
  if (isOutlaw(state, HUMAN_ID)) return tr('Je bent vogelvrij: geen stam neemt je nu aan.');
  const nm = name.trim(), tg = tagIn.trim().toUpperCase();
  if (nm.length < 3 || nm.length > 32) return tr('Een naam heeft 3 tot 32 tekens.');
  if (!/^[A-Z0-9]{2,6}$/.test(tg)) return tr('Een tag heeft 2 tot 6 letters of cijfers.');
  for (const t of Object.values(state.tribes ?? {})) {
    if (t.tag === tg) return tr('De tag [{tag}] is al in gebruik.', { tag: tg });
    if (t.name.toLowerCase() === nm.toLowerCase()) return tr('Die naam is al in gebruik.');
  }
  state.tribeAsks = (state.tribeAsks ?? []).filter((a) => a.kind !== 'apply');
  found(state, me, { name: nm, tag: tg });
  return null;
}

export function applyToTribe(state: WorldState, tribeId: number): string | null {
  const me = human(state);
  const t = state.tribes?.[tribeId];
  if (!t) return tr('Die stam bestaat niet meer.');
  if (me.tribe === t.id) return tr('Daar zit je al.');
  if (isOutlaw(state, HUMAN_ID)) return tr('Je bent vogelvrij: geen stam neemt je nu aan.');
  // switching while in a tribe: one application at a time (you only leave when they take you)
  if (me.tribe !== undefined && (state.tribeAsks ?? []).some((a) => a.kind === 'apply')) return tr('Je hebt al een aanmelding lopen.');
  if (t.members.length >= MAX_MEMBERS && !bumpCandidate(state, t, HUMAN_ID)) return tr('Die stam is vol, en niemand daar is zwak genoeg om voor jou plaats te maken.');
  if ((state.tribeAsks ?? []).some((a) => a.kind === 'apply' && a.tribe === tribeId)) return tr('Je aanmelding loopt al.');
  (state.tribeAsks ??= []).push({ kind: 'apply', tribe: tribeId, at: state.time });
  addLog(state, { time: state.time, text: tr('Je meldt je aan bij {tag}.', { tag: tag(t) }) });
  return null;
}

export function leaveTribe(state: WorldState): string | null {
  const me = human(state);
  const t = tribeOf(state, HUMAN_ID);
  if (!t) return tr('Je zit niet in een stam.');
  leave(state, me);
  state.tribeAsks = (state.tribeAsks ?? []).filter((a) => a.kind === 'apply');
  addLog(state, { time: state.time, text: tr('Je verlaat {tag}.', { tag: tag(t) }) });
  return null;
}

function myLedTribe(state: WorldState): Tribe | string {
  const t = tribeOf(state, HUMAN_ID);
  if (!t) return tr('Je zit niet in een stam.');
  if (t.leader !== HUMAN_ID) return tr('Alleen de leider kan dat.');
  return t;
}

export function invitePlayer(state: WorldState, playerId: number): string | null {
  const t = myLedTribe(state);
  if (typeof t === 'string') return t;
  const p = state.players[playerId];
  if (!p?.bot) return tr('Die speler bestaat niet.');
  if (p.tribe === t.id) return tr('{name} zit al in je stam.', { name: p.name });
  if (t.members.length >= MAX_MEMBERS) return tr('Je stam is vol.');
  if ((state.tribeAsks ?? []).some((a) => a.kind === 'invite' && a.player === playerId)) return tr('{name} heeft je uitnodiging al.', { name: p.name });
  (state.tribeAsks ??= []).push({ kind: 'invite', player: playerId, at: state.time });
  addLog(state, { time: state.time, text: tr('Je nodigt {name} uit voor {tag}.', { name: p.name, tag: tag(t) }) });
  return null;
}

export function kickMember(state: WorldState, playerId: number): string | null {
  const t = myLedTribe(state);
  if (typeof t === 'string') return t;
  const p = state.players[playerId];
  if (!p || p.tribe !== t.id || playerId === HUMAN_ID) return tr('Die speler zit niet in je stam.');
  leave(state, p);
  // being kicked out stings
  if (p.bot) (p.bot.grudges ??= {})[HUMAN_ID] = { score: grudge(state, p, HUMAN_ID) + 0.6, at: state.time, why: 'uit de stam gezet' };
  moodAll(state, t, -5, T('je zette {name} eruit', { name: p.name }));
  addMessage(state, { kind: 'info', from: -1, title: T('{name} uit de stam gezet', { name: p.name }), text: T('Je hebt {name} uit {tag} gezet. Dat vergeet hij niet zomaar.', { name: p.name, tag: tag(t) }) });
  return null;
}

/** As leader: ask another tribe for a treaty (they answer when their leader is online). */
export function proposeRelation(state: WorldState, tribeId: number, relation: 'nap' | 'ally' | 'peace'): string | null {
  const t = myLedTribe(state);
  if (typeof t === 'string') return t;
  const o = state.tribes?.[tribeId];
  if (!o || o.id === t.id) return tr('Die stam bestaat niet.');
  const now = t.relations[o.id];
  if (relation === 'peace' && now !== 'war') return tr('Jullie zijn niet in oorlog.');
  // peace after a war goes through talks, with terms
  if (relation === 'peace') return humanStartTalks(state, o.id);
  if (now === 'war') return tr('Sluit eerst vrede.');
  if (relation === now) return tr('Dat verdrag hebben jullie al.');
  if (relation === 'ally' && Object.values(t.relations).filter((r) => r === 'ally').length >= MAX_ALLIES) return tr('Je hebt al {n} bondgenoten.', { n: MAX_ALLIES });
  if ((state.tribeAsks ?? []).some((a) => a.kind === 'propose' && a.tribe === tribeId)) return tr('Je voorstel loopt al.');
  (state.tribeAsks ??= []).push({ kind: 'propose', tribe: tribeId, relation, at: state.time });
  addLog(state, { time: state.time, text: tr('Je stelt {tag} {rel} voor.', { tag: tag(o), rel: REL_NAME[relation] }) });
  return null;
}

/** After a no from your leader you wait this long before asking for a war again. */
export const WAR_ASK_COOLDOWN = DAY;

/** As a member of a bot tribe: ask your leader to declare war on a tribe your tribe touches. */
export function askLeaderWar(state: WorldState, tribeId: number): string | null {
  const t = tribeOf(state, HUMAN_ID);
  if (!t) return tr('Je zit niet in een stam.');
  if (t.leader === HUMAN_ID) return tr('Jij bent de leider: verklaar zelf de oorlog.');
  const o = state.tribes?.[tribeId];
  if (!o || o.id === t.id) return tr('Die stam bestaat niet.');
  const rel = t.relations[o.id];
  if (rel === 'war') return tr('Jullie zijn al in oorlog.');
  if (rel === 'nap' || rel === 'ally') return tr('Jullie hebben een verdrag met {tag}: daar vraag je geen oorlog tegen.', { tag: tag(o) });
  if (!inContact(state, t, o)) return tr('{tag} grenst nergens aan jullie stam.', { tag: tag(o) });
  if ((state.tribeAsks ?? []).some((a) => a.kind === 'war')) return tr('Je hebt de leider al om een oorlog gevraagd; hij antwoordt als hij online is.');
  if (state.warAskNo !== undefined && state.time - state.warAskNo < WAR_ASK_COOLDOWN) return tr('Je leider zei net nee. Wacht een speldag voor je het opnieuw vraagt.');
  (state.tribeAsks ??= []).push({ kind: 'war', tribe: o.id, at: state.time });
  addLog(state, { time: state.time, text: tr('Je vraagt je leider om {tag} de oorlog te verklaren.', { tag: tag(o) }) });
  return null;
}

/** For the tribe screen: whom you may ask your leader to fight, and until when you wait after a no. */
export function warAskInfo(state: WorldState): WarAskInfo {
  const t = tribeOf(state, HUMAN_ID);
  if (!t || t.leader === HUMAN_ID) return { contact: [] };
  const contacts = tribeContacts(state);
  const contact = Object.values(state.tribes ?? {}).filter((o) => o.id !== t.id && contacts.has(contactKey(t.id, o.id))).map((o) => o.id);
  const waitUntil = state.warAskNo !== undefined && state.time - state.warAskNo < WAR_ASK_COOLDOWN ? state.warAskNo + WAR_ASK_COOLDOWN : undefined;
  return waitUntil === undefined ? { contact } : { contact, waitUntil };
}

/** The friction your leader needs for a war you ask for: less than his own, less still the more he values you. */
function askedNeed(state: WorldState, leader: Player): number {
  const arch = leader.bot?.archetype ?? 'diplomat';
  const ask = Math.max(0.4, Math.min(1, 0.7 - ((state.standing ?? 60) - 60) / 200));
  // your rank weighs in: a right hand's ask needs less friction than a recruit's
  const t = tribeOf(state, HUMAN_ID);
  const weight = t ? rankWeight(state, t, HUMAN_ID) : 1;
  return (WAR_FRICTION * (1.6 - AGGRESSION[arch]) * ask) / weight;
}

/** Your tribe's friction with every other tribe, highest first (empty without a tribe). */
export function frictionView(state: WorldState): FrictionRow[] {
  const t = tribeOf(state, HUMAN_ID);
  if (!t) return [];
  const contacts = tribeContacts(state);
  const leader = state.players[t.leader];
  const rows: FrictionRow[] = [];
  for (const [id, f] of Object.entries(t.friction ?? {})) {
    const o = state.tribes?.[Number(id)];
    if (!o || f < 0.1) continue;
    const { strong, need, power } = warNeed(state, t, o);
    const ours = strong.id === t.id;
    const row: FrictionRow = {
      tribe: o.id, friction: f, need, even: power < 1.2,
      starter: ours ? (t.leader === HUMAN_ID ? 'you' : 'us') : 'them',
      why: topWhy(t, o), contact: contacts.has(contactKey(t.id, o.id)),
    };
    if (ours && t.leader !== HUMAN_ID && leader?.bot && !row.even && !t.relations[o.id]) row.asked = askedNeed(state, leader);
    const rel = t.relations[o.id];
    if (rel) row.rel = rel;
    rows.push(row);
  }
  return rows.sort((a, b) => b.friction - a.friction);
}

/**
 * Your leader weighs your war: the same reasons as a war of his own (enough friction, a tribe that
 * expects to win), but your ask counts. It lowers the friction he needs, more so when he thinks
 * highly of you (standing). Missing reason = yes.
 */
export function warAskVerdict(state: WorldState, mine: Tribe, o: Tribe, leader: Player): Txt | null {
  const rel = mine.relations[o.id];
  if (rel === 'nap' || rel === 'ally') return T('we hebben een verdrag met {tag}. Dat breek ik niet zomaar.', { tag: tag(o) });
  if (!inContact(state, mine, o)) return T('{tag} zit nergens bij ons in de buurt.', { tag: tag(o) });
  const ours = tribeStrength(state, mine), theirs = tribeStrength(state, o);
  if (ours / Math.max(1, theirs) < 1.2) return T('we zijn nog niet sterk genoeg voor {tag}.', { tag: tag(o) });
  if (frictionBetween(mine, o) < askedNeed(state, leader)) return T('ik zie geen aanleiding. {tag} heeft ons (nog) niks aangedaan.', { tag: tag(o) });
  return null;
}

/** As leader: declare war (immediate), or end a treaty. */
export function setOwnRelation(state: WorldState, tribeId: number, action: 'war' | 'end'): string | null {
  const t = myLedTribe(state);
  if (typeof t === 'string') return t;
  const o = state.tribes?.[tribeId];
  if (!o || o.id === t.id) return tr('Die stam bestaat niet.');
  if (action === 'war') {
    if (t.relations[o.id] === 'war') return tr('Jullie zijn al in oorlog.');
    const broke = t.relations[o.id] !== undefined;
    declareWar(state, t, o, broke);
    // their members will remember
    for (const m of o.members) { const p = state.players[m]; if (p?.bot) (p.bot.grudges ??= {})[HUMAN_ID] = { score: grudge(state, p, HUMAN_ID) + 0.5, at: state.time }; }
    return null;
  }
  if (!t.relations[o.id] || t.relations[o.id] === 'war') return tr('Er is geen verdrag om te beëindigen.');
  setRelation(state, t, o, null);
  return null;
}

/** Your answer to an invitation or proposal in the inbox. */
/** Your tribe lost its leader and wants you: a bot leads until you say yes. */
export function offerLeadership(state: WorldState, t: Tribe, old: Player, interim: Player): void {
  for (const m of state.inbox ?? []) if (m.status === 'open' && m.kind === 'lead') m.status = 'expired';
  const title = T('{tag} wil jou als leider', { tag: tag(t) });
  addMessage(state, {
    kind: 'lead', from: interim.id, tribe: t.id, title, status: 'open', expires: expiry(state),
    text: T('{old} is weg. De stam kijkt naar jou: wil jij {tag} leiden? Dan bepaal jij oorlog, vrede en wie erbij mag, en geeft niemand jou nog opdrachten. Tot je antwoordt houdt {interim} de boel bij elkaar; zeg je nee, dan blijft hij leider.', { old: old.name, tag: tag(t), interim: interim.name }),
  });
  alertHuman(state, txt(title));
}

export function answerMessage(state: WorldState, id: number, accept: boolean): string | null {
  const m = (state.inbox ?? []).find((x) => x.id === id);
  if (!m || m.status !== 'open') return tr('Dit bericht vraagt geen antwoord meer.');
  m.read = true;
  if (m.kind === 'treaty') {
    // peace goes through the talks now (see talks); old offers ran out
    m.status = 'expired';
    return tr('Vrede loopt nu via vredesbesprekingen (Stammen).');
  }
  if (m.kind === 'rhTreaty' || m.kind === 'rhAsk') return answerRh(state, m, accept);
  const t = m.tribe !== undefined ? state.tribes?.[m.tribe] : undefined;
  if (!accept && m.kind !== 'request' && m.kind !== 'lead') {
    m.status = 'declined';
    if (t && m.kind === 'invite') addLog(state, { time: state.time, text: tr('Je slaat de uitnodiging van {tag} af.', { tag: tag(t) }) });
    return null;
  }
  if (m.kind === 'request') return answerRequest(state, m, accept);
  if (m.kind === 'lead') {
    if (!t || human(state).tribe !== t.id) { m.status = 'expired'; return tr('Je zit niet meer in die stam.'); }
    if (!accept) {
      m.status = 'declined';
      addLog(state, { time: state.time, text: tr('Je laat het leiderschap van {tag} aan {name}.', { tag: tag(t), name: state.players[t.leader]?.name ?? '?' }) });
      return null;
    }
    setLeader(state, t, HUMAN_ID);
    m.status = 'accepted';
    const text = T('Je bent nu de leider van {tag} {name}.', { tag: tag(t), name: t.name });
    addLog(state, { time: state.time, text: txt(text) });
    (state.tribeNews ??= []).push({ time: state.time, text });
    return null;
  }
  if (!t) { m.status = 'expired'; return tr('Die stam bestaat niet meer.'); }
  if (m.kind === 'invite') {
    const me = human(state);
    if (me.tribe !== undefined) return tr('Verlaat eerst je huidige stam.');
    if (isOutlaw(state, HUMAN_ID)) return tr('Je bent vogelvrij: geen stam neemt je nu aan.');
    if (t.members.length >= MAX_MEMBERS) { m.status = 'expired'; return tr('Die stam is inmiddels vol.'); }
    join(state, t, me);
    m.status = 'accepted';
    addLog(state, { time: state.time, text: tr('Je sluit je aan bij {tag} {name}.', { tag: tag(t), name: t.name }) });
    return null;
  }
  if (m.kind === 'application') {
    const p = state.players[m.from];
    const mine = myLedTribe(state);
    if (typeof mine === 'string' || mine.id !== t.id) { m.status = 'expired'; return typeof mine === 'string' ? mine : tr('Je leidt die stam niet meer.'); }
    if (!p || p.tribe !== undefined) { m.status = 'expired'; return tr('Die speler heeft al een stam gevonden.'); }
    if (t.members.length >= MAX_MEMBERS) return tr('Je stam is vol.');
    join(state, t, p);
    m.status = 'accepted';
    addLog(state, { time: state.time, text: tr('{name} is lid van {tag}.', { name: p.name, tag: tag(t) }) });
    return null;
  }
  if (m.kind === 'merge' && m.merge) {
    const mine = myLedTribe(state);
    if (typeof mine === 'string') { m.status = 'expired'; return mine; }
    if (mine.members.length + t.members.length > MAX_MEMBERS) { m.status = 'expired'; return tr('Samen zijn jullie te groot voor één stam.'); }
    const [into, from] = m.merge === 'theirsIntoYours' ? [mine, t] : [t, mine];
    for (const id of [...from.members]) join(state, into, state.players[id]!);
    m.status = 'accepted';
    const text = T('{from} gaat op in {into} {name}.', { from: tag(from), into: tag(into), name: into.name });
    addLog(state, { time: state.time, text: txt(text) });
    (state.tribeNews ??= []).push({ time: state.time, text });
    return null;
  }
  if (m.kind === 'proposal' && m.relation) {
    const mine = myLedTribe(state);
    if (typeof mine === 'string') { m.status = 'expired'; return mine; }
    if (m.relation === 'ally' && Object.values(mine.relations).filter((r) => r === 'ally').length >= MAX_ALLIES) return tr('Je hebt al {n} bondgenoten.', { n: MAX_ALLIES });
    setRelation(state, mine, t, m.relation === 'peace' ? null : m.relation);
    m.status = 'accepted';
    return null;
  }
  return tr('Dit bericht vraagt geen antwoord.');
}

export function markInboxRead(state: WorldState): void {
  for (const m of state.inbox ?? []) m.read = true;
}

// --- the bots' side, at the diplomacy tick ------------------------------------------------

/** How keen a leader of this kind is to take you in. */
const TAKES_YOU: Record<string, number> = { diplomat: 0.9, supporter: 0.85, farmer: 0.7, turtle: 0.6, opportunist: 0.5, rusher: 0.5 };

export function humanTribeTick(state: WorldState): void {
  const me = human(state);
  // open messages that ran out
  for (const m of state.inbox ?? []) {
    if (m.status !== 'open' || m.expires === undefined || m.expires > state.time) continue;
    m.status = 'expired';
    // a mate's request you let run out: like a no, a bit milder
    if (m.kind === 'request') mateEvent(state, state.players[m.from], -6, -3, T('je reageerde niet op mijn verzoek'));
  }

  const keep: TribeAsk[] = [];
  for (const ask of state.tribeAsks ?? []) {
    const answered = answerAsk(state, me, ask);
    if (!answered) keep.push(ask);
  }
  // a switch to another tribe drops the asks of the old one (see switchAway)
  const still = new Set(state.tribeAsks ?? []);
  state.tribeAsks = keep.filter((a) => still.has(a));
  rhTreatyTick(state);

  inviteHuman(state, me);
}

/** Grudge your old leader holds when you switch to another tribe (an application that is turned down stays secret). */
export const SWITCH_GRUDGE = 0.4;

/** You leave your tribe for another that took you: your old leader takes it badly, the old tribe's asks lapse. */
function switchAway(state: WorldState, old: Tribe): void {
  const leader = state.players[old.leader];
  if (leader?.bot && leader.id !== HUMAN_ID) (leader.bot.grudges ??= {})[HUMAN_ID] = { score: grudge(state, leader, HUMAN_ID) + SWITCH_GRUDGE, at: state.time };
  leave(state, human(state));
  state.tribeAsks = (state.tribeAsks ?? []).filter((a) => a.kind === 'apply');
  const text = T('{name} verlaat {tag} voor een andere stam.', { name: state.players[HUMAN_ID]?.name ?? 'Jij', tag: tag(old) });
  addLog(state, { time: state.time, text: txt(text) });
  (state.tribeNews ??= []).push({ time: state.time, text });
}

/** One of your asks: the bot answers if it is online now. Returns true when it is settled. */
function answerAsk(state: WorldState, me: Player, ask: TribeAsk): boolean {
  if (ask.kind === 'apply') {
    const t = state.tribes?.[ask.tribe];
    if (!t || me.tribe === t.id) return true;
    // in a tribe already: you switch when they take you
    const old = me.tribe !== undefined ? state.tribes?.[me.tribe] : undefined;
    const leader = state.players[t.leader];
    if (!leader?.bot) return true;
    if (!isOnline(state, leader.id, leader.bot)) return false;
    const arch = leader.bot.archetype;
    const ok =
      (t.members.length < MAX_MEMBERS || !!bumpCandidate(state, t, HUMAN_ID)) &&
      fits(state, t, HUMAN_ID) &&
      leaderAccepts(state, t, me) &&
      grudge(state, leader, HUMAN_ID) < 0.5 &&
      nextFloat(state.rng) < Math.min(0.97, (arch === 'opportunist' ? (strongEnough(state, t, HUMAN_ID) ? 0.9 : 0.3) : TAKES_YOU[arch] ?? 0.6) * kindness(state.config).accept * trustFactor(state));
    if (ok) {
      if (old) switchAway(state, old);
      join(state, t, me);
      addMessage(state, { kind: 'answer', from: leader.id, tribe: t.id, title: T('Welkom bij {tag}', { tag: tag(t) }), text: old
        ? T('{leader} heeft je aanmelding geaccepteerd. Je bent nu lid van {tag} {name} en hebt {old} verlaten.', { leader: leader.name, tag: tag(t), name: t.name, old: tag(old) })
        : T('{leader} heeft je aanmelding geaccepteerd. Je bent nu lid van {tag} {name}.', { leader: leader.name, tag: tag(t), name: t.name }) });
    } else {
      addMessage(state, { kind: 'answer', from: leader.id, tribe: t.id, title: T('{tag} wijst je af', { tag: tag(t) }), text: rejectReason(state, t, me, leader) });
      refused(state, 'applications', t.id);
    }
    return true;
  }
  if (ask.kind === 'invite') {
    const t = tribeOf(state, HUMAN_ID);
    const p = state.players[ask.player];
    if (!t || t.leader !== HUMAN_ID || !p?.bot) return true;
    if (!isOnline(state, p.id, p.bot)) return false;
    const arch = p.bot.archetype;
    const current = p.tribe !== undefined ? state.tribes?.[p.tribe] : undefined;
    let ok = t.members.length < MAX_MEMBERS && fits(state, t, p.id) && grudge(state, p, HUMAN_ID) < 0.5;
    if (ok && current) {
      // leaving a tribe: only an opportunist, for a clearly stronger one
      const mine = tribeCentre(state, t)?.points ?? 0, theirs = tribeCentre(state, current)?.points ?? 0;
      ok = arch === 'opportunist' && mine > theirs * 1.5 && nextFloat(state.rng) < 0.5;
    } else if (ok) {
      ok = nextFloat(state.rng) < Math.min(0.97, SOCIAL[arch] * 0.9 * kindness(state.config).accept * trustFactor(state));
    }
    if (ok) {
      join(state, t, p);
      addMessage(state, { kind: 'answer', from: p.id, tribe: t.id, title: T('{name} komt erbij', { name: p.name }), text: T('{name} heeft je uitnodiging aangenomen en is lid van {tag}.', { name: p.name, tag: tag(t) }) });
    } else {
      refused(state, 'invites', p.id);
      addMessage(state, { kind: 'answer', from: p.id, title: T('{name} slaat af', { name: p.name }), text: inviteRefusal(state, t, p, current) });
    }
    return true;
  }
  if (ask.kind === 'war') {
    const mine = tribeOf(state, HUMAN_ID);
    const o = state.tribes?.[ask.tribe];
    if (!mine || mine.leader === HUMAN_ID || !o) return true;
    const leader = state.players[mine.leader];
    if (!leader?.bot) return true;
    if (mine.relations[o.id] === 'war') return true;
    if (!isOnline(state, leader.id, leader.bot)) return false;
    const no = warAskVerdict(state, mine, o, leader);
    if (no) {
      state.warAskNo = state.time;
      addMessage(state, { kind: 'answer', from: leader.id, tribe: o.id, title: T('{name}: geen oorlog met {tag}', { name: leader.name, tag: tag(o) }), text: T('{name}: {text}', { name: leader.name, text: no }) });
    } else {
      declareWar(state, mine, o, false, T('op jouw verzoek'));
      addMessage(state, { kind: 'answer', from: leader.id, tribe: o.id, title: T('{name}: oorlog met {tag}', { name: leader.name, tag: tag(o) }), text: T('{name}: je hebt gelijk. {mine} verklaart {tag} de oorlog.', { name: leader.name, mine: tag(mine), tag: tag(o) }) });
    }
    return true;
  }
  if (ask.kind === 'allyAsk') return answerRhAsk(state, ask);
  // a treaty you proposed (as leader, or as right hand: then only while you still are)
  const mine = ask.by === 'rh' ? myRightHandTribe(state) : tribeOf(state, HUMAN_ID);
  const o = state.tribes?.[ask.tribe];
  if (!mine || (ask.by !== 'rh' && mine.leader !== HUMAN_ID) || !o) return true;
  const leader = state.players[o.leader];
  if (!leader?.bot) return true;
  if (!isOnline(state, leader.id, leader.bot)) return false;
  const arch = leader.bot.archetype;
  const ours = tribeCentre(state, mine)?.points ?? 0, theirs = tribeCentre(state, o)?.points ?? 1;
  const strongerUs = ours > theirs;
  const g = grudge(state, leader, HUMAN_ID);
  let chance = 0;
  if (ask.relation === 'nap') chance = (1 - AGGRESSION[arch]) * 0.8 + (strongerUs ? 0.2 : 0) - g * 0.5;
  if (ask.relation === 'ally') {
    const since = state.time - (o.since?.[mine.id] ?? state.time);
    const allies = Object.values(o.relations).filter((r) => r === 'ally').length;
    chance = o.relations[mine.id] === 'nap' && since > DAY / (4 * state.config.worldSpeed) && allies < MAX_ALLIES ? SOCIAL[arch] * 0.7 - g * 0.5 : 0;
  }
  if (ask.relation === 'peace') chance = (1 - AGGRESSION[arch]) * 0.6 + (strongerUs ? 0.3 : 0) - g * 0.3;
  if (chance > 0) chance += kindness(state.config).treaty;
  const ok = (ask.relation === 'peace' ? o.relations[mine.id] === 'war' : o.relations[mine.id] !== 'war') && nextFloat(state.rng) < chance;
  if (ask.by === 'rh') rhTreatyAnswered(state, mine, o, ask.relation, ok);
  if (ok) {
    setRelation(state, mine, o, ask.relation === 'peace' ? null : ask.relation);
    addMessage(state, { kind: 'answer', from: leader.id, tribe: o.id, title: T('{tag} gaat akkoord', { tag: tag(o) }), text: T('{name} gaat akkoord met {rel}.', { name: leader.name, rel: REL_NAME[ask.relation] }) });
  } else {
    addMessage(state, { kind: 'answer', from: leader.id, tribe: o.id, title: T('{tag} wijst je voorstel af', { tag: tag(o) }), text: T('{name} wil geen {rel} met {mine}.', { name: leader.name, rel: REL_NAME[ask.relation], mine: tag(mine) }) });
  }
  return true;
}

function refused(state: WorldState, kind: 'invites' | 'applications', id: number): void {
  const r = (state.tribeRefusals ??= { invites: {}, applications: {} });
  r[kind][id] = (r[kind][id] ?? 0) + 1;
}

function strongEnough(state: WorldState, t: Tribe, id: number): boolean {
  const tc = tribeCentre(state, t), pc = playerCentre(state, id);
  return !!tc && !!pc && pc.points >= tc.points / Math.max(1, t.members.length);
}

/** The leader says why, like a player would (roughly). */
/** Why a bot turned down your invitation, in his words. */
/** A distance with one decimal (shown in the reader's notation). */
const dec1 = (x: number) => Math.round(x * 10) / 10;

function inviteRefusal(state: WorldState, t: Tribe, p: Player, current: Tribe | undefined): Txt {
  const name = p.name;
  if (current) return T('{name} blijft liever bij {tag}.', { name, tag: tag(current) });
  if (grudge(state, p, HUMAN_ID) >= 0.5) return T('{name}: bij jou? Na wat je mij hebt aangedaan? Nee.', { name });
  const fit = fitCheck(state, t, p.id);
  if (fit.reason === 'full') return T('{name}: jullie zitten vol.', { name });
  if (fit.reason === 'far') return T('{name}: jullie zitten te ver bij mij vandaan ({distance} velden van jullie centrum, max {reach}).', { name, distance: dec1(fit.distance), reach: dec1(fit.reach) });
  if (fit.reason === 'blocked') return T('{name}: er zit een vijandige stam tussen ons in.', { name });
  if (fit.reason === 'prey') return T('{name}: ik zit midden in jullie gebied en ben veel kleiner. Daar vertrouw ik niks van.', { name });
  return p.bot?.archetype === 'turtle' || p.bot?.archetype === 'rusher'
    ? T('{name} speelt liever op zichzelf. Misschien later.', { name })
    : T('{name} heeft nu geen interesse in {tag}. Misschien later.', { name, tag: tag(t) });
}

function rejectReason(state: WorldState, t: Tribe, me: Player, leader: Player): Txt {
  const who = `${leader.name} (${tag(t)})`;
  if (t.members.length >= MAX_MEMBERS && !bumpCandidate(state, t, HUMAN_ID)) return T('{who}: we zitten vol.', { who });
  if (grudge(state, leader, HUMAN_ID) >= 0.5) return T('{who}: na wat je ons hebt aangedaan? Nee.', { who });
  const fit = fitCheck(state, t, HUMAN_ID);
  if (fit.reason === 'far') return T('{who}: je zit te ver van ons vandaan ({distance} velden van ons centrum, wij nemen tot {reach}).', { who, distance: dec1(fit.distance), reach: dec1(fit.reach) });
  if (fit.reason === 'prey') return T('{who}: je zit midden in ons gebied en bent veel kleiner dan wij. Jij bent eerder een doelwit dan een lid.', { who });
  if (fit.reason === 'blocked') return T('{who}: er zit een vijandige stam tussen jou en ons in.', { who });
  if (fit.reason !== 'ok') return T('{who}: je ligt niet goed voor ons.', { who });
  if (!leaderAccepts(state, t, me)) return T('{who}: kom terug als je wat groter bent.', { who });
  return T('{who}: nu even niet.', { who });
}

/**
 * A bot tribe with room nearby may invite you (one at a time, not again soon after a no). Not only
 * the leader: any member that plays seriously (mid or pro) and is online can recruit, like a
 * recruiter in TW. A tribe wants you more when you are stronger than its average member.
 */
function inviteHuman(state: WorldState, me: Player): void {
  if (me.tribe !== undefined || isOutlaw(state, HUMAN_ID)) return;
  const inbox = state.inbox ?? [];
  if (inbox.some((m) => m.kind === 'invite' && m.status === 'open')) return;
  const cooldown = DAY / state.config.worldSpeed;
  const mine = playerCentre(state, HUMAN_ID);
  for (const t of Object.values(state.tribes ?? {})) {
    if (t.leader === HUMAN_ID || t.members.length >= MAX_MEMBERS) continue;
    const leader = state.players[t.leader];
    if (!leader?.bot) continue;
    // who can invite now: the leader, or a serious member, online
    const recruiter = [leader, ...t.members.map((m) => state.players[m]).filter((p): p is Player => !!p?.bot && p.id !== leader.id && (p.bot.tier ?? 'pro') !== 'casual')]
      .find((p) => isOnline(state, p.id, p.bot!));
    if (!recruiter) continue;
    if (inbox.some((m) => m.kind === 'invite' && m.tribe === t.id && state.time - m.time < cooldown * 2)) continue;
    if (!fits(state, t, HUMAN_ID) || !leaderAccepts(state, t, me) || grudge(state, leader, HUMAN_ID) >= 0.5 || grudge(state, recruiter, HUMAN_ID) >= 0.5) continue;
    const tc = tribeCentre(state, t);
    const avg = tc ? tc.points / Math.max(1, t.members.length) : 0;
    const keen = mine && avg > 0 && mine.points > 2 * avg ? 1.5 : 1;
    if (nextFloat(state.rng) >= 0.25 * SOCIAL[recruiter.bot!.archetype] * keen) continue;
    addMessage(state, {
      kind: 'invite',
      from: recruiter.id,
      tribe: t.id,
      title: T('Uitnodiging van {tag}', { tag: tag(t) }),
      text: recruiter.id === leader.id
        ? T('{name} nodigt je uit voor {tag} {tribe} ({n}/{max} leden).', { name: recruiter.name, tag: tag(t), tribe: t.name, n: t.members.length, max: MAX_MEMBERS })
        : T('{name} (namens leider {leader}) nodigt je uit voor {tag} {tribe} ({n}/{max} leden).', { name: recruiter.name, leader: leader.name, tag: tag(t), tribe: t.name, n: t.members.length, max: MAX_MEMBERS }),
      status: 'open',
      expires: expiry(state),
    });
    return;
  }
}
