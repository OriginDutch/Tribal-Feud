/**
 * Peace talks between two tribes at war.
 *
 * At most three bids: the winner offers, the loser counters, the winner counters once more; then
 * the loser says yes or no. Each round the side whose turn it is votes (its own members only):
 * accept the bid on the table, make a bid (the leader's suggestion or a member's alternative), or
 * break off. Most votes wins; on a tie the leader's choice wins; who doesn't vote doesn't count.
 * A round lasts 12 game hours (world speed 1). No agreement: the war goes on.
 *
 * During the talks there is a NAP. Attacks underway when they start turn around. Whoever attacks
 * the other side anyway is thrown out of his tribe and outlawed: members of both tribes may take
 * his villages, no friction and no permission needed (see outlaws). He may join a tribe again later.
 *
 * Terms: villages (the loser's lowest-scoring villages, never someone's home or last village) and
 * resources (a total, paid by each loser member by his share of the tribe's points, with
 * merchants: see reparations). With no villages to give, only resources can be asked.
 *
 * Bot tribes talk among themselves by the same rules, without inbox messages.
 */
import { DAY, HOUR } from '../shared/time';
import { villagePoints } from './barbarians';
import { push } from './eventQueue';
import { addMessage, alertHuman } from './humanTribe';
import { addNews } from './news';
import { cedeVillages } from './peace';
import { nextFloat } from './rng';
import { HUMAN_ID, addLog, addMovement, nextId, removeMovement, villagesOf, type Player, type WorldState } from './state';
import { AGGRESSION, between, leave, tribeCentre as tribeCentreOf, tribeOf, type Tribe } from './tribes';
import { tribeStrength } from './warCause';
import { addReparations } from './reparations';
import { addDuty, offensiveSpace } from './duties';
import type { Village } from './village';
import { T, tr, type Txt } from '../shared/i18n';

export const ROUND_HOURS = 12;
export const MAX_BIDS = 3;
/** How long an outlaw stays outlawed after the talks (game days, world speed 1). */
export const OUTLAW_DAYS = 7;
/** Resources a ceded village is worth when bots weigh terms (per point of the village). */
const RES_PER_POINT = 60;

export interface Terms {
  villages: number;
  resources: number;
  /** Help in attacks: every loser member sends at least `space` farm space of offensive troops at `target` (a tribe). */
  help?: { target: number; space: number };
}

export interface TalksOption {
  id: number;
  kind: 'accept' | 'bid' | 'reject';
  terms?: Terms;
  /** Who put this bid forward (the leader's suggestion or a member's alternative). */
  author?: number;
}

export interface Talks {
  id: number;
  winner: number;
  loser: number;
  startedAt: number;
  /** The bids so far, in order (winner, loser, winner). */
  bids: { side: number; terms: Terms }[];
  /** The tribe deciding now. */
  side: number;
  until: number;
  options: TalksOption[];
  /** Player id → option id. */
  votes: Record<number, number>;
}

export interface Outlaw {
  /** The two tribes whose members may take his villages. */
  tribes: number[];
  until: number;
}

const tg = (t: Tribe) => `[${t.tag}]`;
const round = (n: number) => Math.round(n / 1000) * 1000;

/** The terms as kept text (news, inbox). */
export function termsText(t: Terms, state?: WorldState): Txt {
  const parts: Txt[] = [];
  if (t.villages > 0) parts.push(t.villages === 1 ? T('{n} dorp', { n: t.villages }) : T('{n} dorpen', { n: t.villages }));
  if (t.resources > 0) parts.push(T('{n} grondstoffen', { n: Math.round(t.resources) }));
  if (t.help && t.help.space > 0) {
    const tag = state?.tribes?.[t.help.target]?.tag;
    parts.push(tag
      ? T('hulp: {space} boerderijplekken aanval per lid tegen [{tag}]', { space: t.help.space, tag })
      : T('hulp: {space} boerderijplekken aanval per lid', { space: t.help.space }));
  }
  if (!parts.length) return T('niets');
  return parts.slice(1).reduce<Txt>((a, b) => T('{a} + {b}', { a, b }), parts[0]!);
}

