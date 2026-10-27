/**
 * Tribes (stammen) and diplomacy between them — the bots' strategy layer.
 *
 * Bots found tribes, apply to tribes nearby and accept members that fit: close to the tribe,
 * not on the other side of an enemy and not a weak village in the middle of the tribe's own
 * ground (that one is prey, not a member). Tribes keep relations: ally, NAP or war.
 * Members never attack each other or allies / NAP partners, and help each other defend.
 *
 * Runs on its own slow clock ('diplomacy' event), deterministic through the world rng.
 */
import { BOT_PROFILES, type Archetype } from '../shared/botProfiles';
import { kindness } from '../shared/config';
import { endgameTick, leaderBonus, tribeShares } from './endgame';
import { loyaltyTick } from './loyalty';
import { itemsTick } from './paladin';
import { flagsTick } from './flags';
import { HOUR, MINUTE } from '../shared/time';
import { MAX_MEMBERS } from '../shared/tribes';
import { sawAttack } from './botReact';
import { applyToHuman, humanTribeTick, proposeToHuman, warOnHuman } from './humanTribe';
import { push } from './eventQueue';
import { villagePoints } from './barbarians';
import { nextFloat } from './rng';
import type { TribeView } from '../shared/protocol';
import { BARBARIAN, HUMAN_ID, addLog as addWorldLog, movementIndex, villagesOf, type Player, type WorldState } from './state';

export type Relation = 'ally' | 'nap' | 'war';

export interface Tribe {
  id: number;
  name: string;
  tag: string;
  /** Map colour (#rrggbb). */
  color: string;
  leader: number;
  members: number[];
  founded: number;
  /** Relation to other tribes; missing = neutral. Always kept symmetric. */
  relations: Record<number, Relation>;
  /** When each relation started (for peace after a long war, alliances after a long NAP). */
  since?: Record<number, number>;
}

export { MAX_MEMBERS };
/** How far (in fields) a member may live from the tribe's centre. */
export const REACH = 16;
/** Within this distance of the centre a much weaker bot is prey, not a member. */
const CORE = 6;
/** How often the diplomacy layer runs (game time). */
export const DIPLOMACY_EVERY = 90 * MINUTE;
const MAX_ALLIES = 2;

// --- naming -------------------------------------------------------------------

const NAMES: [string, string][] = [
  ['De Wolven', 'WOLF'], ['IJzeren Vuist', 'VUIST'], ['Zonen van de Storm', 'STORM'], ['Het Zwarte Woud', 'WOUD'],
  ['De Rode Raven', 'RAVEN'], ['Orde van de Eik', 'EIK'], ['Bergvolk', 'BERG'], ['De Zilveren Speer', 'SPEER'],
  ['Kinderen van de Nacht', 'NACHT'], ['Het Gouden Paard', 'PAARD'], ['De Stenen Wacht', 'WACHT'], ['Moerasvolk', 'MOER'],
  ['De Bijlbroeders', 'BIJL'], ['Vuur en Zwaard', 'VUUR'], ['Het Noorderlicht', 'NOORD'], ['De Grijze Valk', 'VALK'],
  ['Heren van de Heuvel', 'HEUVEL'], ['De Laatste Wal', 'WAL'], ['Bloedmaan', 'MAAN'], ['De Oude Eed', 'EED'],
  ['Zwarte Toren', 'TOREN'], ['Kraaiennest', 'KRAAI'], ['De Lange Boog', 'BOOG'], ['Wintervolk', 'WINTER'],
];
/** Distinct from gold (you) and grey (barbarians). */
const COLORS = [
  '#ff6f91', '#4f8fd6', '#5fb56b', '#b06ad6', '#e07ad0', '#3fb5b0', '#d65a9a', '#8fa43a',
  '#6a7ad6', '#70d6c8', '#3f9a6e', '#9ad65a', '#8a5cc2', '#5ac2d6', '#7ad6ff', '#7ab53f',
  '#d67a7a', '#4a6ab0', '#c0c0ff', '#5c9ec2', '#b55a7a', '#6ab09a', '#9a9ad6', '#ff9ab0',
];

