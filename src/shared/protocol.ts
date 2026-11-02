/**
 * Typed messages between the UI (main thread) and the simulation worker.
 * The UI only sends commands; the worker is the single source of truth and sends state back.
 */
import type { BarbType, BonusKind } from './barbarianTypes';
import type { ConfigOverrides, PresetId } from './config';
import type { Speed } from './time';
import type { AlertMode, LogEntry } from '../sim/state';
import type { BotRequest } from '../sim/state';
import type { Face } from './faces';
import type { VillageGroup } from '../sim/groups';
import type { BuildTemplate, NobleTemplate, TroopTemplate, VillageManager } from '../sim/manager';
import type { SaveMeta } from '../sim/save';
import type { CloudStatus, CloudUser, CloudWorld } from '../cloud/sync';
import type { VillageView } from '../sim/view';
import type { BuildingId, UnitCounts, UnitId } from './gameData';
import type { Report } from '../sim/movement';
import type { DemandStatus, PendingReward } from '../sim/quests';
import type { Res } from './gameData';
import type { ScavParams, ScavTemplate } from './scavenge';
import type { FarmAllOptions } from '../sim/farmAll';
import type { FarmKey, FarmLetter, FarmTemplates } from './farmTemplates';

export type Command =
  | { type: 'newWorld'; preset: Exclude<PresetId, 'custom'>; name: string; seed?: number; overrides?: ConfigOverrides }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'setVisible'; visible: boolean }
  /** The screen this tab shows: heavy snapshot fields only go to screens that use them. */
  | { type: 'setScreen'; screen: string }
  /** A tab closes (shared worker: it stops getting messages). */
  | { type: 'bye' }
  /** A tab (re)opens: the village it showed before (kept per tab in the browser). */
  | { type: 'hello'; village: number | null }
  | { type: 'scheduleTest'; delayMs: number; autoPause: boolean }
  | { type: 'scheduleRandom' }
  | { type: 'save'; slot: string }
  /** Saves the world in its own manual slot (one per world, overwritten each time). */
  | { type: 'saveWorld' }
  /** Battle rules of the running world (only the ones that can safely change halfway). */
  | { type: 'setRules'; morale?: 'off' | 'points' | 'pointsTime'; luck?: boolean; nightBonus?: boolean }
  /** A tab signed in or out, or has a fresh token (tokens last an hour; the tab renews them). */
  | { type: 'auth'; user: CloudUser | null }
  | { type: 'cloudRefresh' }
  | { type: 'cloudLoad'; slot: string }
  | { type: 'cloudDelete'; slot: string }
  /** Upload the current world even if the cloud copy is further along. */
  | { type: 'cloudForce' }
  /** Worlds this device keeps out of the cloud. */
  | { type: 'cloudPrefs'; off: string[] }
  /** Put a world's newest local save in the cloud (force: also over a copy that is further along). */
  | { type: 'cloudPush'; key: string; force: boolean }
  /** Cloud full: this cloud world makes room for that local one. */
  | { type: 'cloudReplace'; slot: string; key: string }
  /** Fetch a cloud world to this device without opening it. */
  | { type: 'cloudDownload'; slot: string }
  /** Every local save of a world (not the open one). */
  | { type: 'deleteWorld'; key: string }
  /** Save and close the open world: back to the start screen. */
  | { type: 'closeWorld' }
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
  | { type: 'sendFarm'; from: number; to: number; template: FarmKey }
  /** A farm template's runs as normal attacks (notifications, sounds) or quiet farm runs. */
  | { type: 'setFarmNotify'; template: FarmKey; on: boolean }
  /** Empty units = the letter is removed. */
  | { type: 'setFarmTemplate'; template: FarmLetter; units: UnitCounts }
  /** Build, troop and noble templates: hide from the lists and pickers (they keep working). */
  | { type: 'setTemplateHidden'; id: string; hidden: boolean }
  | { type: 'getMap' }
  | { type: 'getReports' }
  | { type: 'getNews' }
  | { type: 'getVillage'; id: number }
  | { type: 'setNote'; target: 'village' | 'player'; id: number; text: string }
  | { type: 'setMark'; target: 'player' | 'tribe'; id: number; color: string | null }
  | { type: 'talksVote'; talks: number; option: number }
  | { type: 'talksPropose'; talks: number; villages: number; resources: number; help?: { target: number; space: number } }
  | { type: 'markReportsRead'; ids: number[] | 'all' }
  | { type: 'deleteReports'; ids: number[] | 'read' }
  | { type: 'getRanking' }
  | { type: 'claimReward'; id: number; villageId?: number }
  | { type: 'claimAllRewards'; villageId?: number }
  | { type: 'setAutoRewards'; on: boolean }
  | { type: 'selectVillage'; id: number }
  | { type: 'setAlertMode'; mode: AlertMode }
  | { type: 'tribeFound'; name: string; tag: string }
  | { type: 'tribeApply'; tribe: number }
  | { type: 'tribeLeave' }
  | { type: 'tribeInvite'; player: number }
  | { type: 'tribeKick'; player: number }
  | { type: 'tribePropose'; tribe: number; relation: 'nap' | 'ally' | 'peace' }
  | { type: 'tribeRelation'; tribe: number; action: 'war' | 'end' }
  /** As a member: ask your leader to declare war on a tribe. */
  | { type: 'tribeAskWar'; tribe: number }
  /** As right hand: a NAP or peace talks yourself, an alliance through your leader. */
  | { type: 'rhPropose'; tribe: number; relation: 'nap' | 'peace' | 'ally' }
  /** Leader: the war front your bot members fight (enemy tribe, optionally one village). null = let them choose. */
  | { type: 'tribeFront'; enemy: number | null; target?: number }
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
  /** Plan an attack or noble train to land at landAt; it leaves by itself. */
  | { type: 'planAttack'; from: number; to: number; first: UnitCounts; escorts?: UnitCounts[]; catapultTarget?: BuildingId; clearFirst?: boolean; landAt: number }
  /** Plan your strongest free army (or spies) from a village for an order, to land at landAt. */
  | { type: 'planOrder'; from: number; to: number; spies?: boolean; landAt: number }
  | { type: 'cancelPlanned'; id: number }
  /** Give your nobles in a joint attack to another candidate. */
  | { type: 'giveNobles'; op: number; to: number }
  /** Ask your bot leader for an order. */
  | { type: 'askOrder' }
  /** Try to take over your bot tribe. */
  | { type: 'tribeCoup' }
  | { type: 'returnSupport'; hostId: number; originId: number }
  /** Sends many supports home at once (rows of the support list). */
  | { type: 'returnSupportMany'; pairs: { hostId: number; originId: number }[] }
  | { type: 'getSupportList' }
  | { type: 'setSurplus'; keep: number; auto: boolean }
  | { type: 'setMint'; keep: number; auto: boolean }
  | { type: 'sendSurplus'; keep: number }
  | { type: 'getSurplusPlan'; keep: number }
  | { type: 'getMintPlan'; keep: number }
  | { type: 'getScav' }
  | { type: 'getFarmAllPlan'; options: FarmAllOptions }
  | { type: 'farmAll'; options: FarmAllOptions }
  /** null = off. */
  | { type: 'setAutoFarm'; options: FarmAllOptions | null }
  /** Rooftochten: units per level (index = level) per village. */
  | { type: 'sendScav'; plans: { villageId: number; plan: UnitCounts[] }[] }
  | { type: 'setScavRepeat'; villages: number[]; repeat: boolean }
  | { type: 'saveScavTemplate'; template: ScavTemplate }
  | { type: 'deleteScavTemplate'; id: string }
  | { type: 'setScavenging'; on: boolean }
  /** Building and recruiting speed of the running world (on top of world speed). */
  | { type: 'setSpeeds'; build: number; recruit: number }
  | { type: 'continueWorld' }
  | { type: 'askTribeResources'; village: number; res: [number, number, number] }
  | { type: 'askPermission'; target: number }
  | { type: 'betray'; target: number }
  | { type: 'getOpinions' }
  | { type: 'simulate'; input: SimInput }
  | { type: 'getWorldStats' }
  | { type: 'equipItem'; item: string | null }
  | { type: 'upgradeFlag'; flag: string; level: number }
  /** Merge what can be merged (one kind, or all), keeping enough to hang one in every village. */
  | { type: 'mergeFlags'; flag?: string }
  /** Merge by itself whenever flags come in. */
  | { type: 'flagAuto'; on: boolean }
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
  last?: { report?: number; time: number; result: Report['result']; loot: number; scouted?: [number, number, number] };
  /** You wrote a note on this village or its owner. */
  note?: true;
  /** When you last scouted it (player villages). */
  scoutedAt?: number;
}

