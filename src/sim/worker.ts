/**
 * Simulation worker: owns the world state, runs the clock, handles saves.
 * The UI never touches the state directly.
 */
import { localizeNames } from './defaultNames';
import { lang, tr } from '../shared/i18n';
import '../shared/i18n/en';
import { autoFarmInterval, setAutoFarm } from './farmAll';
import { isFarmLetter } from '../shared/farmTemplates';
import { humanOpSent, setFront, warFrontView } from './warOps';
import { cancelPlanned, planAttack, planOrder, plannedViews } from './planned';
import { giveNobles } from './nobleRole';
import { attemptCoup, coupView } from './coup';
import { askForOrder } from './tribeOrders';
import { faceOf } from './faces';
import { deleteGroup, saveGroup, setGroup } from './groups';
import { askPermission, askTribeHelp, askTribeResources, attackedWithoutPermission, cancelOrder, giveOrder, leaderOrderView, scoutOrderViews } from './tribeOrders';
import { grudge, grudgeHalfLife } from './botReact';
import { answerMessage, applyToTribe, foundTribe, invitePlayer, kickMember, leaveTribe, markInboxRead, askLeaderWar, proposeRelation, setOwnRelation, warAskInfo, frictionView } from './humanTribe';
import { fitCheck, playerCentre, tribeNews, tribeViews } from './tribes';
import { latestNews } from './news';
import { MAX_BIDS, cedable, isOutlaw, proposeTalks, voteTalks } from './talks';
import { owedBy } from './reparations';
import { dutyOf } from './duties';
import type { TalksView } from '../shared/protocol';
import { farmCUnits } from './intel';
import { createConfig, validateConfig } from '../shared/config';
import { AUTOSAVE_SLOT, BACKUP_PREFIX, MANUAL_PREFIX, UPDATE_PREFIX, nextBackupSlot, type Command, type Snapshot, type WorkerMessage } from '../shared/protocol';
import { DAY, SECOND } from '../shared/time';
import { deleteSave, getSave, listSaves, putSave } from '../storage/saveStore';
import { randomSeed } from './rng';
import { SAVE_VERSION, fromSaveData, toSaveData, type SaveData } from './save';
import { FIREBASE } from '../cloud/config';
import { Firestore } from '../cloud/rest';
import { CloudSync } from '../cloud/sync';
import { isSafetyCopy, worldKeyOf } from '../shared/worlds';
import { advance, schedule, scheduleRandom, setPaused, setSpeed } from './simulation';
import { createWorld, currentVillage, playSfx, playerVillage, type Player, type WorldState } from './state';
import { storageCapacity } from './formulas';
import { villageView } from './view';
import { incomingViews, mapData, movementViews, villageInfo } from './mapView';
import { CANCEL_WINDOW_MS, cancelBlocker, cancelMovement, conquer, distance, reportOwners, loyaltyNow, protectionEndsAt, returnSupport, sendAttack, sendNobleTrain, sendSupport, travelTimeMs } from './movement';
import { BARBARIAN } from './state';
import { maxMintable, mintBlocker, mintCoins } from './nobles';
import { allTemplates, deleteNobleTemplate, deleteTemplate, deleteTroopTemplate, findTemplate, saveNobleTemplate, saveTemplate, saveTroopTemplate, scheduleManager, setManager, templateUse } from './manager';
import { HUMAN_ID, addLog } from './state';
import { autoClaimRewards, chainActive, claimAllRewards, claimReward, demandStatus, dismissToast } from './quests';
import type { CandidateView, MarketView, OrderView, PlayerView, MovementView, OfferView, OwnVillageRow, QuestsView, InboxView, RankingRow, SupportRow, SurplusRow, EndgameView, OpinionsView, WorldStatsView, SimInput, SimResult } from '../shared/protocol';
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
import { growBarbarian, villagePoints } from './barbarians';
import { ARCHETYPE_NAMES } from '../shared/botProfiles';
import { UNIT_IDS, type UnitCounts, type UnitId } from '../shared/gameData';
import {
  cancelBuild,
  cancelRecruit,
  cancelResearch,
  currentResources,
  dismissUnits,
  isOperational,
  popMax,
  popUsed,
  queueBuild,
  queueDemolish,
  renameVillage,
  recruit,
  settle,
  startResearch,
  techLevel,
  techMultiplier,
  type Village,
} from './village';
import { fight } from './combat';
import { endgameRules } from './endgame';
import { liveTribes } from './worldStats';
import { hasFaith } from './church';
import { FLAG_NAMES, FLAG_TYPES, autoHang, freeFlags, meltAll, mergeAll, redrawOnLoad, setFlag, upgradeFlag, type FlagType } from './flags';
import { ITEMS, ITEM_IDS, equipItem, type ItemId } from './paladin';
import { BASE_MOOD, humanBetray, moodOf } from './loyalty';
import { farmAll, farmNotifies, markFarm, planFarmAll, type FarmAllOptions } from './farmAll';
import type { FarmAllView } from '../shared/protocol';
import { SCAV_UNITS, scavEnabled, scavOf, scavParams, sendPlan } from './scavenge';
import { DEFAULT_SCAV_TEMPLATE, type ScavTemplate } from '../shared/scavenge';
import type { ScavView } from '../shared/protocol';
import { rhAskAlly, rhPropose } from './rightHand';
import { DEFAULT_MINT, DEFAULT_SURPLUS, mintAll, setMint, planMintAll, planSurplus, sendSurplus, setSurplus } from './surplus';

/** Minimal typing for the worker global, so the project only needs the DOM lib. */
const ctx = self as unknown as {
  postMessage(message: WorkerMessage): void;
  onmessage: ((e: MessageEvent<Command>) => void) | null;
};

const TICK_MS = 50;
/**
 * Longest real-time step per tick. Stops huge jumps after the browser throttled us (a sleeping
 * phone), but is long enough that one slow tick (a big auto-farm round on a phone) costs no game time.
 */
const MAX_STEP_MS = 1000;
const SNAPSHOT_EVERY_TICKS = 2;
/** Saves are cheap since they are stored as text (~70 ms on a big world): often, so a closed browser costs little. */
const AUTOSAVE_EVERY_MS = 10 * SECOND;
/** A rolling backup this often (real time while the game runs). */
const BACKUP_EVERY_MS = 20 * 60 * SECOND;
const SNAPSHOT_LOG_LINES = 40;

let state: WorldState | null = null;
let suspended = false;
let lastTick = performance.now();
let ticks = 0;
let runningSinceAutosave = 0;
let runningSinceBackup = 0;

/** Each world has its own autosave and backups (the seed tells worlds apart). */
const worldKey = (s: WorldState) => String(s.config.seed);
const autosaveSlot = (s: WorldState) => `${AUTOSAVE_SLOT}:${worldKey(s)}`;

/** Cloud saves (only once a tab has signed in). */
const cloud = new CloudSync(
  (u) => new Firestore(FIREBASE?.projectId ?? '', async () => cloud.user?.token ?? u.token),
  (status) => post({ type: 'cloud', status }),
  (worlds) => post({ type: 'cloudWorlds', worlds }),
);

/** The newest save of a world on this device (not a backup), with its data. */
async function newestLocal(key: string): Promise<{ slot: string; data: SaveData } | null> {
  const metas = (await listSaves()).filter((m) => (worldKeyOf(m) === key || `slot:${m.slot}` === key) && !isSafetyCopy(m.slot));
  const best = metas.sort((a, b) => b.savedAt - a.savedAt)[0];
  const data = best ? await getSave(best.slot) : undefined;
  return best && data ? { slot: best.slot, data } : null;
}

/** A world's newest local save to the cloud (the open world is saved first). */
async function pushWorld(key: string, when: 'push' | 'force', to: Client | null): Promise<void> {
  if (state && worldKey(state) === key) return save(autosaveSlot(state), true, to, when);
  const local = await newestLocal(key);
  if (!local) return notice(tr('Die wereld staat niet op dit apparaat.'), 'error', to);
  const { data } = local;
  await cloud.offer({ key, name: data.state.config.name, savedAt: data.savedAt, gameTime: data.state.time, version: data.version, json: JSON.stringify(data) }, when);
}

/** A cloud world onto this device as its autosave; the local autosave of it is kept as a backup first. */
async function fetchCloudWorld(slot: string) {
  const { world, json } = await cloud.download(slot);
  const data = JSON.parse(json) as SaveData;
  fromSaveData(data); // throws when it doesn't load: nothing local is touched then
  const target = `${AUTOSAVE_SLOT}:${world.key}`;
  const local = await getSave(target);
  if (local) await putSave(nextBackupSlot(await listSaves(), `${BACKUP_PREFIX}${world.key}:`), local);
  await putSave(target, data, json);
  return world;
}

/** Writes a rolling backup: up to BACKUPS_KEPT per world, the oldest one is replaced. */
async function backup(): Promise<void> {
  if (!state) return;
  const prefix = `${BACKUP_PREFIX}${worldKey(state)}:`;
  const slot = nextBackupSlot(await listSaves(), prefix);
  await putSave(slot, toSaveData(state, Date.now(), false));
  runningSinceBackup = 0;
}

/**
 * Tabs ("clients"). As a SharedWorker every tab of the game talks to this one simulation through
 * its own port; each tab keeps its own selected village. As a plain Worker there is one client.
 */
interface Client {
  port: { postMessage(message: WorkerMessage): void };
  /** What this tab last got per snapshot field (JSON), to leave out what didn't change. */
  sent?: Map<string, string>;
  /** When this tab last got the village rows (they change with every resource tick), and how many. */
  villagesAt?: number;
  villagesLen?: number;
  /** The screen it shows, and when it last got the movements (only the map and the rally point use them). */
  screen?: string;
  movesAt?: number;
  /** The village this tab shows. */
  current: number | null;
  visible: boolean;
}
const clients = new Set<Client>();
/** The tab whose command is being handled: answers go there. */
let from: Client | null = null;
/** The tab's village was already taken over from the command (by a snapshot during it). */
let fromSettled = false;
/** Messages every tab needs, whoever caused them. */
const BROADCAST = new Set<WorkerMessage['type']>(['saves', 'autoPaused', 'cloud', 'cloudWorlds']);

