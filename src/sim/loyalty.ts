/**
 * Phase 8b: satisfaction and betrayal.
 *
 * - Every bot in a tribe has a mood (0..100) about its tribe's leader: you, when you lead.
 *   Helping, keeping your word and protecting them raise it; ignoring them, too many orders
 *   and villages lost without your help lower it. It drifts back to 60 slowly.
 * - Low mood: first complaints, then leaving (< 25), then betrayal (< 12): the bot leaves,
 *   bears a grudge and goes after the leader (and may defect to a tribe at war with you).
 *   Opportunists betray quickly, supporters almost never.
 * - When YOU are a member of a bot tribe, its leader has a standing of you (0..100). Too low
 *   and you are kicked out.
 * - You can betray too (the nuke): break with a mate, an ally or a NAP partner. It costs you.
 * - Bot tribes play by the same rules: a leader nobody likes is replaced.
 */
import type { Archetype } from '../shared/botProfiles';
import { kindness } from '../shared/config';
import { DAY } from '../shared/time';
import { addMessage, alertHuman, pauses } from './humanTribe';
import { nextFloat } from './rng';
import { HUMAN_ID, addLog, type Player, type WorldState } from './state';
import { MAX_MEMBERS } from '../shared/tribes';
import { checkLeaderOrder } from './tribeOrders';
import { T, tr, txt, type Txt } from '../shared/i18n';
import { REACH, SOCIAL, declareWar, fits, found, join, leave, playerCentre, reachOf, setLeader, tribeCentre, tribeOf, type Tribe } from './tribes';

export const BASE_MOOD = 60;
export interface MoodNote { time: number; delta: number; why: Txt }

/** How easily each kind turns on its leader (betrayal), and how loyal it is (leaving). */
const BETRAY: Record<Archetype, number> = { opportunist: 0.5, rusher: 0.35, farmer: 0.15, turtle: 0.1, diplomat: 0.05, supporter: 0.02 };
const LOYAL: Record<Archetype, number> = { supporter: 0.8, diplomat: 0.7, turtle: 0.6, farmer: 0.5, rusher: 0.35, opportunist: 0.25 };

const clamp = (x: number) => Math.max(0, Math.min(100, x));
const tag = (t: Tribe) => `[${t.tag}]`;
const note = (list: MoodNote[] | undefined, n: MoodNote): MoodNote[] => [...(list ?? []), n].slice(-6);

export function moodOf(p: Player): number {
  return p.bot?.mood ?? BASE_MOOD;
}

/** A bot's mood about its tribe's leadership changes, with a reason you can read. */
export function changeMood(state: WorldState, p: Player | undefined, delta: number, why: Txt): void {
  if (!p?.bot || delta === 0) return;
  p.bot.mood = clamp(moodOf(p) + delta);
  p.bot.moodNotes = note(p.bot.moodNotes, { time: state.time, delta, why });
}

/** Every bot member of a tribe (not its leader). */
export function moodAll(state: WorldState, t: Tribe, delta: number, why: Txt, except?: number): void {
  for (const m of t.members) if (m !== t.leader && m !== except) changeMood(state, state.players[m], delta, why);
}

/** What your bot leader thinks of you (when you are a member of a bot tribe). */
export function changeStanding(state: WorldState, delta: number, why: Txt): void {
  const t = tribeOf(state, HUMAN_ID);
  if (!t || t.leader === HUMAN_ID || delta === 0) return;
  state.standing = clamp((state.standing ?? BASE_MOOD) + delta);
  state.standingNotes = note(state.standingNotes, { time: state.time, delta, why });
}

/** Something happened between you and a mate: mood if you lead, standing if you are a member. */
export function mateEvent(state: WorldState, mate: Player | undefined, leaderDelta: number, memberDelta: number, why: Txt): void {
  const t = tribeOf(state, HUMAN_ID);
  if (!t || !mate || mate.tribe !== t.id) return;
  if (t.leader === HUMAN_ID) changeMood(state, mate, leaderDelta, why);
  else changeStanding(state, memberDelta, why);
}

