/**
 * Typed messages between the UI (main thread) and the simulation worker.
 * The UI only sends commands; the worker is the single source of truth and sends state back.
 */
import type { ConfigOverrides, PresetId } from './config';
import type { Speed } from './time';
import type { LogEntry } from '../sim/state';
import type { SaveMeta } from '../sim/save';
import type { VillageView } from '../sim/view';
import type { BuildingId, UnitCounts, UnitId } from './gameData';
import type { Report } from '../sim/movement';

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
  | { type: 'research'; villageId: number; unit: UnitId }
  | { type: 'cancelResearch'; villageId: number }
  | { type: 'recruit'; villageId: number; unit: UnitId; count: number }
  | { type: 'cancelRecruit'; villageId: number; jobId: number }
  | { type: 'sendAttack'; from: number; to: number; units: UnitCounts; catapultTarget?: BuildingId }
  | { type: 'sendFarm'; from: number; to: number; template: 'A' | 'B' }
  | { type: 'setFarmTemplate'; template: 'A' | 'B'; units: UnitCounts }
  | { type: 'getMap' }
  | { type: 'getReports' }
  | { type: 'markReportsRead'; ids: number[] | 'all' }
  /** Debug cheats for testing. */
  | { type: 'debugGive'; units?: UnitCounts; resources?: number };

export interface MapVillage {
  id: number;
  x: number;
  y: number;
  name: string;
  owner: number;
  ownerName: string;
  kind: 'own' | 'bot' | 'barb';
  points: number;
  /** Your last attack on this village. */
  last?: { time: number; result: Report['result']; loot: number; scouted?: [number, number, number] };
}

export interface MapData {
  ownVillageId: number;
  villages: MapVillage[];
}

export interface MovementView {
  id: number;
  kind: 'attack' | 'return';
  from: { id: number; name: string; x: number; y: number };
  to: { id: number; name: string; x: number; y: number };
  sent: number;
  arrives: number;
  units: UnitCounts;
  loot?: [number, number, number];
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
  /** The player's village, fully computed for display. */
  village: VillageView | null;
  /** The player's troops on the road, soonest first. */
  movements: MovementView[];
  unreadReports: number;
  farmTemplates: { A: UnitCounts; B: UnitCounts };
  /** worldSpeed * unitSpeed * marchSpeed, to preview travel times. */
  marchFactor: number;
}

export type WorkerMessage =
  | { type: 'snapshot'; snapshot: Snapshot | null }
  | { type: 'autoPaused'; entry: LogEntry }
  | { type: 'saves'; saves: SaveMeta[] }
  | { type: 'map'; map: MapData }
  | { type: 'reports'; reports: Report[] }
  | { type: 'notice'; level: 'info' | 'error'; text: string };

export const AUTOSAVE_SLOT = 'autosave';
