import type { WorldState } from './state';

/**
 * Save format. Bump SAVE_VERSION whenever WorldState changes shape,
 * and add a migration from the previous version to MIGRATIONS.
 */
export const SAVE_VERSION = 1;

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
const MIGRATIONS: Record<number, (data: SaveData) => SaveData> = {};

export function toSaveData(state: WorldState, now: number): SaveData {
  // structuredClone so later mutations of the live state never leak into a stored save
  return { version: SAVE_VERSION, savedAt: now, state: structuredClone(state) };
}

export function fromSaveData(raw: unknown): WorldState {
  if (typeof raw !== 'object' || raw === null || !('version' in raw) || !('state' in raw)) {
    throw new Error('Ongeldige save.');
  }
  let data = raw as SaveData;
  if (data.version > SAVE_VERSION) {
    throw new Error(`Save is van een nieuwere versie (${data.version}) dan dit spel (${SAVE_VERSION}).`);
  }
  while (data.version < SAVE_VERSION) {
    const migrate = MIGRATIONS[data.version];
    if (!migrate) throw new Error(`Geen migratie van saveversie ${data.version}.`);
    data = migrate(data);
  }
  return structuredClone(data.state);
}