/** One village in detail: its reports, earlier owners, your notes, your last scout. */
export interface VillageInfo {
  id: number;
  name: string;
  x: number;
  y: number;
  owner: number;
  ownerName: string;
  /** Your reports about it, newest first (attacks on it and from it). */
  reports: Report[];
  /** Conquests of it by players that the world statistics still know (the last 200 in the world). */
  owners: { from: string; to: string; at: number }[];
  note: string;
  ownerNote: string;
  /** Your last scout of it: what was home and when. */
  scout: { time: number; units: UnitCounts; away?: UnitCounts } | null;
  /** Your troops supporting it. */
  yourSupport: UnitCounts | null;
}

/** Your own colours for players and tribes on the map. */
export interface MapMarks {
  players: Record<number, string>;
  tribes: Record<number, string>;
}

/** Who holds the villages your reports are about right now, by village id (the target of each report). */
export type ReportOwners = Record<number, { owner: number; ownerName: string; name: string }>;

export interface MapData {
  ownVillageId: number;
  villages: MapVillage[];
  marks: MapMarks;
  tribes: TribeView[];
  /** Churches worlds: your churches and how far their faith reaches. */
  churches?: { x: number; y: number; radius: number }[];
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
/** As a member: the tribes you may ask your leader to go to war with, and until when you wait after a no. */
export interface WarAskInfo {
  contact: number[];
  waitUntil?: number;
}
/** Your tribe's friction with another tribe (tribe screen), highest first. */
export interface FrictionRow {
  tribe: number;
  friction: number;
  /** Friction a war needs; who would start it. 'you' = you lead the stronger side and decide yourself. */
  need: number;
  starter: 'us' | 'them' | 'you';
  /** Under 1.2x stronger: a war only comes at twice the need. */
  even: boolean;
  /** As a member: what your leader needs when you ask him (only when your tribe is the stronger one). */
  asked?: number;
  why: 'attack' | 'conquest' | 'treaty' | 'border' | null;
  contact: boolean;
  rel?: TribeRelation;
}
export type TribeAskView =
  | { kind: 'apply'; tribe: number; at: number }
  | { kind: 'invite'; player: number; at: number }
  | { kind: 'propose'; tribe: number; relation: 'nap' | 'ally' | 'peace'; at: number; by?: 'rh' }
  | { kind: 'allyAsk'; tribe: number; at: number }
  | { kind: 'war'; tribe: number; at: number };
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

export interface LeaderOrderView {
  order: 'attack' | 'support' | 'scout';
  /** open = in your inbox, waiting for your yes or no. */
  status: 'open' | 'accepted';
  /** Inbox message (open orders). */
  message?: number;
  target: { id: number; name: string; x: number; y: number; owner: number; ownerName: string };
  /** Deadline (game time); a joint attack also has its landing time. */
  until: number;
  landAt?: number;
  from: string;
  /** Attack orders: the attack strength the leader wants (scouts don't count). */
  minAttack?: number;
  /** Scout orders: more spies than this get through (the last ones that died). */
  minSpies?: number;
  /** Your attacks underway to the target: strength and landing time. */
  underway: { attack: number; arrives: number; nobles: number }[];
  /** Your strongest village for it: attack at home and when it would land if sent now. */
  best?: { id: number; name: string; attack: number; arrives: number; spies?: number; nobles?: number };
  /** You bring the nobles of a joint attack: at least `min`, and who you could give them to. */
  nobles?: { min: number; op: number; giveTo: { id: number; name: string; d: number }[] };
  /** Your planned attacks on the target (not yet left): strength and landing time. */
  planned: { id: number; attack: number; landAt: number; spies: number }[];
}

/** One of your planned attacks: it leaves by itself at sendAt and lands at landAt. */
export interface PlannedView {
  id: number;
  from: { id: number; name: string; x: number; y: number };
  to: { id: number; name: string; x: number; y: number; owner: number; ownerName: string };
  /** All waves together, and how many waves (more than 1 = a noble train). */
  units: UnitCounts;
  waves: number;
  clearFirst: boolean;
  sendAt: number;
  landAt: number;
  /** Not all of it is home right now (it goes with what is there). */
  short: boolean;
}

export interface InboxView {
  id: number;
  time: number;
  kind: 'invite' | 'application' | 'proposal' | 'answer' | 'war' | 'info' | 'request' | 'merge' | 'treaty' | 'talks' | 'lead' | 'rhTreaty' | 'rhAsk';
  rhAsk?: 'ally' | 'war';
  from: number;
  fromName: string;
  /** The sender's portrait (a bot). */
  fromFace?: Face;
  request?: BotRequest;
  title: string;
  text: string;
  read: boolean;
  tribe?: number;
  status?: 'open' | 'accepted' | 'declined' | 'expired';
  expires?: number;
}
export interface OpView {
  id: number;
  enemyTag: string;
  target: { id: number; name: string; x: number; y: number; owner: number; ownerName: string };
  landAt: number;
  armies: number;
  nobles: boolean;
  /** You were asked to join. */
  you: boolean;
  sent: number;
  failed: number;
}

export interface WarFrontView {
  /** Tribes you are at war with. */
  enemies: { id: number; tag: string; name: string }[];
  /** Leader's choice (only when you lead). */
  front: { enemy: number; target?: { id: number; name: string; x: number; y: number } } | null;
  ops: OpView[];
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
  /** trust: this tribe's trust in an ally (0..100), see alliances. */
  relations: { id: number; rel: TribeRelation; since: number; trust?: number }[];
  /** Every member's rank and merit, by place. */
  ranks: RankRow[];
  /** A full tribe you are not in: who would make room for you if they take you (null: nobody). */
  bump?: { id: number; name: string; rank: RankId; merit: number } | null;
  /** Your tribe: the merit you need for the next place up. */
  next?: { rank: RankId; need: number } | null;
}

export type RankId = 'leider' | 'rechterhand' | 'kapitein' | 'veteraan' | 'krijger' | 'rekruut';
export interface RankRow { id: number; rank: RankId; merit: number }

/** Everything you can see about another player (profile screen). */
export interface PlayerView {
  id: number;
  name: string;
  isBot: boolean;
  face?: Face;
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
  /** World statistics: attacks on players / barbarians, villages taken (of players / barbarians) and lost. */
  stats: { pvp: number; barb: number; took: number; tookBarb: number; lost: number };
  /** For the mini map: tribe mates' villages (without theirs) and yours. */
  mates: { id: number; name: string; villages: { x: number; y: number }[] }[];
  mine: { x: number; y: number }[];
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
  /** owner = the village's owner (-1 barbarian), with name. */
  from: { id: number; name: string; x: number; y: number; owner?: number; ownerName?: string };
  to: { id: number; name: string; x: number; y: number; owner?: number; ownerName?: string };
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
  /** Yours: a farm run (sent by the farm tools); missing on old ones. */
  farm?: boolean;
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

export interface HelpView {
  target: number;
  tag: string;
  space: number;
}

export interface TalksView {
  id: number;
  enemy: { id: number; tag: string; name: string };
  /** Your tribe is the winning side. */
  youWin: boolean;
  /** Your tribe decides now. */
  yourTurn: boolean;
  until: number;
  bids: { ours: boolean; villages: number; resources: number; help?: HelpView }[];
  options: { id: number; kind: 'accept' | 'bid' | 'reject'; villages?: number; resources?: number; help?: HelpView; author?: string; leader?: boolean; votes: number }[];
  /** Tribes help can be asked against (not one of the two). */
  helpTargets: { id: number; tag: string; war: boolean }[];
  myVote: number | null;
  leader: boolean;
  /** Villages the losing side can give up at most (none: only resources can be asked). */
  maxVillages: number;
  /** Bids left (three in total). */
  bidsLeft: number;
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
  /** For the performance meter, per real second: ms the simulation was busy (of which building updates), its slowest tick, game time lost (ms real). */
  simPerf: { busy: number; max: number; lost: number; snap: number };
  queueSize: number;
  /** World speed settings, for display. */
  multipliers: { world: number; production: number; build: number; recruit: number; farm: number };
  log: LogEntry[];
  /** Open tabs of the game on this world. */
  tabs: number;
  /** The latest world news, newest first (for the ticker). */
  news: import('../sim/news').NewsItem[];
  /** Where you are (centre of your villages), for news "near me". */
  me: { x: number; y: number } | null;
  /** Peace talks your tribe is in. */
  talks: TalksView[];
  /** You are outlawed until this game time (attacked during peace talks). */
  outlawUntil: number | null;
  /** Resources you still have to pay after a lost war. */
  owed: number;
  /** Help in attacks you owe after a lost war. */
  duty: { tag: string; space: number; sent: number; due: number } | null;
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
  /** As a member of a bot tribe: your chance at a coup (or why you can't try). */
  coup: CoupView | null;
  /** The order of your bot leader you said yes to (or one still waiting for your answer). */
  leaderOrder: LeaderOrderView | null;
  /** Scout orders beside it (open and said yes to), at most 3. */
  scoutOrders: LeaderOrderView[];
  /** Your planned attacks, soonest to leave first. */
  planned: PlannedView[];
  inboxUnread: number;
  /** Open messages that ask for an answer. */
  inboxOpen: number;
  tribePause: { war: boolean; requests: boolean };
  /** Incoming attacks you asked your tribe help for (movement ids). */
  helpAsked: number[];
  /** Your open orders / suggestions to the tribe. */
  orders: OrderView[];
  /** Your tribe at war: the front and the joint operations underway. */
  war: WarFrontView | null;
  /** Build templates: the presets first, then the player's own. */
  templates: BuildTemplate[];
  troopTemplates: TroopTemplate[];
  nobleTemplates: NobleTemplate[];
  groups: VillageGroup[];
  /** Surplus to building villages: keep share and automatic on/off. */
  surplus: { keep: number; auto: boolean };
  mint: { keep: number; auto: boolean };
  /** Rooftochten on in this world. */
  scavenging: boolean;
  /** Battle rules that may change while playing. */
  rules: { morale: 'off' | 'points' | 'pointsTime'; luck: boolean; nightBonus: boolean };
  /** Domination endgame. */
  endgame: EndgameView;
  /** Flags worlds: your free flags per kind and level (index 0 = level 1), and progress to the next. */
  flags?: { free: Record<string, number[]>; kills: number; auto: boolean };
  /** Paladin items worlds: your weapon chamber. */
  items?: { found: { id: string; name: string; text: string }[]; equipped?: string; progress: number; all: number };
  /** Bot difficulty of this world (can be changed while playing). */
  difficulty: 'easy' | 'normal' | 'hard';
  /** Villages using each template (build and troop), by id. */
  templateUse: Record<string, number>;
  unreadReports: number;
  farmTemplates: FarmTemplates;
  /** Templates with "Meldingen tonen": their runs count as normal attacks for you. */
  farmNotify: FarmKey[];
  /** Template ids you hid. */
  hiddenTemplates: string[];
  autoRewards: boolean;
  /** Auto-farm: its settings, the next round and what the last one sent. */
  autoFarm: { options: FarmAllOptions; next?: number; last?: { time: number; sent: number } } | null;
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
  /** `same`: fields left out because they didn't change; keep the ones you have. */
  | { type: 'snapshot'; snapshot: Snapshot | null; same?: string[] }
  /** Sounds to play (the tab you look at plays them). */
  | { type: 'sfx'; sounds: import('./reportOutcome').Sfx[] }
  | { type: 'autoPaused'; entry: LogEntry }
  | { type: 'saves'; saves: SaveMeta[] }
  | { type: 'cloud'; status: CloudStatus }
  | { type: 'cloudWorlds'; worlds: CloudWorld[] }
  | { type: 'map'; map: MapData }
  | { type: 'reports'; reports: Report[]; now: ReportOwners }
  | { type: 'news'; news: import('../sim/news').NewsItem[] }
  | { type: 'village'; info: VillageInfo | null }
  | { type: 'ranking'; ranking: RankingRow[]; tribes: TribeView[]; news: { time: number; text: string }[]; asks: TribeAskView[]; candidates: CandidateView[]; refusedApplications: Record<number, number>; refusedInvites: Record<number, number>; warAsk: WarAskInfo; friction: FrictionRow[] }
  | { type: 'inbox'; inbox: InboxView[] }
  | { type: 'supportList'; rows: SupportRow[] }
  | { type: 'opinions'; opinions: OpinionsView }
  | { type: 'simResult'; result: SimResult }
  | { type: 'worldStats'; stats: WorldStatsView }
  | { type: 'surplusPlan'; rows: SurplusRow[]; keep: number }
  | { type: 'scav'; view: ScavView }
  | { type: 'farmAllPlan'; plan: FarmAllView }
  | { type: 'mintPlan'; rows: { id: number; name: string; x: number; y: number; coins: number }[]; keep: number }
  | { type: 'player'; player: PlayerView | null }
  | { type: 'notice'; level: 'info' | 'error'; text: string }
  /** Another simulation already runs (another tab, maybe another version): this one does nothing. */
  | { type: 'blocked' };

export const AUTOSAVE_SLOT = 'autosave';
/** Rolling backups per world (the last BACKUPS_KEPT), and the original of a save before an update migrated it. */
export const BACKUP_PREFIX = 'backup:';
export const UPDATE_PREFIX = 'update:';
/** The manual save of a world: one per world. */
export const MANUAL_PREFIX = 'handmatig:';
export const BACKUPS_KEPT = 5;

/** The slot for the next rolling backup: a free number up to `kept`, else the oldest one. */
export function nextBackupSlot(existing: { slot: string; savedAt: number }[], prefix: string, kept = BACKUPS_KEPT): string {
  const mine = existing.filter((x) => x.slot.startsWith(prefix)).sort((a, b) => a.savedAt - b.savedAt);
  if (mine.length >= kept) return mine[0]!.slot;
  const used = new Set(mine.map((x) => x.slot));
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

/** How a slot is shown: autosaves, backups and pre-update copies get a readable name. */
export function slotLabel(slot: string, version?: number): string {
  if (slot === AUTOSAVE_SLOT || slot.startsWith(`${AUTOSAVE_SLOT}:`)) return 'Autosave';
  if (slot.startsWith(MANUAL_PREFIX)) return 'Handmatig';
  if (slot.startsWith(BACKUP_PREFIX)) return `Backup ${slot.split(':')[2] ?? ''}`.trim();
  if (slot.startsWith(UPDATE_PREFIX)) return `Voor update (v${version ?? slot.split(':v')[1] ?? '?'})`;
  return slot;
}

export interface RankingRow {
  id: number;
  name: string;
  points: number;
  villages: number;
  isBot: boolean;
  tribe?: number;
  /** A bot's portrait. */
  face?: Face;
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

/** Preview of "Farm alles". */
export interface FarmAllView {
  options: FarmAllOptions;
  attacks: number;
  /** Your villages that send, with how many attacks each. */
  from: { id: number; name: string; attacks: number }[];
  villages: number;
  able: number;
  skipped: { busy: number; lost: number; wall: number; noScout: number };
  left: number;
  /** Furthest target, fields. */
  furthest: number;
}

/** Rooftochten of your villages. */
export interface ScavView {
  enabled: boolean;
  params: ScavParams;
  templates: ScavTemplate[];
  villages: ScavVillageRow[];
}

export interface ScavVillageRow {
  id: number;
  name: string;
  x: number;
  y: number;
  groups: string[];
  hasPlace: boolean;
  home: UnitCounts;
  /** Highest open level (0..3). */
  unlocked: number;
  repeat: boolean;
  runs: { level: number; units: UnitCounts; returns: number }[];
  last: { level: number; loot: [number, number, number]; lost: UnitCounts; at: number }[];
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

/** Battle simulator input (the same battle code as the game). */
export interface SimInput {
  attacker: UnitCounts;
  defender: UnitCounts;
  wall: number;
  /** 0.3..1 */
  morale: number;
  /** -0.25..0.25 */
  luck: number;
  catapultTarget?: BuildingId;
  targetLevel?: number;
  /** Whole-side multipliers in percent: faith, flags, night (e.g. 50 = half strength, 104 = +4%). */
  attackerPercent: number;
  defenderPercent: number;
  /** Paladin items (ids) on either side, if any. */
  attackerItem?: string;
  defenderItem?: string;
  /** Use the research levels of this (own) village for the attacker. */
  techVillage?: number;
}
export interface SimResult {
  attackerWon: boolean;
  attackerLost: UnitCounts;
  defenderLost: UnitCounts;
  wallAfter: number;
  buildingAfter?: number;
  attackStrength: number;
  defenseStrength: number;
}

export interface CoupView {
  /** 0..1 */
  chance: number;
  /** What makes the chance, in words. */
  why: string[];
  blocker?: string;
}
