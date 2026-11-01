/**
 * Your coup: as a member of a bot tribe you can try to take over from its leader. The chance is
 * shown before you try. It rests on how unhappy the bots are with their leader (that counts most),
 * your rank, and how big you are next to him. It works: you lead, the old leader leaves with a
 * grudge, and the bots that still liked him may go with him. It fails: you are thrown out and an
 * outlaw for a while. Recruits can't try.
 */
import type { CoupView } from '../shared/protocol';
import { addMessage, alertHuman } from './humanTribe';
import { BASE_MOOD, moodOf } from './loyalty';
import { addNews } from './news';
import { outlawFrom } from './nobleRole';
import { RANK_NAMES, isRecruit, rankOf, rankWeight } from './ranks';
import { nextFloat } from './rng';
import { HUMAN_ID, addLog, villagesOf, type Player, type WorldState } from './state';
import { found, join, leave, playerCentre, setLeader, tribeOf, type Tribe } from './tribes';
import { villagePoints } from './barbarians';

/** The chance never goes below or above these. */
export const COUP_MIN = 0.02;
export const COUP_MAX = 0.9;
/** What it starts from, before discontent, size and rank. */
const COUP_BASE = 0.05;
/** Discontent (0..1) is worth this much: no bot happy with the leader = +50%. */
const COUP_DISCONTENT = 0.5;
/** Mood at which the bots are fully content (no discontent at all). */
const CONTENT_MOOD = 80;
/** Being as big as the leader is neutral; all the points on your side +20%, none -20%. */
const COUP_SIZE = 0.2;
/** Bots that liked their old leader this much may follow him out. */
const FOLLOW_MOOD = 70;
const FOLLOW_CHANCE = 0.5;
/** The grudge of the leader you pushed out. */
const COUP_GRUDGE = 1.5;

const pointsOf = (state: WorldState, id: number) => villagesOf(state, id).reduce((a, v) => a + villagePoints(state.config, v), 0);

/** Why you can't try now, or null. */
function blocker(state: WorldState, t: Tribe | undefined): string | null {
  if (!t) return 'Je zit niet in een stam.';
  if (t.leader === HUMAN_ID) return 'Jij bent al de leider.';
  if (!state.players[t.leader]?.bot) return 'Alleen tegen een botleider.';
  if (isRecruit(state, t, HUMAN_ID)) return 'Als rekruut heb je nog geen gezag: wacht tot je krijger bent.';
  return null;
}

/** The chance now, and what makes it. */
export function coupChance(state: WorldState, t: Tribe): { chance: number; why: string[] } {
  const bots = t.members.filter((m) => m !== t.leader && m !== HUMAN_ID && state.players[m]?.bot);
  const avg = bots.length ? bots.reduce((a, m) => a + moodOf(state.players[m]!), 0) / bots.length : BASE_MOOD;
  const discontent = Math.max(0, Math.min(1, (CONTENT_MOOD - avg) / CONTENT_MOOD));
  const mine = pointsOf(state, HUMAN_ID), his = pointsOf(state, t.leader);
  const share = mine + his > 0 ? mine / (mine + his) : 0.5;
  const rank = rankWeight(state, t, HUMAN_ID);
  const raw = (COUP_BASE + COUP_DISCONTENT * discontent + COUP_SIZE * (2 * share - 1)) * rank;
  const chance = Math.max(COUP_MIN, Math.min(COUP_MAX, raw));
  const leader = state.players[t.leader]?.name ?? '?';
  const why = [
    bots.length ? `stemming over ${leader}: gemiddeld ${Math.round(avg)} (${avg < 40 ? 'onrustig, dat helpt je' : avg < 65 ? 'gemengd' : 'tevreden, dat werkt tegen'})` : 'geen botleden om je te steunen',
    `jouw punten tegenover de zijne: ${Math.round(share * 100)}%`,
    `jouw rang: ${RANK_NAMES[rankOf(state, t, HUMAN_ID)].toLowerCase()} (×${rank.toFixed(1)})`,
  ];
  return { chance, why };
}

