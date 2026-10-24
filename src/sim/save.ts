import { defaultTables } from '../shared/config';
import { HUMAN_ID, type WorldState } from './state';
import { createVillage } from './village';

/**
 * Save format. Bump SAVE_VERSION whenever WorldState changes shape,
 * and add a migration from the previous version to MIGRATIONS.
 */
export const SAVE_VERSION = 3;

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
