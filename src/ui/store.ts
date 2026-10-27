/**
 * Connection to the simulation worker + UI state as signals.
 * Components read these signals; only the parts that use a changed signal re-render.
 */
import { signal } from '@preact/signals';
import type { BuildingId, RecruitBuilding } from '../shared/gameData';
import type { CandidateView, Command, InboxView, PlayerView, MapData, RankingRow, Snapshot, SupportRow, SurplusRow, OpinionsView, TribeAskView, TribeView, WorkerMessage } from '../shared/protocol';
import type { Report } from '../sim/movement';
import type { LogEntry } from '../sim/state';
import type { SaveMeta } from '../sim/save';

export type Screen = 'overview' | 'villages' | 'manager' | 'main' | RecruitBuilding | 'smith' | 'map' | 'place' | 'market' | 'farm' | 'reports' | 'quests' | 'ranking' | 'tribes' | 'inbox' | 'support' | 'player' | 'debug' | 'building' | 'relations';

export const snapshot = signal<Snapshot | null>(null);
export const saves = signal<SaveMeta[]>([]);
/** Set when an event auto-paused the game; cleared when the player resumes. */
export const autoPause = signal<LogEntry | null>(null);
export const notice = signal<{ text: string; level: 'info' | 'error' } | null>(null);
export const screen = signal<Screen>('overview');
/** The Ctrl+K search. */
export const paletteOpen = signal(false);
/** The building shown on the 'building' screen. */
export const infoBuilding = signal<BuildingId>('wood');

/** Opens a building: its own screen if it has one, else its info screen. */
export function openBuilding(id: BuildingId): void {
  const own: Partial<Record<BuildingId, Screen>> = {
    main: 'main',
    barracks: 'barracks',
    stable: 'stable',
    garage: 'garage',
    statue: 'statue',
    snob: 'snob',
    smith: 'smith',
    place: 'place',
    market: 'market',
  };
  const target = own[id];
  if (target) {
    screen.value = target;
    return;
  }
  infoBuilding.value = id;
  screen.value = 'building';
}
export const mapData = signal<MapData | null>(null);
export const reports = signal<Report[]>([]);
export const ranking = signal<RankingRow[]>([]);
export const tribes = signal<TribeView[]>([]);
/** Tribe opened on the tribe screen. */
export const tribeFocus = signal<number | null>(null);
/** Support planner request: to which village, and by when (null: no deadline). */
export const supportPlan = signal<{ target: number; deadline: number | null } | null>(null);
export function openSupport(target: number, deadline: number | null = null): void {
  supportPlan.value = { target, deadline };
  screen.value = 'support';
}
/** Village group filter (null = all villages): the village switcher, A/D and the village lists follow it. */
export const groupFilter = signal<string | null>((() => { try { return localStorage.getItem('tf-group') || null; } catch { return null; } })());
export function setGroupFilter(id: string | null): void {
  groupFilter.value = id;
  try { if (id) localStorage.setItem('tf-group', id); else localStorage.removeItem('tf-group'); } catch { /* fine */ }
}
/** Your villages in the active group (all when no group, or the group is gone). */
export function groupVillages<T extends { groups: string[] }>(villages: T[], groups: { id: string }[]): T[] {
  const g = groupFilter.value;
  if (!g || !groups.some((x) => x.id === g)) return villages;
  return villages.filter((v) => v.groups.includes(g));
}