// --- lookups --------------------------------------------------------------------

export function talksBetween(state: WorldState, a: number, b: number): Talks | undefined {
  const ta = tribeOf(state, a), tb = tribeOf(state, b);
  if (!ta || !tb || ta.id === tb.id) return undefined;
  return talksOfTribes(state, ta.id, tb.id);
}

export function talksOfTribes(state: WorldState, a: number, b: number): Talks | undefined {
  return (state.talks ?? []).find((t) => (t.winner === a && t.loser === b) || (t.winner === b && t.loser === a));
}

export function isOutlaw(state: WorldState, id: number): boolean {
  const o = state.outlaws?.[id];
  return !!o && state.time <= o.until;
}

/** May `hunter` go after `outlaw` freely (member of one of the two tribes)? */
export function huntsOutlaw(state: WorldState, hunter: number, outlaw: number): boolean {
  const o = state.outlaws?.[outlaw];
  if (!o || state.time > o.until) return false;
  const t = state.players[hunter]?.tribe;
  return t !== undefined && o.tribes.includes(t);
}

/** A player's home village: his first one (kept from the start), else his biggest. */
export function homeOf(state: WorldState, player: Player): Village | undefined {
  const own = villagesOf(state, player.id);
  const kept = player.home !== undefined ? own.find((v) => v.id === player.home) : undefined;
  if (kept) return kept;
  return own.reduce<Village | undefined>((a, v) => (!a || villagePoints(state.config, v) > villagePoints(state.config, a) ? v : a), undefined);
}

/** The loser's villages that may be ceded, lowest score first: never someone's home or last village. */
export function cedable(state: WorldState, loser: Tribe): Village[] {
  const pool: Village[] = [];
  for (const m of loser.members) {
    const p = state.players[m];
    if (!p) continue;
    const own = villagesOf(state, m);
    if (own.length < 2) continue;
    const home = homeOf(state, p);
    pool.push(...own.filter((v) => v.id !== home?.id));
  }
  return pool.sort((a, b) => villagePoints(state.config, a) - villagePoints(state.config, b) || a.id - b.id);
}

function tribePoints(state: WorldState, t: Tribe): number {
  let sum = 0;
  for (const m of t.members) for (const v of villagesOf(state, m)) sum += villagePoints(state.config, v);
  return sum;
}

/** What a side would ask or offer: villages by how badly the war went, resources by the loser's size. */
export function suggestion(state: WorldState, winner: Tribe, loser: Tribe, severity = 1): Terms {
  const power = tribeStrength(state, winner) / Math.max(1, tribeStrength(state, loser));
  const free = cedable(state, loser).length;
  const base = Math.max(1, Math.min(4, Math.round(power - 1.5)));
  const villages = Math.max(0, Math.min(free, Math.round(base * severity)));
  // no villages to give: the price is paid in resources
  const perVillage = Math.max(1000, (tribePoints(state, loser) / Math.max(1, loser.members.length)) * RES_PER_POINT * 0.3);
  const resources = round(Math.max(0, (base * severity - villages) * perVillage + tribePoints(state, loser) * 8 * Math.min(3, Math.max(0.5, power - 1)) * severity));
  const help = helpSuggestion(state, winner, loser, severity);
  return help ? { villages, resources, help } : { villages, resources };
}

/** The winner wants help against another enemy of his (the nearest one at war with him), if any. */
function helpSuggestion(state: WorldState, winner: Tribe, loser: Tribe, severity: number): Terms['help'] | undefined {
  const c = tribeCentreOf(state, winner);
  const enemies = Object.entries(winner.relations).filter(([id, r]) => r === 'war' && Number(id) !== loser.id).map(([id]) => state.tribes?.[Number(id)]).filter((t): t is Tribe => !!t);
  if (!c || !enemies.length) return undefined;
  const target = enemies.sort((a, b) => dist(state, a, c) - dist(state, b, c))[0]!;
  // a third of what an average loser member has in offensive troops
  const avg = loser.members.reduce((s, m) => s + villagesOf(state, m).reduce((x, v) => x + offensiveSpace(state, v.units), 0), 0) / Math.max(1, loser.members.length);
  const space = Math.round((avg * 0.33 * severity) / 100) * 100;
  return space >= 200 ? { target: target.id, space } : undefined;
}
const dist = (state: WorldState, t: Tribe, c: { x: number; y: number }) => { const x = tribeCentreOf(state, t); return x ? Math.hypot(x.x - c.x, x.y - c.y) : Infinity; };

