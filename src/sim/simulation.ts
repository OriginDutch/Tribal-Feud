import { MINUTE, type Speed } from '../shared/time';
import { peek, pop, push } from './eventQueue';
import { nextInt } from './rng';
import { addLog, type GameEvent, type LogEntry, type WorldState } from './state';
import { onBuildDone, onRecruitTick, onResearchDone } from './village';
import { onArrive } from './movement';
import { checkQuests } from './quests';

/**
 * Pure simulation core. No timers, no DOM, no worker APIs:
 * everything here is driven by explicit calls, so it is testable and deterministic.
 */

export interface AdvanceResult {
  /** Number of events processed in this step. */
  processed: number;
  /** Set when an event paused the game; time stops exactly at that event. */
  autoPaused?: LogEntry;
}

export function schedule(state: WorldState, delayMs: number, event: GameEvent): void {
  if (delayMs < 0) throw new Error(`schedule: negative delay ${delayMs}`);
  push(state.queue, state.time + delayMs, event);
}

/** Handles one event. Returns a log entry for debug events; game events log themselves. */
function handle(state: WorldState, event: GameEvent): LogEntry | null {
  switch (event.kind) {
    case 'build':
      onBuildDone(state, event.villageId, event.jobId);
      return null;
    case 'recruit':
      onRecruitTick(state, event.villageId, event.jobId);
      return null;
    case 'research':
      onResearchDone(state, event.villageId, event.jobId);
      return null;
    case 'arrive':
      onArrive(state, event.movementId);
      return null;
    case 'test': {
      const entry: LogEntry = { time: state.time, text: `Test-event: ${event.label}` };
      if (event.autoPause) entry.autoPause = true;
      return entry;
    }
    case 'random':
      return { time: state.time, text: `Willekeurig event: ${event.label}` };
  }
}

/**
 * Advances game time by realDtMs * speed.
 * Events due in that window are processed in order. An auto-pause event
 * stops the clock at its own time, so nothing after it happens unseen.
 */
export function advance(state: WorldState, realDtMs: number): AdvanceResult {
  const result: AdvanceResult = { processed: 0 };
  if (state.paused || realDtMs <= 0) return result;

  const target = state.time + realDtMs * state.speed;
  for (;;) {
    const next = peek(state.queue);
    if (next === undefined || next.time > target) break;
    pop(state.queue);
    state.time = next.time;
    const entry = handle(state, next.event);
    result.processed++;
    checkQuests(state);
    if (!entry) continue;
    addLog(state, entry);
    if (entry.autoPause) {
      state.paused = true;
      result.autoPaused = entry;
      return result;
    }
  }
  state.time = target;
  return result;
}

export function setSpeed(state: WorldState, speed: Speed): void {
  state.speed = speed;
}

export function setPaused(state: WorldState, paused: boolean): void {
  state.paused = paused;
}

/** Debug helper: schedules an event at a random moment 1..60 game minutes ahead, using the world RNG. */
export function scheduleRandom(state: WorldState): number {
  const minutes = nextInt(state.rng, 1, 60);
  schedule(state, minutes * MINUTE, { kind: 'random', label: `na ${minutes} min` });
  return minutes;
}