/** Diplomacy news: kept apart (the world log scrolls fast) and in the world log. */
function addLog(state: WorldState, entry: { time: number; text: string }): void {
  addWorldLog(state, entry);
  (state.tribeNews ??= []).push(entry);
  if (state.tribeNews.length > 60) state.tribeNews.splice(0, state.tribeNews.length - 60);
}

/** More colours once the palette is used up: spread hues by the golden angle, skipping gold/brown (you, loners). */
function extraColor(used: Set<string>): string {
  for (let i = 0; i < 720; i++) {
    const hue = Math.round((i * 137.508) % 360);
    if (hue >= 20 && hue <= 60) continue;
    const c = `hsl(${hue} ${i % 2 ? 55 : 70}% ${i % 3 ? 62 : 72}%)`;
    if (!used.has(c)) return c;
  }
  return 'hsl(200 60% 65%)';
}

// --- helpers ------------------------------------------------------------------

export function tribeOf(state: WorldState, playerId: number): Tribe | undefined {
  const id = state.players[playerId]?.tribe;
  return id !== undefined ? state.tribes?.[id] : undefined;
}

export function relationBetween(state: WorldState, a: number, b: number): Relation | 'same' | null {
  const ta = tribeOf(state, a), tb = tribeOf(state, b);
  if (!ta || !tb) return null;
  if (ta.id === tb.id) return 'same';
  return ta.relations[tb.id] ?? null;
}

/** May `attacker` attack villages of `defender`? No for tribe mates, allies and NAP partners. */
export function mayAttack(state: WorldState, attacker: number, defender: number): boolean {
  if (attacker === defender) return false;
  if (attacker === BARBARIAN || defender === BARBARIAN) return true;
  const r = relationBetween(state, attacker, defender);
  return r !== 'same' && r !== 'ally' && r !== 'nap';
}

/** Weight for choosing targets: enemies at war are preferred. */
export function targetWeight(state: WorldState, attacker: number, defender: number): number {
  return (relationBetween(state, attacker, defender) === 'war' ? 2.5 : 1) * leaderBonus(state, attacker, defender);
}

/** Centre of a player's villages, weighted by points. */
export function playerCentre(state: WorldState, id: number): { x: number; y: number; points: number } | null {
  const vs = villagesOf(state, id);
  if (!vs.length) return null;
  let x = 0, y = 0, w = 0;
  for (const v of vs) { const p = villagePoints(state.config, v) + 1; x += v.x * p; y += v.y * p; w += p; }
  return { x: x / w, y: y / w, points: w - vs.length };
}
export function tribeCentre(state: WorldState, t: Tribe): { x: number; y: number; points: number } | null {
  let x = 0, y = 0, w = 0;
  for (const m of t.members) { const c = playerCentre(state, m); if (!c) continue; const p = c.points + 1; x += c.x * p; y += c.y * p; w += p; }
  return w ? { x: x / w, y: y / w, points: w } : null;
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Social appetite per archetype: how keen a bot is on tribes. */
export const SOCIAL: Record<Archetype, number> = { diplomat: 1, supporter: 0.9, opportunist: 0.7, farmer: 0.55, rusher: 0.5, turtle: 0.45 };
export const AGGRESSION: Record<Archetype, number> = { rusher: 1, opportunist: 0.8, farmer: 0.35, diplomat: 0.3, supporter: 0.3, turtle: 0.15 };

/**
 * Does `candidate` fit in tribe `t`? Close to the centre, not cut off by an enemy, and not a
 * weak village right in the tribe's own ground (that is prey).
 */
export type FitReason = 'ok' | 'full' | 'far' | 'prey' | 'blocked' | 'gone';

/**
 * How far (fields) a member may live from the tribe's centre: REACH, plus how spread out the
 * tribe already is (points-weighted average distance of its villages to the centre), capped at
 * twice REACH. A big tribe covers more map, so its reach grows with it.
 */
export function reachOf(state: WorldState, t: Tribe, tc = tribeCentre(state, t)): number {
  if (!tc) return REACH;
  let sum = 0, w = 0;
  for (const m of t.members) {
    for (const v of villagesOf(state, m)) {
      const p = villagePoints(state.config, v) + 1;
      sum += Math.hypot(v.x - tc.x, v.y - tc.y) * p;
      w += p;
    }
  }
  const spread = w ? sum / w : 0;
  return Math.min(REACH * 2, REACH + spread);
}

/** Why `candidate` does (not) fit in tribe `t`; see fits(). Also gives the distance and reach used. */
export function fitCheck(state: WorldState, t: Tribe, candidate: number): { reason: FitReason; distance: number; reach: number } {
  const tc = tribeCentre(state, t), cc = playerCentre(state, candidate);
  if (!tc || !cc) return { reason: 'gone', distance: 0, reach: REACH };
  const d = dist(tc, cc);
  // your tribe (or you as candidate): the difficulty makes bots more or less welcoming
  const yours = candidate === HUMAN_ID || t.members.includes(HUMAN_ID);
  const reach = reachOf(state, t, tc) + (yours ? kindness(state.config).reach : 0);
  const out = (reason: FitReason) => ({ reason, distance: d, reach });
  if (t.members.length >= MAX_MEMBERS) return out('full');
  if (d > reach) return out('far');
  const avg = tc.points / Math.max(1, t.members.length);
  if (d < CORE && cc.points < avg * 0.3) return out('prey');
  // in the way: an enemy tribe sits between the candidate and us
  for (const [other, rel] of Object.entries(t.relations)) {
    if (rel !== 'war') continue;
    const e = state.tribes?.[Number(other)];
    const ec = e && tribeCentre(state, e);
    if (ec && dist(cc, ec) < d && dist(ec, tc) < d) return out('blocked');
  }
  return out('ok');
}

export function fits(state: WorldState, t: Tribe, candidate: number): boolean {
  return fitCheck(state, t, candidate).reason === 'ok';
}

export function setRelation(state: WorldState, a: Tribe, b: Tribe, rel: Relation | null): void {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    x.since ??= {};
    if (rel) { x.relations[y.id] = rel; x.since[y.id] = state.time; }
    else { delete x.relations[y.id]; delete x.since[y.id]; }
  }
}

