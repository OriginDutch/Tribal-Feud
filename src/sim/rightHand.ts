/**
 * The right hand speaks for the tribe (you, in a bot's tribe). A NAP and peace talks you may start
 * yourself; an alliance (and a war, see askLeaderWar) you ask your leader for, and your rank weighs
 * in his answer. The other tribe treats your proposal like one from the leader. Your leader still
 * has the last word: a NAP with a tribe he holds a grudge against costs you standing, and he may
 * end it again within a day (that costs you rank points).
 */
import { DAY } from '../shared/time';
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
  if (!t) return 'Alleen de rechterhand kan namens de stam voorstellen doen.';
  const o = state.tribes?.[tribeId];
  if (!o || o.id === t.id) return 'Die stam bestaat niet.';
  if (openRh(state)) return 'Je hebt al een voorstel lopen.';
  const no = state.rhNo?.[o.id];
  if (no !== undefined && state.time - no < RH_RETRY) return `${tag(o)} zei net nee. Wacht een halve speldag.`;
  return { t, o };
}

/** As right hand: propose a NAP to a tribe, or open peace talks with one you are at war with. */
export function rhPropose(state: WorldState, tribeId: number, relation: 'nap' | 'peace'): string | null {
  const b = blocker(state, tribeId);
  if (typeof b === 'string') return b;
  const { t, o } = b;
  const rel = t.relations[o.id];
  if (relation === 'peace') {
    if (rel !== 'war') return 'Jullie zijn niet in oorlog met die stam.';
    if (talksOfTribes(state, t.id, o.id)) return 'Er lopen al besprekingen.';
    const strongerMine = tribeStrength(state, t) >= tribeStrength(state, o);
    startTalks(state, strongerMine ? t : o, strongerMine ? o : t);
    addLog(state, { time: state.time, text: `Als rechterhand open je vredesbesprekingen met ${tag(o)}.` });
    return null;
  }
  if (rel === 'war') return 'Jullie zijn in oorlog: open vredesbesprekingen.';
  if (rel) return 'Dat verdrag hebben jullie al.';
  (state.tribeAsks ??= []).push({ kind: 'propose', tribe: o.id, relation: 'nap', at: state.time, by: 'rh' });
  addLog(state, { time: state.time, text: `Als rechterhand stel je ${tag(o)} een niet-aanvalsverdrag voor.` });
  return null;
}

/** As right hand: ask your leader to offer a tribe you have a NAP with an alliance. */
export function rhAskAlly(state: WorldState, tribeId: number): string | null {
  const b = blocker(state, tribeId);
  if (typeof b === 'string') return b;
  const { t, o } = b;
  if (t.relations[o.id] !== 'nap') return 'Eerst een niet-aanvalsverdrag.';
  (state.tribeAsks ??= []).push({ kind: 'allyAsk', tribe: o.id, at: state.time });
  addLog(state, { time: state.time, text: `Je vraagt je leider om ${tag(o)} een bondgenootschap voor te stellen.` });
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
    addMessage(state, { kind: 'answer', from: leader.id, tribe: o.id, title: `${leader.name}: bondgenootschap met ${tag(o)}`, text: `${leader.name}: goed idee. Ik stel ${tag(o)} een bondgenootschap voor.` });
  } else {
    (state.rhNo ??= {})[o.id] = state.time;
    const why = g >= GRUDGE ? `met ${tag(o)}? Na wat ze ons hebben aangedaan? Nee.` : allies >= MAX_ALLIES ? 'we hebben al genoeg bondgenoten.' : `daar zie ik nu niks in.`;
    addMessage(state, { kind: 'answer', from: leader.id, tribe: o.id, title: `${leader.name}: geen bondgenootschap`, text: `${leader.name}: ${why}` });
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
  changeStanding(state, RH_GRUDGE_STANDING, `NAP met ${tag(o)} tegen de zin van ${leader.name}`);
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
      addMessage(state, { kind: 'answer', from: leader.id, tribe: o.id, title: `${leader.name} zegt de NAP met ${tag(o)} op`, text: `${leader.name}: met ${tag(o)} sluiten wij geen verdrag. Ik heb het opgezegd.` });
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
function unjust(state: WorldState, t: Tribe, rh: Player, why: string): void {
  changeMood(state, rh, UNJUST.rightHand, why);
  moodAll(state, t, UNJUST.others, why, rh.id);
}
function rhNews(state: WorldState, kind: 'nap' | 'ally' | 'war' | 'talks', a: Tribe, b: Tribe, dry: string): void {
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
      rhNews(state, 'talks', x, y, `${tag(x)}: rechterhand ${p.name} opent vredesbesprekingen met ${tag(y)}.`);
      if (x.leader === HUMAN_ID) addMessage(state, { kind: 'info', from: p.id, tribe: y.id, title: `Je rechterhand opent vredesbesprekingen met ${tag(y)}`, text: `${p.name}: deze oorlog met ${tag(y)} kost ons te veel. Ik ben met ze om tafel gegaan.` });
      return true;
    }
  }
  return false;
}