/** A tribe member lost a village: whoever leads gets the blame, less if you helped. */
export function onVillageLost(state: WorldState, owner: number, helped: boolean, name: string): void {
  const p = state.players[owner];
  if (!p?.bot || p.tribe === undefined) return;
  const t = state.tribes?.[p.tribe];
  if (!t) return;
  // a leader who can't hold his own villages loses authority
  if (t.leader === owner) return moodAll(state, t, -4, T('leider {name} verloor {village}', { name: p.name, village: name }));
  if (t.leader === HUMAN_ID) changeMood(state, p, helped ? -3 : -12, helped ? T('{village} verloren, ondanks je hulp', { village: name }) : T('{village} verloren, jij hielp niet', { village: name }));
  else changeMood(state, p, -6, T('{village} verloren', { village: name }));
}

/** Runs with the diplomacy tick: drift, complaints, leaving, betrayal, coups, kicking you. */
export function loyaltyTick(state: WorldState): void {
  for (const t of Object.values(state.tribes ?? {})) {
    const humanLeads = t.leader === HUMAN_ID;
    for (const id of [...t.members]) {
      if (id === t.leader) continue;
      const p = state.players[id];
      if (!p?.bot) continue;
      const b = p.bot;
      // drift back to the middle (and a bit of noise in bot tribes)
      const m = moodOf(p);
      b.mood = clamp(m + Math.sign(BASE_MOOD - m) * Math.min(1, Math.abs(BASE_MOOD - m)) + (humanLeads ? 0 : (nextFloat(state.rng) - 0.5) * 3));
      const mood = b.mood;
      const worst = [...(b.moodNotes ?? [])].reverse().find((n) => n.delta < 0)?.why;
      if (humanLeads && mood < 35 && (b.complained === undefined || state.time - b.complained > DAY)) {
        b.complained = state.time;
        const q = { name: p.name, tag: tag(t), why: worst };
        addMessage(state, { kind: 'info', from: id, title: T('{name} is ontevreden', { name: p.name }), text: worst ? T('{name}: zo heb ik het niet bedoeld met {tag} ({why}). Doe er iets aan, of ik ben weg.', q) : T('{name}: zo heb ik het niet bedoeld met {tag}. Doe er iets aan, of ik ben weg.', q) });
      }
      if (mood < 12 && nextFloat(state.rng) < 0.25 * BETRAY[b.archetype] * (humanLeads ? kindness(state.config).betray : 1)) {
        betray(state, p, t, worst);
        continue;
      }
      if (mood < 25 && nextFloat(state.rng) < 0.12 * (1 - LOYAL[b.archetype])) {
        leave(state, p);
        b.mood = BASE_MOOD;
        delete b.moodNotes;
        addLog(state, { time: state.time, text: tr('{name} verlaat {tag}: ontevreden.', { name: p.name, tag: tag(t) }) });
        (state.tribeNews ??= []).push({ time: state.time, text: T('{name} verlaat {tag} {tribe}.', { name: p.name, tag: tag(t), tribe: t.name }) });
        const q = { name: p.name, tag: tag(t), why: worst };
        if (humanLeads) addMessage(state, { kind: 'info', from: id, title: T('{name} vertrekt', { name: p.name }), text: worst ? T('{name} heeft {tag} verlaten: {why}.', q) : T('{name} heeft {tag} verlaten.', q) });
      }
    }
    if (!state.tribes?.[t.id]) continue;
    // a bot leader nobody likes is replaced by the most content member
    if (!humanLeads) coup(state, t);
    // you as a member of a bot tribe
    if (t.members.includes(HUMAN_ID) && !humanLeads) judgeYou(state, t);
  }
  reshape(state);
}

// --- 8c: tribes merge and fall apart -----------------------------------------------------------

