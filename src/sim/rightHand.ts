/**
 * The right hand speaks for the tribe (you, in a bot's tribe). A NAP and peace talks you may start
 * yourself; an alliance (and a war, see askLeaderWar) you ask your leader for, and your rank weighs
 * in his answer. The other tribe treats your proposal like one from the leader. Your leader still
 * has the last word: a NAP with a tribe he holds a grudge against costs you standing, and he may
 * end it again within a day (that costs you rank points).
 */
import { DAY } from '../shared/time';
import { T, tr, type Txt } from '../shared/i18n';
import { isOnline } from './bots';
import { grudge } from './botReact';
import { addMessage, proposeRelation, proposeToHuman, setOwnRelation } from './humanTribe';
import { changeMood, changeStanding, moodAll } from './loyalty';
import { addNews } from './news';
import { MERIT, RANK_WEIGHT, addMerit, rightHand } from './ranks';
import { nextFloat } from './rng';
import { HUMAN_ID, addLog, type InboxMessage, type Player, type TribeAsk, type WorldState } from './state';
import { mayTalk, startTalks, talksOfTribes } from './talks';
import { AGGRESSION, MAX_ALLIES, SOCIAL, declareWar, setRelation, tribeOf, warNeed, type Tribe } from './tribes';
import { frictionBetween, tribeStrength } from './warCause';

const proposeAsLeader = (state: WorldState, tribe: number) => proposeRelation(state, tribe, 'ally');
const declareAsLeader = (state: WorldState, tribe: number) => setOwnRelation(state, tribe, 'war');

/** After a no you wait this long before proposing to the same tribe again. */
export const RH_RETRY = DAY / 2;
/** Your leader may end a NAP you made against his grudge within this long. */
export const RH_UNDO_WINDOW = DAY;
/** Standing it costs when you make a NAP with a tribe your leader holds a grudge against. */
export const RH_GRUDGE_STANDING = -4;
/** A grudge (0..) of your leader against a tribe's member that counts. */
const GRUDGE = 0.5;

const tag = (t: Tribe) => `[${t.tag}]`;

/** You are the right hand of a tribe someone else leads. */
export function myRightHandTribe(state: WorldState): Tribe | null {
  const t = tribeOf(state, HUMAN_ID);
  return t && t.leader !== HUMAN_ID && rightHand(state, t) === HUMAN_ID ? t : null;
}

const openRh = (state: WorldState) => (state.tribeAsks ?? []).some((a) => (a.kind === 'propose' && a.by === 'rh') || a.kind === 'allyAsk');

/** Why you can't propose to this tribe now (null = you can). */
function blocker(state: WorldState, tribeId: number): { t: Tribe; o: Tribe } | string {
  const t = myRightHandTribe(state);
  if (!t) return tr('Alleen de rechterhand kan namens de stam voorstellen doen.');
  const o = state.tribes?.[tribeId];
  if (!o || o.id === t.id) return tr('Die stam bestaat niet.');
  if (openRh(state)) return tr('Je hebt al een voorstel lopen.');
  const no = state.rhNo?.[o.id];
  if (no !== undefined && state.time - no < RH_RETRY) return tr('{tag} zei net nee. Wacht een halve speldag.', { tag: tag(o) });
  return { t, o };
}

/** As right hand: propose a NAP to a tribe, or open peace talks with one you are at war with. */
export function rhPropose(state: WorldState, tribeId: number, relation: 'nap' | 'peace'): string | null {
  const b = blocker(state, tribeId);
  if (typeof b === 'string') return b;
  const { t, o } = b;
  const rel = t.relations[o.id];
  if (relation === 'peace') {
    if (rel !== 'war') return tr('Jullie zijn niet in oorlog met die stam.');
    if (talksOfTribes(state, t.id, o.id)) return tr('Er lopen al besprekingen.');
    const strongerMine = tribeStrength(state, t) >= tribeStrength(state, o);
    startTalks(state, strongerMine ? t : o, strongerMine ? o : t);
    addLog(state, { time: state.time, text: tr('Als rechterhand open je vredesbesprekingen met {tag}.', { tag: tag(o) }) });
    return null;
  }
  if (rel === 'war') return tr('Jullie zijn in oorlog: open vredesbesprekingen.');
  if (rel) return tr('Dat verdrag hebben jullie al.');
  (state.tribeAsks ??= []).push({ kind: 'propose', tribe: o.id, relation: 'nap', at: state.time, by: 'rh' });
  addLog(state, { time: state.time, text: tr('Als rechterhand stel je {tag} een niet-aanvalsverdrag voor.', { tag: tag(o) }) });
  return null;
}

