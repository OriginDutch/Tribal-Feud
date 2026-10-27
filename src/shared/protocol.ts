/**
 * Typed messages between the UI (main thread) and the simulation worker.
 * The UI only sends commands; the worker is the single source of truth and sends state back.
 */
import type { BarbType, BonusKind } from './barbarianTypes';
import type { ConfigOverrides, PresetId } from './config';
import type { Speed } from './time';
import type { AlertMode, LogEntry } from '../sim/state';
import type { BotRequest } from '../sim/state';
import type { VillageGroup } from '../sim/groups';
import type { BuildTemplate, NobleTemplate, TroopTemplate, VillageManager } from '../sim/manager';
import type { SaveMeta } from '../sim/save';
import type { VillageView } from '../sim/view';
import type { BuildingId, UnitCounts, UnitId } from './gameData';
import type { Report } from '../sim/movement';
import type { DemandStatus, PendingReward } from '../sim/quests';
import type { Res } from './gameData';

export type Command =
  | { type: 'newWorld'; preset: Exclude<PresetId, 'custom'>; name: string; seed?: number; overrides?: ConfigOverrides }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'setVisible'; visible: boolean }
  | { type: 'scheduleTest'; delayMs: number; autoPause: boolean }
  | { type: 'scheduleRandom' }
  | { type: 'save'; slot: string }
  | { type: 'load'; slot: string }
  | { type: 'deleteSave'; slot: string }
  | { type: 'listSaves' }
  | { type: 'build'; villageId: number; building: BuildingId }
  | { type: 'cancelBuild'; villageId: number; jobId: number }
  | { type: 'demolish'; villageId: number; building: BuildingId }
  | { type: 'renameVillage'; villageId: number; name: string }
  | { type: 'research'; villageId: number; unit: UnitId }
  | { type: 'cancelResearch'; villageId: number }
  | { type: 'recruit'; villageId: number; unit: UnitId; count: number }
  | { type: 'cancelRecruit'; villageId: number; jobId: number }
  | { type: 'sendAttack'; from: number; to: number; units: UnitCounts; catapultTarget?: BuildingId }
  | { type: 'sendFarm'; from: number; to: number; template: 'A' | 'B' | 'C' }
  | { type: 'setFarmTemplate'; template: 'A' | 'B'; units: UnitCounts }
  | { type: 'getMap' }
  | { type: 'getReports' }
  | { type: 'markReportsRead'; ids: number[] | 'all' }
  | { type: 'deleteReports'; ids: number[] | 'read' }
  | { type: 'getRanking' }
  | { type: 'claimReward'; id: number; villageId?: number }
  | { type: 'claimAllRewards'; villageId?: number }
  | { type: 'selectVillage'; id: number }
  | { type: 'setAlertMode'; mode: AlertMode }
  | { type: 'tribeFound'; name: string; tag: string }
  | { type: 'tribeApply'; tribe: number }
  | { type: 'tribeLeave' }
  | { type: 'tribeInvite'; player: number }
  | { type: 'tribeKick'; player: number }
  | { type: 'tribePropose'; tribe: number; relation: 'nap' | 'ally' | 'peace' }
  | { type: 'tribeRelation'; tribe: number; action: 'war' | 'end' }
  | { type: 'inboxAnswer'; id: number; accept: boolean }
  | { type: 'inboxRead' }
  | { type: 'getInbox' }
  | { type: 'getPlayer'; id: number }
  | { type: 'askTribeHelp'; movement: number }
  | { type: 'giveOrder'; kind: 'attack' | 'spare' | 'focus'; target: number }
  | { type: 'cancelOrder'; id: number }
  | { type: 'saveGroup'; group: VillageGroup }
  | { type: 'deleteGroup'; id: string }
  | { type: 'setGroup'; group: string; villages: number[]; member: boolean }
  | { type: 'setTribePause'; war: boolean; requests: boolean }
  | { type: 'setManager'; villageId: number; manager: VillageManager | null }
  | { type: 'setManagerAll'; manager: VillageManager | null }
  | { type: 'saveTemplate'; template: BuildTemplate }
  | { type: 'deleteTemplate'; id: string }
  | { type: 'saveTroopTemplate'; template: TroopTemplate }
  | { type: 'deleteTroopTemplate'; id: string }
  | { type: 'saveNobleTemplate'; template: NobleTemplate }
  | { type: 'deleteNobleTemplate'; id: string }
  | { type: 'mintCoins'; villageId: number; count: number }
  | { type: 'sendSupport'; from: number; to: number; units: UnitCounts }
  /** Dismiss troops at home for good (no refund). */
  | { type: 'dismissUnits'; villageId: number; units: UnitCounts }
  /** Support from several of your villages at once (the support planner). */
  | { type: 'sendSupportMany'; to: number; orders: { from: number; units: UnitCounts }[] }
  | { type: 'sendNobleTrain'; from: number; to: number; first: UnitCounts; escorts: UnitCounts[]; catapultTarget?: BuildingId; clearFirst?: boolean }
  | { type: 'returnSupport'; hostId: number; originId: number }
  /** Sends many supports home at once (rows of the support list). */
  | { type: 'returnSupportMany'; pairs: { hostId: number; originId: number }[] }
  | { type: 'getSupportList' }
  | { type: 'setSurplus'; keep: number; auto: boolean }
  | { type: 'sendSurplus'; keep: number }
  | { type: 'getSurplusPlan'; keep: number }
  | { type: 'getMintPlan'; keep: number }
  | { type: 'continueWorld' }
  | { type: 'askTribeResources'; village: number; res: [number, number, number] }
  | { type: 'askPermission'; target: number }
  | { type: 'betray'; target: number }
  | { type: 'getOpinions' }
  | { type: 'getWorldStats' }
  | { type: 'equipItem'; item: string | null }
  | { type: 'upgradeFlag'; flag: string; level: number }
  | { type: 'setFlag'; village: number; flag: { type: string; level: number } | null }
  | { type: 'setDifficulty'; difficulty: 'easy' | 'normal' | 'hard' }
  | { type: 'mintAll'; keep: number }
  | { type: 'dismissToast'; id: number | 'all' }
  | { type: 'sendResources'; from: number; to: number; res: [number, number, number] }
  | { type: 'createOffer'; villageId: number; give: TradeSide; want: TradeSide; count: number }
  | { type: 'cancelOffer'; id: number }
  | { type: 'acceptOffer'; id: number; villageId: number }
  | { type: 'balanceVillages' }
  | { type: 'cancelMovement'; id: number }
  /** Debug cheats for testing. */
  | { type: 'debugGive'; units?: UnitCounts; resources?: number; buildings?: Partial<Record<BuildingId, number>> }
  | { type: 'debugConquer' }
  | { type: 'debugSkip'; hours: number };

