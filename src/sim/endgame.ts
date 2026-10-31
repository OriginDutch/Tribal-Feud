/**
 * Endgame (domination): a tribe that owns `villageShare` of the world (with or without the
 * barbarian villages, a world setting) for `holdDays` game days in a row wins the world.
 * When a tribe gets close (15 points below the target) everyone hears it, and the bot tribes
 * close ranks against it: treaties with the leader break, old enemies make peace.
 * Only tribes can win; your tribe winning is a win, a bot tribe winning is a loss.
 */
import { DAY } from '../shared/time';
import { addMessage, alertHuman } from './humanTribe';
import { nextFloat } from './rng';
import { HUMAN_ID, addLog, villagesOf, type WorldState } from './state';
import { AGGRESSION, declareWar, setRelation, type Tribe } from './tribes';

export interface EndgameState {
  /** Tribes that already caused the "close to winning" warning. */
  warned: number[];
  /** The biggest tribe while it is close to winning (everyone's target). */
  front?: number;
  /** The tribe above the target and since when (game time). */
  leader?: number;
  since?: number;
  /** The world is over. */
  winner?: { tribe: number; tag: string; name: string; time: number; you: boolean };
  /** You chose to keep playing after the end. */
  continued?: boolean;
}

export interface EndgameRules { target: number; warnAt: number; countBarbarians: boolean; holdMs: number }

export function endgameRules(state: WorldState): EndgameRules {
  const w = state.config.winCondition;
  const target = w.villageShare;
  return { target, warnAt: Math.max(target * 0.6, target - 0.15), countBarbarians: w.countBarbarians ?? true, holdMs: (w.holdDays ?? 3) * DAY };
}

/** Share of the world per tribe (0..1), biggest first. */
const sharesCache = new WeakMap<WorldState, { at: number; shares: { tribe: Tribe; villages: number; share: number }[] }>();
/** Shares change slowly: one count of every village per game minute is plenty (the quests ask after every event). */
export function tribeShares(state: WorldState): { tribe: Tribe; villages: number; share: number }[] {
  const at = Math.floor(state.time / 60_000);
  const hit = sharesCache.get(state);
  if (hit && hit.at === at) return hit.shares;
  const shares = countShares(state);
  sharesCache.set(state, { at, shares });
  return shares;
}
/** The shares counted now (the endgame clock itself goes by this, never by a cached count). */
export function countShares(state: WorldState): { tribe: Tribe; villages: number; share: number }[] {
  const rules = endgameRules(state);
  let total = 0;
  for (const v of Object.values(state.villages)) if (rules.countBarbarians || v.owner >= 0) total++;
  if (!total) return [];
  return Object.values(state.tribes ?? {})
    .map((t) => {
      const villages = t.members.reduce((n, m) => n + villagesOf(state, m).length, 0);
      return { tribe: t, villages, share: villages / total };
    })
    .sort((a, b) => b.share - a.share);
}

const tag = (t: Tribe) => `[${t.tag}]`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const isYours = (t: Tribe) => t.members.includes(HUMAN_ID);