export function coupView(state: WorldState): CoupView | null {
  const t = tribeOf(state, HUMAN_ID);
  if (!t || t.leader === HUMAN_ID) return null;
  const b = blocker(state, t);
  if (b) return { chance: 0, why: [], blocker: b };
  const { chance, why } = coupChance(state, t);
  return { chance, why };
}

/** You try. (`roll` only for tests: 0 always works, 1 always fails.) */
export function attemptCoup(state: WorldState, roll?: number): string | null {
  const t = tribeOf(state, HUMAN_ID);
  const b = blocker(state, t);
  if (b || !t) return b;
  const old = state.players[t.leader]!;
  const { chance } = coupChance(state, t);
  const c = playerCentre(state, HUMAN_ID);
  const at = c ? { x: Math.round(c.x), y: Math.round(c.y) } : {};
  const me = state.players[HUMAN_ID]!;
  if ((roll ?? nextFloat(state.rng)) < chance) {
    // the bots that still liked him: they may go with him (he starts anew)
    const followers = t.members.filter((m) => m !== old.id && m !== HUMAN_ID && state.players[m]?.bot && moodOf(state.players[m]!) >= FOLLOW_MOOD && nextFloat(state.rng) < FOLLOW_CHANCE);
    setLeader(state, t, HUMAN_ID);
    leave(state, old);
    grudge(state, old);
    let gone = '';
    if (followers.length) {
      const nt = found(state, old);
      for (const f of followers) join(state, nt, state.players[f]!);
      gone = ` ${followers.map((f) => state.players[f]?.name ?? '?').join(', ')} ${followers.length === 1 ? 'gaat' : 'gaan'} met hem mee naar [${nt.tag}].`;
    }
    // a fresh start for whoever stayed
    for (const m of t.members) { const p = state.players[m]; if (p?.bot) { p.bot.mood = BASE_MOOD; delete p.bot.moodNotes; } }
    const text = `Machtsgreep geslaagd: jij leidt nu [${t.tag}]. ${old.name} is weg en zint op wraak.${gone}`;
    addLog(state, { time: state.time, text });
    (state.tribeNews ??= []).push({ time: state.time, text });
    addNews(state, { kind: 'leader', tribes: [t.id], players: [HUMAN_ID, old.id], ...at,
      dry: `[${t.tag}]: ${me.name} zet ${old.name} af als leider.`, head: [`Paleisrevolutie bij [${t.tag}]: ${me.name} grijpt de macht`, `${old.name} van de troon gestoten bij [${t.tag}]`] });
    return null;
  }
  // it failed: out, and hunted for a while
  outlawFrom(state, me, t);
  grudge(state, old);
  delete state.standing; delete state.standingNotes; delete state.leaderOrder; delete state.scoutOrders;
  const text = `Machtsgreep mislukt: ${old.name} houdt stand en gooit je uit [${t.tag}]. Je bent een tijd vogelvrij.`;
  addLog(state, { time: state.time, text });
  (state.tribeNews ??= []).push({ time: state.time, text });
  addMessage(state, { kind: 'war', from: old.id, tribe: t.id, title: 'Machtsgreep mislukt', text: `${old.name}: dacht je nou echt dat de stam achter jou stond? Eruit.` });
  addNews(state, { kind: 'leader', tribes: [t.id], players: [HUMAN_ID, old.id], ...at,
    dry: `[${t.tag}]: ${me.name} probeert ${old.name} af te zetten en wordt de stam uit gegooid.`, head: [`Mislukte coup bij [${t.tag}]: ${me.name} eruit`, `${old.name} slaat opstand neer in [${t.tag}]`] });
  alertHuman(state, text);
  return null;
}

function grudge(state: WorldState, p: Player): void {
  if (!p.bot) return;
  (p.bot.grudges ??= {})[HUMAN_ID] = { score: COUP_GRUDGE, at: state.time, why: 'machtsgreep' };
}