/** How heavy terms are, as a fraction of the "fair" terms (1 = what the war's outcome says). */
function weight(state: WorldState, t: Talks, terms: Terms): number {
  const winner = state.tribes?.[t.winner], loser = state.tribes?.[t.loser];
  if (!winner || !loser) return 1;
  const fair = suggestion(state, winner, loser);
  const perVillage = Math.max(1000, (tribePoints(state, loser) / Math.max(1, loser.members.length)) * RES_PER_POINT * 0.3);
  // help: each member's farm space, as if it were resources (a soldier costs ~130 resources)
  const value = (x: Terms) => x.villages * perVillage + x.resources + (x.help ? x.help.space * loser.members.length * 130 : 0);
  return value(terms) / Math.max(1, value(fair));
}

// --- starting -------------------------------------------------------------------

/** Talks start: a NAP for the duration, attacks underway between the two turn around. */
export function startTalks(state: WorldState, winner: Tribe, loser: Tribe): Talks | null {
  if (talksOfTribes(state, winner.id, loser.id)) return null;
  const t: Talks = { id: nextId(state), winner: winner.id, loser: loser.id, startedAt: state.time, bids: [], side: winner.id, until: 0, options: [], votes: {} };
  (state.talks ??= []).push(t);
  recallAttacks(state, winner, loser);
  addNews(state, { kind: 'talks', tribes: [winner.id, loser.id], ...between(state, winner, loser),
    dry: T('{a} en {b} gaan aan tafel voor vredesbesprekingen.', { a: tg(winner), b: tg(loser) }),
    head: [
      T('Witte vlaggen: {a} en {b} praten over vrede', { a: tg(winner), b: tg(loser) }),
      T('Gesprekken in de oorlog tussen {a} en {b}', { a: tg(winner), b: tg(loser) }),
      T('Wapenstilstand: {a} en {b} aan de onderhandelingstafel', { a: tg(winner), b: tg(loser) }),
    ] });
  openRound(state, t);
  return t;
}

/** All attacks between members of the two tribes turn around; they are as long home as they walked. */
function recallAttacks(state: WorldState, a: Tribe, b: Tribe): void {
  const side = (owner: number) => state.players[owner]?.tribe;
  for (const m of Object.values(state.movements)) {
    if (m.kind !== 'attack' || m.arrives <= state.time) continue;
    const target = state.villages[m.to];
    if (!target || target.owner < 0) continue;
    const s1 = side(m.owner), s2 = side(target.owner);
    if (!((s1 === a.id && s2 === b.id) || (s1 === b.id && s2 === a.id))) continue;
    removeMovement(state, m.id);
    const back = { id: nextId(state), kind: 'return' as const, owner: m.owner, from: m.to, to: m.from, units: { ...m.units }, sent: state.time, arrives: state.time + Math.max(1, state.time - m.sent) };
    addMovement(state, back);
    push(state.queue, back.arrives, { kind: 'arrive', movementId: back.id });
  }
}

// --- rounds -----------------------------------------------------------------------

function sideTribes(state: WorldState, t: Talks): { me: Tribe; other: Tribe; winner: Tribe; loser: Tribe } | null {
  const winner = state.tribes?.[t.winner], loser = state.tribes?.[t.loser];
  if (!winner || !loser) return null;
  const me = t.side === winner.id ? winner : loser;
  return { me, other: me === winner ? loser : winner, winner, loser };
}