/** Runs with the diplomacy tick. */
export function endgameTick(state: WorldState): void {
  const eg = (state.endgame ??= { warned: [] });
  if (eg.winner) return;
  const rules = endgameRules(state);
  const shares = countShares(state);
  const top = shares[0];

  // close to winning: everyone hears it once
  for (const s of shares) {
    if (s.share < rules.warnAt || eg.warned.includes(s.tribe.id)) continue;
    eg.warned.push(s.tribe.id);
    const text = isYours(s.tribe)
      ? `Jouw stam ${tag(s.tribe)} bezit ${pct(s.share)} van de wereld. De andere stammen slaan de handen ineen tegen jullie. Bij ${pct(rules.target)}, ${rules.holdMs / DAY} speldagen lang, wint ${tag(s.tribe)} de wereld.`
      : `${tag(s.tribe)} ${s.tribe.name} bezit ${pct(s.share)} van de wereld. Bij ${pct(rules.target)}, ${rules.holdMs / DAY} speldagen lang, wint die stam de wereld en heb jij verloren.`;
    addMessage(state, { kind: 'info', from: s.tribe.leader, tribe: s.tribe.id, title: `Eindspel: ${tag(s.tribe)} op ${pct(s.share)}`, text });
    addLog(state, { time: state.time, text: `Eindspel: ${tag(s.tribe)} bezit ${pct(s.share)} van de wereld.` });
    alertHuman(state, `Eindspel: ${tag(s.tribe)} bezit ${pct(s.share)} van de wereld.`);
  }

  // the rest closes ranks against whoever is in the lead and close
  if (top && top.share >= rules.warnAt) {
    eg.front = top.tribe.id;
    unite(state, top.tribe);
  } else delete eg.front;

  // holding the target
  if (top && top.share >= rules.target) {
    if (eg.leader !== top.tribe.id) {
      eg.leader = top.tribe.id;
      eg.since = state.time;
      const text = `${tag(top.tribe)} bezit ${pct(top.share)} van de wereld. Houdt die stam dat ${rules.holdMs / DAY} speldagen vast, dan is de wereld gewonnen.`;
      addMessage(state, { kind: 'info', from: top.tribe.leader, tribe: top.tribe.id, title: `Eindspel: ${tag(top.tribe)} boven ${pct(rules.target)}`, text });
      alertHuman(state, text);
    } else if (state.time - (eg.since ?? state.time) >= rules.holdMs) {
      const you = isYours(top.tribe);
      eg.winner = { tribe: top.tribe.id, tag: top.tribe.tag, name: top.tribe.name, time: state.time, you };
      const text = you ? `Gewonnen! ${tag(top.tribe)} ${top.tribe.name} heeft de wereld veroverd.` : `Verloren. ${tag(top.tribe)} ${top.tribe.name} heeft de wereld veroverd.`;
      addMessage(state, { kind: 'info', from: top.tribe.leader, tribe: top.tribe.id, title: you ? 'De wereld is gewonnen' : 'De wereld is verloren', text });
      addLog(state, { time: state.time, text });
      alertHuman(state, text);
    }
  } else if (eg.leader !== undefined) {
    const t = state.tribes?.[eg.leader];
    if (t) addMessage(state, { kind: 'info', from: t.leader, tribe: t.id, title: `Eindspel: ${tag(t)} zakt onder ${pct(rules.target)}`, text: `${tag(t)} houdt de ${pct(rules.target)} niet vast. De teller begint opnieuw.` });
    delete eg.leader;
    delete eg.since;
  }
}

/** Bot tribes against the leader: treaties with it break, wars among the others end. */
function unite(state: WorldState, leader: Tribe): void {
  for (const t of Object.values(state.tribes ?? {})) {
    if (t.id === leader.id || t.leader === HUMAN_ID) continue;
    const arch = state.players[t.leader]?.bot?.archetype ?? 'diplomat';
    const rel = t.relations[leader.id];
    if (rel !== 'war' && nextFloat(state.rng) < 0.1 + AGGRESSION[arch] * 0.15) declareWar(state, t, leader, rel === 'nap' || rel === 'ally');
    for (const [otherId, r] of Object.entries(t.relations)) {
      const o = state.tribes?.[Number(otherId)];
      if (!o || o.id === leader.id || o.leader === HUMAN_ID || r !== 'war') continue;
      if (nextFloat(state.rng) < 0.15) {
        setRelation(state, t, o, 'nap');
        addLog(state, { time: state.time, text: `${tag(t)} en ${tag(o)} sluiten vrede tegen ${tag(leader)}.` });
      }
    }
  }
}

/** Target weight bonus: the tribe in the lead is everyone's target. */
export function leaderBonus(state: WorldState, attacker: number, defender: number): number {
  const id = state.endgame?.front;
  if (id === undefined || state.endgame?.winner) return 1;
  const t = state.tribes?.[id];
  if (!t || !t.members.includes(defender) || t.members.includes(attacker)) return 1;
  return 1.6;
}
