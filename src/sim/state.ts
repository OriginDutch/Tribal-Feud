import { nameAllBotVillages, renameStartVillages } from './botNames';
import { nameBots } from './names/apply';
import type { BuildTemplate, NobleTemplate, TroopTemplate } from './manager';
import type { VillageGroup } from './groups';
import type { SurplusSettings } from './surplus';
import type { EndgameState } from './endgame';
import type { MoodNote } from './loyalty';
import type { WorldStats } from './worldStats';
import type { PaladinItems } from './paladin';
import type { FlagStock } from './flags';
import type { TradeOffer } from './market';
import type { Intel } from './intel';
import type { WorldConfig } from '../shared/config';
import type { Speed } from '../shared/time';
import { createQueue, type EventQueue } from './eventQueue';
import { seedRng, type RngState } from './rng';
import type { Res, UnitCounts, UnitId } from '../shared/gameData';
import type { Archetype } from '../shared/botProfiles';
import { generateMap } from './map';
import type { Movement, Report } from './movement';
import { checkQuests, type PendingReward, type QuestStats, type QuestToast } from './quests';
import { initBots } from './bots';
import { initDiplomacy, type Tribe } from './tribes';
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
  | { kind: 'manager' }
  | { kind: 'autoFarm' }
  | { kind: 'diplomacy' }
  | { kind: 'scavenge'; villageId: number }
  /** A member's part of a tribe's joint operation leaves now (warOps). */
  | { kind: 'opLaunch'; tribe: number; op: number; role: number }
  | { kind: 'talks'; talks: number }
  /** One of your planned attacks leaves now (planned.ts). */
  | { kind: 'planned'; id: number };

export interface LogEntry {
  time: number;
  text: string;
  autoPause?: boolean;
}

export type BotTier = 'pro' | 'mid' | 'casual';

export type InboxKind = 'invite' | 'application' | 'proposal' | 'answer' | 'war' | 'info' | 'request' | 'merge' | 'treaty' | 'talks' | 'lead';
export interface InboxMessage {
  id: number;
  time: number;
  kind: InboxKind;
  /** Player that sent it (-1: the world). */
  from: number;
  title: string;
  text: string;
  read: boolean;
  /** invite: the tribe inviting you. proposal: the tribe proposing, with the relation. application: the bot (from) asking to join yours. */
  tribe?: number;
  relation?: 'nap' | 'ally' | 'peace';
  /** A tribe mate asking you something (kind 'request'). */
  request?: BotRequest;
  /** kind 'merge': which tribe goes up in which (yours into theirs, or theirs into yours). */
  merge?: 'yoursIntoTheirs' | 'theirsIntoYours';
  /** kind 'treaty': the peace treaty it is about. */
  treaty?: number;
  /** kind 'talks': the peace talks it is about. */
  talks?: number;
  /** Messages with a choice: open until answered or expired. */
  status?: 'open' | 'accepted' | 'declined' | 'expired';
  expires?: number;
}

/** What a tribe mate can ask you. */
export type BotRequest =
  | { type: 'support'; village: number; movement: number; arrives: number }
  | { type: 'resources'; village: number; res: [number, number, number] }
  | { type: 'permission'; target: number }
  /** Your bot leader orders you: attack a village, or support a mate's village. */
  | { type: 'order'; order: 'attack' | 'support' | 'scout'; village: number; x: number; y: number; arrives?: number; spies?: number; nobles?: true; op?: number; asked?: true }
  /** You lost the draw for the nobles of a joint attack: go to appeal (it costs standing)? */
  | { type: 'appeal'; op: number; village: number }
  /** Your leader ruled against you on the nobles: agree, or leave the tribe as an outlaw. */
  | { type: 'verdict'; op: number; village: number };

/** You asked your tribe to help defend a village against an attack. */
export interface HelpAsk {
  id: number;
  village: number;
  movement: number;
  arrives: number;
  at: number;
  /** Mates that answered (they answer once, when online). */
  answered: number[];
}

