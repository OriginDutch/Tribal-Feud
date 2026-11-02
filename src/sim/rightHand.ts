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
import { addMessage } from './humanTribe';
import { changeStanding } from './loyalty';
import { MERIT, RANK_WEIGHT, addMerit, rightHand } from './ranks';
import { nextFloat } from './rng';
import { HUMAN_ID, addLog, type Player, type TribeAsk, type WorldState } from './state';
import { startTalks, talksOfTribes } from './talks';
import { AGGRESSION, MAX_ALLIES, SOCIAL, setRelation, tribeOf, type Tribe } from './tribes';
import { tribeStrength } from './warCause';

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
