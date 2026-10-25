import { PRESETS, defaultTables } from '../shared/config';
import { UNIT_IDS, type UnitId } from '../shared/gameData';
import { generateMap } from './map';
import { defaultQuests } from '../shared/quests';
import { checkQuests } from './quests';
import { initBots } from './bots';
import { HUMAN_ID, type WorldState } from './state';
import { createVillage } from './village';

/**
 * Save format. Bump SAVE_VERSION whenever WorldState changes shape,
 * and add a migration from the previous version to MIGRATIONS.
 */
export const SAVE_VERSION = 10;

export interface SaveData {
  version: number;
  savedAt: number;
  state: WorldState;
}

export interface SaveMeta {
  slot: string;
  worldName: string;
  gameTime: number;
  savedAt: number;
  version: number;
}

/** MIGRATIONS[n] upgrades a save from version n to n + 1. */
const MIGRATIONS: Record<number, (data: SaveData) => SaveData> = {
  // v1 (phase 1) had no villages: add the game tables, a player and a starting village.
  1: (data) => {
    const state = data.state as WorldState & Partial<Pick<WorldState, 'players' | 'villages' | 'nextId'>>;
    state.config = { ...defaultTables(), ...state.config };
    state.players = [{ id: HUMAN_ID, name: 'Jij', isBot: false }];
    state.nextId = 1;
    const village = createVillage(state.config, state.nextId++, HUMAN_ID, 'Jouw dorp', 500, 500, state.time);
    state.villages = { [village.id]: village };
    return { ...data, version: 2, state };
  },
  // v2 had no separate multipliers: keep old worlds exactly as they were (all 1).
  2: (data) => {
    const config = data.state.config as Partial<WorldState['config']> & WorldState['config'];
    config.productionMultiplier ??= 1;
    config.buildSpeed ??= 1;
    config.recruitSpeed ??= 1;
    return { ...data, version: 3 };
  },
  // v3 (phase 2) had one village and no map: add map settings, troop movements and generate the world around it.
  3: (data) => {
    const state = data.state;
    const base = PRESETS.classic;
    const config = state.config as Partial<WorldState['config']> & WorldState['config'];
    config.marchSpeed ??= 1;
    config.map ??= structuredClone(base.map);
    config.combat ??= structuredClone(base.combat);
    config.barbarians = { ...base.barbarians, ...config.barbarians };
    for (const v of Object.values(state.villages)) {
      if (!v.outside) {
        v.outside = Object.fromEntries(UNIT_IDS.map((u) => [u, 0])) as Record<UnitId, number>;
      }
    }
    state.movements ??= {};
    state.reports ??= [];
    state.lastReportByTarget ??= {};
    state.farmTemplates ??= { A: { light: 5 }, B: { spear: 10 } };
    generateMap(state);
    return { ...data, version: 4 };
  },
  // v4 (phase 3) had no quests: add them; quests already done complete on the next check.
  4: (data) => {
    const state = data.state;
    const config = state.config as Partial<WorldState['config']> & WorldState['config'];
    config.quests ??= defaultQuests();
    state.questProgress ??= {};
    state.rewards ??= [];
    state.stats ??= { plunders: 0, loot: 0, rewardsClaimed: 0 };
    checkQuests(state);
    return { ...data, version: 5 };
  },
  // v5 had passive bots: give them the new bot settings, personalities and turns.
  5: (data) => {
    const state = data.state;
    state.config.bots = { ...PRESETS.classic.bots, ...state.config.bots };
    initBots(state);
    return { ...data, version: 6 };
  },
  // v6 barbarians grew one level per interval and had no types: keep that for old worlds.
  6: (data) => {
    const c = data.state.config;
    c.barbarians = {
      ...PRESETS.classic.barbarians,
      ...c.barbarians,
      types: structuredClone(PRESETS.classic.barbarians.types),
      growthMode: 'levels',
      bonusShare: 0,
    };
    c.bots = { ...PRESETS.classic.bots, ...c.bots };
    // rebuild what the player knew from the reports (oldest first, so newer ones win)
    const state = data.state;
    state.intel ??= {};
    for (const r of state.reports) {
      const intel = (state.intel[r.defender.id] ??= {});
      if (r.wall) {
        intel.wall = r.wall.after;
        intel.wallAt = r.time;
      }
      if (r.scouted) intel.scout = { time: r.time, res: r.scouted.res, buildings: r.scouted.buildings };
    }
    return { ...data, version: 7 };
  },
  // v7 had no quest toasts.
  7: (data) => {
    data.state.questToasts ??= [];
    return { ...data, version: 8 };
  },
  // v8 had no conquest settings.
  8: (data) => {
    const c = data.state.config;
    c.conquest = { ...structuredClone(PRESETS.classic.conquest), ...c.conquest };
    return { ...data, version: 9 };
  },
  // v9 bots played at full strength: keep that as 'hard' for old worlds.
  9: (data) => {
    data.state.config.bots.difficulty = 'hard';
    return { ...data, version: 10 };
  },
};

export function toSaveData(state: WorldState, now: number): SaveData {
  // structuredClone so later mutations of the live state never leak into a stored save
  return { version: SAVE_VERSION, savedAt: now, state: structuredClone(state) };
}

export function fromSaveData(raw: unknown): WorldState {
  if (typeof raw !== 'object' || raw === null || !('version' in raw) || !('state' in raw)) {
    throw new Error('Ongeldige save.');
  }
  let data = structuredClone(raw) as SaveData;
  if (data.version > SAVE_VERSION) {
    throw new Error(`Save is van een nieuwere versie (${data.version}) dan dit spel (${SAVE_VERSION}).`);
  }
  while (data.version < SAVE_VERSION) {
    const migrate = MIGRATIONS[data.version];
    if (!migrate) throw new Error(`Geen migratie van saveversie ${data.version}.`);
    data = migrate(data);
  }
  return data.state;
}