/** Bot tribes merge (old allies, small enough together) and fall apart (unhappy or spread out). */
function reshape(state: WorldState): void {
  const list = Object.values(state.tribes ?? {}).filter((t) => t.leader !== HUMAN_ID);
  // merge: allies close together that fit in one tribe; the smaller one joins the bigger one
  for (const a of list) {
    for (const b of list) {
      if (a.id >= b.id || !state.tribes?.[a.id] || !state.tribes?.[b.id]) continue;
      if (a.relations[b.id] !== 'ally' || a.members.length + b.members.length > MAX_MEMBERS) continue;
      const ca = tribeCentre(state, a), cb = tribeCentre(state, b);
      if (!ca || !cb || Math.hypot(ca.x - cb.x, ca.y - cb.y) > Math.max(reachOf(state, a, ca), reachOf(state, b, cb))) continue;
      const social = (SOCIAL[archOf(state, a)] + SOCIAL[archOf(state, b)]) / 2;
      if (nextFloat(state.rng) > 0.03 * social) continue;
      const [big, small] = ca.points >= cb.points ? [a, b] : [b, a];
      const text = T('{tag} {name} gaat op in {bigTag} {bigName}.', { tag: tag(small), name: small.name, bigTag: tag(big), bigName: big.name });
      for (const m of [...small.members]) join(state, big, state.players[m]!);
      news(state, text);
      if (big.members.includes(HUMAN_ID)) addMessage(state, { kind: 'info', from: big.leader, tribe: big.id, title: T('Fusie: {tag} → {bigTag}', { tag: tag(small), bigTag: tag(big) }), text });
    }
  }
  // your tribe: an allied bot tribe close by proposes a merger; you decide
  const yours = Object.values(state.tribes ?? {}).find((t) => t.leader === HUMAN_ID);
  if (yours) {
    const yc = tribeCentre(state, yours);
    for (const b of list) {
      if (!state.tribes?.[b.id] || b.relations[yours.id] !== 'ally' || b.members.length + yours.members.length > MAX_MEMBERS || !yc) continue;
      if ((state.inbox ?? []).some((m) => m.kind === 'merge' && m.tribe === b.id && (m.status === 'open' || state.time - m.time < 3 * DAY))) continue;
      const bc = tribeCentre(state, b);
      if (!bc || Math.hypot(bc.x - yc.x, bc.y - yc.y) > Math.max(reachOf(state, yours, yc), reachOf(state, b, bc))) continue;
      if (nextFloat(state.rng) > 0.02 * SOCIAL[archOf(state, b)]) continue;
      const theirsIntoYours = bc.points <= yc.points;
      const leader = state.players[b.leader];
      addMessage(state, {
        kind: 'merge', from: b.leader, tribe: b.id, status: 'open', expires: state.time + DAY,
        merge: theirsIntoYours ? 'theirsIntoYours' : 'yoursIntoTheirs',
        title: theirsIntoYours ? T('{tag} wil opgaan in {yourTag}', { tag: tag(b), yourTag: tag(yours) }) : T('{tag} stelt een fusie voor', { tag: tag(b) }),
        text: theirsIntoYours
          ? T('{name}: samen zijn we sterker. Wij ({n} leden) gaan graag op in {yourTag}, onder jouw leiding.', { name: leader?.name ?? '?', n: b.members.length, yourTag: tag(yours) })
          : T('{name}: samen zijn we sterker. Gaan jullie ({n} leden) op in {tag}? Dan word jij lid en blijf ik leider.', { name: leader?.name ?? '?', n: yours.members.length, tag: tag(b) }),
      });
      if (pauses(state, 'requests')) alertHuman(state, tr('{tag} stelt een fusie voor.', { tag: tag(b) }));
    }
  }
  // fall apart: an unhappy or spread-out tribe splits; the unhappiest member leads the new one
  for (const t of Object.values(state.tribes ?? {})) {
    if (t.leader === HUMAN_ID || t.members.length < 4) continue;
    const bots = t.members.filter((m) => m !== t.leader && state.players[m]?.bot);
    if (bots.length < 3) continue;
    const avg = bots.reduce((x, m) => x + moodOf(state.players[m]!), 0) / bots.length;
    const tc = tribeCentre(state, t);
    const spread = tc ? reachOf(state, t, tc) >= REACH * 1.8 : false;
    if (!(avg < 40 || spread) || nextFloat(state.rng) > 0.04) continue;
    const rebel = state.players[[...bots].sort((x, y) => moodOf(state.players[x]!) - moodOf(state.players[y]!))[0]!]!;
    const rc = playerCentre(state, rebel.id);
    if (!rc) continue;
    // who goes along: the unhappy ones near the rebel
    const along = bots.filter((m) => m !== rebel.id && moodOf(state.players[m]!) < 50 && (() => { const c = playerCentre(state, m); return c && Math.hypot(c.x - rc.x, c.y - rc.y) <= REACH; })());
    const nt = found(state, rebel);
    for (const m of along) join(state, nt, state.players[m]!);
    const q = { tag: tag(t), name: rebel.name, newTag: tag(nt), newName: nt.name, n: along.length };
    const text = !along.length ? T('{tag} valt uiteen: {name} begint {newTag} {newName}.', q)
      : along.length === 1 ? T('{tag} valt uiteen: {name} begint {newTag} {newName} met 1 ander.', q)
      : T('{tag} valt uiteen: {name} begint {newTag} {newName} met {n} anderen.', q);
    news(state, text);
    if (t.members.includes(HUMAN_ID)) addMessage(state, { kind: 'info', from: rebel.id, tribe: t.id, title: T('{tag} valt uiteen', { tag: tag(t) }), text });
  }
}

