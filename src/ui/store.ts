/**
 * Connection to the simulation worker + UI state as signals.
 * Components read these signals; only the parts that use a changed signal re-render.
 */
import { signal } from '@preact/signals';
import type { BuildingId, RecruitBuilding, UnitCounts } from '../shared/gameData';
import type { CandidateView, Command, InboxView, PlayerView, MapData, RankingRow, Snapshot, SupportRow, SurplusRow, ScavView, FarmAllView, OpinionsView, WorldStatsView, SimResult, TribeAskView, TribeView, WarAskInfo, FrictionRow, WorkerMessage } from '../shared/protocol';
import type { Report } from '../sim/movement';
import type { LogEntry } from '../sim/state';
import type { SaveMeta } from '../sim/save';

export type Screen = 'overview' | 'villages' | 'manager' | 'main' | RecruitBuilding | 'smith' | 'map' | 'place' | 'market' | 'farm' | 'reports' | 'quests' | 'ranking' | 'tribes' | 'inbox' | 'support' | 'player' | 'debug' | 'building' | 'relations' | 'stats' | 'simulator' | 'scavenge' | 'news' | 'settings' | 'rules' | 'sound' | 'admin';

export const snapshot = signal<Snapshot | null>(null);
export const saves = signal<SaveMeta[]>([]);
/** Cloud saves as the worker sees them (upload state, the worlds in the cloud). */
export const cloudStatus = signal<import('../cloud/sync').CloudStatus>({ email: null, state: 'off', at: null });
export const cloudWorlds = signal<import('../cloud/sync').CloudWorld[]>([]);
/** Set when an event auto-paused the game; cleared when the player resumes. */
export const autoPause = signal<LogEntry | null>(null);
export const notice = signal<{ text: string; level: 'info' | 'error' } | null>(null);
const SCREENS = ['overview', 'villages', 'manager', 'main', 'barracks', 'stable', 'garage', 'statue', 'snob', 'smith', 'map', 'place', 'market', 'farm', 'reports', 'quests', 'ranking', 'tribes', 'inbox', 'support', 'player', 'debug', 'building', 'relations', 'stats', 'simulator', 'scavenge', 'news', 'settings', 'rules', 'sound', 'admin'] as const satisfies readonly Screen[];
export const screen = signal<Screen>(screenFromHash() ?? 'overview');
function screenFromHash(): Screen | null {
  const h = typeof location !== 'undefined' ? decodeURIComponent(location.hash.slice(1)) : '';
  return (SCREENS as readonly string[]).includes(h) ? (h as Screen) : null;
}
// each tab shows its screen in the address: a reload or a duplicated tab opens the same screen
if (typeof window !== 'undefined') {
  screen.subscribe((s) => { if (location.hash.slice(1) !== s) history.replaceState(null, '', `#${s}`); });
  window.addEventListener('hashchange', () => { const s = screenFromHash(); if (s && s !== screen.value) screen.value = s; });
}
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
export const newsList = signal<import('../sim/news').NewsItem[]>([]);
/** The village shown in detail (map panel, player profile). */
export const villageInfo = signal<import('../shared/protocol').VillageInfo | null>(null);
/** A report shown over everything (from the map or a profile). */
export const reportPopup = signal<Report | null>(null);
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
export const warAsk = signal<WarAskInfo>({ contact: [] });
export const friction = signal<FrictionRow[]>([]);
export const inviteCandidates = signal<CandidateView[]>([]);
export const refusedApplications = signal<Record<number, number>>({});
export const refusedInvites = signal<Record<number, number>>({});
export const inbox = signal<InboxView[]>([]);
export const supportRows = signal<SupportRow[] | null>(null);
export const opinions = signal<OpinionsView | null>(null);
export const worldStats = signal<WorldStatsView | null>(null);
export const simResult = signal<SimResult | null>(null);
/** A report asks the simulator for a re-run with its numbers. */
export const simPrefill = signal<{ attacker: UnitCounts; defender: UnitCounts; wall: number; morale: number; luck: number } | null>(null);
export const mintPlan = signal<{ rows: { id: number; name: string; x: number; y: number; coins: number }[]; keep: number } | null>(null);
export const scavView = signal<ScavView | null>(null);
export const farmAllPlan = signal<FarmAllView | null>(null);
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