export interface MapVillage {
  id: number;
  x: number;
  y: number;
  name: string;
  owner: number;
  ownerName: string;
  kind: 'own' | 'bot' | 'barb';
  points: number;
  /** Production bonus: public, shown on the map. */
  bonus?: BonusKind;
  /** Barbarian type: only after you scouted it. */
  barbType?: BarbType;
  /** Wall level you saw last. */
  wall?: number;
  /** Estimated loot now, from your last scout (template C). */
  estimate?: number;
  /** Tribe of the owner. */
  tribe?: number;
  /** Your last attack on this village. */
  last?: { time: number; result: Report['result']; loot: number; scouted?: [number, number, number] };
}

export interface MapData {
  ownVillageId: number;
  villages: MapVillage[];
  tribes: TribeView[];
}

export type TribeRelation = 'ally' | 'nap' | 'war';
/** A player near you that you could invite (leaders only). */
export interface CandidateView {
  id: number;
  name: string;
  points: number;
  distance: number;
  tribe?: number;
  /** Times this player turned down your invitation. */
  declined?: number;
  /** Why he can't join now (same check the bot makes); missing = he could say yes. */
  blocked?: 'full' | 'far' | 'prey' | 'blocked';
  /** Distance to your tribe's centre and how far your tribe reaches (fields). */
  reach: number;
}
export type TribeAskView =
  | { kind: 'apply'; tribe: number; at: number }
  | { kind: 'invite'; player: number; at: number }
  | { kind: 'propose'; tribe: number; relation: 'nap' | 'ally' | 'peace'; at: number };