function reportsMsg(s: WorldState): WorkerMessage {
  return { type: 'reports', reports: s.reports, now: reportOwners(s) };
}

function post(msg: WorkerMessage): void {
  if (from && !BROADCAST.has(msg.type)) { from.port.postMessage(msg); return; }
  for (const c of clients) c.port.postMessage(msg);
}

/** Runs `f` with this tab's village as the current one, and remembers what it is after. */
function asClient<T>(c: Client, f: () => T): T {
  if (state && c.current !== null && state.villages[c.current]?.owner === HUMAN_ID) state.current = c.current;
  try {
    return f();
  } finally {
    if (state) c.current = state.current ?? null;
  }
}

/** A message on screen: in the tab that caused it (`to`, after an await), else as post() decides. */
function notice(text: string, level: 'info' | 'error' = 'info', to: Client | null = null): void {
  if (to) to.port.postMessage({ type: 'notice', level, text });
  else post({ type: 'notice', level, text });
}

const VILLAGE_ORDER = new Intl.Collator('nl', { numeric: true, sensitivity: 'base' });

/** How much of the village's troop target stands at home (troops away or in training don't count). */
function troopTarget(s: WorldState, v: Village): Pick<OwnVillageRow, 'target'> {
  const m = v.manager;
  const want = m?.troopTemplate ? s.troopTemplates?.find((t) => t.id === m.troopTemplate)?.troops : m?.troops;
  if (!want) return {};
  let need = 0;
  let home = 0;
  for (const u of UNIT_IDS) {
    const n = want[u] ?? 0;
    if (n <= 0) continue;
    need += n;
    home += Math.min(n, v.units[u]);
  }
  return need > 0 ? { target: { home, want: need, ready: home >= need } } : {};
}

function ownVillageRows(s: WorldState): OwnVillageRow[] {
  const { config } = s;
  return villagesOf(s, HUMAN_ID)
    // by name, with numbers in order ("Dorp 2" before "Dorp 10"), like TW's village list
    .sort((a, b) => VILLAGE_ORDER.compare(a.name, b.name) || a.id - b.id)
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
        pop: { used: popUsed(config, v), max: popMax(config, v) },
        building: job ? { name: tr(config.buildings[job.building].name), level: job.level, end: job.end } : null,
        buildQueue: v.buildQueue.length,
        recruiting,
        units,
        canSend: isOperational(config, v, 'place'),
        groups: [...(v.groups ?? [])],
        loyalty: Math.floor(loyaltyNow(config, v, s.time)),
        manager: v.manager
          ? [findTemplate(s, v.manager.template)?.name, v.manager.troops ? tr('troepen') : undefined].filter(Boolean).join(' · ') || tr('aan')
          : null,
        maxMint: mintBlocker(s, v) === null ? maxMintable(s, v) : 0,
        ...(s.config.churches ? { faith: hasFaith(s, v) } : {}),
        ...(v.flag ? { flag: { ...v.flag } } : {}),
        ...troopTarget(s, v),
      };
    });
}

function talksViews(s: WorldState): TalksView[] {
  const mine = s.players[HUMAN_ID]?.tribe;
  if (mine === undefined || !s.talks?.length) return [];
  const out: TalksView[] = [];
  for (const t of s.talks) {
    if (t.winner !== mine && t.loser !== mine) continue;
    const enemy = s.tribes?.[t.winner === mine ? t.loser : t.winner];
    const own = s.tribes?.[mine];
    const loser = s.tribes?.[t.loser];
    if (!enemy || !own || !loser) continue;
    const votes = new Map<number, number>();
    for (const id of Object.values(t.votes)) votes.set(id, (votes.get(id) ?? 0) + 1);
    const yourTurn = t.side === mine;
    const help = (h?: { target: number; space: number }) => (h ? { help: { target: h.target, space: h.space, tag: s.tribes?.[h.target]?.tag ?? '?' } } : {});
    out.push({
      id: t.id,
      enemy: { id: enemy.id, tag: enemy.tag, name: enemy.name },
      youWin: t.winner === mine,
      yourTurn,
      until: t.until,
      bids: t.bids.map((b) => ({ ours: b.side === mine, villages: b.terms.villages, resources: b.terms.resources, ...help(b.terms.help) })),
      // the other side's options and votes are theirs: you only see your own round
      options: yourTurn
        ? t.options.map((o) => ({ id: o.id, kind: o.kind, ...(o.terms ? { villages: o.terms.villages, resources: o.terms.resources, ...help(o.terms.help) } : {}), ...(o.author !== undefined ? { author: s.players[o.author]?.name ?? '?', leader: o.author === own.leader } : {}), votes: votes.get(o.id) ?? 0 }))
        : [],
      myVote: yourTurn ? (t.votes[HUMAN_ID] ?? null) : null,
      leader: own.leader === HUMAN_ID,
      maxVillages: cedable(s, loser).length,
      bidsLeft: MAX_BIDS - t.bids.length,
      helpTargets: Object.values(s.tribes ?? {}).filter((x) => x.id !== t.winner && x.id !== t.loser).map((x) => ({ id: x.id, tag: x.tag, war: s.tribes![t.winner]!.relations[x.id] === 'war' })).sort((a, b) => Number(b.war) - Number(a.war) || a.tag.localeCompare(b.tag)),
    });
  }
  return out;
}

/** Stands in for a snapshot field this tab doesn't need right now: it keeps what it has. */
const SKIP = Symbol('skip');
/** Screens that show your troop movements (the map's arrows, the rally point's list). */
const MOVEMENT_SCREENS = new Set(['map', 'place']);

/**
 * Builds field `k` for tab `c` only when it is due: the village rows at most every VILLAGES_EVERY_MS
 * (sooner when villages came or went), the movements only for a screen that shows them and at most as
 * often. A tab always gets each field once, so nothing it reads is ever missing.
 */
function lazy<T>(c: Client | undefined, k: 'villages' | 'movements', build: () => T): T {
  if (!c?.sent?.has(k) || !state) return build();
  const now = Date.now();
  if (k === 'villages') {
    if (now - (c.villagesAt ?? 0) < VILLAGES_EVERY_MS && villagesOf(state, HUMAN_ID).length === c.villagesLen) return SKIP as never;
    c.villagesAt = now;
  } else {
    if (!MOVEMENT_SCREENS.has(c.screen ?? '') || now - (c.movesAt ?? 0) < VILLAGES_EVERY_MS) return SKIP as never;
    c.movesAt = now;
  }
  return build();
}

function snapshot(c?: Client): Snapshot | null {
  if (!state) return null;
  localizeNames(state, lang.value);
  return {
    worldName: state.config.name,
    seed: state.config.seed,
    preset: state.config.preset,
    time: state.time,
    speed: state.speed,
    paused: state.paused,
    suspended,
    simPerf,
    queueSize: state.queue.heap.length,
    multipliers: {
      world: state.config.worldSpeed,
      production: state.config.productionMultiplier,
      build: state.config.buildSpeed,
      recruit: state.config.recruitSpeed,
      farm: state.config.farmMultiplier ?? 1,
    },
    log: state.log.slice(-SNAPSHOT_LOG_LINES),
    news: latestNews(state, 15),
    tabs: clients.size,
    talks: talksViews(state),
    outlawUntil: isOutlaw(state, HUMAN_ID) ? state.outlaws![HUMAN_ID]!.until : null,
    owed: owedBy(state, HUMAN_ID),
    duty: (() => { const d = dutyOf(state, HUMAN_ID); return d ? { tag: state.tribes?.[d.target]?.tag ?? '?', space: d.space, sent: d.sent, due: d.due } : null; })(),
    me: (() => { const c = playerCentre(state, HUMAN_ID); return c ? { x: Math.round(c.x), y: Math.round(c.y) } : null; })(),
    village: (() => {
      const v = currentVillage(state);
      return v ? villageView(state, v) : null;
    })(),
    villages: lazy(c, 'villages', () => ownVillageRows(state!)),
    movements: lazy(c, 'movements', () => movementViews(state!)),
    incoming: incomingViews(state),
    protectionEndsAt: protectionEndsAt(state),
    alertMode: state.alertMode ?? 'perVillage',
    myTribe: state.players[HUMAN_ID]?.tribe ?? null,
    myTribeLeader: (() => { const t = state.players[HUMAN_ID]?.tribe; return t !== undefined && state.tribes?.[t]?.leader === HUMAN_ID; })(),
    leaderOrder: leaderOrderView(state),
    coup: coupView(state),
    scoutOrders: scoutOrderViews(state),
    planned: plannedViews(state),
    inboxUnread: (state.inbox ?? []).filter((m) => !m.read).length,
    inboxOpen: (state.inbox ?? []).filter((m) => m.status === 'open').length,
    tribePause: state.tribePause ?? { war: true, requests: true },
    helpAsked: (state.helpAsks ?? []).map((a) => a.movement),
    orders: orderViews(state),
    war: warFrontView(state),
    templates: allTemplates(state),
    troopTemplates: state.troopTemplates ?? [],
    nobleTemplates: state.nobleTemplates ?? [],
    groups: state.villageGroups ?? [],
    surplus: state.surplus ?? DEFAULT_SURPLUS,
    mint: state.mint ?? DEFAULT_MINT,
    difficulty: state.config.bots.difficulty,
    scavenging: state.config.scavenging !== false,
    rules: { morale: state.config.morale, luck: state.config.luck, nightBonus: state.config.nightBonus },
    endgame: endgameView(state),
    ...(state.config.paladin === 'items' ? { items: itemsView(state) } : {}),
    ...(state.config.flags ? { flags: flagsView(state) } : {}),
    templateUse: templateUse(state),
    unreadReports: state.reports.filter((r) => !r.read).length,
    farmTemplates: state.farmTemplates,
    farmNotify: state.farmNotify ?? [],
    hiddenTemplates: state.hiddenTemplates ?? [],
    autoRewards: !!state.autoRewards,
    autoFarm: state.autoFarm ? { options: state.autoFarm.options, ...(state.autoFarm.at !== undefined ? { next: state.autoFarm.at } : {}), ...(state.autoFarm.last ? { last: state.autoFarm.last } : {}) } : null,
    marchFactor: state.config.worldSpeed * state.config.unitSpeed * state.config.marchSpeed,
    unitSpeeds: Object.fromEntries(UNIT_IDS.map((u) => [u, state!.config.units[u].speed])) as Record<UnitId, number>,
    quests: questsView(state),
    market: marketView(state),
  };
}

