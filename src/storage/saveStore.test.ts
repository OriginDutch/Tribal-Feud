import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { fromSaveData, toSaveData } from '../sim/save';
import { createWorld } from '../sim/state';
import { deleteSave, getSave, listSaves, putSave } from './saveStore';

describe('saveStore', () => {
  it('stores, lists, loads and deletes saves', async () => {
    const world = createWorld(createConfig('speed', 'Wereld A', 3));
    world.time = 12345;

    await putSave('manual', toSaveData(world, 1000));
    await putSave('autosave', toSaveData(world, 2000));

    const list = await listSaves();
    expect(list.map((s) => s.slot)).toEqual(['autosave', 'manual']);
    expect(list[0]?.worldName).toBe('Wereld A');
    expect(list[0]?.gameTime).toBe(12345);

    const loaded = fromSaveData(await getSave('manual'));
    expect(loaded).toEqual(world);

    await deleteSave('manual');
    expect((await listSaves()).map((s) => s.slot)).toEqual(['autosave']);
    expect(await getSave('manual')).toBeUndefined();
  });
});
