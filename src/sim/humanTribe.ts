/**
 * You and tribes: founding, applying, leaving, inviting, kicking and treaties, plus the inbox.
 *
 * Bots answer when they are online (at the diplomacy tick), with the same rules they use among
 * themselves: the position rule (not too far, not behind an enemy, not prey in the middle),
 * the leader's view of your strength, their personality and any grudge against you.
 */
import { kindness } from '../shared/config';
import { MAX_MEMBERS } from '../shared/tribes';
import { DAY } from '../shared/time';
import { isOnline } from './bots';
import { answerRequest } from './tribeOrders';
import { grudge } from './botReact';
import { nextFloat } from './rng';
import {
  HUMAN_ID,
  addLog,
  nextId,
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
  join,
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
    title: `${tag(from)} stelt ${REL_NAME[relation]} voor`,
    text: `${leaderName(state, from)}, leider van ${tag(from)} ${from.name}, stelt ${REL_NAME[relation]} voor met jouw stam.`,
    status: 'open',
    expires: expiry(state),
  });
}

/** War was declared on your tribe. */
export function warOnHuman(state: WorldState, by: Tribe, on: Tribe, breaksTreaty: boolean): void {
  const text = breaksTreaty
    ? `${tag(by)} ${by.name} verbreekt het verdrag en verklaart ${tag(on)} de oorlog.`
    : `${tag(by)} ${by.name} verklaart ${tag(on)} de oorlog.`;
  addMessage(state, { kind: 'war', from: by.leader, tribe: by.id, title: `Oorlog: ${tag(by)}`, text });
  if (pauses(state, 'war')) alertHuman(state, text);
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
    title: `${p.name} wil bij ${tag(t)}`,
    text: `${p.name} (${pts.toLocaleString('nl-NL')} punten) vraagt of hij lid mag worden van ${tag(t)}.`,
    status: 'open',
    expires: expiry(state),
  });
  if (pauses(state, 'requests')) alertHuman(state, `${p.name} wil lid worden van ${tag(t)}.`);
}

// --- your actions ------------------------------------------------------------------------

const human = (state: WorldState): Player => state.players[HUMAN_ID]!;

export function foundTribe(state: WorldState, name: string, tagIn: string): string | null {
  const me = human(state);
  if (me.tribe !== undefined) return 'Je zit al in een stam.';
  const nm = name.trim(), tg = tagIn.trim().toUpperCase();
  if (nm.length < 3 || nm.length > 32) return 'Een naam heeft 3 tot 32 tekens.';
  if (!/^[A-Z0-9]{2,6}$/.test(tg)) return 'Een tag heeft 2 tot 6 letters of cijfers.';
  for (const t of Object.values(state.tribes ?? {})) {
    if (t.tag === tg) return `De tag [${tg}] is al in gebruik.`;
    if (t.name.toLowerCase() === nm.toLowerCase()) return 'Die naam is al in gebruik.';
  }
  state.tribeAsks = (state.tribeAsks ?? []).filter((a) => a.kind !== 'apply');
  found(state, me, { name: nm, tag: tg });
  return null;
}

export function applyToTribe(state: WorldState, tribeId: number): string | null {
  const me = human(state);
  const t = state.tribes?.[tribeId];
  if (!t) return 'Die stam bestaat niet meer.';
  if (me.tribe !== undefined) return 'Verlaat eerst je huidige stam.';
  if (t.members.length >= MAX_MEMBERS) return 'Die stam is vol.';
  if ((state.tribeAsks ?? []).some((a) => a.kind === 'apply' && a.tribe === tribeId)) return 'Je aanmelding loopt al.';
  (state.tribeAsks ??= []).push({ kind: 'apply', tribe: tribeId, at: state.time });
  addLog(state, { time: state.time, text: `Je meldt je aan bij ${tag(t)}.` });
  return null;
}

export function leaveTribe(state: WorldState): string | null {
  const me = human(state);
  const t = tribeOf(state, HUMAN_ID);
  if (!t) return 'Je zit niet in een stam.';
  leave(state, me);
  state.tribeAsks = (state.tribeAsks ?? []).filter((a) => a.kind === 'apply');
  addLog(state, { time: state.time, text: `Je verlaat ${tag(t)}.` });
  return null;
}

function myLedTribe(state: WorldState): Tribe | string {
  const t = tribeOf(state, HUMAN_ID);
  if (!t) return 'Je zit niet in een stam.';
  if (t.leader !== HUMAN_ID) return 'Alleen de leider kan dat.';
  return t;
}