const archOf = (state: WorldState, t: Tribe): Archetype => state.players[t.leader]?.bot?.archetype ?? 'diplomat';
function news(state: WorldState, text: Txt): void {
  addLog(state, { time: state.time, text: txt(text) });
  (state.tribeNews ??= []).push({ time: state.time, text });
}

function coup(state: WorldState, t: Tribe): void {
  const others = t.members.filter((m) => m !== t.leader && state.players[m]?.bot);
  if (others.length < 2) return;
  const avg = others.reduce((s, m) => s + moodOf(state.players[m]!), 0) / others.length;
  if (avg >= 30 || nextFloat(state.rng) > 0.2) return;
  const old = state.players[t.leader];
  const next = others.sort((a, b) => moodOf(state.players[b]!) - moodOf(state.players[a]!))[0]!;
  setLeader(state, t, next);
  for (const m of t.members) if (state.players[m]?.bot) { state.players[m]!.bot!.mood = BASE_MOOD; delete state.players[m]!.bot!.moodNotes; }
  const text = T('{name} neemt de leiding van {tag} over van {old}.', { name: state.players[next]?.name ?? '?', tag: tag(t), old: old?.name ?? '?' });
  addLog(state, { time: state.time, text: txt(text) });
  (state.tribeNews ??= []).push({ time: state.time, text });
  if (t.members.includes(HUMAN_ID)) addMessage(state, { kind: 'info', from: next, tribe: t.id, title: T('Nieuwe leider in {tag}', { tag: tag(t) }), text });
}

function judgeYou(state: WorldState, t: Tribe): void {
  checkLeaderOrder(state);
  const s = (state.standing = clamp((state.standing ?? BASE_MOOD) + Math.sign(BASE_MOOD - (state.standing ?? BASE_MOOD))));
  const leader = state.players[t.leader];
  if (!leader) return;
  const worst = [...(state.standingNotes ?? [])].reverse().find((n) => n.delta < 0)?.why;
  if (s < 35 && (state.standingWarned === undefined || state.time - state.standingWarned > DAY)) {
    state.standingWarned = state.time;
    const q = { name: leader.name, tag: tag(t), why: worst };
    addMessage(state, { kind: 'info', from: leader.id, tribe: t.id, title: T('{name} is niet blij met je', q), text: worst ? T('{name}: zo gaat het niet ({why}). Laat zien dat je bij {tag} hoort.', q) : T('{name}: zo gaat het niet. Laat zien dat je bij {tag} hoort.', q) });
  }
  if (s < 20 && nextFloat(state.rng) < 0.3) {
    leave(state, state.players[HUMAN_ID]!);
    delete state.standing;
    delete state.standingNotes;
    const q = { name: leader.name, tag: tag(t), why: worst };
    const text = worst ? T('{name} heeft je uit {tag} gezet: {why}.', q) : T('{name} heeft je uit {tag} gezet.', q);
    addMessage(state, { kind: 'info', from: leader.id, tribe: t.id, title: T('Uit {tag} gezet', q), text });
    addLog(state, { time: state.time, text: txt(text) });
    alertHuman(state, txt(text));
  }
}