/** An order (as leader) or a suggestion (as member) to your tribe. */
export interface TribeOrder {
  id: number;
  kind: 'attack' | 'spare' | 'focus';
  /** attack: a village id; spare / focus: a player id. */
  target: number;
  binding: boolean;
  at: number;
  expires: number;
  answers: Record<number, 'yes' | 'half' | 'no'>;
}

/** Something you asked a bot: to join its tribe, to join yours, or a treaty with its tribe. */
export type TribeAsk =
  | { kind: 'apply'; tribe: number; at: number }
  | { kind: 'invite'; player: number; at: number }
  | { kind: 'propose'; tribe: number; relation: 'nap' | 'ally' | 'peace'; at: number }
  /** As a member: you asked your leader to declare war on this tribe. */
  | { kind: 'war'; tribe: number; at: number };

/** A bot's judgement of an incoming attack, made once when it first sees it. */
export interface SeenAttack {
  /** Did it react (dodge, restack, recruit, ask its tribe)? */
  reacted: boolean;
  /** A dodge it still plans to do just before the attack lands. */
  dodge?: boolean;
}

export interface BotState {
  archetype: Archetype;
  /** Scouts per village raised in an arms race (see raiseSpies); never lower than its own level. */
  spyWar?: number;
  /** Stopped playing for good (only in saves from 28 Oct 2026; casuals don't quit any more). */
  quit?: boolean;
  /** Villages it has named (its numbering). */
  named?: number;
  /** A casual's spell away from the game: no turns until then. */
  awayUntil?: number;
  /** Game time of the previous turn (for the chance to quit in between). */
  lastTurnAt?: number;
  /** How serious this "player" is: presence, sharpness and reactions follow from it. */
  tier?: BotTier;
  /**
   * When the bot is at the game. Random stretches online/offline, derived from the seed
   * (no clock: there is no night to time your attacks to). Pros have none: always online.
   */
  presence?: { online: boolean; until: number; n: number };
  /** Incoming attacks this bot has seen, by movement id (pruned when they are gone). */
  seen?: Record<number, SeenAttack>;
  /** Give and take with you (tribe mates): + you helped it, − you let it down. About −2..2. */
  favor?: number;
  /** Players it leaves alone until a time (your order, or you said no to attacking them). */
  spare?: Record<number, number>;
  /** Players it goes after harder until a time (your order). */
  focus?: Record<number, number>;
  /** When it last asked you something (one open request at a time, not too often). */
  lastAsk?: number;
  /** Who attacked it and how much it minds: player id -> score (fades over time). */
  grudges?: Record<number, { score: number; at: number; why?: string }>;
  /** Satisfaction with its tribe's leader (you, when you lead), 0..100; 60 when missing. */
  mood?: number;
  /** Why the mood changed lately (newest last). */
  moodNotes?: MoodNote[];
  /** When it last complained to you. */
  complained?: number;
  /** 0..1, higher = more turns. */
  activity: number;
  /** Game time of the next scheduled turn. */
  nextTurn: number;
  /** What the bot knows about barbarian villages it farmed: village id -> last result. */
  farmLog: Record<number, { at: number; won: boolean }>;
  /** What its scouts saw in player villages: village id -> defense strength (see botStrategy). */
  scouted?: Record<number, import('./botStrategy').BotScout>;
  /** Players it leaves alone (scouted strong) until a time. */
  wary?: Record<number, number>;
  /** Last war or revenge attack. */
  lastStrike?: number;
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
  /** Tribe this player belongs to. */
  tribe?: number;
  /** Paladin items worlds: the weapon chamber. */
  items?: PaladinItems;
  /** Flags worlds: flags in stock. */
  flags?: FlagStock;
  /** Game time this player (re)started in the world (time-based morale); missing = 0. */
  joinedAt?: number;
  /** His first village (since the last start): never ceded in peace talks. */
  home?: number;
}