/** Player profile shown on the player screen. */
export const playerFocus = signal<number | null>(null);
export const playerView = signal<PlayerView | null>(null);
export function openPlayer(id: number): void {
  playerFocus.value = id;
  screen.value = 'player';
}
export function openTribe(id: number): void {
  tribeFocus.value = id;
  screen.value = 'tribes';
}
export const tribeNews = signal<{ time: number; text: string }[]>([]);
export const tribeAsks = signal<TribeAskView[]>([]);
export const inviteCandidates = signal<CandidateView[]>([]);
export const refusedApplications = signal<Record<number, number>>({});
export const refusedInvites = signal<Record<number, number>>({});
export const inbox = signal<InboxView[]>([]);
export const supportRows = signal<SupportRow[] | null>(null);
export const opinions = signal<OpinionsView | null>(null);
export const mintPlan = signal<{ rows: { id: number; name: string; x: number; y: number; coins: number }[]; keep: number } | null>(null);
export const surplusPlan = signal<{ rows: SurplusRow[]; keep: number } | null>(null);
/** Target picked on the map, prefilled in the rally point. */
export const placeTarget = signal<{ x: number; y: number } | null>(null);
/** Map style: drawn villages, or the classic flat squares. Remembered per browser. */
export const mapStyle = signal<'sprites' | 'flat'>(
  (() => {
    try {
      return localStorage.getItem('tf-map-style') === 'flat' ? 'flat' : 'sprites';
    } catch {
      return 'sprites';
    }
  })(),
);
export function setMapStyle(style: 'sprites' | 'flat'): void {
  mapStyle.value = style;
  try {
    localStorage.setItem('tf-map-style', style);
  } catch {
    // storage blocked: just not remembered
  }
}

/** Village overview lighting: day or dusk. Remembered per browser. */
export const villageLight = signal<'day' | 'dusk'>(
  (() => {
    try {
      return localStorage.getItem('tf-village-light') === 'day' ? 'day' : 'dusk';
    } catch {
      return 'dusk';
    }
  })(),
);
export function setVillageLight(light: 'day' | 'dusk'): void {
  villageLight.value = light;
  try {
    localStorage.setItem('tf-village-light', light);
  } catch {
    // storage blocked: just not remembered
  }
}

/** "Kijk op de kaart": a player (by id) or the owner of the village at x|y. */
export const mapFocus = signal<{ owner?: number; tribe?: number; x?: number; y?: number } | null>(null);
/** Village selected on the map. */
export const selectedVillage = signal<number | null>(null);

const worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });

export function send(cmd: Command): void {
  worker.postMessage(cmd);
}

let noticeTimer: number | undefined;
export function showNotice(text: string, level: 'info' | 'error'): void {
  notice.value = { text, level };
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (notice.value = null), level === 'error' ? 6000 : 3000);
}

worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'snapshot':
      snapshot.value = msg.snapshot;
      break;
    case 'autoPaused':
      autoPause.value = msg.entry;
      break;
    case 'saves':
      saves.value = msg.saves;
      break;
    case 'map':
      mapData.value = msg.map;
      break;
    case 'reports':
      reports.value = msg.reports;
      break;
    case 'ranking':
      ranking.value = msg.ranking;
      tribes.value = msg.tribes;
      tribeNews.value = msg.news;
      tribeAsks.value = msg.asks;
      inviteCandidates.value = msg.candidates;
      refusedApplications.value = msg.refusedApplications;
      refusedInvites.value = msg.refusedInvites;
      break;
    case 'inbox':
      inbox.value = msg.inbox;
      break;
    case 'opinions':
      opinions.value = msg.opinions;
      break;
    case 'supportList':
      supportRows.value = msg.rows;
      break;
    case 'mintPlan':
      mintPlan.value = { rows: msg.rows, keep: msg.keep };
      break;
    case 'surplusPlan':
      surplusPlan.value = { rows: msg.rows, keep: msg.keep };
      break;
    case 'player':
      playerView.value = msg.player;
      break;
    case 'notice':
      showNotice(msg.text, msg.level);
      break;
  }
};

worker.onerror = (e) => showNotice(`Worker-fout: ${e.message}`, 'error');

document.addEventListener('visibilitychange', () => {
  send({ type: 'setVisible', visible: document.visibilityState === 'visible' });
});

/** Pause/resume; resuming clears the auto-pause banner. */
export function togglePause(): void {
  const s = snapshot.value;
  if (!s) return;
  autoPause.value = null;
  send({ type: 'setPaused', paused: !s.paused });
}

/** Opens the rally point with a target filled in. */
export function attackVillage(x: number, y: number): void {
  placeTarget.value = { x, y };
  screen.value = 'place';
}

/** Opens the map on a player's villages (or on the village at x|y and its owner). */
export function showOnMap(target: { owner?: number; tribe?: number; x?: number; y?: number }): void {
  mapFocus.value = { ...target };
  screen.value = 'map';
}
