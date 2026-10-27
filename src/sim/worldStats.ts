/**
 * World statistics: per game day how many attacks went to players and to barbarians and how
 * many villages changed hands, per player totals, the latest conquests between players, and
 * the villages per tribe at the end of each day. Small and cheap: counters, not logs (only
 * player-to-player conquests are kept, the last 200).
 */
import { DAY } from '../shared/time';
import { BARBARIAN, HUMAN_ID, villagesOf, type WorldState } from './state';

export interface DayStats {
  day: number;
  attacksPvp: number;
  attacksBarb: number;
  conquestsPvp: number;
  conquestsBarb: number;
  /** Attacks on you / by you. */
  onYou: number;
  byYou: number;
  /** Wars between tribes at the end of the day (counted at the first event of the next day). */
  wars?: number;
  /** Villages per tribe id (top 8) at the end of the day. */
  tribes?: Record<number, number>;
}

export interface PlayerStats { pvp: number; barb: number; took: number; tookBarb: number; lost: number }

export interface WorldStats {
  days: DayStats[];
  players: Record<number, PlayerStats>;
  /** Player-to-player conquests, newest last (max 200). */
  conquests: { time: number; village: number; name: string; from: number; to: number }[];
}

const MAX_DAYS = 120;

function today(state: WorldState): DayStats {
  const ws = (state.worldStats ??= { days: [], players: {}, conquests: [] });
  const day = Math.floor(state.time / DAY);
  let last = ws.days.at(-1);
  if (!last || last.day !== day) {
    // close yesterday: tribes and wars as they stand now
    if (last) snapshotTribes(state, last);
    last = { day, attacksPvp: 0, attacksBarb: 0, conquestsPvp: 0, conquestsBarb: 0, onYou: 0, byYou: 0 };
    ws.days.push(last);
    if (ws.days.length > MAX_DAYS) ws.days.splice(0, ws.days.length - MAX_DAYS);
  }
  return last;
}

function player(state: WorldState, id: number): PlayerStats {
  const ws = state.worldStats!;
  return (ws.players[id] ??= { pvp: 0, barb: 0, took: 0, tookBarb: 0, lost: 0 });
}

function snapshotTribes(state: WorldState, d: DayStats): void {
  const list = Object.values(state.tribes ?? {})
    .map((t) => ({ id: t.id, n: t.members.reduce((x, m) => x + villagesOf(state, m).length, 0) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
  d.tribes = Object.fromEntries(list.map((x) => [x.id, x.n]));
  let wars = 0;
  for (const t of Object.values(state.tribes ?? {})) wars += Object.values(t.relations).filter((r) => r === 'war').length;
  d.wars = wars / 2;
}

/** An attack landed (farm runs and scouts count too). */
export function statAttack(state: WorldState, attacker: number, defender: number): void {
  const d = today(state);
  const p = player(state, attacker);
  if (defender === BARBARIAN) { d.attacksBarb++; p.barb++; }
  else { d.attacksPvp++; p.pvp++; }
  if (defender === HUMAN_ID) d.onYou++;
  if (attacker === HUMAN_ID) d.byYou++;
}

/** A village changed owner. */
export function statConquest(state: WorldState, villageId: number, name: string, from: number, to: number): void {
  const d = today(state);
  if (from === BARBARIAN) { d.conquestsBarb++; player(state, to).tookBarb++; return; }
  d.conquestsPvp++;
  player(state, to).took++;
  player(state, from).lost++;
  const ws = state.worldStats!;
  ws.conquests.push({ time: state.time, village: villageId, name, from, to });
  if (ws.conquests.length > 200) ws.conquests.splice(0, ws.conquests.length - 200);
}

/** The current day's tribe numbers, for the view (the stored ones are end-of-day). */
export function liveTribes(state: WorldState): Record<number, number> {
  const d: DayStats = { day: 0, attacksPvp: 0, attacksBarb: 0, conquestsPvp: 0, conquestsBarb: 0, onYou: 0, byYou: 0 };
  snapshotTribes(state, d);
  return d.tribes ?? {};
}