/** The human player always has id 0. */
export const HUMAN_ID = 0;
/** Owner id of barbarian villages. */
export const BARBARIAN = -1;

export type { FarmTemplates } from '../shared/farmTemplates';
import type { FarmTemplates } from '../shared/farmTemplates';

/**
 * The complete world. Plain data only: this object is what gets saved.
 * Runtime-only things (timers, suspended-because-tab-hidden) live in the worker.
 */
export interface LastAttack {
  /** The report of it (missing in saves from before this was kept). */
  report?: number;
  time: number;
  result: 'win' | 'winLosses' | 'loss';
  loot: number;
  scouted?: [number, number, number];
}

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
  /** Your last attack per target village (map, farm assistant). Kept apart from reports, so deleting a report loses nothing. */
  lastAttack: Record<number, LastAttack>;
  farmTemplates: FarmTemplates;
  /** Farm alles on its own, every little while (game time), with these settings. */
  autoFarm?: { options: import('./farmAll').FarmAllOptions; at?: number; last?: { time: number; sent: number } };
  /** Peace treaties with ceded villages (see peace). */
  treaties?: import('./peace').Treaty[];
  /** Peace talks underway (see talks), when talks between two tribes last ended ("a:b"), outlaws. */
  talks?: import('./talks').Talks[];
  /** Sounds for the screens since the last snapshot (drained by the worker; not kept in saves). */
  sfx?: import('../shared/reportOutcome').Sfx[];
  /** Your attacks set to leave by themselves, so they land at a chosen time (planned.ts). */
  planned?: PlannedAttack[];
  talksEnded?: Record<string, number>;
  outlaws?: Record<number, import('./talks').Outlaw>;
  /** Resources the losers of peace talks still have to pay (see reparations). */
  reparations?: import('./reparations').Reparation[];
  /** Your notes on villages and players (shown on the map and in their panels). */
  notes?: { villages: Record<number, string>; players: Record<number, string> };
  /** Your own colours for players and tribes on the map. */
  mapMarks?: import('../shared/protocol').MapMarks;
  /** Help in attacks owed after peace talks, and when each player last failed one (see duties). */
  duties?: import('./duties').Duty[];
  dutyStrikes?: Record<number, number>;
  /** Quest rewards go in by themselves when they fit. */
  autoRewards?: boolean;
  autoRewardsAt?: number;
  /** Build, troop and noble template ids you hid from the lists. */
  hiddenTemplates?: string[];
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
  /** Open market offers (everyone's). */
  offers?: TradeOffer[];
  /** The player's own build templates (account manager). */
  templates?: BuildTemplate[];
  /** The player's troop templates. */
  troopTemplates?: TroopTemplate[];
  /** Your village groups. */
  villageGroups?: VillageGroup[];
  /** Your rooftocht templates (the default one is built in). */
  scavTemplates?: import('../shared/scavenge').ScavTemplate[];
  /** World statistics (attacks and conquests per day, per player). */
  worldStats?: WorldStats;
  /** Domination endgame: warnings, the tribe holding the target, the winner. */
  endgame?: EndgameState;
  /** Surplus to building villages (button and automatic). */
  surplus?: SurplusSettings;
  /** The player's noble train templates. */
  nobleTemplates?: NobleTemplate[];
  /** Time of the scheduled account-manager check. */
  managerAt?: number;
  /** World statistics: villages taken from barbarians and from players. */
  conquests?: { barbarian: number; player: number };
  /** When to auto-pause for attacks (default: the first attack per attacking village). */
  alertMode?: AlertMode;
  /** perVillage mode: when each attacking village last caused a pause. */
  alertSeen?: Record<number, number>;
  /** Tribes by id. */
  tribes?: Record<number, Tribe>;
  /** Recent diplomacy news. */
  tribeNews?: LogEntry[];
  /** World news for the ticker and the news screen (see news). */
  news?: import('./news').NewsItem[];
  newsSeq?: number;
  /** For ranking news: the biggest tribe and the top-10 players at the last diplomacy tick. */
  newsTop?: { tribe?: number; players: number[] };
  /** Your messages: invitations, proposals, answers, war declarations. */
  inbox?: InboxMessage[];
  /** What you asked bots, waiting for their answer (they answer when they are online). */
  tribeAsks?: TribeAsk[];
  /** When your leader last said no to a war you asked for (you wait a game day before asking again). */
  warAskNo?: number;
  /** How often a bot turned down your invitation, and a tribe your application (for a note in the lists). */
  tribeRefusals?: { invites: Record<number, number>; applications: Record<number, number> };
  /** Your requests for help to your tribe. */
  helpAsks?: HelpAsk[];
  /** Orders / suggestions to your tribe. */
  tribeOrders?: TribeOrder[];
  /** Which tribe events pause the game. */
  tribePause?: { war: boolean; requests: boolean };
  /** As a member of a bot tribe: what its leader thinks of you (0..100), and why. */
  standing?: number;
  standingNotes?: MoodNote[];
  standingWarned?: number;
  /** As a member: the order of your leader you said yes to, until when it must be done. */
  leaderOrder?: { order: 'attack' | 'support' | 'scout'; village: number; until: number; from: number; landAt?: number; spies?: number; nobles?: true; op?: number; asked?: true };
  /** When you last asked your leader for an order. */
  orderAskAt?: number;
  /** Scout orders you said yes to (beside one normal order, at most 3; see MAX_SCOUT_ORDERS). */
  scoutOrders?: { village: number; until: number; from: number; spies?: number }[];
  /** When your bot leader last gave you an order. */
  leaderOrderAt?: number;
  /** How often you betrayed someone (tribes trust you less). */
  betrayals?: number;
  /** Your asks to your tribe for resources (mates answer in their turn). */
  resourceAsks?: { id: number; village: number; res: Res; sent: Res; at: number; answered: number[] }[];
  /** As a member of a bot tribe: your asks for permission to attack a player, and the answers. */
  permissions?: Record<number, { at: number; answer?: 'yes' | 'no'; until?: number; broken?: boolean }>;
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
    lastAttack: {},
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
  state.players[HUMAN_ID]!.home = village.id;
  generateMap(state);
  initBots(state);
  renameStartVillages(state, nameBots(state));
  nameAllBotVillages(state);
  initDiplomacy(state);
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

