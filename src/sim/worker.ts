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
import { createWorld, playerVillage, type WorldState } from './state';
import { villageView } from './view';
import { mapData, movementViews } from './mapView';
import { sendAttack } from './movement';
import { HUMAN_ID, addLog } from './state';
import { claimAllRewards, claimReward, demandStatus } from './quests';
import type { QuestsView, RankingRow } from '../shared/protocol';
import { villagesOf } from './state';
import { villagePoints } from './barbarians';
import { ARCHETYPE_NAMES } from '../shared/botProfiles';
import { UNIT_IDS, type UnitCounts } from '../shared/gameData';
import { cancelBuild, cancelRecruit, cancelResearch, queueBuild, recruit, settle, startResearch } from './village';

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
    multipliers: {
      world: state.config.worldSpeed,
      production: state.config.productionMultiplier,
      build: state.config.buildSpeed,
      recruit: state.config.recruitSpeed,
    },
    log: state.log.slice(-SNAPSHOT_LOG_LINES),
    village: (() => {
      const v = playerVillage(state);
      return v ? villageView(state, v) : null;
    })(),
    movements: movementViews(state),
    unreadReports: state.reports.filter((r) => !r.read).length,
    farmTemplates: state.farmTemplates,
    marchFactor: state.config.worldSpeed * state.config.unitSpeed * state.config.marchSpeed,
    quests: questsView(state),
  };
}

function questsView(s: WorldState): QuestsView {
  return {
    chains: s.config.quests.chains.map((chain) => {
      const done = s.questProgress[chain.id] ?? 0;
      const quest = chain.quests[done];
      return {
        id: chain.id,
        name: chain.name,
        done,
        total: chain.quests.length,
        current: quest
          ? { title: quest.title, text: quest.text, demands: quest.demands.map((d) => demandStatus(s, d)), reward: quest.reward }
          : null,
      };
    }),
    rewards: s.rewards,
    buildingReward: s.config.quests.buildingReward,
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
      const config = createConfig(cmd.preset, cmd.name.trim() || 'Naamloze wereld', cmd.seed ?? randomSeed(), cmd.overrides);
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
    case 'sendAttack':
      if (!state) return;
      if (state.villages[cmd.from]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      {
        const error = sendAttack(state, cmd.from, cmd.to, cmd.units, cmd.catapultTarget);
        if (error) notice(error, 'error');
      }
      break;
    case 'sendFarm': {
      if (!state) return;
      if (state.villages[cmd.from]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      const error = sendAttack(state, cmd.from, cmd.to, state.farmTemplates[cmd.template]);
      if (error) notice(error, 'error');
      break;
    }
    case 'setFarmTemplate': {
      if (!state) return;
      const units: UnitCounts = {};
      for (const u of UNIT_IDS) {
        const n = Math.floor(cmd.units[u] ?? 0);
        if (n > 0) units[u] = n;
      }
      state.farmTemplates[cmd.template] = units;
      break;
    }
    case 'claimReward': {
      if (!state) return;
      const error = claimReward(state, cmd.id);
      if (error) notice(error, 'error');
      break;
    }
    case 'claimAllRewards': {
      if (!state) return;
      const error = claimAllRewards(state);
      if (error) notice(error, 'error');
      break;
    }
    case 'debugGive': {
      if (!state) return;
      const v = playerVillage(state);
      if (!v) return;
      settle(state.config, v, state.time);
      if (cmd.resources) for (const i of [0, 1, 2] as const) v.res[i] += cmd.resources;
      for (const u of UNIT_IDS) v.units[u] += Math.max(0, Math.floor(cmd.units?.[u] ?? 0));
      addLog(state, { time: state.time, text: 'Debug: troepen/grondstoffen toegevoegd.' });
      break;
    }
    case 'getMap':
      if (state) post({ type: 'map', map: mapData(state) });
      return;
    case 'getRanking': {
      if (!state) return;
      const s = state;
      const ranking: RankingRow[] = s.players.map((p) => {
        const villages = villagesOf(s, p.id);
        const row: RankingRow = {
          id: p.id,
          name: p.name,
          points: villages.reduce((sum, v) => sum + villagePoints(s.config, v), 0),
          villages: villages.length,
          isBot: p.isBot,
        };
        if (p.bot) {
          row.archetype = ARCHETYPE_NAMES[p.bot.archetype];
          row.activity = p.bot.activity;
        }
        return row;
      });
      ranking.sort((a, b) => b.points - a.points);
      post({ type: 'ranking', ranking });
      return;
    }
    case 'getReports':
      if (state) post({ type: 'reports', reports: state.reports });
      return;
    case 'markReportsRead':
      if (!state) return;
      for (const r of state.reports) if (cmd.ids === 'all' || cmd.ids.includes(r.id)) r.read = true;
      post({ type: 'reports', reports: state.reports });
      break;
    case 'build':
    case 'cancelBuild':
    case 'research':
    case 'cancelResearch':
    case 'recruit':
    case 'cancelRecruit': {
      if (!state) return;
      const error = villageAction(state, cmd);
      if (error) notice(error, 'error');
      break;
    }
  }
  postSnapshot();
}

type VillageCommand = Extract<
  Command,
  { type: 'build' | 'cancelBuild' | 'research' | 'cancelResearch' | 'recruit' | 'cancelRecruit' }
>;

function villageAction(s: WorldState, cmd: VillageCommand): string | null {
  switch (cmd.type) {
    case 'build':
      return queueBuild(s, cmd.villageId, cmd.building);
    case 'cancelBuild':
      return cancelBuild(s, cmd.villageId, cmd.jobId);
    case 'research':
      return startResearch(s, cmd.villageId, cmd.unit);
    case 'cancelResearch':
      return cancelResearch(s, cmd.villageId);
    case 'recruit':
      return recruit(s, cmd.villageId, cmd.unit, cmd.count);
    case 'cancelRecruit':
      return cancelRecruit(s, cmd.villageId, cmd.jobId);
  }
}

ctx.onmessage = (e: MessageEvent<Command>) => {
  handle(e.data).catch((err: unknown) => {
    notice(err instanceof Error ? err.message : String(err), 'error');
  });
};

setInterval(tick, TICK_MS);
postSnapshot();
postSaves().catch((err: unknown) => notice(`Saves laden mislukt: ${String(err)}`, 'error'));