export function leave(state: WorldState, player: Player): void {
  const t = player.tribe !== undefined ? state.tribes?.[player.tribe] : undefined;
  delete player.tribe;
  if (!t) return;
  t.members = t.members.filter((m) => m !== player.id);
  if (!t.members.length) {
    for (const o of Object.values(state.tribes ?? {})) { delete o.relations[t.id]; delete o.since?.[t.id]; }
    delete state.tribes![t.id];
    addLog(state, { time: state.time, text: `Stam [${t.tag}] ${t.name} is opgeheven.` });
    return;
  }
  if (t.leader === player.id) {
    // the strongest member takes over
    t.leader = [...t.members].sort((a, b) => (playerCentre(state, b)?.points ?? 0) - (playerCentre(state, a)?.points ?? 0))[0]!;
  }
}

export function join(state: WorldState, t: Tribe, player: Player): void {
  if (player.tribe !== undefined) leave(state, player);
  player.tribe = t.id;
  t.members.push(player.id);
  // a fresh start with the new leader
  if (player.bot) { delete player.bot.mood; delete player.bot.moodNotes; delete player.bot.complained; }
  if (player.id === HUMAN_ID) { delete state.standing; delete state.standingNotes; delete state.standingWarned; }
}

export function found(state: WorldState, player: Player, own?: { name: string; tag: string }): Tribe {
  const [name, tag] = own ? [own.name, own.tag] : tribeName(state);
  const usedColors = new Set(Object.values(state.tribes ?? {}).map((t) => t.color));
  const color = COLORS.find((c) => !usedColors.has(c)) ?? extraColor(usedColors);
  const id = state.nextId++;
  const t: Tribe = { id, name, tag, color, leader: player.id, members: [], founded: state.time, relations: {}, since: {} };
  state.tribes ??= {};
  state.tribes[id] = t;
  join(state, t, player);
  addLog(state, { time: state.time, text: `${player.name} richt de stam [${tag}] ${name} op.` });
  return t;
}