export function invitePlayer(state: WorldState, playerId: number): string | null {
  const t = myLedTribe(state);
  if (typeof t === 'string') return t;
  const p = state.players[playerId];
  if (!p?.bot) return 'Die speler bestaat niet.';
  if (p.tribe === t.id) return `${p.name} zit al in je stam.`;
  if (t.members.length >= MAX_MEMBERS) return 'Je stam is vol.';
  if ((state.tribeAsks ?? []).some((a) => a.kind === 'invite' && a.player === playerId)) return `${p.name} heeft je uitnodiging al.`;
  (state.tribeAsks ??= []).push({ kind: 'invite', player: playerId, at: state.time });
  addLog(state, { time: state.time, text: `Je nodigt ${p.name} uit voor ${tag(t)}.` });
  return null;
}

export function kickMember(state: WorldState, playerId: number): string | null {
  const t = myLedTribe(state);
  if (typeof t === 'string') return t;
  const p = state.players[playerId];
  if (!p || p.tribe !== t.id || playerId === HUMAN_ID) return 'Die speler zit niet in je stam.';
  leave(state, p);
  // being kicked out stings
  if (p.bot) (p.bot.grudges ??= {})[HUMAN_ID] = { score: grudge(state, p, HUMAN_ID) + 0.6, at: state.time };
  addMessage(state, { kind: 'info', from: -1, title: `${p.name} uit de stam gezet`, text: `Je hebt ${p.name} uit ${tag(t)} gezet. Dat vergeet hij niet zomaar.` });
  return null;
}

/** As leader: ask another tribe for a treaty (they answer when their leader is online). */
export function proposeRelation(state: WorldState, tribeId: number, relation: 'nap' | 'ally' | 'peace'): string | null {
  const t = myLedTribe(state);
  if (typeof t === 'string') return t;
  const o = state.tribes?.[tribeId];
  if (!o || o.id === t.id) return 'Die stam bestaat niet.';
  const now = t.relations[o.id];
  if (relation === 'peace' && now !== 'war') return 'Jullie zijn niet in oorlog.';
  if (relation !== 'peace' && now === 'war') return 'Sluit eerst vrede.';
  if (relation === now) return 'Dat verdrag hebben jullie al.';
  if (relation === 'ally' && Object.values(t.relations).filter((r) => r === 'ally').length >= MAX_ALLIES) return `Je hebt al ${MAX_ALLIES} bondgenoten.`;
  if ((state.tribeAsks ?? []).some((a) => a.kind === 'propose' && a.tribe === tribeId)) return 'Je voorstel loopt al.';
  (state.tribeAsks ??= []).push({ kind: 'propose', tribe: tribeId, relation, at: state.time });
  addLog(state, { time: state.time, text: `Je stelt ${tag(o)} ${REL_NAME[relation]} voor.` });
  return null;
}

/** As leader: declare war (immediate), or end a treaty. */
export function setOwnRelation(state: WorldState, tribeId: number, action: 'war' | 'end'): string | null {
  const t = myLedTribe(state);
  if (typeof t === 'string') return t;
  const o = state.tribes?.[tribeId];
  if (!o || o.id === t.id) return 'Die stam bestaat niet.';
  if (action === 'war') {
    if (t.relations[o.id] === 'war') return 'Jullie zijn al in oorlog.';
    const broke = t.relations[o.id] !== undefined;
    declareWar(state, t, o, broke);
    // their members will remember
    for (const m of o.members) { const p = state.players[m]; if (p?.bot) (p.bot.grudges ??= {})[HUMAN_ID] = { score: grudge(state, p, HUMAN_ID) + 0.5, at: state.time }; }
    return null;
  }
  if (!t.relations[o.id] || t.relations[o.id] === 'war') return 'Er is geen verdrag om te beëindigen.';
  setRelation(state, t, o, null);
  addLog(state, { time: state.time, text: `${tag(t)} beëindigt het verdrag met ${tag(o)}.` });
  return null;
}

