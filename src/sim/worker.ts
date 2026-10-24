/**
 * Simulation worker: owns the world state, runs the clock, handles saves.
 * The UI never touches the state directly.
 */
import { createConfig, validateConfig } from '../shared/config';
import { AUTOSAVE_SLOT, type Command, type Snapshot, type WorkerMessage } from '../shared/protocol';
import { SECOND } from '../shared/time';
import { deleteSave, getSave, listSaves, putSave } from '../storage/saveStore';
import { randomSeed } from './rng';
import { fromSaveData, toSaveData } from './save';
import { advance, schedule, scheduleRandom, setPaused, setSpeed } from './simulation';
import { createWorld, type WorldState } from './state';

/** Minimal typing for the worker global, so the project only needs the DOM lib. */
const ctx = self as unknown as {
  postMessage(message: WorkerMessage): void;
  onmessage: ((e: MessageEvent<Command>) => void) | null;
};

const TICK_MS = 50;
/** Longest real-time step per tick. Stops huge jumps after the browser throttled us. */
const MAX_STEP_MS = 250;
const SNAPSHOT_EVERY_TICKS = 2;
const AUTOSAVE_EVERY_MS = 60 * SECOND;
const SNAPSHOT_LOG_LINES = 40;

let state: WorldState | null = null;
let suspended = false;
let lastTick = performance.now();
let ticks = 0;
let runningSinceAutosave = 0;

function post(msg: WorkerMessage): void {
  ctx.postMessage(msg);
}

function notice(text: string, level: 'info' | 'error' = 'info'): void {
  post({ type: 'notice', level, text });
}

function snapshot(): Snapshot | null {
  if (!state) return null;
  return {
    worldName: state.config.name,
    seed: state.config.seed,
    preset: state.config.preset,
    time: state.time,
    speed: state.speed,
    paused: state.paused,
    suspended,
    queueSize: state.queue.heap.length,
    log: state.log.slice(-SNAPSHOT_LOG_LINES),
  };
}

function postSnapshot(): void {
  post({ type: 'snapshot', snapshot: snapshot() });
}

async function postSaves(): Promise<void> {
  post({ type: 'saves', saves: await listSaves() });
}

async function save(slot: string, quiet = false): Promise<void> {
  if (!state) return;
  await putSave(slot, toSaveData(state, Date.now()));
  runningSinceAutosave = 0;
  if (!quiet) notice(`Opgeslagen in "${slot}".`);
  await postSaves();
}

function autosave(): void {
  save(AUTOSAVE_SLOT, true).catch((e: unknown) => notice(`Autosave mislukt: ${String(e)}`, 'error'));
}

function tick(): void {
  const now = performance.now();
  const dt = Math.min(now - lastTick, MAX_STEP_MS);
  lastTick = now;
  if (!state) return;

  if (!state.paused && !suspended) {
    const result = advance(state, dt);
    runningSinceAutosave += dt;
    if (result.autoPaused) {
      post({ type: 'autoPaused', entry: result.autoPaused });
      autosave();
    } else if (runningSinceAutosave >= AUTOSAVE_EVERY_MS) {
      autosave();
    }
  }

  if (++ticks % SNAPSHOT_EVERY_TICKS === 0) postSnapshot();
}

async function handle(cmd: Command): Promise<void> {
  switch (cmd.type) {
    case 'newWorld': {
      const config = createConfig(cmd.preset, cmd.name.trim() || 'Naamloze wereld', cmd.seed ?? randomSeed());
      const errors = validateConfig(config);
      if (errors.length > 0) {
        notice(errors.join(' '), 'error');
        return;
      }
      state = createWorld(config);
      await save(AUTOSAVE_SLOT, true);
      break;
    }
    case 'setSpeed':
      if (state) setSpeed(state, cmd.speed);
      break;
    case 'setPaused':
      if (state) {
        setPaused(state, cmd.paused);
        if (cmd.paused) autosave();
      }
      break;
    case 'setVisible':
      suspended = !cmd.visible;
      if (suspended && state && !state.paused) autosave();
      break;
    case 'scheduleTest':
      if (state) {
        schedule(state, cmd.delayMs, {
          kind: 'test',
          label: cmd.autoPause ? 'auto-pause' : 'gewoon',
          autoPause: cmd.autoPause,
        });
      }
      break;
    case 'scheduleRandom':
      if (state) scheduleRandom(state);
      break;
    case 'save':
      await save(cmd.slot);
      break;
    case 'load': {
      const data = await getSave(cmd.slot);
      if (!data) {
        notice(`Save "${cmd.slot}" niet gevonden.`, 'error');
        return;
      }
      state = fromSaveData(data);
      // always resume paused, so nothing happens before the player looks
      state.paused = true;
      notice(`"${state.config.name}" geladen.`);
      break;
    }
    case 'deleteSave':
      await deleteSave(cmd.slot);
      await postSaves();
      break;
    case 'listSaves':
      await postSaves();
      break;
  }
  postSnapshot();
}

ctx.onmessage = (e: MessageEvent<Command>) => {
  handle(e.data).catch((err: unknown) => {
    notice(err instanceof Error ? err.message : String(err), 'error');
  });
};

setInterval(tick, TICK_MS);
postSnapshot();
postSaves().catch((err: unknown) => notice(`Saves laden mislukt: ${String(err)}`, 'error'));
