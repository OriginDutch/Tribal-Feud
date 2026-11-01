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

  it('units from the same building grow together, not first all spears and then all swords', () => {
    const { s, v } = setup();
    Object.assign(v.buildings, { main: 20, barracks: 20, smith: 20, farm: 30, storage: 30, wood: 30, stone: 30, iron: 30 });
    v.researched.push('sword');
    v.res = [400000, 400000, 400000];
    expect(setManager(s, v.id, { troops: { spear: 3000, sword: 1500 }, troopShare: 1 })).toBeNull();
    run(s, 6 * HOUR);
    const spear = v.units.spear, sword = v.units.sword;
    expect(spear).toBeLessThan(3000); // still on the way
    expect(spear).toBeGreaterThan(0);
    expect(sword).toBeGreaterThan(0);
    // both about the same share of their target on the way there
    expect(Math.abs(spear / 3000 - sword / 1500)).toBeLessThan(0.25);
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

describe('account manager: churches, research levels, flags', () => {
  it('builds a church without faith, raises research levels and hangs the chosen flag', () => {
    const s = createWorld(createConfig('classic', 'MX', 52, { churches: true, flags: true, research: 'levels3', bots: { count: 0 } } as never));
    setPaused(s, false);
    const v = playerVillage(s)!;
    v.buildings.church_f = 0; // no faith
    Object.assign(v.buildings, { main: 20, farm: 30, storage: 30, smith: 15, barracks: 10, wood: 30, stone: 30, iron: 30 });
    v.res = [300000, 300000, 300000];
    v.resAt = s.time;
    s.players[0]!.flags = { have: { res: [0, 0, 1, 0, 0, 0, 0, 0, 0], recruit: Array(9).fill(0), attack: Array(9).fill(0), defense: Array(9).fill(0), luck: Array(9).fill(0), pop: Array(9).fill(0), coin: Array(9).fill(0), haul: Array(9).fill(0) }, kills: 0 };
    expect(setManager(s, v.id, { troopShare: 0, troops: { spear: 10 }, church: true, research: true, flag: 'res' })).toBeNull();
    expect(v.buildQueue.some((j) => j.building === 'church_f')).toBe(true);
    expect(v.research?.unit).toBe('spear');
    expect(v.flag).toEqual({ type: 'res', level: 3 });
  });
});

describe('account manager: a full storage it cannot raise', () => {
  it('builds the next affordable step instead of waiting for a storage it cannot pay', async () => {
    const { manageVillage } = await import('./manager');
    const s = createWorld(createConfig('classic', 'M', 9, { bots: { count: 0 } } as never));
    const v = playerVillage(s)!;
    Object.assign(v.buildings, { main: 16, wood: 29, stone: 30, iron: 20, storage: 29, farm: 20, barracks: 10, smith: 5 });
    const cap = 325337;
    v.res = [cap, cap, 5450];
    v.resAt = s.time;
    expect(saveTemplate(s, { id: 'own:t', name: 'T', steps: [['main', 20]] })).toBeNull();
    v.manager = { template: 'own:t' } as never;
    manageVillage(s, v, v.manager!);
    expect(v.buildQueue.map((j) => j.building)).toContain('main');
  });
});

describe('own templates that tear down', () => {
  it('when every step is there: one level at a time off what stands higher; not the farm, not what the template does not name', () => {
    const { s, v } = setup();
    Object.assign(v.buildings, { main: 20, barracks: 25, farm: 20, wall: 15, market: 10, smith: 5 });
    const steps: [import('../shared/gameData').BuildingId, number][] = [['main', 20], ['barracks', 10], ['farm', 5], ['wall', 20], ['smith', 5]];
    expect(saveTemplate(s, { id: 'own:off', name: 'Off', steps, demolish: true })).toBeNull();
    // not done yet (the wall is short): nothing comes off
    expect(setManager(s, v.id, { template: 'own:off', troopShare: 0 })).toBeNull();
    expect(v.buildQueue.some((j) => j.demolish)).toBe(false);
    v.buildings.wall = 20;
    v.buildQueue = [];
    setManager(s, v.id, { template: 'own:off', troopShare: 0 });
    const jobs = v.buildQueue.filter((j) => j.demolish);
    expect(jobs.map((j) => j.building)).toEqual(['barracks']);
    expect(jobs[0]!.level).toBe(24);
    run(s, 40 * 24 * HOUR);
    expect(v.buildings.barracks).toBe(10);
    expect(v.buildings.farm).toBeGreaterThanOrEqual(20);
    expect(v.buildings.market).toBe(10);
  });
});
