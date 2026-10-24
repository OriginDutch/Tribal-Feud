import type { WorldConfig } from '../shared/config';
import type { Speed } from '../shared/time';
import { createQueue, type EventQueue } from './eventQueue';
import { seedRng, type RngState } from './rng';

/** Everything that can be scheduled in game time. Grows per phase. */
export type GameEvent =
  | { kind: 'test'; label: string; autoPause: boolean }
  | { kind: 'random'; label: string };

export interface LogEntry {
  time: number;
  text: string;
  autoPause?: boolean;
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
}

export const MAX_LOG = 100;

export function createWorld(config: WorldConfig): WorldState {
  return {
    config,
    time: 0,
    speed: 1,
    paused: true,
    rng: seedRng(config.seed),
    queue: createQueue<GameEvent>(),
    log: [{ time: 0, text: `Wereld "${config.name}" aangemaakt (seed ${config.seed}).` }],
  };
}

export function addLog(state: WorldState, entry: LogEntry): void {
  state.log.push(entry);
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}