/** Generated names once the classic list runs out: "De Rode Wolven" [RWOLF]. */
const ADJ: [string, string][] = [
  ['Rode', 'R'], ['Zwarte', 'Z'], ['Witte', 'W'], ['Grijze', 'G'], ['Gouden', 'GD'], ['Zilveren', 'ZL'], ['IJzeren', 'IJ'], ['Stenen', 'ST'],
  ['Wilde', 'WL'], ['Oude', 'O'], ['Laatste', 'L'], ['Stille', 'S'], ['Woeste', 'WO'], ['Koude', 'K'], ['Verborgen', 'V'], ['Eerste', 'E'],
];
const NOUN: [string, string][] = [
  ['Wolven', 'WOLF'], ['Raven', 'RAAF'], ['Beren', 'BEER'], ['Valken', 'VALK'], ['Speren', 'SPEER'], ['Bijlen', 'BIJL'], ['Torens', 'TOREN'], ['Eiken', 'EIK'],
  ['Heuvels', 'HEUVEL'], ['Zwaarden', 'ZWAARD'], ['Schilden', 'SCHILD'], ['Ruiters', 'RUITER'], ['Stieren', 'STIER'], ['Vossen', 'VOS'], ['Adelaars', 'AREND'], ['Kraaien', 'KRAAI'],
  ['Broeders', 'BROER'], ['Wachters', 'WACHT'], ['Jagers', 'JAGER'], ['Zonen', 'ZOON'],
];
function tribeName(state: WorldState): [string, string] {
  const all = Object.values(state.tribes ?? {});
  const tags = new Set(all.map((t) => t.tag)), names = new Set(all.map((t) => t.name));
  const free = NAMES.filter(([n, tag]) => !tags.has(tag) && !names.has(n));
  if (free.length) return free[Math.floor(nextFloat(state.rng) * free.length)]!;
  for (let tries = 0; tries < 50; tries++) {
    const [a, at] = ADJ[Math.floor(nextFloat(state.rng) * ADJ.length)]!;
    const [n, nt] = NOUN[Math.floor(nextFloat(state.rng) * NOUN.length)]!;
    const name = `De ${a} ${n}`, tag = (at + nt).slice(0, 6);
    if (!names.has(name) && !tags.has(tag)) return [name, tag];
  }
  // 16 x 20 combinations taken: number them
  let i = 2;
  while (tags.has(`STAM${i}`)) i++;
  return [`Stam ${i}`, `STAM${i}`];
}

// --- the diplomacy turn -------------------------------------------------------

export function initDiplomacy(state: WorldState): void {
  state.tribes ??= {};
  push(state.queue, state.time + 5 * MINUTE, { kind: 'diplomacy' });
}

export function onDiplomacy(state: WorldState): void {
  state.tribes ??= {};
  const tribes = () => Object.values(state.tribes!);
  const bots = state.players.filter((p) => p.isBot && p.bot && villagesOf(state, p.id).length > 0);

  // members that lost everything leave
  for (const p of state.players) if (p.tribe !== undefined && villagesOf(state, p.id).length === 0) leave(state, p);

  // drift: a member that ended up far from the rest leaves (moved by conquests or a restart)
  for (const t of tribes()) {
    if (t.members.length < 2) continue;
    const tc = tribeCentre(state, t);
    const leaveAt = tc ? reachOf(state, t, tc) * 1.6 : Infinity;
    for (const m of [...t.members]) {
      const c = playerCentre(state, m), p = state.players[m];
      if (tc && c && p?.isBot && dist(tc, c) > leaveAt) {
        leave(state, p);
        addLog(state, { time: state.time, text: `${p.name} verlaat [${t.tag}]: te ver weg.` });
      }
    }
  }

  // solo bots: apply to a tribe nearby, or found one
  const solos = bots.filter((p) => p.tribe === undefined);
  for (let i = solos.length - 1; i > 0; i--) { const j = Math.floor(nextFloat(state.rng) * (i + 1)); [solos[i], solos[j]] = [solos[j]!, solos[i]!]; }
  for (const p of solos) {
    const social = SOCIAL[p.bot!.archetype] * (0.6 + p.bot!.activity * 0.4);
    if (nextFloat(state.rng) > social * 0.05) continue;
    const pc = playerCentre(state, p.id);
    if (!pc) continue;
    const options = tribes().filter((t) => fits(state, t, p.id) && leaderAccepts(state, t, p));
    if (options.length) {
      // opportunists go for strength, the rest for closeness
      const score = (t: Tribe) => { const c = tribeCentre(state, t)!; return p.bot!.archetype === 'opportunist' ? c.points / (5 + dist(c, pc)) : -dist(c, pc) + c.points / 50_000; };
      const best = options.sort((a, b) => score(b) - score(a))[0]!;
      // your tribe: the bot applies, you decide
      if (best.leader === HUMAN_ID) { applyToHuman(state, p, best); continue; }
      join(state, best, p);
      addLog(state, { time: state.time, text: `${p.name} sluit zich aan bij [${best.tag}] ${best.name}.` });
      continue;
    }
    // nothing fits: the social ones start their own
    const nearby = tribes().some((t) => { const c = tribeCentre(state, t); return c && dist(c, pc) < REACH * 0.6; });
    if (!nearby && nextFloat(state.rng) < (p.bot!.archetype === 'diplomat' ? 0.5 : 0.1 * social)) found(state, p);
  }

  diplomacy(state);
  loyaltyTick(state);
  itemsTick(state);
  flagsTick(state);
  endgameTick(state);
  humanTribeTick(state);
  push(state.queue, state.time + DIPLOMACY_EVERY, { kind: 'diplomacy' });
}