/** A bot turns on its tribe: leaves, holds a grudge and goes after the leader; may defect. */
export function betray(state: WorldState, p: Player, t: Tribe, why?: Txt): void {
  const b = p.bot!;
  const leaderId = t.leader;
  const enemy = Object.entries(t.relations)
    .filter(([, r]) => r === 'war')
    .map(([id]) => state.tribes?.[Number(id)])
    .find((e): e is Tribe => !!e && e.leader !== HUMAN_ID && fits(state, e, p.id));
  leave(state, p);
  b.mood = BASE_MOOD;
  delete b.moodNotes;
  (b.grudges ??= {})[leaderId] = { score: 1.5, at: state.time, why: 'verraad' };
  (b.focus ??= {})[leaderId] = state.time + 3 * DAY;
  // and one more member of the old tribe, if any
  const mate = t.members.find((m) => m !== leaderId);
  if (mate !== undefined) b.focus[mate] = state.time + 3 * DAY;
  if (enemy) join(state, enemy, p);
  const text = enemy
    ? T('{name} verraadt {tag} en loopt over naar {enemy}.', { name: p.name, tag: tag(t), enemy: tag(enemy) })
    : T('{name} verraadt {tag} en keert zich tegen {leader}.', { name: p.name, tag: tag(t), leader: state.players[leaderId]?.name ?? T('de leider') });
  addLog(state, { time: state.time, text: txt(text) });
  (state.tribeNews ??= []).push({ time: state.time, text });
  if (t.members.includes(HUMAN_ID) || leaderId === HUMAN_ID) {
    addMessage(state, { kind: 'war', from: p.id, tribe: t.id, title: T('Verraad: {name}', { name: p.name }), text: why ? T('{text} ({why}) Verwacht aanvallen.', { text, why }) : T('{text} Verwacht aanvallen.', { text }) });
    alertHuman(state, txt(text));
  }
}

// --- you betray (the nuke) ------------------------------------------------------------------

/**
 * You break with a player: a mate, or a player whose tribe has a NAP or alliance with yours.
 * Afterwards you can attack them. As leader you throw a mate out / declare war; as member you
 * are thrown out yourself. Everyone involved remembers, and every tribe trusts you less.
 */
export function humanBetray(state: WorldState, target: number): string | null {
  const p = state.players[target];
  if (!p || target === HUMAN_ID) return tr('Die speler bestaat niet.');
  const mine = tribeOf(state, HUMAN_ID);
  if (!mine) return tr('Je zit niet in een stam: je kunt iedereen al aanvallen.');
  const theirs = tribeOf(state, target);
  const rel = theirs && theirs.id !== mine.id ? mine.relations[theirs.id] : undefined;
  if (theirs?.id !== mine.id && rel !== 'nap' && rel !== 'ally') return tr('Met die speler heb je geen band om te verbreken.');
  const leads = mine.leader === HUMAN_ID;
  const sting = (q: Player | undefined, by: number) => { if (q?.bot) (q.bot.grudges ??= {})[HUMAN_ID] = { score: by, at: state.time, why: 'verraad' }; };
  state.betrayals = (state.betrayals ?? 0) + 1;
  let text: Txt;
  if (theirs?.id === mine.id) {
    if (leads) {
      leave(state, p);
      sting(p, 2);
      moodAll(state, mine, -25, T('je verraadde {name}', { name: p.name }));
      text = T('Je verraadt {name} en zet hem uit {tag}. Je stamgenoten kijken je met andere ogen aan.', { name: p.name, tag: tag(mine) });
    } else {
      for (const m of mine.members) if (m !== HUMAN_ID) sting(state.players[m], m === target ? 2 : 1);
      leave(state, state.players[HUMAN_ID]!);
      delete state.standing;
      text = T('Je verraadt {name}. {tag} zet je eruit en vergeet het niet.', { name: p.name, tag: tag(mine) });
    }
  } else {
    for (const m of theirs!.members) sting(state.players[m], m === target ? 2 : 1);
    if (leads) {
      declareWar(state, mine, theirs!, true);
      moodAll(state, mine, -8, T('je verbrak het verdrag met {tag}', { tag: tag(theirs!) }));
      text = rel === 'ally' ? T('Je verbreekt het bondgenootschap met {tag}: oorlog.', { tag: tag(theirs!) }) : T('Je verbreekt het niet-aanvalsverdrag met {tag}: oorlog.', { tag: tag(theirs!) });
    } else {
      leave(state, state.players[HUMAN_ID]!);
      delete state.standing;
      text = T('Je keert je tegen {tag}, een partner van {myTag}. {myTag} zet je eruit.', { tag: tag(theirs!), myTag: tag(mine) });
    }
  }
  addLog(state, { time: state.time, text: txt(text) });
  (state.tribeNews ??= []).push({ time: state.time, text: T('Verraad: {name} keert zich tegen {target}.', { name: state.players[HUMAN_ID]?.name ?? T('Jij'), target: p.name }) });
  addMessage(state, { kind: 'war', from: -1, title: T('Verraad'), text });
  return null;
}

/** Every betrayal of yours makes tribes warier of taking you in (x0.75 per betrayal). */
export function trustFactor(state: WorldState): number {
  return 0.75 ** (state.betrayals ?? 0);
}
