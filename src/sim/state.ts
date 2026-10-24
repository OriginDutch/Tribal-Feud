import type { WorldConfig } from '../shared/config';
import type { Speed } from '../shared/time';
import { createQueue, type EventQueue } from './eventQueue';
import { seedRng, type RngState } from './rng';
import { createVillage, type Village } from './village';

/** Everything that can be scheduled in game time. Grows per phase. */
export type GameEvent =
  | { kind: 'test'; label: string; autoPause: boolean }
  | { kind: 'random'; label: string }
  | { kind: 'build'; villageId: number; jobId: number }
  | { kind: 'recruit'; villageId: number; jobId: number }
  | { kind: 'research'; villageId: number; jobId: number };

export interface LogEntry {
  time: number;
  text: string;
  autoPause?: boolean;
}

export interface Player {
  id: number;
  name: string;
  isBot: boolean;
}

/** The human player always has id 0. */
export const HUMAN_ID = 0;

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
  /** Next free id for villages and jobs. */
  nextId: number;
}

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
    nextId: 1,
  };
  const village = createVillage(config, nextId(state), HUMAN_ID, 'Jouw dorp', 500, 500, 0);
  state.villages[village.id] = village;
  return state;
}

export function addLog(state: WorldState, entry: LogEntry): void {
  state.log.push(entry);
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}

/** The human player's first village (phase 2 has exactly one). */
export function playerVillage(state: WorldState): Village | undefined {
  return Object.values(state.villages).find((v) => v.owner === HUMAN_ID);
}