/** Clamp terms to what can be given: no more villages than can be ceded, no negative numbers. */
export function clampTerms(state: WorldState, t: Talks, terms: Terms): Terms {
  const loser = state.tribes?.[t.loser];
  const free = loser ? cedable(state, loser).length : 0;
  const out: Terms = { villages: Math.max(0, Math.min(free, Math.floor(terms.villages))), resources: Math.max(0, round(terms.resources)) };
  const h = terms.help;
  // help only against a tribe that exists and is not one of the two
  if (h && h.space > 0 && state.tribes?.[h.target] && h.target !== t.winner && h.target !== t.loser) out.help = { target: h.target, space: Math.round(h.space / 100) * 100 };
  if (out.help && out.help.space <= 0) delete out.help;
  return out;
}

const scale = (h: Terms['help'], f: number): Terms['help'] => (h ? { target: h.target, space: h.space * f } : undefined);

/** The leader's suggestion for this round. */
function leaderBid(state: WorldState, t: Talks): Terms {
  const s = sideTribes(state, t)!;
  const last = t.bids.at(-1)?.terms;
  if (t.side === t.winner) {
    // first: the full price; the last word: halfway to what the loser offered
    const full = suggestion(state, s.winner, s.loser, 0.8 + 0.4 * AGGRESSION[lead(state, s.me)]);
    if (!last) return full;
    const mine = t.bids.filter((b) => b.side === t.winner).at(-1)!.terms;
    const help = mine.help ? { target: mine.help.target, space: (mine.help.space + (last.help?.space ?? 0)) / 2 } : undefined;
    return clampTerms(state, t, { villages: Math.round((mine.villages + last.villages) / 2), resources: (mine.resources + last.resources) / 2, ...(help ? { help } : {}) });
  }
  // the loser counters with less
  const give = 0.35 + 0.3 * (1 - AGGRESSION[lead(state, s.me)]);
  const help = scale(last?.help, give);
  return clampTerms(state, t, { villages: Math.floor((last?.villages ?? 0) * give), resources: (last?.resources ?? 0) * give, ...(help ? { help } : {}) });
}

const lead = (state: WorldState, tribe: Tribe) => state.players[tribe.leader]?.bot?.archetype ?? 'diplomat';

function openRound(state: WorldState, t: Talks): void {
  const s = sideTribes(state, t);
  if (!s) { end(state, t); return; }
  t.until = state.time + (ROUND_HOURS * HOUR) / state.config.worldSpeed;
  t.votes = {};
  t.options = [];
  const opt = (o: Omit<TalksOption, 'id'>) => { const x = { id: nextId(state), ...o }; t.options.push(x); return x; };
  if (t.bids.length) opt({ kind: 'accept' });
  if (t.bids.length < MAX_BIDS) opt({ kind: 'bid', terms: leaderBid(state, t), author: s.me.leader });
  // bots with a strong opinion put an alternative on the table (two at most)
  if (t.bids.length < MAX_BIDS) {
    let alts = 0;
    for (const m of s.me.members) {
      const p = state.players[m];
      if (!p?.bot || m === s.me.leader || alts >= 2) continue;
      const a = AGGRESSION[p.bot.archetype];
      if ((a < 0.8 && a > 0.3) || nextFloat(state.rng) > 0.25) continue;
      const base = t.options.find((o) => o.kind === 'bid')!.terms!;
      // hawks ask more / give less, doves the other way round
      const f = t.side === t.winner ? (a >= 0.8 ? 1.4 : 0.7) : (a >= 0.8 ? 0.6 : 1.3);
      const help = scale(base.help, f);
      opt({ kind: 'bid', terms: clampTerms(state, t, { villages: Math.round(base.villages * f), resources: base.resources * f, ...(help ? { help } : {}) }), author: m });
      alts++;
    }
  }
  // breaking off is always the last choice on the list
  opt({ kind: 'reject' });
  push(state.queue, t.until, { kind: 'talks', talks: t.id });
  botVotes(state, t);
  if (s.me.members.includes(HUMAN_ID)) {
    const asked = t.bids.at(-1);
    addMessage(state, {
      kind: 'talks',
      from: s.other.leader,
      tribe: s.other.id,
      talks: t.id,
      title: T('Vredesbesprekingen met {tribe}: jullie zijn aan zet', { tribe: tg(s.other) }),
      text: asked
        ? t.bids.length >= MAX_BIDS
          ? T('{tribe} biedt: {terms}. Stem in de stamtab: accepteren, een tegenbod doen (kan niet meer: dit was het laatste bod) of afbreken.', { tribe: tg(s.other), terms: termsText(asked.terms, state) })
          : T('{tribe} biedt: {terms}. Stem in de stamtab: accepteren, een tegenbod doen of afbreken.', { tribe: tg(s.other), terms: termsText(asked.terms, state) })
        : T('De besprekingen beginnen. Stem in de stamtab over het eerste bod aan {tribe}.', { tribe: tg(s.other) }),
    });
    alertHuman(state, tr('Vredesbesprekingen met {tribe}: jullie zijn aan zet.', { tribe: tg(s.other) }));
  }
}