export interface OrderView {
  id: number;
  kind: 'attack' | 'spare' | 'focus';
  target: number;
  /** "Dorp (x|y) van speler" or the player's name. */
  targetName: string;
  binding: boolean;
  expires: number;
  yes: number;
  half: number;
  no: number;
  /** Mates that have not answered yet. */
  waiting: number;
}

export interface InboxView {
  id: number;
  time: number;
  kind: 'invite' | 'application' | 'proposal' | 'answer' | 'war' | 'info' | 'request';
  from: number;
  fromName: string;
  request?: BotRequest;
  title: string;
  text: string;
  read: boolean;
  tribe?: number;
  status?: 'open' | 'accepted' | 'declined' | 'expired';
  expires?: number;
}
export interface TribeView {
  id: number;
  name: string;
  tag: string;
  color: string;
  leader: number;
  members: number[];
  founded: number;
  points: number;
  villages: number;
  /** Share of the world (endgame), 0..1. */
  share: number;
  relations: { id: number; rel: TribeRelation; since: number }[];
}

/** Everything you can see about another player (profile screen). */
export interface PlayerView {
  id: number;
  name: string;
  isBot: boolean;
  rank: number;
  points: number;
  tribe?: { id: number; tag: string; name: string; color: string };
  /** Their villages, biggest first; distance to your nearest village. */
  villages: { id: number; name: string; x: number; y: number; points: number; distance: number }[];
  /** Weighted centre of their villages. */
  centre: { x: number; y: number } | null;
  /** From your reports: what happened between you two. */
  history: {
    theirAttacks: number;
    theirWins: number;
    lastTheirs?: number;
    yourAttacks: number;
    yourWins: number;
    lastYours?: number;
    villagesTakenFromYou: number;
    villagesYouTook: number;
  };
  /** Their attacks on you right now. */
  incoming: number;
  /** What ties you: same tribe, or a treaty between your tribes (you can betray it). */
  bond?: 'mate' | 'ally' | 'nap';
  /** Their grudge against you (0 = none, 1 = a lot). */
  grudge: number;
  /** You lead and they are your mate: their mood about you. */
  mood?: number;
  /** You are a member of a bot tribe: you can ask its leader whether you may attack them. */
  canAskPermission: boolean;
  permission?: { answer?: 'yes' | 'no'; until?: number };
}

export interface IncomingView {
  id: number;
  from: { id: number; name: string; x: number; y: number; ownerName: string; owner: number };
  to: { id: number; name: string; x: number; y: number };
  arrives: number;
  /** Fields between the two villages. */
  distance: number;
  /** Slowest unit that fits the walking time (what TW players work out by hand). */
  pace: 'noble' | 'siege' | 'sword' | 'infantry' | 'heavy' | 'cav' | 'scout';
}

export interface MovementView {
  id: number;
  kind: 'attack' | 'return' | 'support' | 'trade' | 'tradeReturn';
  from: { id: number; name: string; x: number; y: number };
  to: { id: number; name: string; x: number; y: number };
  sent: number;
  arrives: number;
  units: UnitCounts;
  loot?: [number, number, number];
  /** Merchants: what they carry. */
  res?: [number, number, number];
  /** Game time until which you can still call it back (your own commands only). */
  cancelUntil?: number;
  /** Part of a noble train: cancelling calls back the whole train. */
  train?: boolean;
}

export interface TradeSide {
  res: 0 | 1 | 2;
  amount: number;
}

export interface OfferView {
  id: number;
  village: { id: number; name: string; x: number; y: number; ownerName: string };
  give: TradeSide;
  want: TradeSide;
  /** Fields from the selected village. */
  distance: number;
  created: number;
}

/** The market of the selected village. */
export interface MarketView {
  merchantsFree: number;
  merchantsTotal: number;
  carry: number;
  /** Game minutes per field for merchants. */
  minutesPerField: number;
  myOffers: OfferView[];
  /** Other players' offers, nearest first. */
  offers: OfferView[];
  /** Merchants on the road from or to this village (also other players' merchants coming here). */
  trades: MovementView[];
}