/** A village changed owner: update the index in place instead of rebuilding it (conquests are frequent). */
export function moveOwner(state: WorldState, villageId: number, from: number, to: number): void {
  const index = ownerIndex.get(state);
  if (index) {
    const list = index.get(from);
    if (list) {
      const i = list.indexOf(villageId);
      if (i >= 0) list.splice(i, 1);
    }
    const target = index.get(to);
    if (target) {
      // keep ids ascending, like a fresh build
      let i = target.length;
      while (i > 0 && target[i - 1]! > villageId) i--;
      target.splice(i, 0, villageId);
    } else index.set(to, [villageId]);
  }
  if (from === HUMAN_ID || to === HUMAN_ID) humanVillageCache.delete(state);
}

/**
 * All adding and removing of movements goes through these two, so indexes over movements stay
 * exact without rescanning. Indexes are derived from state only (rebuilt after a load), so a
 * loaded save plays out the same as one that kept running.
 */
export interface MovementIndex {
  /** Real attacks (100+ units) per target village: movement id -> arrival. */
  attacks: Map<number, Map<number, number>>;
  /** Supports underway, per "owner:target". */
  supports: Map<string, number>;
  /** Every attack underway (any size), per target village. What a defender sees coming. */
  incoming: Map<number, Set<number>>;
  /** Merchants out per village (walking with goods, or walking back). */
  merchants: Map<number, number>;
  /** Goods walking to a village. */
  goods: Map<number, [number, number, number]>;
}
const movementIndexes = new WeakMap<WorldState, MovementIndex>();
const REAL_ATTACK = 100;
function track(ix: MovementIndex, m: Movement, sign: 1 | -1): void {
  if (m.kind === 'trade' || m.kind === 'tradeReturn') {
    const home = m.kind === 'trade' ? m.from : m.to;
    const n = (ix.merchants.get(home) ?? 0) + sign * (m.merchants ?? 0);
    if (n > 0) ix.merchants.set(home, n);
    else ix.merchants.delete(home);
    if (m.kind === 'trade' && m.res) {
      const g = ix.goods.get(m.to) ?? [0, 0, 0];
      for (const i of [0, 1, 2] as const) g[i] += sign * m.res[i];
      if (g[0] || g[1] || g[2]) ix.goods.set(m.to, g);
      else ix.goods.delete(m.to);
    }
    return;
  }
  if (m.kind === 'support') {
    const k = `${m.owner}:${m.to}`;
    const n = (ix.supports.get(k) ?? 0) + sign;
    if (n > 0) ix.supports.set(k, n);
    else ix.supports.delete(k);
    return;
  }
  if (m.kind !== 'attack') return;
  let inc = ix.incoming.get(m.to);
  if (sign > 0) {
    if (!inc) ix.incoming.set(m.to, (inc = new Set()));
    inc.add(m.id);
  } else if (inc) {
    inc.delete(m.id);
    if (!inc.size) ix.incoming.delete(m.to);
  }
  let n = 0;
  for (const k in m.units) n += m.units[k as keyof typeof m.units] ?? 0;
  if (n < REAL_ATTACK) return;
  let at = ix.attacks.get(m.to);
  if (sign > 0) {
    if (!at) ix.attacks.set(m.to, (at = new Map()));
    at.set(m.id, m.arrives);
  } else if (at) {
    at.delete(m.id);
    if (!at.size) ix.attacks.delete(m.to);
  }
}
export function movementIndex(state: WorldState): MovementIndex {
  let ix = movementIndexes.get(state);
  if (!ix) {
    ix = { attacks: new Map(), supports: new Map(), incoming: new Map(), merchants: new Map(), goods: new Map() };
    for (const m of Object.values(state.movements)) track(ix, m, 1);
    movementIndexes.set(state, ix);
  }
  return ix;
}
export function addMovement(state: WorldState, m: Movement): void {
  state.movements[m.id] = m;
  const ix = movementIndexes.get(state);
  if (ix) track(ix, m, 1);
}
export function removeMovement(state: WorldState, id: number): void {
  const m = state.movements[id];
  if (!m) return;
  delete state.movements[id];
  const ix = movementIndexes.get(state);
  if (ix) track(ix, m, -1);
}

