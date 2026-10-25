import type { BuildTemplate } from './manager';
import type { Intel } from './intel';
import type { WorldConfig } from '../shared/config';
import type { Speed } from '../shared/time';
import { createQueue, type EventQueue } from './eventQueue';
import { seedRng, type RngState } from './rng';
import type { UnitCounts } from '../shared/gameData';
import type { Archetype } from '../shared/botProfiles';
import { generateMap } from './map';
import type { Movement, Report } from './movement';
import { checkQuests, type PendingReward, type QuestStats, type QuestToast } from './quests';
import { initBots } from './bots';
import { createVillage, type Village } from './village';

/** Everything that can be scheduled in game time. Grows per phase. */
export type GameEvent =
  | { kind: 'test'; label: string; autoPause: boolean }
  | { kind: 'random'; label: string }
  | { kind: 'build'; villageId: number; jobId: number }
  | { kind: 'recruit'; villageId: number; jobId: number }
  | { kind: 'research'; villageId: number; jobId: number }
  | { kind: 'arrive'; movementId: number }
  | { kind: 'botTurn'; playerId: number }
  | { kind: 'manager' };

export interface LogEntry {
  time: number;
  text: string;
  autoPause?: boolean;
}

export interface BotState {
  archetype: Archetype;
  /** 0..1, higher = more turns. */
  activity: number;
  /** Game time of the next scheduled turn. */
  nextTurn: number;
  /** What the bot knows about barbarian villages it farmed: village id -> last result. */
  farmLog: Record<number, { at: number; won: boolean }>;
  /** Barbarian villages this bot has a farm attack on the way to. */
  outgoing: number[];
  /** Next village to look at when the bot has more villages than it handles per turn. */
  cursor?: number;
  /**
   * Reference player (balance simulations only): a player with the account manager.
   * Building and troops run by themselves (like the manager, every turn); farming, coins and
   * noblemen only happen when the "player" checks in, every `interval` game ms.
   * No difficulty limits; all villages each turn.
   */
  reference?: { interval: number };
  /** Last time this bot looked at the game (farming, coins, noblemen, attacks). */
  lastCheck?: number;
  /** When this bot last took a village (for the difficulty's conquest cooldown). */
  lastConquest?: number;
  /** Village this bot is nobling. */
  nobleTarget?: number;
  /** Highest points seen and when: a bot that stops growing gives up (see abandon). */
  peak?: { points: number; at: number };
}

export interface Player {
  id: number;
  name: string;
  isBot: boolean;
  bot?: BotState;
  /** Coins minted (coins worlds). */
  coins?: number;
}

/** The human player always has id 0. */
export const HUMAN_ID = 0;
/** Owner id of barbarian villages. */
export const BARBARIAN = -1;

export interface FarmTemplates {
  A: UnitCounts;
  B: UnitCounts;
}

/**
 * The complete world. Plain data only: this object is what gets saved.
 * Runtime-only things (timers, suspended-because-tab-hidden) live in the worker.
 */
export interface WorldState {
  config: WorldConfig;
  /** Game time in ms since the world started. */
  time: number;
  speed: Speed;
  paused: boolean;
  rng: RngState;
  queue: EventQueue<GameEvent>;
  log: LogEntry[];
  players: Player[];
  villages: Record<number, Village>;
  /** Troops on the road. */
  movements: Record<number, Movement>;
  /** Reports for the human player, newest last. */
  reports: Report[];
  /** Last report id per target village (for the farm assistant). */
  lastReportByTarget: Record<number, number>;
  farmTemplates: FarmTemplates;
  /** What the human player knows about other villages. */
  intel: Record<number, Intel>;
  /** Index of the current quest per chain. */
  questProgress: Record<string, number>;
  /** Rewards waiting to be claimed. */
  rewards: PendingReward[];
  /** Finished quests not yet dismissed (toasts). */
  questToasts: QuestToast[];
  stats: QuestStats;
  /** Next free id for villages, jobs, movements and reports. */
  nextId: number;
  /** The human player's selected village (falls back to the first one). */
  current?: number;
  /** An alert raised during an event (incoming attack, village lost): it auto-pauses the game. */
  alert?: LogEntry;
  /** The player's own build templates (account manager). */
  templates?: BuildTemplate[];
  /** Time of the scheduled account-manager check. */
  managerAt?: number;
  /** World statistics: villages taken from barbarians and from players. */
  conquests?: { barbarian: number; player: number };
  /** When to auto-pause for attacks (default: the first attack per attacking village). */
  alertMode?: AlertMode;
  /** perVillage mode: when each attacking village last caused a pause. */
  alertSeen?: Record<number, number>;
}

