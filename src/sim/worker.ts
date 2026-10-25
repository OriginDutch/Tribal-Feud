/**
 * Simulation worker: owns the world state, runs the clock, handles saves.
 * The UI never touches the state directly.
 */
import { farmCUnits } from './intel';
import { createConfig, validateConfig } from '../shared/config';
import { AUTOSAVE_SLOT, type Command, type Snapshot, type WorkerMessage } from '../shared/protocol';
import { SECOND } from '../shared/time';
import { deleteSave, getSave, listSaves, putSave } from '../storage/saveStore';
import { randomSeed } from './rng';
import { fromSaveData, toSaveData } from './save';
import { advance, schedule, scheduleRandom, setPaused, setSpeed } from './simulation';
import { createWorld, currentVillage, playerVillage, type WorldState } from './state';
import { storageCapacity } from './formulas';
import { villageView } from './view';
import { incomingViews, mapData, movementViews } from './mapView';
import { CANCEL_WINDOW_MS, cancelBlocker, cancelMovement, conquer, distance, loyaltyNow, protectionEndsAt, returnSupport, sendAttack, sendNobleTrain, sendSupport } from './movement';
import { BARBARIAN } from './state';
import { maxMintable, mintBlocker, mintCoins } from './nobles';
import { allTemplates, deleteTemplate, findTemplate, saveTemplate, setManager } from './manager';
import { HUMAN_ID, addLog } from './state';
import { claimAllRewards, claimReward, demandStatus, dismissToast } from './quests';
import type { MarketView, MovementView, OfferView, OwnVillageRow, QuestsView, RankingRow } from '../shared/protocol';
import {
  MERCHANT_CARRY,
  MERCHANT_MINUTES_PER_FIELD,
  acceptOffer,
  balanceVillages,
  cancelOffer,
  createOffer,
  merchantsFree,
  merchantsTotal,
  sendResources,
  type TradeOffer,
} from './market';
import { villagesOf } from './state';
import { villagePoints } from './barbarians';
import { ARCHETYPE_NAMES } from '../shared/botProfiles';
import { UNIT_IDS, type UnitCounts } from '../shared/gameData';
import {
  cancelBuild,
  cancelRecruit,
  cancelResearch,
  currentResources,
  popMax,
  popUsed,
  queueBuild,
  queueDemolish,
  renameVillage,
  recruit,
  settle,
  startResearch,
} from './village';

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

function ownVillageRows(s: WorldState): OwnVillageRow[] {
  const { config } = s;
  return villagesOf(s, HUMAN_ID)
    .sort((a, b) => a.id - b.id)
    .map((v) => {
      const job = v.buildQueue[0];
      let recruiting = 0;
      for (const q of Object.values(v.recruitQueues)) for (const j of q) recruiting += j.total - j.done;
      const units: UnitCounts = {};
      for (const u of UNIT_IDS) if (v.units[u] > 0) units[u] = v.units[u];
      return {
        id: v.id,
        name: v.name,
        x: v.x,
        y: v.y,
        points: villagePoints(config, v),
        res: currentResources(config, v, s.time).map(Math.floor) as OwnVillageRow['res'],
        storage: storageCapacity(v.buildings.storage),
        pop: { used: popUsed(config, v), max: popMax(v) },
        building: job ? { name: config.buildings[job.building].name, level: job.level, end: job.end } : null,
        buildQueue: v.buildQueue.length,
        recruiting,
        units,
        loyalty: Math.floor(loyaltyNow(config, v, s.time)),
        manager: v.manager
          ? [findTemplate(s, v.manager.template)?.name, v.manager.troops ? 'troepen' : undefined].filter(Boolean).join(' · ') || 'aan'
          : null,
        maxMint: mintBlocker(s, v) === null ? maxMintable(s, v) : 0,
      };
    });
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
      const v = currentVillage(state);
      return v ? villageView(state, v) : null;
    })(),
    villages: ownVillageRows(state),
    movements: movementViews(state),
    incoming: incomingViews(state),
    protectionEndsAt: protectionEndsAt(state),
    alertMode: state.alertMode ?? 'perVillage',
    templates: allTemplates(state),
    unreadReports: state.reports.filter((r) => !r.read).length,
    farmTemplates: state.farmTemplates,
    marchFactor: state.config.worldSpeed * state.config.unitSpeed * state.config.marchSpeed,
    quests: questsView(state),
    market: marketView(state),
  };
}