/** His NAP: the other side decides (a human leader gets the proposal); his own leader hears of it. */
function rhNap(state: WorldState, x: Tribe, y: Tribe, p: Player): boolean {
  if (x.leader === HUMAN_ID) addMessage(state, { kind: 'info', from: p.id, tribe: y.id, title: `Je rechterhand stelt ${tag(y)} een NAP voor`, text: `${p.name}: ik heb ${tag(y)} namens ons een niet-aanvalsverdrag voorgesteld. Dat houdt onze grens rustig.` });
  if (y.leader === HUMAN_ID) { proposeToHuman(state, x, 'nap'); return true; }
  const yl = state.players[y.leader];
  if (!yl?.bot) return true;
  const chance = (1 - AGGRESSION[yl.bot.archetype]) * 0.8 + (tribeStrength(state, x) > tribeStrength(state, y) ? 0.2 : 0) - grudge(state, yl, p.id) * 0.5;
  if (nextFloat(state.rng) >= chance) return true;
  setRelation(state, x, y, 'nap', true);
  rhNews(state, 'nap', x, y, `${tag(x)}: rechterhand ${p.name} sluit een NAP met ${tag(y)}.`);
  addMerit(state, p.id, MERIT.treaty);
  rhTreatyMade(state, x, y, p);
  return true;
}

/** A NAP his right hand made: a human leader may undo it for a day; a bot leader with a grudge frowns (and maybe undoes it, see rhNapCheck). */
function rhTreatyMade(state: WorldState, x: Tribe, y: Tribe, p: Player): void {
  if (x.leader === HUMAN_ID) {
    addMessage(state, { kind: 'rhTreaty', from: p.id, tribe: y.id, title: `Je rechterhand sloot een NAP met ${tag(y)}`, text: `${p.name}: ${tag(y)} gaat akkoord met een niet-aanvalsverdrag. Wil je het opzeggen, dan kan dat nu nog.`, status: 'open', expires: state.time + RH_UNDO_WINDOW });
    return;
  }
  const leader = state.players[x.leader];
  if (!leader?.bot || leaderGrudge(state, leader, y) < GRUDGE) return;
  changeMood(state, p, RH_GRUDGE_STANDING, `NAP met ${tag(y)} tegen de zin van ${leader.name}`);
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
  rhNews(state, 'nap', x, y, `${tag(x)}: leider ${leader.name} zegt de NAP met ${tag(y)} op.`);
  const id = rightHand(state, x);
  const rh = id !== undefined ? state.players[id] : undefined;
  if (!rh?.bot) return true;
  addMerit(state, rh.id, MERIT.treatyUndone);
  // a stronger neighbour you just made an enemy of again: the tribe sees it as a mistake
  if (tribeStrength(state, y) > tribeStrength(state, x)) unjust(state, x, rh, `${leader.name} zegt de NAP met het sterkere ${tag(y)} op`);
  return true;
}