/**
 * The simulation. Where the browser can, one SharedWorker for all tabs of the game (one world,
 * each tab its own screen and village); otherwise a Worker per tab.
 */
const port: { postMessage(cmd: Command): void; onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null } = (() => {
  if (typeof SharedWorker !== 'undefined') {
    const w = new SharedWorker(new URL('../sim/worker.ts', import.meta.url), { type: 'module', name: 'tribal-feud' });
    w.port.start();
    window.addEventListener('pagehide', () => w.port.postMessage({ type: 'bye' } satisfies Command));
    return w.port as never;
  }
  return new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' }) as never;
})();

export function send(cmd: Command): void {
  port.postMessage(cmd);
}

/** Another simulation runs (other tabs, maybe of an older version): this tab can't play. */
export const blocked = signal(false);

// --- per tab: its village and its screen survive a reload (sessionStorage is per tab) ---------
const TAB_VILLAGE = 'tf-tab-village';
let lastVillage: number | null = null;
function rememberVillage(id: number | null): void {
  if (id === null || id === lastVillage) return;
  lastVillage = id;
  try { if (id === null) sessionStorage.removeItem(TAB_VILLAGE); else sessionStorage.setItem(TAB_VILLAGE, String(id)); } catch { /* fine */ }
}
(() => {
  let v: number | null = null;
  try { const raw = sessionStorage.getItem(TAB_VILLAGE); v = raw === null ? null : Number(raw); } catch { /* fine */ }
  send({ type: 'hello', village: v !== null && Number.isFinite(v) ? v : null });
})();

/** Asks before something that changes the world in every open tab. */
export function confirmAllTabs(what: string): boolean {
  const n = snapshot.value?.tabs ?? 1;
  return n < 2 || window.confirm(`${what} verandert de wereld in alle ${n} open tabbladen. Doorgaan?`);
}

let noticeTimer: number | undefined;
export function showNotice(text: string, level: 'info' | 'error'): void {
  notice.value = { text, level };
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (notice.value = null), level === 'error' ? 6000 : 3000);
}

port.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'snapshot':
      snapshot.value = msg.snapshot;
      rememberVillage(msg.snapshot?.village?.id ?? null);
      break;
    case 'blocked':
      blocked.value = true;
      break;
    case 'autoPaused':
      autoPause.value = msg.entry;
      break;
    case 'saves':
      saves.value = msg.saves;
      break;
    case 'cloud':
      cloudStatus.value = msg.status;
      break;
    case 'cloudWorlds':
      cloudWorlds.value = msg.worlds;
      break;
    case 'map':
      mapData.value = msg.map;
      break;
    case 'reports':
      reports.value = msg.reports;
      break;
    case 'news':
      newsList.value = msg.news;
      break;
    case 'village':
      villageInfo.value = msg.info;
      break;
    case 'ranking':
      ranking.value = msg.ranking;
      tribes.value = msg.tribes;
      tribeNews.value = msg.news;
      tribeAsks.value = msg.asks;
      warAsk.value = msg.warAsk ?? { contact: [] };
      friction.value = msg.friction ?? [];
      inviteCandidates.value = msg.candidates;
      refusedApplications.value = msg.refusedApplications;
      refusedInvites.value = msg.refusedInvites;
      break;
    case 'inbox':
      inbox.value = msg.inbox;
      break;
    case 'simResult':
      simResult.value = msg.result;
      break;
    case 'worldStats':
      worldStats.value = msg.stats;
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
    case 'farmAllPlan':
      farmAllPlan.value = msg.plan;
      break;
    case 'scav':
      scavView.value = msg.view;
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

// worker errors show up as notices from the worker itself (a SharedWorker has no onerror on the page side)

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