export interface Snapshot {
  worldName: string;
  seed: number;
  preset: PresetId;
  time: number;
  speed: Speed;
  paused: boolean;
  /** Tab hidden: time stops without touching the player's pause/speed choice. */
  suspended: boolean;
  queueSize: number;
  /** World speed settings, for display. */
  multipliers: { world: number; production: number; build: number; recruit: number; farm: number };
  log: LogEntry[];
  /** The selected village, fully computed for display. */
  village: VillageView | null;
  /** All the player's villages, short, for the village switcher and the overview. */
  villages: OwnVillageRow[];
  /** The player's troops on the road, soonest first. */
  movements: MovementView[];
  /** Attacks coming at the player's villages, soonest first. Only what TW shows: no units. */
  incoming: IncomingView[];
  /** Game time when beginner protection ends. */
  protectionEndsAt: number;
  alertMode: AlertMode;
  /** Your tribe (id) and whether you lead it. */
  myTribe: number | null;
  myTribeLeader: boolean;
  inboxUnread: number;
  /** Open messages that ask for an answer. */
  inboxOpen: number;
  tribePause: { war: boolean; requests: boolean };
  /** Incoming attacks you asked your tribe help for (movement ids). */
  helpAsked: number[];
  /** Your open orders / suggestions to the tribe. */
  orders: OrderView[];
  /** Build templates: the presets first, then the player's own. */
  templates: BuildTemplate[];
  troopTemplates: TroopTemplate[];
  nobleTemplates: NobleTemplate[];
  groups: VillageGroup[];
  /** Surplus to building villages: keep share and automatic on/off. */
  surplus: { keep: number; auto: boolean };
  /** Domination endgame. */
  endgame: EndgameView;
  /** Flags worlds: your free flags per kind and level (index 0 = level 1), and progress to the next. */
  flags?: { free: Record<string, number[]>; kills: number };
  /** Paladin items worlds: your weapon chamber. */
  items?: { found: { id: string; name: string; text: string }[]; equipped?: string; progress: number; all: number };
  /** Bot difficulty of this world (can be changed while playing). */
  difficulty: 'easy' | 'normal' | 'hard';
  /** Villages using each template (build and troop), by id. */
  templateUse: Record<string, number>;
  unreadReports: number;
  farmTemplates: { A: UnitCounts; B: UnitCounts };
  /** worldSpeed * unitSpeed * marchSpeed, to preview travel times. */
  marchFactor: number;
  /** Minutes per field at speed 1, per unit (travel = distance * speed / marchFactor). */
  unitSpeeds: Record<UnitId, number>;
  quests: QuestsView;
  /** Market of the selected village; null without a market. */
  market: MarketView | null;
}

export interface OwnVillageRow {
  id: number;
  name: string;
  x: number;
  y: number;
  points: number;
  res: Res;
  storage: number;
  pop: { used: number; max: number };
  /** First job in the build queue. */
  building: { name: string; level: number; end: number } | null;
  buildQueue: number;
  /** Units waiting in all recruit queues. */
  recruiting: number;
  /** Units at home. */
  units: UnitCounts;
  /** Has a working rally point: can send troops. */
  canSend: boolean;
  /** Your groups this village is in (ids). */
  groups: string[];
  loyalty: number;
  /** Account manager in short ("Economie · troepen"), or null when off. */
  manager: string | null;
  /** Coins this village can mint right now (0 if it can't). */
  maxMint: number;
  /** Churches worlds: does this village have faith? */
  faith?: boolean;
  /** Flags worlds: the flag hanging here. */
  flag?: { type: string; level: number };
}

export interface QuestsView {
  chains: {
    id: string;
    name: string;
    done: number;
    total: number;
    current: { title: string; text: string; demands: DemandStatus[]; reward: { res?: Res; units?: UnitCounts } } | null;
  }[];
  rewards: PendingReward[];
  /** Finished quests to show as toasts, oldest first. */
  toasts: { id: number; title: string; reward?: PendingReward }[];
  buildingReward: { maxLevel: number; share: number };
}