/** Bots vote at the start of a round (who is online; casuals that are away don't). */
function botVotes(state: WorldState, t: Talks): void {
  const s = sideTribes(state, t)!;
  const power = tribeStrength(state, s.winner) / Math.max(1, tribeStrength(state, s.loser));
  for (const m of s.me.members) {
    const p = state.players[m];
    if (!p?.bot) continue;
    const away = p.bot.awayUntil !== undefined && p.bot.awayUntil > state.time;
    if (away && m !== s.me.leader) continue;
    const a = AGGRESSION[p.bot.archetype];
    const winning = t.side === t.winner;
    const score = (o: TalksOption): number => {
      const noise = nextFloat(state.rng) * 0.1;
      if (o.kind === 'reject') return (winning ? (a - 0.55) * 0.6 : (a - 0.75) * 0.6 - 0.1 * (power - 2)) + noise;
      const w = o.kind === 'accept' ? weight(state, t, t.bids.at(-1)!.terms) : weight(state, t, o.terms!);
      if (o.kind === 'accept') return (winning ? w - (0.75 + 0.35 * a) : 0.95 + 0.35 * (1 - a) + 0.08 * (power - 2) - w) + noise;
      // a bid: how close to what this member wants
      const want = winning ? 0.8 + 0.6 * a : 0.35 + 0.4 * (1 - a);
      return 0.25 - Math.abs(w - want) + (o.author === m ? 0.1 : 0) + noise;
    };
    let best = t.options[0]!, top = -Infinity;
    for (const o of t.options) { const x = score(o); if (x > top) { top = x; best = o; } }
    t.votes[m] = best.id;
  }
}

/** The round's result: most votes; a tie goes the leader's way. */
export function tally(t: Talks, leader: number): TalksOption {
  const count = new Map<number, number>();
  for (const id of Object.values(t.votes)) count.set(id, (count.get(id) ?? 0) + 1);
  const leaderPick = t.votes[leader] ?? t.options.find((o) => o.kind === 'bid' && o.author === leader)?.id ?? t.options.find((o) => o.kind === 'accept')?.id ?? t.options[0]!.id;
  let best = leaderPick, top = count.get(leaderPick) ?? 0;
  for (const [id, n] of count) if (n > top) { best = id; top = n; }
  return t.options.find((o) => o.id === best)!;
}

/** Event: the round's time is up. */
export function onTalksRound(state: WorldState, id: number): void {
  const t = state.talks?.find((x) => x.id === id);
  if (!t || t.until !== state.time) return; // stale
  const s = sideTribes(state, t);
  if (!s || s.winner.relations[s.loser.id] !== 'war') { end(state, t); return; }
  const pick = tally(t, s.me.leader);
  if (pick.kind === 'accept') { conclude(state, t, t.bids.at(-1)!.terms); return; }
  if (pick.kind === 'reject' || t.bids.length >= MAX_BIDS) { fail(state, t, s.me); return; }
  t.bids.push({ side: t.side, terms: clampTerms(state, t, pick.terms!) });
  t.side = s.other.id;
  openRound(state, t);
}