export function invalidateOwners(state: WorldState): void {
  ownerIndex.delete(state);
  humanVillageCache.delete(state);
}

/**
 * An attack of yours set to leave by itself at `sendAt`, so it lands at `landAt`. One wave is a
 * plain attack; 2..5 waves are a noble train (each wave as it goes, nobles included). The troops
 * stay home and defend, but nothing else may use them (see reservedUnits).
 */
export interface PlannedAttack {
  id: number;
  from: number;
  to: number;
  waves: UnitCounts[];
  clearFirst?: boolean;
  catapultTarget?: import('../shared/gameData').BuildingId;
  landAt: number;
  sendAt: number;
}

/** Troops held back in a village for planned attacks (none for anyone but you). */
export function reservedUnits(state: WorldState, villageId: number): UnitCounts {
  const out: UnitCounts = {};
  if (!state.planned?.length) return out;
  for (const p of state.planned) {
    if (p.from !== villageId) continue;
    for (const w of p.waves) for (const [u, n] of Object.entries(w) as [UnitId, number][]) out[u] = (out[u] ?? 0) + n;
  }
  return out;
}

/** A sound for the screens (a report, an order, an attack leaving). */
export function playSfx(state: WorldState, sound: import('../shared/reportOutcome').Sfx | null): void {
  if (sound) (state.sfx ??= []).push(sound);
}