/** As right hand: ask your leader to offer a tribe you have a NAP with an alliance. */
export function rhAskAlly(state: WorldState, tribeId: number): string | null {
  const b = blocker(state, tribeId);
  if (typeof b === 'string') return b;
  const { t, o } = b;
  if (t.relations[o.id] !== 'nap') return tr('Eerst een niet-aanvalsverdrag.');
  (state.tribeAsks ??= []).push({ kind: 'allyAsk', tribe: o.id, at: state.time });
  addLog(state, { time: state.time, text: tr('Je vraagt je leider om {tag} een bondgenootschap voor te stellen.', { tag: tag(o) }) });
  return null;
}

/** Your leader's worst grudge against a member of `o`. */
function leaderGrudge(state: WorldState, leader: Player, o: Tribe): number {
  return Math.max(0, ...o.members.map((m) => grudge(state, leader, m)));
}

/**
 * A right-hand ask, answered when the one who decides is online. Returns true when settled.
 * Proposals to another tribe go through the usual treaty answer (`answerTreaty`), this handles the rest.
 */
export function answerRhAsk(state: WorldState, ask: Extract<TribeAsk, { kind: 'allyAsk' }>): boolean {
  const t = myRightHandTribe(state);
  const o = state.tribes?.[ask.tribe];
  if (!t || !o) return true; // no longer right hand (or the tribe is gone): it lapses
  const leader = state.players[t.leader];
  if (!leader?.bot) return true;
  if (!isOnline(state, leader.id, leader.bot)) return false;
  const allies = Object.values(t.relations).filter((r) => r === 'ally').length;
  const g = leaderGrudge(state, leader, o);
  const chance = t.relations[o.id] === 'nap' && allies < MAX_ALLIES ? SOCIAL[leader.bot.archetype] * 0.7 * RANK_WEIGHT.rechterhand - g * 0.5 : 0;
  if (nextFloat(state.rng) < chance) {
    // he makes the proposal; the other tribe answers it like any other
    (state.tribeAsks ??= []).push({ kind: 'propose', tribe: o.id, relation: 'ally', at: state.time, by: 'rh' });
    addMessage(state, { kind: 'answer', from: leader.id, tribe: o.id, title: T('{name}: bondgenootschap met {tag}', { name: leader.name, tag: tag(o) }), text: T('{name}: goed idee. Ik stel {tag} een bondgenootschap voor.', { name: leader.name, tag: tag(o) }) });
  } else {
    (state.rhNo ??= {})[o.id] = state.time;
    const name = leader.name;
    const text = g >= GRUDGE ? T('{name}: met {tag}? Na wat ze ons hebben aangedaan? Nee.', { name, tag: tag(o) })
      : allies >= MAX_ALLIES ? T('{name}: we hebben al genoeg bondgenoten.', { name }) : T('{name}: daar zie ik nu niks in.', { name });
    addMessage(state, { kind: 'answer', from: leader.id, tribe: o.id, title: T('{name}: geen bondgenootschap', { name }), text });
  }
  return true;
}

/** The other tribe said yes or no to your proposal as right hand. */
export function rhTreatyAnswered(state: WorldState, t: Tribe, o: Tribe, relation: 'nap' | 'ally' | 'peace', ok: boolean): void {
  if (!ok) { (state.rhNo ??= {})[o.id] = state.time; return; }
  addMerit(state, HUMAN_ID, MERIT.treaty);
  if (relation !== 'nap') return;
  const leader = state.players[t.leader];
  if (!leader?.bot || leaderGrudge(state, leader, o) < GRUDGE) return;
  changeStanding(state, RH_GRUDGE_STANDING, T('NAP met {tag} tegen de zin van {name}', { tag: tag(o), name: leader.name }));
  (state.rhTreaties ??= []).push({ tribe: o.id, at: state.time });
}

/** Your leader looks at the NAPs you made against his grudge: an aggressive one may end it. */
export function rhTreatyTick(state: WorldState): void {
  if (!state.rhTreaties?.length) return;
  const t = tribeOf(state, HUMAN_ID);
  const keep: { tribe: number; at: number }[] = [];
  for (const r of state.rhTreaties) {
    const o = state.tribes?.[r.tribe];
    if (!t || !o || t.relations[o.id] !== 'nap' || state.time - r.at > RH_UNDO_WINDOW) continue;
    const leader = state.players[t.leader];
    if (!leader?.bot || leader.id === HUMAN_ID) continue;
    if (!isOnline(state, leader.id, leader.bot)) { keep.push(r); continue; }
    // one look per NAP: he lets it be, or ends it
    if (nextFloat(state.rng) < AGGRESSION[leader.bot.archetype]) {
      setRelation(state, t, o, null);
      addMerit(state, HUMAN_ID, MERIT.treatyUndone);
      addMessage(state, { kind: 'answer', from: leader.id, tribe: o.id, title: T('{name} zegt de NAP met {tag} op', { name: leader.name, tag: tag(o) }), text: T('{name}: met {tag} sluiten wij geen verdrag. Ik heb het opgezegd.', { name: leader.name, tag: tag(o) }) });
    }
  }
  state.rhTreaties = keep;
}

