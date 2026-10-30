import { describe, expect, it } from 'vitest';
import type { CloudWorld } from '../cloud/sync';
import type { SaveMeta } from '../sim/save';
import { worldKeyOf, worldsOverview } from './worlds';

const meta = (slot: string, savedAt: number, gameTime: number, key?: string): SaveMeta => ({ slot, worldName: `W ${key ?? slot}`, gameTime, savedAt, version: 19, ...(key ? { key } : {}) });
const cloud = (slot: string, key: string, savedAt: number, gameTime: number): CloudWorld => ({ slot, key, name: `W ${key}`, savedAt, gameTime, version: 19, size: 1 });

describe('worlds overview', () => {
  it('reads the world from old slot names', () => {
    expect(worldKeyOf(meta('autosave:42', 1, 1))).toBe('42');
    expect(worldKeyOf(meta('handmatig:42', 1, 1))).toBe('42');
    expect(worldKeyOf(meta('backup:42:3', 1, 1))).toBe('42');
    expect(worldKeyOf(meta('update:42:v17', 1, 1))).toBe('42');
    expect(worldKeyOf(meta('geïmporteerd', 1, 1))).toBeNull();
    expect(worldKeyOf(meta('geïmporteerd', 1, 1, '7'))).toBe('7');
  });

  it('one row per world, newest regular save, backups only as a last resort', () => {
    const rows = worldsOverview([meta('autosave:1', 10, 100), meta('handmatig:1', 20, 90), meta('backup:1:1', 30, 80), meta('backup:2:1', 5, 50)], []);
    expect(rows.map((r) => r.key)).toEqual(['1', '2']);
    expect(rows[0]!.local!.slot).toBe('handmatig:1');
    expect(rows[1]!.local!.slot).toBe('backup:2:1');
  });

  it('matches cloud copies; cloud-only worlds; cloud ahead', () => {
    const rows = worldsOverview([meta('autosave:1', 10, 100), meta('autosave:2', 12, 300)], [cloud('1', '1', 50, 200), cloud('2', '2', 11, 300), cloud('3', '3', 1, 10)]);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by['1']!.cloudAhead).toBe(true);
    expect(by['2']!.cloudAhead).toBe(false);
    expect(by['3']!.local).toBeNull();
    expect(rows[0]!.key).toBe('1'); // newest copy first
  });
});