function end(state: WorldState, t: Talks): void {
  state.talks = (state.talks ?? []).filter((x) => x.id !== t.id);
  for (const m of state.inbox ?? []) if (m.kind === 'talks' && m.talks === t.id && m.status === 'open') m.status = 'expired';
  state.talksEnded ??= {};
  state.talksEnded[`${Math.min(t.winner, t.loser)}:${Math.max(t.winner, t.loser)}`] = state.time;
}

function fail(state: WorldState, t: Talks, by: Tribe): void {
  const s = sideTribes(state, t)!;
  end(state, t);
  addNews(state, { kind: 'talksFailed', tribes: [s.winner.id, s.loser.id], ...between(state, s.winner, s.loser),
    dry: T('De vredesbesprekingen tussen {a} en {b} zijn mislukt: {by} haakt af. De oorlog gaat door.', { a: tg(s.winner), b: tg(s.loser), by: tg(by) }),
    head: [
      T('Geen akkoord: de oorlog tussen {a} en {b} laait weer op', { a: tg(s.winner), b: tg(s.loser) }),
      T('{by} loopt weg van de tafel, de bijlen gaan weer omhoog', { by: tg(by) }),
    ] });
  if (s.winner.members.includes(HUMAN_ID) || s.loser.members.includes(HUMAN_ID)) alertHuman(state, tr('Geen vrede met {tribe}: de oorlog gaat door.', { tribe: tg(s.winner.members.includes(HUMAN_ID) ? s.loser : s.winner) }));
}

/** Agreed: villages are ceded (emptied, the window starts), the loser's members pay their share. */
function conclude(state: WorldState, t: Talks, terms: Terms): void {
  const s = sideTribes(state, t)!;
  end(state, t);
  const villages = cedable(state, s.loser).slice(0, terms.villages).map((v) => v.id);
  cedeVillages(state, s.winner, s.loser, villages);
  if (terms.resources > 0) addReparations(state, s.winner, s.loser, terms.resources);
  if (terms.help) addDuty(state, s.winner, s.loser, terms.help.target, terms.help.space);
  const got: Terms = { villages: villages.length, resources: terms.resources, ...(terms.help ? { help: terms.help } : {}) };
  const p = { winner: tg(s.winner), loser: tg(s.loser), terms: termsText(got, state) };
  addNews(state, { kind: 'treaty', tribes: [s.winner.id, s.loser.id], ...between(state, s.winner, s.loser),
    dry: T('Vrede tussen {winner} en {loser}: {loser} geeft {terms}.', p),
    head: [
      T('Vrede getekend: {loser} betaalt {terms} aan {winner}', p),
      T('{winner} dicteert de vrede: {terms} van {loser}', p),
      T('Het is vrede. De rekening voor {loser}: {terms}', p),
    ] });
  if (s.winner.members.includes(HUMAN_ID) || s.loser.members.includes(HUMAN_ID)) alertHuman(state, tr('Vrede tussen {winner} en {loser}: {terms}.', p));
}

// --- your part ------------------------------------------------------------------

/** Your vote in the talks of your tribe (only when it is your side's turn). */
export function voteTalks(state: WorldState, talksId: number, optionId: number): string | null {
  const t = state.talks?.find((x) => x.id === talksId);
  if (!t) return tr('Deze besprekingen zijn voorbij.');
  if (state.players[HUMAN_ID]?.tribe !== t.side) return tr('Jullie zijn nu niet aan zet.');
  if (!t.options.some((o) => o.id === optionId)) return tr('Die keuze bestaat niet.');
  t.votes[HUMAN_ID] = optionId;
  return null;
}