export type WorkerMessage =
  | { type: 'snapshot'; snapshot: Snapshot | null }
  | { type: 'autoPaused'; entry: LogEntry }
  | { type: 'saves'; saves: SaveMeta[] }
  | { type: 'map'; map: MapData }
  | { type: 'reports'; reports: Report[] }
  | { type: 'ranking'; ranking: RankingRow[]; tribes: TribeView[]; news: { time: number; text: string }[]; asks: TribeAskView[]; candidates: CandidateView[]; refusedApplications: Record<number, number>; refusedInvites: Record<number, number> }
  | { type: 'inbox'; inbox: InboxView[] }
  | { type: 'supportList'; rows: SupportRow[] }
  | { type: 'opinions'; opinions: OpinionsView }
  | { type: 'worldStats'; stats: WorldStatsView }
  | { type: 'surplusPlan'; rows: SurplusRow[]; keep: number }
  | { type: 'mintPlan'; rows: { id: number; name: string; x: number; y: number; coins: number }[]; keep: number }
  | { type: 'player'; player: PlayerView | null }
  | { type: 'notice'; level: 'info' | 'error'; text: string };

export const AUTOSAVE_SLOT = 'autosave';

export interface RankingRow {
  id: number;
  name: string;
  points: number;
  villages: number;
  isBot: boolean;
  tribe?: number;
  /** Debug info, only for bots. */
  archetype?: string;
  activity?: number;
}

/**
 * A support standing somewhere that involves you. foreign: someone else's troops in your
 * village; mine: your troops in someone else's village; own: between two of your villages.
 */
export interface SupportRow {
  kind: 'foreign' | 'mine' | 'own';
  host: { id: number; name: string; x: number; y: number; owner: number; ownerName: string };
  origin: { id: number; name: string; x: number; y: number; owner: number; ownerName: string };
  units: UnitCounts;
  /** Walking time home (slowest unit). */
  travel: number;
}

/** One shipment of a surplus run (preview). */
export interface SurplusRow {
  from: { id: number; name: string; x: number; y: number };
  to: { id: number; name: string; x: number; y: number };
  res: [number, number, number];
  merchants: number;
  travel: number;
}

export interface EndgameView {
  target: number;
  warnAt: number;
  countBarbarians: boolean;
  holdDays: number;
  /** The tribe above the target and when it wins if it holds on. */
  leader?: { tribe: number; tag: string; since: number; winsAt: number; you: boolean };
  winner?: { tribe: number; tag: string; name: string; time: number; you: boolean };
  continued: boolean;
}

export interface MoodNoteView { time: number; delta: number; why: string }
/** What others think of you: your mates (you lead), your leader (you are a member), grudges. */
export interface OpinionsView {
  /** You lead: every mate's mood about you. */
  mates: { id: number; name: string; archetype: string; mood: number; favor: number; notes: MoodNoteView[] }[];
  /** You are a member of a bot tribe: what its leader thinks of you. */
  standing?: { leader: number; leaderName: string; value: number; notes: MoodNoteView[] };
  /** Players with a grudge against you, worst first. */
  grudges: { id: number; name: string; tribeTag?: string; score: number; why?: string; at: number; halfLife: number }[];
  betrayals: number;
  /** Your asks to attack players (member of a bot tribe). */
  permissions: { target: number; name: string; answer?: 'yes' | 'no'; until?: number }[];
  /** Your open resource ask. */
  resourceAsk?: { village: number; res: [number, number, number]; sent: [number, number, number]; at: number };
}

/** World statistics screen. */
export interface WorldStatsView {
  days: { day: number; attacksPvp: number; attacksBarb: number; conquestsPvp: number; conquestsBarb: number; onYou: number; byYou: number; wars: number }[];
  /** Villages per tribe per day (end of day; the last entry is now). */
  tribes: { id: number; tag: string; color: string; you: boolean; series: (number | null)[] }[];
  topAttackers: { id: number; name: string; tag?: string; pvp: number; barb: number; took: number; lost: number }[];
  topConquerors: { id: number; name: string; tag?: string; pvp: number; barb: number; took: number; lost: number }[];
  recent: { time: number; name: string; from: number; fromName: string; to: number; toName: string }[];
  you: { pvp: number; barb: number; took: number; tookBarb: number; lost: number };
  totals: { conquestsPvp: number; conquestsBarb: number; tribes: number; wars: number; solo: number; bots: number };
}
