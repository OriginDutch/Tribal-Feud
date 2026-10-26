/**
 * Typed messages between the UI (main thread) and the simulation worker.
 * The UI only sends commands; the worker is the single source of truth and sends state back.
 */
import type { BarbType, BonusKind } from './barbarianTypes';
import type { ConfigOverrides, PresetId } from './config';
import type { Speed } from './time';
import type { AlertMode, LogEntry } from '../sim/state';
import type { BuildTemplate, TroopTemplate, VillageManager } from '../sim/manager';
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
  | { type: 'setTribePause'; war: boolean; requests: boolean }
  | { type: 'setManager'; villageId: number; manager: VillageManager | null }
  | { type: 'setManagerAll'; manager: VillageManager | null }
  | { type: 'saveTemplate'; template: BuildTemplate }
  | { type: 'deleteTemplate'; id: string }
  | { type: 'saveTroopTemplate'; template: TroopTemplate }
  | { type: 'deleteTroopTemplate'; id: string }
  | { type: 'mintCoins'; villageId: number; count: number }
  | { type: 'sendSupport'; from: number; to: number; units: UnitCounts }
  /** Support from several of your villages at once (the support planner). */
  | { type: 'sendSupportMany'; to: number; orders: { from: number; units: UnitCounts }[] }
  | { type: 'sendNobleTrain'; from: number; to: number; first: UnitCounts; escorts: UnitCounts[]; catapultTarget?: BuildingId }
  | { type: 'returnSupport'; hostId: number; originId: number }
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
}
export type TribeAskView =
  | { kind: 'apply'; tribe: number; at: number }
  | { kind: 'invite'; player: number; at: number }
  | { kind: 'propose'; tribe: number; relation: 'nap' | 'ally' | 'peace'; at: number };
export interface InboxView {
  id: number;
  time: number;
  kind: 'invite' | 'application' | 'proposal' | 'answer' | 'war' | 'info';
  from: number;
  fromName: string;
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
  relations: { id: number; rel: TribeRelation; since: number }[];
}

export interface IncomingView {
  id: number;
  from: { id: number; name: string; x: number; y: number; ownerName: string };
  to: { id: number; name: string; x: number; y: number };
  arrives: number;
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
  multipliers: { world: number; production: number; build: number; recruit: number };
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
  /** Build templates: the presets first, then the player's own. */
  templates: BuildTemplate[];
  troopTemplates: TroopTemplate[];
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
  loyalty: number;
  /** Account manager in short ("Economie · troepen"), or null when off. */
  manager: string | null;
  /** Coins this village can mint right now (0 if it can't). */
  maxMint: number;
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
  | { type: 'ranking'; ranking: RankingRow[]; tribes: TribeView[]; news: { time: number; text: string }[]; asks: TribeAskView[]; candidates: CandidateView[] }
  | { type: 'inbox'; inbox: InboxView[] }
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