// --- part 2: a bot as right hand (in any tribe, yours too) ------------------------------------

/** What a bot right hand thinks of his chances, per diplomacy round (see rhRound). */
export const RH_BOT = {
  /** A NAP with a calm neighbour: this × RANK_WEIGHT × (1 − his aggression). */
  nap: 0.012,
  /** Peace talks in a war of over a day: this × (1.2 − his aggression). */
  peace: 0.05,
  /** Ask the leader for an alliance after a NAP of over a day: this × his sociability × RANK_WEIGHT. */
  ally: 0.01,
  /** Only fighters push for war (aggression at least this), with this chance a round. */
  warFrom: 0.6,
  war: 0.1,
} as const;
/** Mood an unjust decision of the leader costs his right hand, and the other members. */
export const UNJUST = { rightHand: -8, others: -3 } as const;
/** The right hand's weight (read when used: ranks may not be loaded yet when this module is). */
const rw = () => RANK_WEIGHT.rechterhand;

const allyCount = (t: Tribe) => Object.values(t.relations).filter((r) => r === 'ally').length;
/** Both fight the same enemy. */
const sharedEnemy = (t: Tribe, o: Tribe) => Object.entries(t.relations).some(([id, r]) => r === 'war' && o.relations[Number(id)] === 'war');
/** The leader went against the tribe's interest: his right hand and the members take it badly. */
function unjust(state: WorldState, t: Tribe, rh: Player, why: Txt): void {
  changeMood(state, rh, UNJUST.rightHand, why);
  moodAll(state, t, UNJUST.others, why, rh.id);
}
function rhNews(state: WorldState, kind: 'nap' | 'ally' | 'war' | 'talks', a: Tribe, b: Tribe, dry: Txt): void {
  addNews(state, { kind, tribes: [a.id, b.id], dry, head: dry });
}

/**
 * Tribe `x`'s bot right hand looks at neighbour `y` (once per diplomacy round). He may propose a NAP or
 * open peace talks himself, and ask his leader for an alliance or a war; a human leader hears of it
 * and may answer or undo it. Returns true when he acted (the leaders leave the pair alone this round).
 */
export function rhRound(state: WorldState, x: Tribe, y: Tribe): boolean {
  if (rhNapCheck(state, x, y)) return true;
  // his leader just ended a NAP of his with them: he lets it rest a day
  if ((x.rhBlock?.[y.id] ?? -Infinity) > state.time) return false;
  const id = rightHand(state, x);
  if (id === undefined || id === HUMAN_ID) return false;
  const p = state.players[id];
  if (!p?.bot) return false;
  const arch = p.bot.archetype;
  const rel = x.relations[y.id];
  const since = state.time - (x.since?.[y.id] ?? state.time);
  const { strong, weak, power, need } = warNeed(state, x, y);
  const friction = frictionBetween(x, y);
  const roll = nextFloat(state.rng);
  if (!rel) {
    if (friction < need / 2 && roll < RH_BOT.nap * rw() * (1 - AGGRESSION[arch])) return rhNap(state, x, y, p);
    if (AGGRESSION[arch] >= RH_BOT.warFrom && strong === x && power >= 1.2 && friction >= need / rw() && roll < RH_BOT.war) return rhWar(state, x, y, p);
  } else if (rel === 'nap') {
    if (since > DAY && allyCount(x) < MAX_ALLIES && allyCount(y) < MAX_ALLIES && roll < RH_BOT.ally * SOCIAL[arch] * rw()) return rhAlly(state, x, y, p);
  } else if (rel === 'war') {
    if (since > DAY && !talksOfTribes(state, x.id, y.id) && mayTalk(state, strong, weak) && roll < RH_BOT.peace * (1.2 - AGGRESSION[arch])) {
      startTalks(state, strong, weak);
      rhNews(state, 'talks', x, y, T('{tag}: rechterhand {name} opent vredesbesprekingen met {other}.', { tag: tag(x), name: p.name, other: tag(y) }));
      if (x.leader === HUMAN_ID) addMessage(state, { kind: 'info', from: p.id, tribe: y.id, title: T('Je rechterhand opent vredesbesprekingen met {tag}', { tag: tag(y) }), text: T('{name}: deze oorlog met {tag} kost ons te veel. Ik ben met ze om tafel gegaan.', { name: p.name, tag: tag(y) }) });
      return true;
    }
  }
  return false;
}