/**
 * every: every incoming attack · perVillage: the first attack per attacking village per
 * game day (÷ world speed) · lostOnly: only a lost village · off: never.
 */
export type AlertMode = 'every' | 'perVillage' | 'lostOnly' | 'off';

export const MAX_LOG = 100;

export function nextId(state: WorldState): number {
  return state.nextId++;
}

export function createWorld(config: WorldConfig): WorldState {
  const state: WorldState = {
    config,
    time: 0,
    speed: 1,
    paused: true,
    rng: seedRng(config.seed),
    queue: createQueue<GameEvent>(),
    log: [{ time: 0, text: `Wereld "${config.name}" aangemaakt (seed ${config.seed}).` }],
    players: [{ id: HUMAN_ID, name: 'Jij', isBot: false }],
    villages: {},
    movements: {},
    reports: [],
    lastReportByTarget: {},
    farmTemplates: { A: { light: 5 }, B: { spear: 10 } },
    intel: {},
    questProgress: {},
    rewards: [],
    questToasts: [],
    stats: { plunders: 0, loot: 0, rewardsClaimed: 0 },
    nextId: 1,
  };
  const village = createVillage(config, nextId(state), HUMAN_ID, 'Jouw dorp', 500, 500, 0);
  state.villages[village.id] = village;
  generateMap(state);
  initBots(state);
  checkQuests(state);
  return state;
}

export function addLog(state: WorldState, entry: LogEntry): void {
  state.log.push(entry);
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}

/** Cached id of the human player's village per world (looking it up scans thousands of villages). */
const humanVillageCache = new WeakMap<WorldState, number>();

/** The human player's first village. */
export function playerVillage(state: WorldState): Village | undefined {
  const cached = humanVillageCache.get(state);
  if (cached !== undefined) {
    const v = state.villages[cached];
    if (v && v.owner === HUMAN_ID) return v;
  }
  const v = Object.values(state.villages).find((x) => x.owner === HUMAN_ID);
  if (v) humanVillageCache.set(state, v.id);
  return v;
}

/** The village the human player is looking at. */
export function currentVillage(state: WorldState): Village | undefined {
  const v = state.current !== undefined ? state.villages[state.current] : undefined;
  if (v && v.owner === HUMAN_ID) return v;
  return playerVillage(state);
}

/** Village ids per owner, cached per world. Call invalidateOwners() whenever a village changes owner. */
const ownerIndex = new WeakMap<WorldState, Map<number, number[]>>();

export function villagesOf(state: WorldState, owner: number): Village[] {
  let index = ownerIndex.get(state);
  if (!index) {
    index = new Map();
    for (const v of Object.values(state.villages)) {
      const list = index.get(v.owner);
      if (list) list.push(v.id);
      else index.set(v.owner, [v.id]);
    }
    ownerIndex.set(state, index);
  }
  const out: Village[] = [];
  for (const id of index.get(owner) ?? []) {
    const v = state.villages[id];
    if (v && v.owner === owner) out.push(v);
  }
  return out;
}

export function invalidateOwners(state: WorldState): void {
  ownerIndex.delete(state);
  humanVillageCache.delete(state);
}