/** Ranking, tribes, diplomacy news and your pending tribe asks: the ranking and tribe screens. */
function sendRanking(s: WorldState): void {
  const ranking: RankingRow[] = s.players.map((p) => {
    const villages = villagesOf(s, p.id);
    const row: RankingRow = {
      id: p.id,
      name: p.name,
      points: villages.reduce((sum, v) => sum + villagePoints(s.config, v), 0),
      villages: villages.length,
      isBot: p.isBot,
    };
    if (p.tribe !== undefined) row.tribe = p.tribe;
    const face = faceOf(s, p.id);
    if (face) row.face = face;
    if (p.bot) {
      row.archetype = tr(ARCHETYPE_NAMES[p.bot.archetype]);
      row.activity = p.bot.activity;
    }
    return row;
  });
  ranking.sort((a, b) => b.points - a.points);
  post({ type: 'ranking', ranking, tribes: tribeViews(s), news: tribeNews(s), asks: [...(s.tribeAsks ?? [])], candidates: inviteCandidates(s, ranking), refusedApplications: { ...(s.tribeRefusals?.applications ?? {}) }, refusedInvites: { ...(s.tribeRefusals?.invites ?? {}) }, warAsk: warAskInfo(s), friction: frictionView(s) });
}

/** For a leader: the 20 players nearest to your villages that are not in your tribe. */
function worldStatsView(s: WorldState): WorldStatsView {
  const ws = s.worldStats ?? { days: [], players: {}, conquests: [] };
  const name = (id: number) => (id < 0 ? tr('barbaren') : (s.players[id]?.name ?? '?'));
  const tagOf = (id: number) => { const t = s.players[id]?.tribe; return t !== undefined ? s.tribes?.[t]?.tag : undefined; };
  const row = (id: number) => { const p = ws.players[id]!; return { id, name: name(id), ...(tagOf(id) ? { tag: tagOf(id)! } : {}), pvp: p.pvp, barb: p.barb, took: p.took, lost: p.lost }; };
  const ids = Object.keys(ws.players).map(Number);
  const live = liveTribes(s);
  const days = ws.days;
  // tribe series: every tribe in the top 8 of any day (or now), that still exists
  const tribeIds = new Set<number>(Object.keys(live).map(Number));
  for (const d of days) for (const id of Object.keys(d.tribes ?? {})) tribeIds.add(Number(id));
  const tribes = [...tribeIds].map((id) => s.tribes?.[id]).filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => ({ id: t.id, tag: t.tag, color: t.color, you: t.members.includes(HUMAN_ID), series: [...days.slice(0, -1).map((d) => d.tribes?.[t.id] ?? null), live[t.id] ?? null] }))
    .sort((a, b) => (b.series.at(-1) ?? 0) - (a.series.at(-1) ?? 0)).slice(0, 8);
  const you = ws.players[HUMAN_ID] ?? { pvp: 0, barb: 0, took: 0, tookBarb: 0, lost: 0 };
  const wars = Object.values(s.tribes ?? {}).reduce((a, t) => a + Object.values(t.relations).filter((r) => r === 'war').length, 0) / 2;
  const botsAlive = s.players.filter((p) => p.bot && villagesOf(s, p.id).length);
  return {
    days: days.map((d) => ({ day: d.day, attacksPvp: d.attacksPvp, attacksBarb: d.attacksBarb, conquestsPvp: d.conquestsPvp, conquestsBarb: d.conquestsBarb, onYou: d.onYou, byYou: d.byYou, wars: d.wars ?? wars })),
    tribes,
    topAttackers: ids.filter((id) => ws.players[id]!.pvp > 0).sort((a, b) => ws.players[b]!.pvp - ws.players[a]!.pvp).slice(0, 10).map(row),
    topConquerors: ids.filter((id) => ws.players[id]!.took > 0).sort((a, b) => ws.players[b]!.took - ws.players[a]!.took).slice(0, 10).map(row),
    recent: ws.conquests.slice(-30).reverse().map((c) => ({ time: c.time, name: c.name, from: c.from, fromName: name(c.from), to: c.to, toName: name(c.to) })),
    you: { ...you },
    totals: { conquestsPvp: s.conquests?.player ?? 0, conquestsBarb: s.conquests?.barbarian ?? 0, tribes: Object.keys(s.tribes ?? {}).length, wars, solo: botsAlive.filter((p) => p.tribe === undefined).length, bots: botsAlive.length },
  };
}

function simulate(s: WorldState, i: SimInput): SimResult {
  const attackerUnitBonus: Partial<Record<UnitId, number>> = {};
  const defenderUnitBonus: Partial<Record<UnitId, number>> = {};
  const tv = i.techVillage !== undefined ? s.villages[i.techVillage] : undefined;
  if (tv && s.config.research !== 'simple') for (const u of UNIT_IDS) { const m = techMultiplier(s.config, Math.max(1, techLevel(s.config, tv, u))); if (m !== 1) attackerUnitBonus[u] = m; }
  const ai = i.attackerItem ? ITEMS[i.attackerItem as ItemId] : undefined;
  const di = i.defenderItem ? ITEMS[i.defenderItem as ItemId] : undefined;
  if (ai?.unit && ai.attack) attackerUnitBonus[ai.unit] = (attackerUnitBonus[ai.unit] ?? 1) * (1 + ai.attack);
  if (di?.unit && di.defense) defenderUnitBonus[di.unit] = 1 + di.defense;
  if (i.defenderItem === 'bonfire') defenderUnitBonus.catapult = 11;
  const r = fight(s.config, {
    attacker: i.attacker, defender: i.defender, wall: Math.max(0, Math.min(20, Math.floor(i.wall))),
    morale: Math.max(0.3, Math.min(1, i.morale)), luck: Math.max(-0.25, Math.min(0.25, i.luck)),
    ...(i.catapultTarget ? { catapultTarget: i.catapultTarget, targetLevel: i.targetLevel ?? 0 } : {}),
    attackerUnitBonus, defenderUnitBonus,
    attackerFactor: i.attackerPercent / 100, defenderFactor: i.defenderPercent / 100,
    ...(i.attackerItem === 'morningstar' ? { ramFactor: 2 } : {}),
    ...(i.attackerItem === 'bonfire' ? { catapultFactor: 2 } : {}),
  });
  return {
    attackerWon: r.attackerWon, attackerLost: r.attackerLost, defenderLost: r.defenderLost, wallAfter: r.wallAfter,
    ...(r.buildingAfter !== undefined ? { buildingAfter: r.buildingAfter } : {}),
    attackStrength: r.attackStrength, defenseStrength: r.defenseStrength,
  };
}

function opinionsView(s: WorldState): OpinionsView {
  const t = s.players[HUMAN_ID]?.tribe !== undefined ? s.tribes?.[s.players[HUMAN_ID]!.tribe!] : undefined;
  const mates = t && t.leader === HUMAN_ID
    ? t.members.filter((m) => m !== HUMAN_ID).map((m) => s.players[m]!).filter((p) => p?.bot).map((p) => ({
        id: p.id, name: p.name, archetype: p.bot!.archetype, mood: Math.round(moodOf(p)), favor: p.bot!.favor ?? 0, notes: [...(p.bot!.moodNotes ?? [])].reverse(),
      })).sort((a, b) => a.mood - b.mood)
    : [];
  const leader = t && t.leader !== HUMAN_ID ? s.players[t.leader] : undefined;
  const grudges = s.players.filter((p) => p.bot?.grudges?.[HUMAN_ID]).map((p) => {
    const g = p.bot!.grudges![HUMAN_ID]!;
    const pt = p.tribe !== undefined ? s.tribes?.[p.tribe] : undefined;
    return { id: p.id, name: p.name, ...(pt ? { tribeTag: pt.tag } : {}), score: grudge(s, p, HUMAN_ID), ...(g.why ? { why: g.why } : {}), at: g.at, halfLife: grudgeHalfLife(s) };
  }).filter((g) => g.score >= 0.05).sort((a, b) => b.score - a.score);
  const ask = (s.resourceAsks ?? []).find((a) => a.at > s.time - DAY);
  return {
    mates,
    ...(leader ? { standing: { leader: leader.id, leaderName: leader.name, value: Math.round(s.standing ?? BASE_MOOD), notes: [...(s.standingNotes ?? [])].reverse() } } : {}),
    grudges,
    betrayals: s.betrayals ?? 0,
    permissions: Object.entries(s.permissions ?? {}).map(([id, p]) => ({ target: Number(id), name: s.players[Number(id)]?.name ?? '?', ...(p.answer ? { answer: p.answer } : {}), ...(p.until ? { until: p.until } : {}) })),
    ...(ask ? { resourceAsk: { village: ask.village, res: [...ask.res] as [number, number, number], sent: [...ask.sent] as [number, number, number], at: ask.at } } : {}),
  };
}

function flagsView(s: WorldState): NonNullable<Snapshot['flags']> {
  const p = s.players[HUMAN_ID]!;
  return {
    free: Object.fromEntries(FLAG_TYPES.map((t) => [t, Array.from({ length: 9 }, (_, i) => freeFlags(s, p, t, i + 1))])),
    kills: p.flags?.kills ?? 0,
    auto: !!p.flags?.auto,
    hang: p.flags?.hang ?? null,
  };
}

function itemsView(s: WorldState): NonNullable<Snapshot['items']> {
  const it = s.players[HUMAN_ID]?.items;
  return {
    found: (it?.found ?? []).map((id) => ({ id, name: ITEMS[id].name, text: ITEMS[id].text })),
    ...(it?.equipped ? { equipped: it.equipped } : {}),
    progress: it?.progress ?? 0,
    all: ITEM_IDS.filter((i) => s.config.archers || (ITEMS[i].unit !== 'archer' && ITEMS[i].unit !== 'marcher')).length,
  };
}

