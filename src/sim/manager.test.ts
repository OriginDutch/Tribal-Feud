import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { HOUR, MINUTE } from '../shared/time';
import { deleteTemplate, saveTemplate, setManager } from './manager';
import { advance, setPaused } from './simulation';
import { createWorld, playerVillage, type WorldState } from './state';

function setup() {
  const s = createWorld(createConfig('classic', 'Manager', 51, { bots: { count: 0 } }));
  setPaused(s, false);
  const v = playerVillage(s);
  if (!v) throw new Error('no village');
  return { s, v };
}

function run(s: WorldState, ms: number): void {
  for (let left = ms; left > 0; left -= 10 * MINUTE) advance(s, Math.min(left, 10 * MINUTE));
}

describe('account manager', () => {
  it('a village follows its build template by itself', () => {
    const { s, v } = setup();
    v.res = [5000, 5000, 5000];
    expect(setManager(s, v.id, { template: 'preset:economy', troopShare: 0 })).toBeNull();
    expect(v.buildQueue.length).toBeGreaterThan(0);
    run(s, 12 * HOUR);
    expect(v.buildings.wood + v.buildings.stone + v.buildings.iron).toBeGreaterThan(9);
    expect(v.buildings.main).toBeGreaterThan(2);
  });

  it('keeps a troop target, researching what is needed', () => {
    const { s, v } = setup();
    Object.assign(v.buildings, { main: 10, barracks: 5, smith: 5, farm: 15, storage: 15 });
    v.res = [50000, 50000, 50000];
    expect(setManager(s, v.id, { troops: { spear: 40, axe: 20 }, troopShare: 1 })).toBeNull();
    run(s, 24 * HOUR);
    expect(v.units.spear).toBe(40);
    expect(v.units.axe).toBe(20);
  });

  it('stops when cleared; own templates can be saved and deleted', () => {
    const { s, v } = setup();
    v.res = [5000, 5000, 5000];
    expect(saveTemplate(s, { id: 'mine', name: 'Mijn pad', steps: [['wood', 3], ['stone', 3]] })).toBeNull();
    expect(saveTemplate(s, { id: 'preset:economy', name: 'x', steps: [['wood', 3]] })).toContain('kopie');
    expect(setManager(s, v.id, { template: 'mine', troopShare: 0 })).toBeNull();
    run(s, 6 * HOUR);
    expect(v.buildings.wood).toBe(3);
    expect(v.buildings.stone).toBe(3);
    expect(setManager(s, v.id, null)).toBeNull();
    expect(s.managerAt).toBeUndefined();
    expect(deleteTemplate(s, 'mine')).toBeNull();
    expect(s.templates).toEqual([]);
  });
});

describe('troop templates', () => {
  it('a village follows its troop template; deleting it leaves the numbers as its own', async () => {
    const { createConfig } = await import('../shared/config');
    const { createWorld, playerVillage } = await import('./state');
    const { saveTroopTemplate, deleteTroopTemplate, setManager, templateUse } = await import('./manager');
    const s = createWorld(createConfig('classic', 'TT', 9, { bots: { count: 0 }, map: { barbarianCount: 10 } } as never));
    const v = playerVillage(s)!;
    expect(saveTroopTemplate(s, { id: 'troops:1', name: 'Off', troops: { axe: 500, light: 100 } })).toBeNull();
    expect(saveTroopTemplate(s, { id: 'troops:2', name: 'Leeg', troops: {} })).toMatch(/minstens/);
    expect(setManager(s, v.id, { troopTemplate: 'troops:1', troopShare: 0.5 })).toBeNull();
    expect(templateUse(s)['troops:1']).toBe(1);
    expect(deleteTroopTemplate(s, 'troops:1')).toBeNull();
    expect(v.manager?.troopTemplate).toBeUndefined();
    expect(v.manager?.troops).toEqual({ axe: 500, light: 100 });
  });
});