/** How far the market screen looks for other players' offers. */
const OFFER_RADIUS = 40;

function marketView(s: WorldState): MarketView | null {
  const v = currentVillage(s);
  if (!v || v.buildings.market <= 0) return null;
  const offerView = (o: TradeOffer): OfferView | null => {
    const at = s.villages[o.villageId];
    if (!at) return null;
    return {
      id: o.id,
      village: { id: at.id, name: at.name, x: at.x, y: at.y, ownerName: s.players[at.owner]?.name ?? '?' },
      give: o.give,
      want: o.want,
      distance: distance(at, v),
      created: o.created,
    };
  };
  const all = s.offers ?? [];
  const pick = (list: TradeOffer[]) => list.map(offerView).filter((x): x is OfferView => x !== null);
  const trades: MovementView[] = [];
  for (const m of Object.values(s.movements)) {
    if (m.kind !== 'trade' && m.kind !== 'tradeReturn') continue;
    if (m.from !== v.id && m.to !== v.id) continue;
    const from = s.villages[m.from];
    const to = s.villages[m.to];
    if (!from || !to) continue;
    const view: MovementView = {
      id: m.id,
      kind: m.kind,
      from: { id: from.id, name: from.name, x: from.x, y: from.y },
      to: { id: to.id, name: to.name, x: to.x, y: to.y },
      sent: m.sent,
      arrives: m.arrives,
      units: {},
    };
    if (m.res) view.res = m.res;
    if (m.owner === HUMAN_ID && cancelBlocker(s, m) === null) view.cancelUntil = m.sent + CANCEL_WINDOW_MS;
    trades.push(view);
  }
  return {
    merchantsFree: merchantsFree(s, v),
    merchantsTotal: merchantsTotal(v),
    carry: MERCHANT_CARRY,
    minutesPerField: MERCHANT_MINUTES_PER_FIELD / s.config.worldSpeed,
    myOffers: pick(all.filter((o) => o.villageId === v.id)),
    offers: pick(all.filter((o) => o.owner !== HUMAN_ID))
      .filter((o) => o.distance <= OFFER_RADIUS)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 60),
    trades: trades.sort((a, b) => a.arrives - b.arrives),
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
    toasts: s.questToasts.map((t) => {
      const reward = t.rewardId !== undefined ? s.rewards.find((r) => r.id === t.rewardId) : undefined;
      return reward ? { id: t.id, title: t.title, reward } : { id: t.id, title: t.title };
    }),
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
      const units = cmd.template === 'C' ? farmCUnits(state, cmd.from, cmd.to) : state.farmTemplates[cmd.template];
      const error = typeof units === 'string' ? units : sendAttack(state, cmd.from, cmd.to, units);
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
      const error = claimReward(state, cmd.id, cmd.villageId ?? currentVillage(state)?.id);
      if (error) notice(error, 'error');
      break;
    }
    case 'sendResources': {
      if (!state) return;
      if (state.villages[cmd.from]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      const error = sendResources(state, cmd.from, cmd.to, cmd.res);
      if (error) notice(error, 'error');
      break;
    }
    case 'createOffer': {
      if (!state) return;
      if (state.villages[cmd.villageId]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      const count = Math.max(1, Math.min(50, Math.floor(cmd.count)));
      let made = 0;
      let error: string | null = null;
      while (made < count && (error = createOffer(state, cmd.villageId, cmd.give, cmd.want)) === null) made++;
      if (error && made === 0) notice(error, 'error');
      else if (error) notice(`${made} van ${count} aanbiedingen geplaatst: ${error}`, 'error');
      break;
    }
    case 'cancelOffer': {
      if (!state) return;
      const error = cancelOffer(state, cmd.id, HUMAN_ID);
      if (error) notice(error, 'error');
      break;
    }
    case 'acceptOffer': {
      if (!state) return;
      if (state.villages[cmd.villageId]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      const error = acceptOffer(state, cmd.id, cmd.villageId);
      if (error) notice(error, 'error');
      break;
    }
    case 'cancelMovement': {
      if (!state) return;
      const error = cancelMovement(state, cmd.id, HUMAN_ID);
      if (error) notice(error, 'error');
      break;
    }
    case 'balanceVillages': {
      if (!state) return;
      const n = balanceVillages(state, HUMAN_ID);
      notice(n > 0 ? `${n} zending${n === 1 ? '' : 'en'} onderweg.` : 'Niets te balanceren (of geen vrije handelaren).');
      break;
    }
    case 'dismissToast':
      if (!state) return;
      dismissToast(state, cmd.id);
      break;
    case 'claimAllRewards': {
      if (!state) return;
      const error = claimAllRewards(state, cmd.villageId ?? currentVillage(state)?.id);
      if (error) notice(error, 'error');
      break;
    }
    case 'mintCoins': {
      if (!state) return;
      if (state.villages[cmd.villageId]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      const error = mintCoins(state, cmd.villageId, cmd.count);
      if (error) notice(error, 'error');
      break;
    }
    case 'sendNobleTrain': {
      if (!state) return;
      if (state.villages[cmd.from]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      const error = sendNobleTrain(state, cmd.from, cmd.to, cmd.first, cmd.escorts, cmd.catapultTarget);
      if (error) notice(error, 'error');
      break;
    }
    case 'sendSupport': {
      if (!state) return;
      if (state.villages[cmd.from]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      const error = sendSupport(state, cmd.from, cmd.to, cmd.units);
      if (error) notice(error, 'error');
      break;
    }
    case 'returnSupport': {
      if (!state) return;
      const error = returnSupport(state, HUMAN_ID, cmd.hostId, cmd.originId);
      if (error) notice(error, 'error');
      break;
    }
    case 'debugConquer': {
      if (!state) return;
      const here = currentVillage(state);
      if (!here) return;
      const target = Object.values(state.villages)
        .filter((x) => x.owner === BARBARIAN)
        .sort((a, b) => distance(a, here) - distance(b, here))[0];
      if (!target) return;
      conquer(state, target, HUMAN_ID);
      addLog(state, { time: state.time, text: `Debug: ${target.name} (${target.x}|${target.y}) overgenomen.` });
      break;
    }
    case 'setManager': {
      if (!state) return;
      const error = setManager(state, cmd.villageId, cmd.manager);
      if (error) notice(error, 'error');
      break;
    }
    case 'setManagerAll': {
      if (!state) return;
      for (const v of villagesOf(state, HUMAN_ID)) {
        const error = setManager(state, v.id, cmd.manager);
        if (error) return notice(error, 'error');
      }
      break;
    }
    case 'saveTemplate': {
      if (!state) return;
      const error = saveTemplate(state, cmd.template);
      if (error) notice(error, 'error');
      break;
    }
    case 'deleteTemplate': {
      if (!state) return;
      const error = deleteTemplate(state, cmd.id);
      if (error) notice(error, 'error');
      break;
    }
    case 'setAlertMode':
      if (!state) return;
      state.alertMode = cmd.mode;
      break;
    case 'selectVillage':
      if (!state) return;
      if (state.villages[cmd.id]?.owner === HUMAN_ID) state.current = cmd.id;
      break;
    case 'debugGive': {
      if (!state) return;
      const v = currentVillage(state);
      if (!v) return;
      settle(state.config, v, state.time);
      if (cmd.resources) for (const i of [0, 1, 2] as const) v.res[i] += cmd.resources;
      for (const u of UNIT_IDS) v.units[u] += Math.max(0, Math.floor(cmd.units?.[u] ?? 0));
      for (const [b, level] of Object.entries(cmd.buildings ?? {})) {
        const id = b as keyof typeof v.buildings;
        if (id in v.buildings) v.buildings[id] = Math.max(v.buildings[id], Math.min(state.config.buildings[id].maxLevel, level ?? 0));
      }
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
    case 'demolish':
    case 'renameVillage':
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
  { type: 'build' | 'cancelBuild' | 'demolish' | 'renameVillage' | 'research' | 'cancelResearch' | 'recruit' | 'cancelRecruit' }
>;

function villageAction(s: WorldState, cmd: VillageCommand): string | null {
  if (s.villages[cmd.villageId]?.owner !== HUMAN_ID) return 'Dat is niet jouw dorp.';
  switch (cmd.type) {
    case 'build':
      return queueBuild(s, cmd.villageId, cmd.building);
    case 'cancelBuild':
      return cancelBuild(s, cmd.villageId, cmd.jobId);
    case 'demolish':
      return queueDemolish(s, cmd.villageId, cmd.building);
    case 'renameVillage':
      return renameVillage(s, cmd.villageId, cmd.name);
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