function endgameView(s: WorldState): EndgameView {
  const r = endgameRules(s);
  const eg = s.endgame;
  const lt = eg?.leader !== undefined ? s.tribes?.[eg.leader] : undefined;
  return {
    target: r.target, warnAt: r.warnAt, countBarbarians: r.countBarbarians, holdDays: r.holdMs / DAY,
    ...(lt && eg?.since !== undefined ? { leader: { tribe: lt.id, tag: lt.tag, since: eg.since, winsAt: eg.since + r.holdMs, you: lt.members.includes(HUMAN_ID) } } : {}),
    ...(eg?.winner ? { winner: { ...eg.winner } } : {}),
    continued: !!eg?.continued,
  };
}

function mintRows(s: WorldState, keep: number) {
  return planMintAll(s, keep).map((p) => { const v = s.villages[p.village]!; return { id: v.id, name: v.name, x: v.x, y: v.y, coins: p.coins }; });
}

function farmAllView(s: WorldState, options: FarmAllOptions): FarmAllView {
  const plan = planFarmAll(s, options);
  const per = new Map<number, number>();
  for (const x of plan.sends) per.set(x.from, (per.get(x.from) ?? 0) + 1);
  return {
    options,
    attacks: plan.sends.length,
    from: [...per].map(([id, attacks]) => ({ id, name: s.villages[id]?.name ?? '?', attacks })).sort((a, b) => b.attacks - a.attacks),
    villages: plan.villages,
    able: plan.able,
    skipped: plan.skipped,
    left: plan.left,
    furthest: plan.sends.reduce((m, x) => Math.max(m, x.distance), 0),
  };
}

function scavView(s: WorldState): ScavView {
  const villages = villagesOf(s, HUMAN_ID).map((v) => {
    const sc = v.scav;
    const home: UnitCounts = {};
    for (const u of SCAV_UNITS) if (v.units[u] > 0) home[u] = v.units[u];
    return {
      id: v.id, name: v.name, x: v.x, y: v.y,
      groups: [...(v.groups ?? [])],
      hasPlace: isOperational(s.config, v, 'place'),
      home,
      unlocked: sc?.unlocked ?? 0,
      repeat: !!sc?.repeat,
      runs: (sc?.runs ?? []).map((r) => ({ level: r.level, units: { ...r.units }, returns: r.returns })),
      last: (sc?.last ?? []).map((l) => ({ ...l, loot: [...l.loot] as [number, number, number], lost: { ...l.lost } })),
    };
  });
  const params = scavParams(s);
  const units = Object.fromEntries(SCAV_UNITS.map((u) => [u, { attack: params.units[u].attack, carry: params.units[u].carry }]));
  return {
    enabled: scavEnabled(s),
    params: { worldSpeed: params.worldSpeed, productionMultiplier: params.productionMultiplier, units: units as ScavView['params']['units'] },
    templates: [DEFAULT_SCAV_TEMPLATE, ...(s.scavTemplates ?? [])],
    villages,
  };
}

function saveScavTemplate(s: WorldState, t: ScavTemplate): string | null {
  const name = t.name.trim();
  if (!name) return tr('Geef het sjabloon een naam.');
  if (t.id === DEFAULT_SCAV_TEMPLATE.id) return tr('Het standaardsjabloon kun je niet aanpassen; sla het op onder een andere naam.');
  const list = (s.scavTemplates ??= []);
  const clean: ScavTemplate = { id: t.id || `t${Date.now().toString(36)}`, name: name.slice(0, 30), units: {}, levels: [0, 1, 2, 3].map((l) => !!t.levels[l]), safeOnly: !!t.safeOnly };
  for (const u of SCAV_UNITS) {
    const r = t.units[u];
    if (r) clean.units[u] = { use: !!r.use, keep: Math.max(0, Math.floor(r.keep || 0)) };
  }
  const at = list.findIndex((x) => x.id === clean.id);
  if (at >= 0) list[at] = clean;
  else if (list.length >= 20) return tr('Maximaal {n} sjablonen.', { n: 20 });
  else list.push(clean);
  return null;
}

function surplusRows(s: WorldState, keep: number): SurplusRow[] {
  const ref = (id: number) => { const v = s.villages[id]!; return { id, name: v.name, x: v.x, y: v.y }; };
  return planSurplus(s, { keep, auto: false }).map((sh) => ({ from: ref(sh.from), to: ref(sh.to), res: [...sh.res] as [number, number, number], merchants: sh.merchants, travel: sh.travel }));
}

/** Every support that involves you: in your villages, yours elsewhere, and between your own villages. */
function supportRows(s: WorldState): SupportRow[] {
  const ref = (v: Village) => ({ id: v.id, name: v.name, x: v.x, y: v.y, owner: v.owner, ownerName: v.owner < 0 ? tr('barbaren') : (s.players[v.owner]?.name ?? '?') });
  const rows: SupportRow[] = [];
  for (const host of Object.values(s.villages)) {
    if (!host.support) continue;
    for (const [originId, units] of Object.entries(host.support)) {
      const origin = s.villages[Number(originId)];
      if (!origin || Object.keys(units).length === 0) continue;
      const hostMine = host.owner === HUMAN_ID, originMine = origin.owner === HUMAN_ID;
      if (!hostMine && !originMine) continue;
      rows.push({
        kind: hostMine && originMine ? 'own' : hostMine ? 'foreign' : 'mine',
        host: ref(host), origin: ref(origin), units: { ...units },
        travel: travelTimeMs(s, units, distance(host, origin)),
      });
    }
  }
  return rows;
}

function inviteCandidates(s: WorldState, ranking: RankingRow[]): CandidateView[] {
  const me = s.players[HUMAN_ID];
  const t = me?.tribe !== undefined ? s.tribes?.[me.tribe] : undefined;
  if (!t || t.leader !== HUMAN_ID) return [];
  const points = new Map(ranking.map((r) => [r.id, r.points]));
  const out: CandidateView[] = [];
  for (const p of s.players) {
    if (!p.bot || p.tribe === t.id) continue;
    const fit = fitCheck(s, t, p.id);
    if (fit.reason === 'gone') continue;
    const declined = s.tribeRefusals?.invites[p.id];
    out.push({
      id: p.id, name: p.name, points: points.get(p.id) ?? 0,
      distance: Math.round(fit.distance * 10) / 10, reach: Math.round(fit.reach * 10) / 10,
      ...(fit.reason !== 'ok' ? { blocked: fit.reason } : {}),
      ...(p.tribe !== undefined ? { tribe: p.tribe } : {}), ...(declined ? { declined } : {}),
    });
  }
  return out.sort((a, b) => a.distance - b.distance).slice(0, 20);
}

function orderViews(s: WorldState): OrderView[] {
  const t = s.players[HUMAN_ID]?.tribe !== undefined ? s.tribes?.[s.players[HUMAN_ID]!.tribe!] : undefined;
  const mates = t ? t.members.filter((m) => m !== HUMAN_ID).length : 0;
  return (s.tribeOrders ?? []).filter((o) => o.expires > s.time).map((o) => {
    const v = o.kind === 'attack' ? s.villages[o.target] : undefined;
    const targetName = v ? tr('{village} ({x}|{y}) van {owner}', { village: v.name, x: String(v.x), y: String(v.y), owner: v.owner < 0 ? tr('barbaren') : (s.players[v.owner]?.name ?? '?') }) : (s.players[o.target]?.name ?? '?');
    const answers = Object.values(o.answers);
    return {
      id: o.id, kind: o.kind, target: o.target, targetName, binding: o.binding, expires: o.expires,
      yes: answers.filter((a) => a === 'yes').length, half: answers.filter((a) => a === 'half').length, no: answers.filter((a) => a === 'no').length,
      waiting: Math.max(0, mates - answers.length),
    };
  });
}

function inboxViews(s: WorldState): InboxView[] {
  return [...(s.inbox ?? [])].reverse().map((m) => ({
    id: m.id, time: m.time, kind: m.kind, from: m.from, fromName: m.from >= 0 ? (s.players[m.from]?.name ?? '?') : tr('Wereld'),
    title: m.title, text: m.text, read: m.read,
    ...((() => { const f = m.from >= 0 ? faceOf(s, m.from) : null; return f ? { fromFace: f } : {}; })()),
    ...(m.tribe !== undefined ? { tribe: m.tribe } : {}),
    ...(m.request ? { request: m.request } : {}),
    ...(m.rhAsk ? { rhAsk: m.rhAsk } : {}),
    ...(m.status ? { status: m.status } : {}),
    ...(m.expires !== undefined ? { expires: m.expires } : {}),
  }));
}