/** The leader's view of a candidate: not too weak, and the tribe has room. */
export function leaderAccepts(state: WorldState, t: Tribe, p: Player): boolean {
  if (t.members.length >= MAX_MEMBERS) return false;
  const tc = tribeCentre(state, t), pc = playerCentre(state, p.id);
  if (!tc || !pc) return false;
  const avg = tc.points / Math.max(1, t.members.length);
  return pc.points >= avg * 0.15;
}

/** Relations between neighbouring tribes: NAPs, alliances, wars and peace. */
function diplomacy(state: WorldState): void {
  const list = Object.values(state.tribes ?? {});
  const centres = new Map(list.map((t) => [t.id, tribeCentre(state, t)]));
  const lead = (t: Tribe) => state.players[t.leader]?.bot?.archetype ?? 'diplomat';
  // a tribe you lead: bots don't decide for you, they propose (wars they simply declare)
  const human = (t: Tribe) => t.leader === HUMAN_ID;
  const offer = (a: Tribe, b: Tribe, rel: 'nap' | 'ally' | 'peace'): boolean => {
    if (!human(a) && !human(b)) return false;
    const bot = human(a) ? b : a;
    proposeToHuman(state, bot, rel);
    return true;
  };
  const allies = (t: Tribe) => Object.values(t.relations).filter((r) => r === 'ally').length;
  const warFactor = (t: Tribe) => (t.members.includes(HUMAN_ID) ? kindness(state.config).war : 1);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i]!, b = list[j]!;
    const ca = centres.get(a.id), cb = centres.get(b.id);
    if (!ca || !cb) continue;
    const d = dist(ca, cb);
    if (d > REACH * 2.4) { if (a.relations[b.id] && a.relations[b.id] !== 'war') setRelation(state, a, b, null); continue; }
    const rel = a.relations[b.id];
    const since = state.time - (a.since?.[b.id] ?? state.time);
    const ratio = ca.points / Math.max(1, cb.points);
    const strong = ratio >= 1 ? a : b, weak = strong === a ? b : a;
    const power = Math.max(ratio, 1 / ratio);
    const roll = nextFloat(state.rng);
    if (!rel) {
      // the stronger side may smell blood; the more diplomatic side wants quiet
      const hunger = AGGRESSION[lead(strong)] * Math.min(1, (power - 1) / 1.5);
      if (state.time > 36 * HOUR && roll < hunger * 0.05 * warFactor(weak) && !human(strong)) {
        declareWar(state, strong, weak);
      } else if (roll > 1 - (1 - AGGRESSION[lead(a)]) * (1 - AGGRESSION[lead(b)]) * 0.012) {
        if (offer(a, b, 'nap')) continue;
        setRelation(state, a, b, 'nap');
        addLog(state, { time: state.time, text: `[${a.tag}] en [${b.tag}] sluiten een niet-aanvalsverdrag.` });
      }
    } else if (rel === 'nap') {
      // a long NAP between friendly leaders, both fighting the same enemy, becomes an alliance
      const shared = Object.entries(a.relations).some(([o, r]) => r === 'war' && b.relations[Number(o)] === 'war');
      if (since > 24 * HOUR && allies(a) < MAX_ALLIES && allies(b) < MAX_ALLIES && (shared || roll < 0.01) && SOCIAL[lead(a)] + SOCIAL[lead(b)] > 1.2) {
        if (offer(a, b, 'ally')) continue;
        setRelation(state, a, b, 'ally');
        addLog(state, { time: state.time, text: `[${a.tag}] en [${b.tag}] worden bondgenoten.` });
      } else if (roll < AGGRESSION[lead(strong)] * 0.01 * (power - 1) * warFactor(weak) && !human(strong)) {
        declareWar(state, strong, weak, true);
      }
    } else if (rel === 'war') {
      // a war that drags on between equals ends in peace
      if (since > 48 * HOUR && power < 1.4 && roll < 0.02) {
        if (offer(a, b, 'peace')) continue;
        setRelation(state, a, b, null);
        addLog(state, { time: state.time, text: `[${a.tag}] en [${b.tag}] sluiten vrede.` });
      }
    }
  }
}