/** Your bid: as leader it replaces your suggestion, as member it is an alternative to vote on. */
export function proposeTalks(state: WorldState, talksId: number, terms: Terms): string | null {
  const t = state.talks?.find((x) => x.id === talksId);
  if (!t) return tr('Deze besprekingen zijn voorbij.');
  const me = state.players[HUMAN_ID]!;
  if (me.tribe !== t.side) return tr('Jullie zijn nu niet aan zet.');
  if (t.bids.length >= MAX_BIDS) return tr('Er zijn al drie biedingen gedaan: alleen accepteren of afbreken kan nog.');
  const clean = clampTerms(state, t, terms);
  if (clean.villages <= 0 && clean.resources <= 0 && !clean.help) return tr('Een bod vraagt dorpen, grondstoffen of hulp.');
  // as leader your bid is the leader's suggestion (made for you at the start of the round); as a
  // member it is an alternative next to it. Either way you vote for it.
  let mine = t.options.find((o) => o.kind === 'bid' && o.author === HUMAN_ID);
  if (mine) mine.terms = clean;
  else {
    mine = { id: nextId(state), kind: 'bid', terms: clean, author: HUMAN_ID };
    t.options.splice(t.options.length - 1, 0, mine);
  }
  t.votes[HUMAN_ID] = mine.id;
  return null;
}

/** You (leading a tribe at war) open talks. The stronger side makes the first bid. */
export function humanStartTalks(state: WorldState, otherId: number): string | null {
  const mine = state.players[HUMAN_ID]?.tribe !== undefined ? state.tribes?.[state.players[HUMAN_ID]!.tribe!] : undefined;
  if (!mine || mine.leader !== HUMAN_ID) return tr('Alleen de stamleider kan vredesbesprekingen openen.');
  const other = state.tribes?.[otherId];
  if (!other || mine.relations[other.id] !== 'war') return tr('Jullie zijn niet in oorlog met die stam.');
  if (talksOfTribes(state, mine.id, other.id)) return tr('Er lopen al besprekingen.');
  const strongerMine = tribeStrength(state, mine) >= tribeStrength(state, other);
  startTalks(state, strongerMine ? mine : other, strongerMine ? other : mine);
  return null;
}

// --- breaking the NAP -------------------------------------------------------------

/** Someone attacked the other side during the talks: out of his tribe, and outlawed. */
export function breachTalks(state: WorldState, t: Talks, who: number): void {
  const p = state.players[who];
  const own = p?.tribe !== undefined ? state.tribes?.[p.tribe] : undefined;
  if (!p || !own) return;
  const winner = state.tribes?.[t.winner], loser = state.tribes?.[t.loser];
  leave(state, p);
  const until = t.until + ((MAX_BIDS + 1 - t.bids.length) * ROUND_HOURS * HOUR + OUTLAW_DAYS * DAY) / state.config.worldSpeed;
  (state.outlaws ??= {})[who] = { tribes: [t.winner, t.loser], until };
  delete t.votes[who];
  const home = villagesOf(state, who)[0];
  addNews(state, { kind: 'outlaw', tribes: [t.winner, t.loser], players: [who], ...(home ? { x: home.x, y: home.y } : {}),
    dry: T('{player} valt aan tijdens de vredesbesprekingen: {tribe} zet hem uit de stam. Hij is vogelvrij voor {a} en {b}.', { player: p.name, tribe: tg(own), a: winner ? tg(winner) : '?', b: loser ? tg(loser) : '?' }),
    head: [
      T('Vogelvrij! {player} breekt de wapenstilstand en wordt verstoten', { player: p.name }),
      T('{player} saboteert de vrede en is nu vrij wild', { player: p.name }),
      T('Op de kop van {player} staat een prijs: vogelvrij verklaard', { player: p.name }),
    ] });
  if (who === HUMAN_ID) addLog(state, { time: state.time, text: tr('Je viel aan tijdens de vredesbesprekingen. {tribe} zet je uit de stam: je bent vogelvrij.', { tribe: tg(own) }) });
}

/** Diplomacy tick: outlaws whose time is up are free again. */
export function outlawsTick(state: WorldState): void {
  for (const [id, o] of Object.entries(state.outlaws ?? {})) if (state.time > o.until) delete state.outlaws![Number(id)];
}

/** Bots start talks when a war is clearly lost (see tribes); not right after failed talks. */
export function mayTalk(state: WorldState, a: Tribe, b: Tribe): boolean {
  if (talksOfTribes(state, a.id, b.id)) return false;
  const last = state.talksEnded?.[`${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`];
  return last === undefined || state.time - last > (2 * DAY) / state.config.worldSpeed;
}
