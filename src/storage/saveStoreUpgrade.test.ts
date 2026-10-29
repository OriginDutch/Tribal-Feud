import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { toSaveData } from '../sim/save';
import { createWorld } from '../sim/state';

/** An old (version 1) database: one store, the save stored as an object. */
function oldDb(records: object[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('tribal-feud', 1);
    open.onupgradeneeded = () => {
      const store = open.result.createObjectStore('saves', { keyPath: 'slot' });
      for (const r of records) store.put(r);
    };
    open.onsuccess = () => { open.result.close(); resolve(); };
    open.onerror = () => reject(open.error);
  });
}

describe('saveStore upgrade', () => {
  it('lists and loads saves from before the meta store, and new saves are stored as text', async () => {
    const world = createWorld(createConfig('speed', 'Oud', 3, { bots: { count: 2 } }));
    world.time = 777;
    const data = toSaveData(world, 500);
    await oldDb([{ slot: 'oud', worldName: 'Oud', gameTime: 777, savedAt: 500, version: data.version, data }]);

    const { getSave, listSaves, putSave, deleteSave } = await import('./saveStore');
    expect(await listSaves()).toEqual([{ slot: 'oud', worldName: 'Oud', gameTime: 777, savedAt: 500, version: data.version }]);
    expect((await getSave('oud'))?.state.time).toBe(777);

    world.time = 999;
    await putSave('nieuw', toSaveData(world, 600, false));
    world.time = 1234; // changing the live world after saving doesn't touch the save
    expect((await getSave('nieuw'))?.state.time).toBe(999);
    expect((await listSaves()).map((s) => s.slot)).toEqual(['nieuw', 'oud']);

    await deleteSave('oud');
    expect((await listSaves()).map((s) => s.slot)).toEqual(['nieuw']);
  });
});