/** His NAP: the other side decides (a human leader gets the proposal); his own leader hears of it. */
function rhNap(state: WorldState, x: Tribe, y: Tribe, p: Player): boolean {
  if (x.leader === HUMAN_ID) addMessage(state, { kind: 'info', from: p.id, tribe: y.id, title: T('Je rechterhand stelt {tag} een NAP voor', { tag: tag(y) }), text: T('{name}: ik heb {tag} namens ons een niet-aanvalsverdrag voorgesteld. Dat houdt onze grens rustig.', { name: p.name, tag: tag(y) }) });
  if (y.leader === HUMAN_ID) { proposeToHuman(state, x, 'nap'); return true; }
  const yl = state.players[y.leader];
  if (!yl?.bot) return true;
  const chance = (1 - AGGRESSION[yl.bot.archetype]) * 0.8 + (tribeStrength(state, x) > tribeStrength(state, y) ? 0.2 : 0) - grudge(state, yl, p.id) * 0.5;
  if (nextFloat(state.rng) >= chance) return true;
  setRelation(state, x, y, 'nap', true);
  rhNews(state, 'nap', x, y, T('{tag}: rechterhand {name} sluit een NAP met {other}.', { tag: tag(x), name: p.name, other: tag(y) }));
  addMerit(state, p.id, MERIT.treaty);
  rhTreatyMade(state, x, y, p);
  return true;
}

/** A NAP his right hand made: a human leader may undo it for a day; a bot leader with a grudge frowns (and maybe undoes it, see rhNapCheck). */
function rhTreatyMade(state: WorldState, x: Tribe, y: Tribe, p: Player): void {
  if (x.leader === HUMAN_ID) {
    addMessage(state, { kind: 'rhTreaty', from: p.id, tribe: y.id, title: T('Je rechterhand sloot een NAP met {tag}', { tag: tag(y) }), text: T('{name}: {tag} gaat akkoord met een niet-aanvalsverdrag. Wil je het opzeggen, dan kan dat nu nog.', { name: p.name, tag: tag(y) }), status: 'open', expires: state.time + RH_UNDO_WINDOW });
    return;
  }
  const leader = state.players[x.leader];
  if (!leader?.bot || leaderGrudge(state, leader, y) < GRUDGE) return;
  changeMood(state, p, RH_GRUDGE_STANDING, T('NAP met {tag} tegen de zin van {name}', { tag: tag(y), name: leader.name }));
  (x.rhNaps ??= []).push({ tribe: y.id, at: state.time });
}

/** A bot leader takes one look at a NAP his right hand made against his grudge: an aggressive one ends it. */
function rhNapCheck(state: WorldState, x: Tribe, y: Tribe): boolean {
  const r = x.rhNaps?.find((n) => n.tribe === y.id);
  if (!r) return false;
  x.rhNaps = x.rhNaps!.filter((n) => n !== r);
  const leader = state.players[x.leader];
  if (!leader?.bot || x.relations[y.id] !== 'nap' || state.time - r.at > RH_UNDO_WINDOW) return false;
  if (nextFloat(state.rng) >= AGGRESSION[leader.bot.archetype]) return false;
  setRelation(state, x, y, null, true);
  (x.rhBlock ??= {})[y.id] = state.time + DAY;
  rhNews(state, 'nap', x, y, T('{tag}: leider {name} zegt de NAP met {other} op.', { tag: tag(x), name: leader.name, other: tag(y) }));
  const id = rightHand(state, x);
  const rh = id !== undefined ? state.players[id] : undefined;
  if (!rh?.bot) return true;
  addMerit(state, rh.id, MERIT.treatyUndone);
  // a stronger neighbour you just made an enemy of again: the tribe sees it as a mistake
  if (tribeStrength(state, y) > tribeStrength(state, x)) unjust(state, x, rh, T('{name} zegt de NAP met het sterkere {tag} op', { name: leader.name, tag: tag(y) }));
  return true;
}

