/**
 * Saves grouped per world, for the start screen: one row per world with its newest local save and
 * its cloud copy (if any). A world is told apart by its seed ("key").
 */
import type { CloudWorld } from '../cloud/sync';
import type { SaveMeta } from '../sim/save';
import { AUTOSAVE_SLOT, BACKUP_PREFIX, MANUAL_PREFIX, UPDATE_PREFIX } from './protocol';

/** The world a save belongs to: its stored key, else read from the slot name (older saves); null = unknown. */
export function worldKeyOf(meta: SaveMeta): string | null {
  if (meta.key) return meta.key;
  for (const prefix of [`${AUTOSAVE_SLOT}:`, MANUAL_PREFIX, BACKUP_PREFIX, UPDATE_PREFIX]) {
    if (meta.slot.startsWith(prefix)) return meta.slot.slice(prefix.length).split(':')[0] || null;
  }
  return null;
}

/** Backups and pre-update copies: kept for emergencies, not what you continue from. */
export const isSafetyCopy = (slot: string) => slot.startsWith(BACKUP_PREFIX) || slot.startsWith(UPDATE_PREFIX);

export interface WorldRow {
  /** the world's key, or `slot:<slot>` for a save whose world is unknown */
  key: string;
  name: string;
  /** newest local save to continue from (null: only in the cloud) */
  local: SaveMeta | null;
  cloud: CloudWorld | null;
  /** game time of the newest copy */
  gameTime: number;
  /** real time of the newest copy */
  savedAt: number;
  /** the cloud copy is further along than the one here */
  cloudAhead: boolean;
}

export function worldsOverview(saves: SaveMeta[], cloud: CloudWorld[]): WorldRow[] {
  const rows = new Map<string, WorldRow>();
  const byKey = new Map<string, SaveMeta[]>();
  for (const s of saves) {
    const key = worldKeyOf(s) ?? `slot:${s.slot}`;
    byKey.set(key, [...(byKey.get(key) ?? []), s]);
  }
  for (const [key, list] of byKey) {
    const regular = list.filter((s) => !isSafetyCopy(s.slot));
    const pool = regular.length ? regular : list;
    const local = pool.reduce((a, b) => (b.savedAt > a.savedAt ? b : a));
    rows.set(key, { key, name: local.worldName, local, cloud: null, gameTime: local.gameTime, savedAt: local.savedAt, cloudAhead: false });
  }
  for (const c of cloud) {
    const row = rows.get(c.key);
    if (!row) {
      rows.set(c.key, { key: c.key, name: c.name, local: null, cloud: c, gameTime: c.gameTime, savedAt: c.savedAt, cloudAhead: true });
      continue;
    }
    row.cloud = c;
    row.cloudAhead = c.gameTime > (row.local?.gameTime ?? -1);
    if (c.savedAt > row.savedAt) { row.savedAt = c.savedAt; row.gameTime = Math.max(row.gameTime, c.gameTime); }
  }
  return [...rows.values()].sort((a, b) => b.savedAt - a.savedAt);
}