/** War between tribes; if it is declared on your tribe you hear it (and the game pauses, if you want). */
export function declareWar(state: WorldState, by: Tribe, on: Tribe, breaksTreaty = false): void {
  setRelation(state, by, on, 'war');
  addLog(state, { time: state.time, text: breaksTreaty ? `[${by.tag}] verbreekt het verdrag en verklaart [${on.tag}] de oorlog.` : `[${by.tag}] verklaart [${on.tag}] de oorlog.` });
  if (state.players[HUMAN_ID]?.tribe === on.id) warOnHuman(state, by, on, breaksTreaty);
}

/** Real attacks on the villages of a tribe that have not landed yet. Read from the movement index: no scans. */
export function threatsFor(state: WorldState, tribeId: number): { village: number; arrives: number }[] {
  const t = state.tribes?.[tribeId];
  if (!t) return [];
  const ix = movementIndex(state);
  const out: { village: number; arrives: number }[] = [];
  for (const member of t.members) {
    if (member === HUMAN_ID) continue;
    for (const v of villagesOf(state, member)) {
      const at = ix.attacks.get(v.id);
      if (!at) continue;
      // only attacks the member saw and called out: an unseen attack gets no help
      for (const [id, arrives] of at) if (arrives > state.time && sawAttack(state, member, id)) out.push({ village: v.id, arrives });
    }
  }
  return out;
}
/** Is `owner` already sending support to `villageId`? */
export function isHelping(state: WorldState, owner: number, villageId: number): boolean {
  return movementIndex(state).supports.has(`${owner}:${villageId}`);
}

/** How much of its defense a bot sends to help: supporters a lot, turtles little. */
export function helpShare(archetype: Archetype): number {
  return { supporter: 0.5, diplomat: 0.3, farmer: 0.2, opportunist: 0.15, rusher: 0.1, turtle: 0.1 }[archetype];
}
void BOT_PROFILES;

/** Tribes for the UI, strongest first. */
export function tribeViews(state: WorldState): TribeView[] {
  const out: TribeView[] = [];
  const shares = new Map(tribeShares(state).map((x) => [x.tribe.id, x.share]));
  for (const t of Object.values(state.tribes ?? {})) {
    let points = 0, villages = 0;
    for (const m of t.members) for (const v of villagesOf(state, m)) { points += villagePoints(state.config, v); villages++; }
    out.push({
      id: t.id, name: t.name, tag: t.tag, color: t.color, leader: t.leader, members: [...t.members], founded: t.founded, points, villages, share: shares.get(t.id) ?? 0,
      relations: Object.entries(t.relations).map(([id, rel]) => ({ id: Number(id), rel, since: t.since?.[Number(id)] ?? t.founded })),
    });
  }
  return out.sort((a, b) => b.points - a.points);
}

/** Diplomacy news (newest first). */
export function tribeNews(state: WorldState): { time: number; text: string }[] {
  return [...(state.tribeNews ?? [])].reverse();
}