/** Profile of a player: villages, tribe, and what your reports say about the two of you. */
function playerView(s: WorldState, id: number): PlayerView | null {
  const p = s.players[id];
  if (!p) return null;
  const vs = villagesOf(s, id);
  const mine = villagesOf(s, HUMAN_ID);
  const pts = (pid: number) => villagesOf(s, pid).reduce((t, v) => t + villagePoints(s.config, v), 0);
  const points = pts(id);
  const rank = 1 + s.players.filter((o) => o.id !== id && pts(o.id) > points).length;
  const villages = vs
    .map((v) => ({
      id: v.id, name: v.name, x: v.x, y: v.y, points: villagePoints(s.config, v),
      distance: mine.length ? Math.round(Math.min(...mine.map((m) => distance(m, v))) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.points - a.points);
  let cx = 0, cy = 0, w = 0;
  for (const v of villages) { const k = v.points + 1; cx += v.x * k; cy += v.y * k; w += k; }
  const t = p.tribe !== undefined ? s.tribes?.[p.tribe] : undefined;
  const is = (r: { owner?: number; ownerName: string }) => (r.owner !== undefined ? r.owner === id : r.ownerName === p.name || (id === HUMAN_ID && (r.ownerName === 'Jij' || r.ownerName === 'You')));
  const history: PlayerView['history'] = { theirAttacks: 0, theirWins: 0, yourAttacks: 0, yourWins: 0, villagesTakenFromYou: 0, villagesYouTook: 0 };
  for (const r of s.reports) {
    const won = r.result !== 'loss';
    if (r.defense && is(r.attacker)) {
      history.theirAttacks++;
      if (won) history.theirWins++;
      if (r.conquered) history.villagesTakenFromYou++;
      history.lastTheirs = Math.max(history.lastTheirs ?? 0, r.time);
    } else if (!r.defense && is(r.defender)) {
      history.yourAttacks++;
      if (won) history.yourWins++;
      if (r.conquered) history.villagesYouTook++;
      history.lastYours = Math.max(history.lastYours ?? 0, r.time);
    }
  }
  const incoming = Object.values(s.movements).filter((m) => m.kind === 'attack' && m.owner === id && s.villages[m.to]?.owner === HUMAN_ID).length;
  return {
    id, name: p.name, isBot: p.isBot, rank, points, villages,
    ...((() => { const f = faceOf(s, id); return f ? { face: f } : {}; })()),
    centre: w ? { x: Math.round(cx / w), y: Math.round(cy / w) } : null,
    ...(t ? { tribe: { id: t.id, tag: t.tag, name: t.name, color: t.color } } : {}),
    history, incoming,
    stats: { pvp: 0, barb: 0, took: 0, tookBarb: 0, lost: 0, ...s.worldStats?.players[id] },
    mates: (t?.members ?? []).filter((m) => m !== id).map((m) => ({
      id: m, name: s.players[m]?.name ?? '?', villages: villagesOf(s, m).map((v) => ({ x: v.x, y: v.y })),
    })),
    mine: id === HUMAN_ID ? [] : mine.map((v) => ({ x: v.x, y: v.y })),
    ...playerBond(s, p),
  };
}

function playerBond(s: WorldState, p: Player): Pick<PlayerView, 'bond' | 'grudge' | 'mood' | 'canAskPermission' | 'permission'> {
  const me = s.players[HUMAN_ID];
  const mine = me?.tribe !== undefined ? s.tribes?.[me.tribe] : undefined;
  const theirs = p.tribe !== undefined ? s.tribes?.[p.tribe] : undefined;
  const rel = mine && theirs && mine.id !== theirs.id ? mine.relations[theirs.id] : undefined;
  const bond = mine && theirs?.id === mine.id ? 'mate' : rel === 'ally' || rel === 'nap' ? rel : undefined;
  const perm = s.permissions?.[p.id];
  return {
    ...(bond && p.id !== HUMAN_ID ? { bond } : {}),
    grudge: p.bot ? Math.round(grudge(s, p, HUMAN_ID) * 100) / 100 : 0,
    ...(mine?.leader === HUMAN_ID && bond === 'mate' && p.bot ? { mood: Math.round(moodOf(p)) } : {}),
    canAskPermission: !!mine && mine.leader !== HUMAN_ID && p.id !== HUMAN_ID && bond !== 'mate',
    ...(perm ? { permission: { ...(perm.answer ? { answer: perm.answer } : {}), ...(perm.until ? { until: perm.until } : {}) } } : {}),
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
    chains: s.config.quests.chains.filter((chain) => chainActive(s, chain)).map((chain) => {
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

/** Village rows to a tab at most this often (ms, real time): resources change them every tick. */
const VILLAGES_EVERY_MS = 500;

/**
 * A snapshot to one tab, without the fields that are the same as what it got last time (it keeps
 * those: `same` names them). Saves copying and redrawing tens of kB ten times a second.
 */
function postTo(c: Client, snap: Snapshot | null): void {
  if (!snap) { c.sent = undefined; c.port.postMessage({ type: 'snapshot', snapshot: null }); return; }
  const sent = (c.sent ??= new Map());
  const out: Record<string, unknown> = {};
  const same: string[] = [];
  const now = Date.now();
  for (const [k, value] of Object.entries(snap)) {
    const prev = sent.get(k);
    // not built for this tab now (see lazy): it keeps what it has
    if (value === SKIP) { same.push(k); continue; }
    const json = JSON.stringify(value ?? null);
    if (json === prev) { same.push(k); continue; }
    sent.set(k, json);
    out[k] = value;
    if (k === 'villages') { c.villagesAt = now; c.villagesLen = (value as unknown[]).length; }
    if (k === 'movements') c.movesAt = now;
  }
  // fields that are gone now (optional ones): the tab must drop them, so they are not 'same'
  for (const k of [...sent.keys()]) if (!(k in snap)) sent.delete(k);
  c.port.postMessage({ type: 'snapshot', snapshot: out as unknown as Snapshot, ...(same.length ? { same } : {}) });
}

function postSnapshot(): void {
  // inside a command: what the command did to the current village is that tab's choice
  if (from && state) { from.current = state.current ?? null; fromSettled = true; }
  // a hidden tab gets no snapshots (it gets a fresh one when it shows again)
  for (const c of clients) if (c.visible || c === from) asClient(c, () => postTo(c, snapshot(c)));
  if (state?.sfx?.length) {
    const sounds = state.sfx;
    state.sfx = [];
    for (const c of clients) if (c.visible) c.port.postMessage({ type: 'sfx', sounds });
  }
}

async function postSaves(): Promise<void> {
  post({ type: 'saves', saves: await listSaves() });
}

/** Saves locally; with `cloud` set the same text also goes to the cloud (if signed in; 'auto' at most every few minutes). */
async function save(slot: string, quiet = false, to: Client | null = null, cloudWhen: 'auto' | 'now' | 'push' | 'force' | null = null): Promise<void> {
  if (!state) return;
  const s = state;
  const data = toSaveData(s, Date.now(), false);
  const json = JSON.stringify(data);
  await putSave(slot, data, json);
  runningSinceAutosave = 0;
  if (!quiet) notice(tr('Opgeslagen in "{slot}".', { slot }), 'info', to);
  await postSaves();
  if (cloudWhen) void cloud.offer({ key: worldKey(s), name: s.config.name, savedAt: data.savedAt, gameTime: s.time, version: data.version, json }, cloudWhen);
}

function autosave(cloudWhen: 'auto' | 'now' = 'auto'): void {
  if (!state) return;
  const due = runningSinceBackup >= BACKUP_EVERY_MS;
  save(autosaveSlot(state), true, null, cloudWhen)
    .then(() => (due ? backup().then(postSaves) : undefined))
    .catch((e: unknown) => notice(tr('Autosave mislukt: {error}', { error: String(e) }), 'error'));
}

/** Simulation cost for the performance meter: per real second, how busy, the slowest tick and game time lost. */
let simPerf = { busy: 0, max: 0, lost: 0, snap: 0 };
let perfWindow = { start: performance.now(), busy: 0, max: 0, lost: 0, snap: 0 };

function notePerf(now: number, gap: number, cost: number, snap: number): void {
  const w = perfWindow;
  w.busy += cost;
  w.snap += snap;
  w.max = Math.max(w.max, cost);
  if (gap > MAX_STEP_MS) w.lost += gap - MAX_STEP_MS;
  const span = now - w.start;
  if (span >= 1000) {
    simPerf = { busy: Math.round((w.busy * 1000) / span), max: Math.round(w.max), lost: Math.round((w.lost * 1000) / span), snap: Math.round((w.snap * 1000) / span) };
    perfWindow = { start: now, busy: 0, max: 0, lost: 0, snap: 0 };
  }
}

function tick(): void {
  const now = performance.now();
  const gap = now - lastTick;
  const dt = Math.min(gap, MAX_STEP_MS);
  lastTick = now;
  if (!state) return;

  if (!state.paused && !suspended) {
    const result = advance(state, dt);
    runningSinceAutosave += dt;
    runningSinceBackup += dt;
    if (result.autoPaused) {
      post({ type: 'autoPaused', entry: result.autoPaused });
      autosave();
    } else if (runningSinceAutosave >= AUTOSAVE_EVERY_MS) {
      autosave();
    }
  }

  const before = performance.now();
  if (++ticks % SNAPSHOT_EVERY_TICKS === 0) postSnapshot();
  // the whole tick (game time and the update for the screens) counts; the update also on its own
  const end = performance.now();
  if (state && !state.paused && !suspended) notePerf(now, gap, end - now, end - before);
}

async function handle(cmd: Command): Promise<void> {
  // after an await another tab may have sent a command: answers then go to this tab explicitly
  const me = from;
  switch (cmd.type) {
    case 'newWorld': {
      const config = createConfig(cmd.preset, cmd.name.trim() || tr('Naamloze wereld'), cmd.seed ?? randomSeed(), cmd.overrides);
      const errors = validateConfig(config);
      if (errors.length > 0) {
        notice(errors.join(' '), 'error');
        return;
      }
      state = createWorld(config);
      runningSinceBackup = 0;
      await save(autosaveSlot(state), true);
      break;
    }
    case 'setSpeed':
      if (state) setSpeed(state, cmd.speed);
      break;
    case 'setPaused':
      if (state) {
        setPaused(state, cmd.paused);
        if (cmd.paused) autosave('now');
      }
      break;
    case 'setLang':
      lang.value = cmd.lang;
      break;
    case 'setScreen':
      if (from) from.screen = cmd.screen;
      break;
    case 'setVisible': {
      if (from) from.visible = cmd.visible;
      const was = suspended;
      // the world stands still only when no tab shows it
      suspended = ![...clients].some((c) => c.visible);
      if (suspended && !was && state && !state.paused) autosave('now');
      break;
    }
    case 'hello':
      if (from && state && cmd.village !== null && state.villages[cmd.village]?.owner === HUMAN_ID) { from.current = cmd.village; state.current = cmd.village; }
      break;
    case 'bye':
      if (from) clients.delete(from);
      suspended = ![...clients].some((c) => c.visible);
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
      await save(cmd.slot, false, me);
      break;
    case 'saveWorld':
      if (state) await save(`${MANUAL_PREFIX}${worldKey(state)}`, true, me, 'now');
      notice(cloud.user ? tr('Wereld opgeslagen (ook naar de cloud).') : tr('Wereld opgeslagen.'), 'info', me);
      break;
    case 'load': {
      const data = await getSave(cmd.slot);
      if (!data) {
        notice(tr('Save "{slot}" niet gevonden.', { slot: cmd.slot }), 'error', me);
        return;
      }
      // a save from before an update: keep the original first, the migration can't be undone
      if (data.version < SAVE_VERSION) {
        const seed = (data.state as { config?: { seed?: number } }).config?.seed ?? 'oud';
        const keep = `${UPDATE_PREFIX}${seed}:v${data.version}`;
        if (!(await getSave(keep))) await putSave(keep, data);
      }
      state = fromSaveData(data);
      redrawOnLoad(state);
      runningSinceBackup = 0;
      // always resume paused, so nothing happens before the player looks
      state.paused = true;
      notice(tr('"{name}" geladen.', { name: state.config.name }), 'info', me);
      break;
    }
    case 'auth':
      await cloud.setUser(cmd.user);
      break;
    case 'cloudRefresh':
      await cloud.refresh();
      break;
    case 'cloudDelete':
      await cloud.remove(cmd.slot);
      break;
    case 'cloudForce':
      if (state) await save(autosaveSlot(state), true, me, 'force');
      break;
    case 'cloudPrefs':
      cloud.skip = new Set(cmd.off);
      break;
    case 'cloudPush':
      await pushWorld(cmd.key, cmd.force ? 'force' : 'push', me);
      break;
    case 'cloudReplace': {
      const local = await newestLocal(cmd.key);
      if (!local) return notice(tr('Die wereld staat niet op dit apparaat.'), 'error', me);
      await cloud.remove(cmd.slot);
      await pushWorld(cmd.key, 'push', me);
      break;
    }
    case 'cloudDownload': {
      const world = await fetchCloudWorld(cmd.slot);
      notice(tr('"{name}" staat nu ook op dit apparaat.', { name: world.name }), 'info', me);
      await postSaves();
      break;
    }
    case 'deleteWorld': {
      if (state && worldKey(state) === cmd.key) return notice(tr('Deze wereld is nu open. Ga eerst terug naar het startscherm.'), 'error', me);
      for (const m of await listSaves()) if (worldKeyOf(m) === cmd.key || `slot:${m.slot}` === cmd.key) await deleteSave(m.slot);
      await postSaves();
      break;
    }
    case 'closeWorld':
      if (state) await save(autosaveSlot(state), true, me, 'now');
      state = null;
      for (const c of clients) c.current = null;
      break;
    case 'cloudLoad': {
      const world = await fetchCloudWorld(cmd.slot);
      await handle({ type: 'load', slot: `${AUTOSAVE_SLOT}:${world.key}` });
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
      if (state.villages[cmd.from]?.owner !== HUMAN_ID) return notice(tr('Dat is niet jouw dorp.'), 'error');
      {
        const error = sendAttack(state, cmd.from, cmd.to, cmd.units, cmd.catapultTarget, undefined, 0, undefined, true);
        if (error) notice(error, 'error');
        else {
          const owner = state.villages[cmd.to]?.owner;
          if (owner !== undefined && owner >= 0) attackedWithoutPermission(state, owner);
          humanOpSent(state, cmd.to);
          // sent by hand: the march (farm tools go quietly)
          playSfx(state, 'march');
        }
      }
      break;
    case 'sendFarm': {
      if (!state) return;
      if (state.villages[cmd.from]?.owner !== HUMAN_ID) return notice(tr('Dat is niet jouw dorp.'), 'error');
      const units = cmd.template === '*' ? farmCUnits(state, cmd.from, cmd.to) : state.farmTemplates[cmd.template];
      const before = state.nextId;
      const error = !units ? tr('Sjabloon {template} bestaat niet.', { template: cmd.template }) : typeof units === 'string' ? units : sendAttack(state, cmd.from, cmd.to, units);
      if (error) notice(error, 'error');
      else { markFarm(state, before, cmd.to, cmd.template); if (farmNotifies(state, cmd.template)) playSfx(state, 'march'); }
      break;
    }
    case 'setFarmNotify': {
      if (!state) return;
      if (cmd.template !== '*' && !isFarmLetter(cmd.template)) break;
      const rest = (state.farmNotify ?? []).filter((k) => k !== cmd.template);
      state.farmNotify = cmd.on ? [...rest, cmd.template] : rest;
      break;
    }
    case 'setFarmTemplate': {
      if (!state) return;
      const units: UnitCounts = {};
      for (const u of UNIT_IDS) {
        const n = Math.floor(cmd.units[u] ?? 0);
        if (n > 0) units[u] = n;
      }
      if (!isFarmLetter(cmd.template)) break;
      if (Object.keys(units).length) state.farmTemplates[cmd.template] = units;
      else delete state.farmTemplates[cmd.template];
      break;
    }
    case 'setTemplateHidden': {
      if (!state) return;
      const set = new Set(state.hiddenTemplates ?? []);
      if (cmd.hidden) set.add(cmd.id); else set.delete(cmd.id);
      state.hiddenTemplates = [...set];
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
      if (state.villages[cmd.from]?.owner !== HUMAN_ID) return notice(tr('Dat is niet jouw dorp.'), 'error');
      const error = sendResources(state, cmd.from, cmd.to, cmd.res);
      if (error) notice(error, 'error');
      break;
    }
    case 'createOffer': {
      if (!state) return;
      if (state.villages[cmd.villageId]?.owner !== HUMAN_ID) return notice(tr('Dat is niet jouw dorp.'), 'error');
      const count = Math.max(1, Math.min(50, Math.floor(cmd.count)));
      let made = 0;
      let error: string | null = null;
      while (made < count && (error = createOffer(state, cmd.villageId, cmd.give, cmd.want)) === null) made++;
      if (error && made === 0) notice(error, 'error');
      else if (error) notice(tr('{made} van {count} aanbiedingen geplaatst: {error}', { made, count, error }), 'error');
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
      if (state.villages[cmd.villageId]?.owner !== HUMAN_ID) return notice(tr('Dat is niet jouw dorp.'), 'error');
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
      notice(n > 0 ? (n === 1 ? tr('{n} zending onderweg.', { n }) : tr('{n} zendingen onderweg.', { n })) : tr('Niets te balanceren (of geen vrije handelaren).'));
      break;
    }
    case 'dismissToast':
      if (!state) return;
      dismissToast(state, cmd.id);
      break;
    case 'setAutoRewards':
      if (!state) return;
      state.autoRewards = cmd.on;
      if (cmd.on) { delete state.autoRewardsAt; autoClaimRewards(state); }
      break;
    case 'claimAllRewards': {
      if (!state) return;
      const error = claimAllRewards(state, cmd.villageId ?? currentVillage(state)?.id);
      if (error) notice(error, 'error');
      break;
    }
    case 'mintCoins': {
      if (!state) return;
      if (state.villages[cmd.villageId]?.owner !== HUMAN_ID) return notice(tr('Dat is niet jouw dorp.'), 'error');
      const error = mintCoins(state, cmd.villageId, cmd.count);
      if (error) notice(error, 'error');
      break;
    }
    case 'sendNobleTrain': {
      if (!state) return;
      if (state.villages[cmd.from]?.owner !== HUMAN_ID) return notice(tr('Dat is niet jouw dorp.'), 'error');
      const error = sendNobleTrain(state, cmd.from, cmd.to, cmd.first, cmd.escorts, cmd.catapultTarget, cmd.clearFirst ?? false);
      if (error) notice(error, 'error');
      else { const owner = state.villages[cmd.to]?.owner; if (owner !== undefined && owner >= 0) attackedWithoutPermission(state, owner); humanOpSent(state, cmd.to); playSfx(state, 'march'); }
      break;
    }
    case 'planAttack': {
      if (!state) return;
      const error = planAttack(state, { from: cmd.from, to: cmd.to, first: cmd.first, ...(cmd.escorts?.length ? { escorts: cmd.escorts } : {}), ...(cmd.catapultTarget ? { catapultTarget: cmd.catapultTarget } : {}), ...(cmd.clearFirst ? { clearFirst: true } : {}), landAt: cmd.landAt });
      notice(error ?? tr('Aanval ingepland: hij vertrekt vanzelf.'), error ? 'error' : 'info');
      break;
    }
    case 'planOrder': {
      if (!state) return;
      const error = planOrder(state, cmd.from, cmd.to, cmd.landAt, !!cmd.spies);
      notice(error ?? tr('Ingepland: hij vertrekt vanzelf op tijd.'), error ? 'error' : 'info');
      break;
    }
    case 'tribeCoup': {
      if (!state) return;
      const error = attemptCoup(state);
      if (error) notice(error, 'error');
      break;
    }
    case 'askOrder': {
      if (!state) return;
      const error = askForOrder(state);
      notice(error ?? tr('Gevraagd: kijk in je opdrachten of je inbox.'), error ? 'error' : 'info');
      break;
    }
    case 'giveNobles': {
      if (!state) return;
      const error = giveNobles(state, cmd.op, cmd.to);
      notice(error ?? tr('Edels weggegeven.'), error ? 'error' : 'info');
      break;
    }
    case 'cancelPlanned': {
      if (!state) return;
      const error = cancelPlanned(state, cmd.id);
      if (error) notice(error, 'error');
      break;
    }
    case 'sendSupport': {
      if (!state) return;
      if (state.villages[cmd.from]?.owner !== HUMAN_ID) return notice(tr('Dat is niet jouw dorp.'), 'error');
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
    case 'returnSupportMany': {
      if (!state) return;
      let ok = 0;
      for (const { hostId, originId } of cmd.pairs) if (returnSupport(state, HUMAN_ID, hostId, originId) === null) ok++;
      notice(ok ? (ok === 1 ? tr('{n} ondersteuning op weg naar huis.', { n: ok }) : tr('{n} ondersteuningen op weg naar huis.', { n: ok })) : tr('Niets teruggestuurd.'), ok ? 'info' : 'error');
      post({ type: 'supportList', rows: supportRows(state) });
      break;
    }
    case 'debugSkip': {
      if (!state) return;
      // run the world forward at speed 1, past any auto-pause
      const speed = state.speed, paused = state.paused;
      state.speed = 1;
      const end = state.time + cmd.hours * 3_600_000;
      while (state.time < end) { state.paused = false; advance(state, Math.min(end - state.time, 3_600_000)); }
      state.speed = speed; state.paused = paused;
      addLog(state, { time: state.time, text: tr('Debug: {n} uur doorgespoeld.', { n: cmd.hours }) });
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
      addLog(state, { time: state.time, text: tr('Debug: {village} ({x}|{y}) overgenomen.', { village: target.name, x: String(target.x), y: String(target.y) }) });
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
    case 'saveNobleTemplate':
    case 'deleteNobleTemplate': {
      if (!state) return;
      const error = cmd.type === 'saveNobleTemplate' ? saveNobleTemplate(state, cmd.template) : deleteNobleTemplate(state, cmd.id);
      if (error) notice(error, 'error');
      break;
    }
    case 'saveTroopTemplate':
    case 'deleteTroopTemplate': {
      if (!state) return;
      const error = cmd.type === 'saveTroopTemplate' ? saveTroopTemplate(state, cmd.template) : deleteTroopTemplate(state, cmd.id);
      if (error) post({ type: 'notice', level: 'error', text: error });
      break;
    }
    case 'dismissUnits': {
      if (!state) return;
      const error = dismissUnits(state, cmd.villageId, cmd.units);
      if (error) notice(error, 'error');
      break;
    }
    case 'sendSupportMany': {
      if (!state) return;
      let sent = 0;
      const errors: string[] = [];
      for (const o of cmd.orders) {
        const error = sendSupport(state, o.from, cmd.to, o.units);
        if (error) errors.push(`${state.villages[o.from]?.name ?? '?'}: ${error}`);
        else sent++;
      }
      if (sent) notice(sent === 1 ? tr('Support verstuurd vanuit {n} dorp.', { n: sent }) : tr('Support verstuurd vanuit {n} dorpen.', { n: sent }), 'info');
      if (errors.length) notice(errors.join(' · '), 'error');
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
    case 'tribeFound':
    case 'tribeApply':
    case 'tribeLeave':
    case 'tribeInvite':
    case 'tribeKick':
    case 'tribePropose':
    case 'tribeRelation':
    case 'tribeAskWar':
    case 'rhPropose':
    case 'inboxAnswer': {
      if (!state) return;
      const s = state;
      const error =
        cmd.type === 'tribeFound' ? foundTribe(s, cmd.name, cmd.tag)
        : cmd.type === 'tribeApply' ? applyToTribe(s, cmd.tribe)
        : cmd.type === 'tribeLeave' ? leaveTribe(s)
        : cmd.type === 'tribeInvite' ? invitePlayer(s, cmd.player)
        : cmd.type === 'tribeKick' ? kickMember(s, cmd.player)
        : cmd.type === 'tribePropose' ? proposeRelation(s, cmd.tribe, cmd.relation)
        : cmd.type === 'rhPropose' ? (cmd.relation === 'ally' ? rhAskAlly(s, cmd.tribe) : rhPropose(s, cmd.tribe, cmd.relation))
        : cmd.type === 'tribeRelation' ? setOwnRelation(s, cmd.tribe, cmd.action)
        : cmd.type === 'tribeAskWar' ? askLeaderWar(s, cmd.tribe)
        : answerMessage(s, cmd.id, cmd.accept);
      if (error) post({ type: 'notice', level: 'error', text: error });
      post({ type: 'inbox', inbox: inboxViews(s) });
      sendRanking(s);
      break;
    }
    case 'tribeFront': {
      if (!state) return;
      const error = setFront(state, cmd.enemy, cmd.target);
      if (error) notice(error, 'error');
      break;
    }
    case 'inboxRead':
      if (!state) return;
      markInboxRead(state);
      post({ type: 'inbox', inbox: inboxViews(state) });
      break;
    case 'saveGroup':
    case 'deleteGroup':
    case 'setGroup': {
      if (!state) return;
      const error = cmd.type === 'saveGroup' ? saveGroup(state, cmd.group) : cmd.type === 'deleteGroup' ? deleteGroup(state, cmd.id) : setGroup(state, cmd.group, cmd.villages, cmd.member);
      if (error) notice(error, 'error');
      break;
    }
    case 'askTribeHelp':
    case 'giveOrder':
    case 'cancelOrder': {
      if (!state) return;
      const error = cmd.type === 'askTribeHelp' ? askTribeHelp(state, cmd.movement) : cmd.type === 'giveOrder' ? giveOrder(state, cmd.kind, cmd.target) : cancelOrder(state, cmd.id);
      if (error) notice(error, 'error');
      else if (cmd.type === 'askTribeHelp') notice(tr('Je stam is om hulp gevraagd. Stamgenoten antwoorden als ze online zijn.'), 'info');
      break;
    }
    case 'getPlayer':
      if (state) post({ type: 'player', player: playerView(state, cmd.id) });
      return;
    case 'getInbox':
      if (state) post({ type: 'inbox', inbox: inboxViews(state) });
      return;
    case 'askTribeResources':
    case 'askPermission':
    case 'betray': {
      if (!state) return;
      const error = cmd.type === 'askTribeResources' ? askTribeResources(state, cmd.village, cmd.res) : cmd.type === 'askPermission' ? askPermission(state, cmd.target) : humanBetray(state, cmd.target);
      if (error) notice(error, 'error');
      else notice(cmd.type === 'askTribeResources' ? tr('Je stam is om grondstoffen gevraagd. Stamgenoten antwoorden als ze online zijn.') : cmd.type === 'askPermission' ? tr('Gevraagd. Je leider antwoordt als hij online is.') : tr('Het is gebeurd. Er is geen weg terug.'), 'info');
      post({ type: 'opinions', opinions: opinionsView(state) });
      break;
    }
    case 'mergeFlags': {
      if (!state) return;
      const n = mergeAll(state, state.players[HUMAN_ID]!, cmd.flag as FlagType | undefined);
      if (n) autoHang(state, state.players[HUMAN_ID]!);
      notice(n ? tr('{n}× samengevoegd.', { n }) : tr('Niets samen te voegen (of je houdt ze nodig voor je dorpen).'), n ? 'info' : 'error');
      break;
    }
    case 'flagAuto': {
      if (!state) return;
      const p = state.players[HUMAN_ID]!;
      if (p.flags) { p.flags.auto = cmd.on; if (cmd.on && mergeAll(state, p)) autoHang(state, p); }
      break;
    }
    case 'flagHang': {
      if (!state) return;
      const p = state.players[HUMAN_ID]!;
      if (!p.flags) return;
      const hang = cmd.hang === 'keep' || FLAG_TYPES.includes(cmd.hang as FlagType) ? (cmd.hang as 'keep' | FlagType) : undefined;
      if (hang) p.flags.hang = hang;
      else delete p.flags.hang;
      const n = autoHang(state, p);
      if (n) notice(tr('{n} dorpen kregen een betere vlag.', { n }));
      break;
    }
    case 'meltFlags': {
      if (!state || !FLAG_TYPES.includes(cmd.to as FlagType)) return;
      const p = state.players[HUMAN_ID]!;
      const n = meltAll(state, p, cmd.to as FlagType);
      if (n && p.flags?.auto) mergeAll(state, p);
      if (n) autoHang(state, p);
      notice(n ? tr('{n} vlaggen omgesmolten tot {flag}.', { n, flag: FLAG_NAMES[cmd.to as FlagType] }) : tr('Niets om te smelten: je hebt drie losse vlaggen van hetzelfde level nodig (of je houdt ze nodig voor je dorpen).'), n ? 'info' : 'error');
      break;
    }
    case 'upgradeFlag':
    case 'setFlag': {
      if (!state) return;
      const error = cmd.type === 'upgradeFlag' ? upgradeFlag(state, HUMAN_ID, cmd.flag as FlagType, cmd.level) : setFlag(state, HUMAN_ID, cmd.village, cmd.flag as { type: FlagType; level: number } | null);
      if (error) notice(error, 'error');
      break;
    }
    case 'equipItem': {
      if (!state) return;
      const error = equipItem(state, HUMAN_ID, cmd.item as ItemId | null);
      if (error) notice(error, 'error');
      break;
    }
    case 'getWorldStats':
      if (state) post({ type: 'worldStats', stats: worldStatsView(state) });
      return;
    case 'simulate':
      if (state) post({ type: 'simResult', result: simulate(state, cmd.input) });
      return;
    case 'getOpinions':
      if (state) post({ type: 'opinions', opinions: opinionsView(state) });
      return;
    case 'continueWorld':
      if (!state?.endgame?.winner) return;
      state.endgame.continued = true;
      break;
    case 'setDifficulty': {
      if (!state) return;
      if (!['easy', 'normal', 'hard'].includes(cmd.difficulty)) return;
      state.config.bots.difficulty = cmd.difficulty;
      addLog(state, { time: state.time, text: tr('Moeilijkheid van de bots: {level}.', { level: tr(({ easy: 'Makkelijk', normal: 'Normaal', hard: 'Moeilijk' } as const)[cmd.difficulty]) }) });
      break;
    }
    case 'getFarmAllPlan':
      if (state) post({ type: 'farmAllPlan', plan: farmAllView(state, cmd.options) });
      break;
    case 'setAutoFarm': {
      if (!state) return;
      setAutoFarm(state, cmd.options);
      notice(cmd.options ? tr('Automatisch farmen aan: elke {n} speelminuten.', { n: Math.max(1, Math.round(autoFarmInterval(state) / 60_000)) }) : tr('Automatisch farmen uit.'), 'info');
      break;
    }
    case 'farmAll': {
      if (!state) return;
      const r = farmAll(state, cmd.options);
      if (r.error && !r.sent) notice(r.error, 'error');
      else notice((r.sent === 1 ? tr('{n} farmaanval verstuurd.', { n: r.sent }) : tr('{n} farmaanvallen verstuurd.', { n: r.sent })) + (r.error ? ' ' + tr('Niet alles lukte: {error}', { error: r.error }) : ''), 'info');
      post({ type: 'farmAllPlan', plan: farmAllView(state, cmd.options) });
      break;
    }
    case 'getScav':
      if (state) post({ type: 'scav', view: scavView(state) });
      break;
    case 'sendScav': {
      if (!state) return;
      let runs = 0;
      let error: string | null = null;
      for (const p of cmd.plans) {
        const v = state.villages[p.villageId];
        if (!v || v.owner !== HUMAN_ID) continue;
        const r = sendPlan(state, v.id, p.plan);
        runs += r.sent;
        error ??= r.error ? `${v.name}: ${r.error}` : null;
      }
      if (error) notice(error, 'error');
      if (runs) notice(runs === 1 ? tr('{n} rooftocht vertrokken.', { n: runs }) : tr('{n} rooftochten vertrokken.', { n: runs }), 'info');
      post({ type: 'scav', view: scavView(state) });
      break;
    }
    case 'setScavRepeat': {
      if (!state) return;
      for (const id of cmd.villages) {
        const v = state.villages[id];
        if (v?.owner === HUMAN_ID) scavOf(v).repeat = cmd.repeat;
      }
      post({ type: 'scav', view: scavView(state) });
      break;
    }
    case 'saveScavTemplate':
    case 'deleteScavTemplate': {
      if (!state) return;
      if (cmd.type === 'saveScavTemplate') { const e = saveScavTemplate(state, cmd.template); if (e) notice(e, 'error'); }
      else state.scavTemplates = (state.scavTemplates ?? []).filter((t) => t.id !== cmd.id);
      post({ type: 'scav', view: scavView(state) });
      break;
    }
    case 'setSpeeds': {
      if (!state) return;
      const clamp = (x: number) => Math.min(10, Math.max(0.25, Number.isFinite(x) ? x : 1));
      const build = clamp(cmd.build), recruit = clamp(cmd.recruit);
      // barbarians grow with the build speed: bring them up to now first, so the change only counts from here
      if (build !== state.config.buildSpeed) for (const v of Object.values(state.villages)) if (v.owner === BARBARIAN) growBarbarian(state, v, state.time);
      state.config.buildSpeed = build;
      state.config.recruitSpeed = recruit;
      addLog(state, { time: state.time, text: tr('Bouwsnelheid ×{build}, rekruteersnelheid ×{recruit}. Wat al in een wachtrij staat houdt zijn tijd.', { build, recruit }) });
      break;
    }
    case 'setRules': {
      if (!state) return;
      const c = state.config;
      const said: string[] = [];
      if (cmd.morale && cmd.morale !== c.morale) { c.morale = cmd.morale; said.push(tr('moraal {value}', { value: tr({ off: 'uit', points: 'op punten', pointsTime: 'op punten en tijd' }[cmd.morale]) })); }
      if (cmd.luck !== undefined && cmd.luck !== c.luck) { c.luck = cmd.luck; said.push(tr('geluk {value}', { value: tr(cmd.luck ? 'aan' : 'uit') })); }
      if (cmd.nightBonus !== undefined && cmd.nightBonus !== c.nightBonus) { c.nightBonus = cmd.nightBonus; said.push(tr('nachtbonus {value}', { value: tr(cmd.nightBonus ? 'aan' : 'uit') })); }
      if (said.length) addLog(state, { time: state.time, text: tr('Wereldregels: {rules}. Geldt voor gevechten vanaf nu, ook voor de bots.', { rules: said.join(', ') }) });
      break;
    }
    case 'setScavenging':
      if (!state) return;
      state.config.scavenging = cmd.on;
      addLog(state, { time: state.time, text: cmd.on ? tr('Rooftochten aan.') : tr('Rooftochten uit.') });
      break;
    case 'getMintPlan':
      if (state) post({ type: 'mintPlan', rows: mintRows(state, cmd.keep), keep: cmd.keep });
      return;
    case 'mintAll': {
      if (!state) return;
      const n = mintAll(state, cmd.keep);
      notice(n ? (n === 1 ? tr('{n} munt geslagen.', { n }) : tr('{n} munten geslagen.', { n })) : tr('Geen munten geslagen: geen afgebouwd dorp met adelshoeve en genoeg grondstoffen.'), n ? 'info' : 'error');
      post({ type: 'mintPlan', rows: mintRows(state, cmd.keep), keep: cmd.keep });
      break;
    }
    case 'getSurplusPlan':
      if (state) post({ type: 'surplusPlan', rows: surplusRows(state, cmd.keep), keep: cmd.keep });
      return;
    case 'setMint': {
      if (!state) return;
      const error = setMint(state, { keep: cmd.keep, auto: cmd.auto });
      if (error) notice(error, 'error');
      else if (cmd.auto) scheduleManager(state);
      break;
    }
    case 'setSurplus': {
      if (!state) return;
      const error = setSurplus(state, { keep: cmd.keep, auto: cmd.auto });
      if (error) notice(error, 'error');
      else if (cmd.auto) scheduleManager(state);
      break;
    }
    case 'sendSurplus': {
      if (!state) return;
      const n = sendSurplus(state, { keep: cmd.keep, auto: state.surplus?.auto ?? false });
      notice(n ? (n === 1 ? tr('{n} zending onderweg naar bouwende dorpen.', { n }) : tr('{n} zendingen onderweg naar bouwende dorpen.', { n })) : tr('Niets te versturen: geen overschot, geen vrije handelaren of geen dorp dat tekortkomt.'), n ? 'info' : 'error');
      post({ type: 'surplusPlan', rows: surplusRows(state, cmd.keep), keep: cmd.keep });
      break;
    }
    case 'getSupportList':
      if (state) post({ type: 'supportList', rows: supportRows(state) });
      return;
    case 'setTribePause':
      if (!state) return;
      state.tribePause = { war: cmd.war, requests: cmd.requests };
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
      addLog(state, { time: state.time, text: tr('Debug: troepen/grondstoffen toegevoegd.') });
      break;
    }
    case 'getMap':
      if (state) post({ type: 'map', map: mapData(state) });
      return;
    case 'getVillage':
      if (state) post({ type: 'village', info: villageInfo(state, cmd.id) });
      return;
    case 'setNote': {
      if (!state) return;
      const notes = (state.notes ??= { villages: {}, players: {} });
      const list = cmd.target === 'village' ? notes.villages : notes.players;
      const text = cmd.text.trim().slice(0, 500);
      if (text) list[cmd.id] = text;
      else delete list[cmd.id];
      return;
    }
    case 'setMark': {
      if (!state) return;
      const marks = (state.mapMarks ??= { players: {}, tribes: {} });
      const list = cmd.target === 'player' ? marks.players : marks.tribes;
      if (cmd.color && /^#[0-9a-f]{6}$/i.test(cmd.color)) list[cmd.id] = cmd.color;
      else delete list[cmd.id];
      post({ type: 'map', map: mapData(state) });
      return;
    }
    case 'getRanking':
      if (state) sendRanking(state);
      return;
    case 'talksVote': {
      const error = voteTalks(state!, cmd.talks, cmd.option);
      if (error) notice(error, 'error');
      postSnapshot();
      break;
    }
    case 'talksPropose': {
      const error = proposeTalks(state!, cmd.talks, { villages: cmd.villages, resources: cmd.resources, ...(cmd.help ? { help: cmd.help } : {}) });
      if (error) notice(error, 'error');
      postSnapshot();
      break;
    }
    case 'getNews':
      if (state) post({ type: 'news', news: [...(state.news ?? [])].reverse() });
      break;
    case 'getReports':
      if (state) post(reportsMsg(state));
      return;
    case 'deleteReports': {
      if (!state) return;
      const drop = cmd.ids === 'read' ? new Set(state.reports.filter((r) => r.read).map((r) => r.id)) : new Set(cmd.ids);
      state.reports = state.reports.filter((r) => !drop.has(r.id));
      post(reportsMsg(state));
      break;
    }
    case 'markReportsRead':
      if (!state) return;
      for (const r of state.reports) if (cmd.ids === 'all' || cmd.ids.includes(r.id)) r.read = true;
      post(reportsMsg(state));
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
  if (s.villages[cmd.villageId]?.owner !== HUMAN_ID) return tr('Dat is niet jouw dorp.');
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

function onCommand(c: Client, cmd: Command): void {
  // not the simulation that runs (or not yet sure): do nothing, the tab shows why
  if (!owner) { if (blocked) c.port.postMessage({ type: 'blocked' }); return; }
  from = c;
  fromSettled = false;
  if (state && c.current !== null && state.villages[c.current]?.owner === HUMAN_ID) state.current = c.current;
  const done = handle(cmd)
    .catch((err: unknown) => notice(err instanceof Error ? err.message : String(err), 'error'));
  // the synchronous part of the command has run: this tab's village is what it chose now
  if (state && !fromSettled) c.current = state.current ?? null;
  // a new or loaded world: every tab starts at its first village
  if (cmd.type === 'newWorld' || cmd.type === 'load' || cmd.type === 'cloudLoad' || cmd.type === 'closeWorld') void done.then(() => { for (const x of clients) x.current = state?.current ?? null; postSnapshot(); });
  from = null;
}

function connect(port: Client['port']): Client {
  const c: Client = { port, current: state?.current ?? null, visible: true };
  clients.add(c);
  suspended = false;
  void lockReady.then(() => {
    if (blocked) { port.postMessage({ type: 'blocked' }); return; }
    asClient(c, () => port.postMessage({ type: 'snapshot', snapshot: snapshot() }));
    listSaves().then((saves) => port.postMessage({ type: 'saves', saves })).catch(() => undefined);
    port.postMessage({ type: 'cloud', status: cloud.status });
    port.postMessage({ type: 'cloudWorlds', worlds: cloud.worlds });
  });
  return c;
}

/**
 * Only one simulation at a time, also across versions (after an update an old tab may still run
 * the old one): whoever holds the lock runs, any other one tells its tabs and does nothing.
 */
let owner = false;
let blocked = false;
const locks = (self as unknown as { navigator?: { locks?: { request(name: string, opts: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void> | void): Promise<void> } } }).navigator?.locks;
const lockReady: Promise<void> = locks
  ? new Promise<void>((resolve) => {
      void locks.request('tribal-feud-simulation', { ifAvailable: true }, (lock) => {
        owner = !!lock;
        blocked = !lock;
        resolve();
        // hold it for as long as this simulation lives
        return lock ? new Promise<void>(() => undefined) : undefined;
      });
    })
  : Promise.resolve().then(() => { owner = true; });

const shared = 'onconnect' in self;
if (shared) {
  (self as unknown as { onconnect: (e: MessageEvent) => void }).onconnect = (e: MessageEvent) => {
    const port = e.ports[0]! as unknown as MessagePort;
    const c = connect(port as unknown as Client['port']);
    port.onmessage = (ev: MessageEvent<Command>) => onCommand(c, ev.data);
    port.start();
  };
} else {
  const c = connect(ctx);
  ctx.onmessage = (e: MessageEvent<Command>) => onCommand(c, e.data);
}

setInterval(() => { if (owner) tick(); }, TICK_MS);