/** Your answer to an invitation or proposal in the inbox. */
export function answerMessage(state: WorldState, id: number, accept: boolean): string | null {
  const m = (state.inbox ?? []).find((x) => x.id === id);
  if (!m || m.status !== 'open') return 'Dit bericht vraagt geen antwoord meer.';
  m.read = true;
  const t = m.tribe !== undefined ? state.tribes?.[m.tribe] : undefined;
  if (!accept && m.kind !== 'request') {
    m.status = 'declined';
    if (t && m.kind === 'invite') addLog(state, { time: state.time, text: `Je slaat de uitnodiging van ${tag(t)} af.` });
    return null;
  }
  if (m.kind === 'request') return answerRequest(state, m, accept);
  if (!t) { m.status = 'expired'; return 'Die stam bestaat niet meer.'; }
  if (m.kind === 'invite') {
    const me = human(state);
    if (me.tribe !== undefined) return 'Verlaat eerst je huidige stam.';
    if (t.members.length >= MAX_MEMBERS) { m.status = 'expired'; return 'Die stam is inmiddels vol.'; }
    join(state, t, me);
    m.status = 'accepted';
    addLog(state, { time: state.time, text: `Je sluit je aan bij ${tag(t)} ${t.name}.` });
    return null;
  }
  if (m.kind === 'application') {
    const p = state.players[m.from];
    const mine = myLedTribe(state);
    if (typeof mine === 'string' || mine.id !== t.id) { m.status = 'expired'; return typeof mine === 'string' ? mine : 'Je leidt die stam niet meer.'; }
    if (!p || p.tribe !== undefined) { m.status = 'expired'; return 'Die speler heeft al een stam gevonden.'; }
    if (t.members.length >= MAX_MEMBERS) return 'Je stam is vol.';
    join(state, t, p);
    m.status = 'accepted';
    addLog(state, { time: state.time, text: `${p.name} is lid van ${tag(t)}.` });
    return null;
  }
  if (m.kind === 'proposal' && m.relation) {
    const mine = myLedTribe(state);
    if (typeof mine === 'string') { m.status = 'expired'; return mine; }
    if (m.relation === 'ally' && Object.values(mine.relations).filter((r) => r === 'ally').length >= MAX_ALLIES) return `Je hebt al ${MAX_ALLIES} bondgenoten.`;
    setRelation(state, mine, t, m.relation === 'peace' ? null : m.relation);
    m.status = 'accepted';
    addLog(state, { time: state.time, text: `${tag(mine)} en ${tag(t)}: ${REL_NAME[m.relation]} gesloten.` });
    return null;
  }
  return 'Dit bericht vraagt geen antwoord.';
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
  for (const m of state.inbox ?? []) if (m.status === 'open' && m.expires !== undefined && m.expires <= state.time) m.status = 'expired';

  const keep: TribeAsk[] = [];
  for (const ask of state.tribeAsks ?? []) {
    const answered = answerAsk(state, me, ask);
    if (!answered) keep.push(ask);
  }
  state.tribeAsks = keep;

  inviteHuman(state, me);
}