/** He asks his leader for an alliance with a NAP partner. */
function rhAlly(state: WorldState, x: Tribe, y: Tribe, p: Player): boolean {
  if (x.leader === HUMAN_ID) {
    if ((state.inbox ?? []).some((m) => m.status === 'open' && m.kind === 'rhAsk')) return false;
    addMessage(state, { kind: 'rhAsk', rhAsk: 'ally', from: p.id, tribe: y.id, title: T('Je rechterhand wil een bondgenootschap met {tag}', { tag: tag(y) }), text: T('{name}: {tag} houdt zich al een tijd aan onze NAP. Zullen we ze een bondgenootschap voorstellen?', { name: p.name, tag: tag(y) }), status: 'open', expires: state.time + DAY });
    return true;
  }
  const leader = state.players[x.leader];
  if (!leader?.bot) return false;
  const chance = SOCIAL[leader.bot.archetype] * 0.7 * rw() - leaderGrudge(state, leader, y) * 0.5;
  if (nextFloat(state.rng) >= chance) {
    if (sharedEnemy(x, y)) unjust(state, x, p, T('{name} wil geen bondgenootschap met {tag}, terwijl we dezelfde vijand hebben', { name: leader.name, tag: tag(y) }));
    return true;
  }
  if (y.leader === HUMAN_ID) { proposeToHuman(state, x, 'ally'); return true; }
  const yl = state.players[y.leader];
  if (!yl?.bot || nextFloat(state.rng) >= SOCIAL[yl.bot.archetype] * 0.7) return true;
  setRelation(state, x, y, 'ally', true);
  rhNews(state, 'ally', x, y, T('{a} en {b} worden bondgenoten, op voorstel van rechterhand {name}.', { a: tag(x), b: tag(y), name: p.name }));
  addMerit(state, p.id, MERIT.treaty);
  return true;
}

/** A fighter as right hand pushes for war (the friction he needs is lower: his rank). */
function rhWar(state: WorldState, x: Tribe, y: Tribe, p: Player): boolean {
  if (x.leader === HUMAN_ID) {
    if ((state.inbox ?? []).some((m) => m.status === 'open' && m.kind === 'rhAsk')) return false;
    addMessage(state, { kind: 'rhAsk', rhAsk: 'war', from: p.id, tribe: y.id, title: T('Je rechterhand wil oorlog met {tag}', { tag: tag(y) }), text: T('{name}: {tag} zit ons al te lang dwars en we zijn sterker. Laten we ze de oorlog verklaren.', { name: p.name, tag: tag(y) }), status: 'open', expires: state.time + DAY });
    return true;
  }
  declareWar(state, x, y, false, T('op aandringen van rechterhand {name}', { name: p.name }));
  return true;
}

/** You as leader answer your bot right hand: undo his NAP (accept = undo), or yes/no to his ask. */
export function answerRh(state: WorldState, m: InboxMessage, accept: boolean): string | null {
  const t = tribeOf(state, HUMAN_ID);
  const y = m.tribe !== undefined ? state.tribes?.[m.tribe] : undefined;
  const p = state.players[m.from];
  if (!t || t.leader !== HUMAN_ID || !y || !p) { m.status = 'expired'; return tr('Dat speelt niet meer.'); }
  if (m.kind === 'rhTreaty') {
    if (!accept) { m.status = 'declined'; return null; }
    if (t.relations[y.id] !== 'nap') { m.status = 'expired'; return tr('Die NAP bestaat niet meer.'); }
    setRelation(state, t, y, null, true);
    rhNews(state, 'nap', t, y, T('{tag}: leider {name} zegt de NAP met {other} op.', { tag: tag(t), name: state.players[HUMAN_ID]?.name ?? 'jij', other: tag(y) }));
    addMerit(state, p.id, MERIT.treatyUndone);
    if (tribeStrength(state, y) > tribeStrength(state, t)) unjust(state, t, p, T('je zegt de NAP met het sterkere {tag} op', { tag: tag(y) }));
    m.status = 'accepted';
    return null;
  }
  // an ask: alliance or war
  if (accept) {
    const e = m.rhAsk === 'war' ? declareAsLeader(state, y.id) : proposeAsLeader(state, y.id);
    m.status = e ? 'expired' : 'accepted';
    return e;
  }
  m.status = 'declined';
  if (m.rhAsk === 'ally' && sharedEnemy(t, y)) unjust(state, t, p, T('je wilt geen bondgenootschap met {tag}, terwijl we dezelfde vijand hebben', { tag: tag(y) }));
  if (m.rhAsk === 'war') {
    const { strong, need } = warNeed(state, t, y);
    if (strong === t && frictionBetween(t, y) >= need) unjust(state, t, p, T('je weigert de oorlog met {tag}, terwijl die al lang verdiend is', { tag: tag(y) }));
  }
  return null;
}