/** He asks his leader for an alliance with a NAP partner. */
function rhAlly(state: WorldState, x: Tribe, y: Tribe, p: Player): boolean {
  if (x.leader === HUMAN_ID) {
    if ((state.inbox ?? []).some((m) => m.status === 'open' && m.kind === 'rhAsk')) return false;
    addMessage(state, { kind: 'rhAsk', rhAsk: 'ally', from: p.id, tribe: y.id, title: `Je rechterhand wil een bondgenootschap met ${tag(y)}`, text: `${p.name}: ${tag(y)} houdt zich al een tijd aan onze NAP. Zullen we ze een bondgenootschap voorstellen?`, status: 'open', expires: state.time + DAY });
    return true;
  }
  const leader = state.players[x.leader];
  if (!leader?.bot) return false;
  const chance = SOCIAL[leader.bot.archetype] * 0.7 * rw() - leaderGrudge(state, leader, y) * 0.5;
  if (nextFloat(state.rng) >= chance) {
    if (sharedEnemy(x, y)) unjust(state, x, p, `${leader.name} wil geen bondgenootschap met ${tag(y)}, terwijl we dezelfde vijand hebben`);
    return true;
  }
  if (y.leader === HUMAN_ID) { proposeToHuman(state, x, 'ally'); return true; }
  const yl = state.players[y.leader];
  if (!yl?.bot || nextFloat(state.rng) >= SOCIAL[yl.bot.archetype] * 0.7) return true;
  setRelation(state, x, y, 'ally', true);
  rhNews(state, 'ally', x, y, `${tag(x)} en ${tag(y)} worden bondgenoten, op voorstel van rechterhand ${p.name}.`);
  addMerit(state, p.id, MERIT.treaty);
  return true;
}

/** A fighter as right hand pushes for war (the friction he needs is lower: his rank). */
function rhWar(state: WorldState, x: Tribe, y: Tribe, p: Player): boolean {
  if (x.leader === HUMAN_ID) {
    if ((state.inbox ?? []).some((m) => m.status === 'open' && m.kind === 'rhAsk')) return false;
    addMessage(state, { kind: 'rhAsk', rhAsk: 'war', from: p.id, tribe: y.id, title: `Je rechterhand wil oorlog met ${tag(y)}`, text: `${p.name}: ${tag(y)} zit ons al te lang dwars en we zijn sterker. Laten we ze de oorlog verklaren.`, status: 'open', expires: state.time + DAY });
    return true;
  }
  declareWar(state, x, y, false, `op aandringen van rechterhand ${p.name}`);
  return true;
}

/** You as leader answer your bot right hand: undo his NAP (accept = undo), or yes/no to his ask. */
export function answerRh(state: WorldState, m: InboxMessage, accept: boolean): string | null {
  const t = tribeOf(state, HUMAN_ID);
  const y = m.tribe !== undefined ? state.tribes?.[m.tribe] : undefined;
  const p = state.players[m.from];
  if (!t || t.leader !== HUMAN_ID || !y || !p) { m.status = 'expired'; return 'Dat speelt niet meer.'; }
  if (m.kind === 'rhTreaty') {
    if (!accept) { m.status = 'declined'; return null; }
    if (t.relations[y.id] !== 'nap') { m.status = 'expired'; return 'Die NAP bestaat niet meer.'; }
    setRelation(state, t, y, null, true);
    rhNews(state, 'nap', t, y, `${tag(t)}: leider ${state.players[HUMAN_ID]?.name ?? 'jij'} zegt de NAP met ${tag(y)} op.`);
    addMerit(state, p.id, MERIT.treatyUndone);
    if (tribeStrength(state, y) > tribeStrength(state, t)) unjust(state, t, p, `je zegt de NAP met het sterkere ${tag(y)} op`);
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
  if (m.rhAsk === 'ally' && sharedEnemy(t, y)) unjust(state, t, p, `je wilt geen bondgenootschap met ${tag(y)}, terwijl we dezelfde vijand hebben`);
  if (m.rhAsk === 'war') {
    const { strong, need } = warNeed(state, t, y);
    if (strong === t && frictionBetween(t, y) >= need) unjust(state, t, p, `je weigert de oorlog met ${tag(y)}, terwijl die al lang verdiend is`);
  }
  return null;
}