/** One of your asks: the bot answers if it is online now. Returns true when it is settled. */
function answerAsk(state: WorldState, me: Player, ask: TribeAsk): boolean {
  if (ask.kind === 'apply') {
    const t = state.tribes?.[ask.tribe];
    if (!t || me.tribe !== undefined) return true;
    const leader = state.players[t.leader];
    if (!leader?.bot) return true;
    if (!isOnline(state, leader.id, leader.bot)) return false;
    const arch = leader.bot.archetype;
    const ok =
      t.members.length < MAX_MEMBERS &&
      fits(state, t, HUMAN_ID) &&
      leaderAccepts(state, t, me) &&
      grudge(state, leader, HUMAN_ID) < 0.5 &&
      nextFloat(state.rng) < Math.min(0.97, (arch === 'opportunist' ? (strongEnough(state, t, HUMAN_ID) ? 0.9 : 0.3) : TAKES_YOU[arch] ?? 0.6) * kindness(state.config).accept);
    if (ok) {
      join(state, t, me);
      addMessage(state, { kind: 'answer', from: leader.id, tribe: t.id, title: `Welkom bij ${tag(t)}`, text: `${leader.name} heeft je aanmelding geaccepteerd. Je bent nu lid van ${tag(t)} ${t.name}.` });
    } else {
      addMessage(state, { kind: 'answer', from: leader.id, tribe: t.id, title: `${tag(t)} wijst je af`, text: rejectReason(state, t, me, leader) });
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
      ok = nextFloat(state.rng) < Math.min(0.97, SOCIAL[arch] * 0.9 * kindness(state.config).accept);
    }
    if (ok) {
      join(state, t, p);
      addMessage(state, { kind: 'answer', from: p.id, tribe: t.id, title: `${p.name} komt erbij`, text: `${p.name} heeft je uitnodiging aangenomen en is lid van ${tag(t)}.` });
    } else {
      refused(state, 'invites', p.id);
      addMessage(state, { kind: 'answer', from: p.id, title: `${p.name} slaat af`, text: inviteRefusal(state, t, p, current) });
    }
    return true;
  }
  // a treaty you proposed
  const mine = tribeOf(state, HUMAN_ID);
  const o = state.tribes?.[ask.tribe];
  if (!mine || mine.leader !== HUMAN_ID || !o) return true;
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
  if (ok) {
    setRelation(state, mine, o, ask.relation === 'peace' ? null : ask.relation);
    addLog(state, { time: state.time, text: `${tag(mine)} en ${tag(o)}: ${REL_NAME[ask.relation]} gesloten.` });
    addMessage(state, { kind: 'answer', from: leader.id, tribe: o.id, title: `${tag(o)} gaat akkoord`, text: `${leader.name} gaat akkoord met ${REL_NAME[ask.relation]}.` });
  } else {
    addMessage(state, { kind: 'answer', from: leader.id, tribe: o.id, title: `${tag(o)} wijst je voorstel af`, text: `${leader.name} wil geen ${REL_NAME[ask.relation]} met ${tag(mine)}.` });
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
function inviteRefusal(state: WorldState, t: Tribe, p: Player, current: Tribe | undefined): string {
  if (current) return `${p.name} blijft liever bij ${tag(current)}.`;
  if (grudge(state, p, HUMAN_ID) >= 0.5) return `${p.name}: bij jou? Na wat je mij hebt aangedaan? Nee.`;
  const fit = fitCheck(state, t, p.id);
  if (fit.reason === 'full') return `${p.name}: jullie zitten vol.`;
  if (fit.reason === 'far') return `${p.name}: jullie zitten te ver bij mij vandaan (${fit.distance.toFixed(1)} velden van jullie centrum, max ${fit.reach.toFixed(1)}).`;
  if (fit.reason === 'blocked') return `${p.name}: er zit een vijandige stam tussen ons in.`;
  if (fit.reason === 'prey') return `${p.name}: ik zit midden in jullie gebied en ben veel kleiner. Daar vertrouw ik niks van.`;
  return p.bot?.archetype === 'turtle' || p.bot?.archetype === 'rusher'
    ? `${p.name} speelt liever op zichzelf. Misschien later.`
    : `${p.name} heeft nu geen interesse in ${tag(t)}. Misschien later.`;
}

function rejectReason(state: WorldState, t: Tribe, me: Player, leader: Player): string {
  const who = `${leader.name} (${tag(t)})`;
  if (t.members.length >= MAX_MEMBERS) return `${who}: we zitten vol.`;
  if (grudge(state, leader, HUMAN_ID) >= 0.5) return `${who}: na wat je ons hebt aangedaan? Nee.`;
  const fit = fitCheck(state, t, HUMAN_ID);
  if (fit.reason === 'far') return `${who}: je zit te ver van ons vandaan (${fit.distance.toFixed(1)} velden van ons centrum, wij nemen tot ${fit.reach.toFixed(1)}).`;
  if (fit.reason === 'prey') return `${who}: je zit midden in ons gebied en bent veel kleiner dan wij. Jij bent eerder een doelwit dan een lid.`;
  if (fit.reason === 'blocked') return `${who}: er zit een vijandige stam tussen jou en ons in.`;
  if (fit.reason !== 'ok') return `${who}: je ligt niet goed voor ons.`;
  if (!leaderAccepts(state, t, me)) return `${who}: kom terug als je wat groter bent.`;
  return `${who}: nu even niet.`;
}

/** A bot tribe with room nearby may invite you (one at a time, not again soon after a no). */
function inviteHuman(state: WorldState, me: Player): void {
  if (me.tribe !== undefined) return;
  const inbox = state.inbox ?? [];
  if (inbox.some((m) => m.kind === 'invite' && m.status === 'open')) return;
  const cooldown = DAY / state.config.worldSpeed;
  for (const t of Object.values(state.tribes ?? {})) {
    if (t.leader === HUMAN_ID || t.members.length >= MAX_MEMBERS) continue;
    const leader = state.players[t.leader];
    if (!leader?.bot || !isOnline(state, leader.id, leader.bot)) continue;
    if (inbox.some((m) => m.kind === 'invite' && m.tribe === t.id && state.time - m.time < cooldown * 2)) continue;
    if (!fits(state, t, HUMAN_ID) || !leaderAccepts(state, t, me) || grudge(state, leader, HUMAN_ID) >= 0.5) continue;
    if (nextFloat(state.rng) >= 0.04 * SOCIAL[leader.bot.archetype]) continue;
    addMessage(state, {
      kind: 'invite',
      from: leader.id,
      tribe: t.id,
      title: `Uitnodiging van ${tag(t)}`,
      text: `${leader.name} nodigt je uit voor ${tag(t)} ${t.name} (${t.members.length}/${MAX_MEMBERS} leden).`,
      status: 'open',
      expires: expiry(state),
    });
    return;
  }
}
