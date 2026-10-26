import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { HOUR, MINUTE, SECOND } from '../shared/time';
import { buildTimeMs, buildingCost, recruitTimeMs } from './formulas';
import { fromSaveData, toSaveData } from './save';
import { advance, setPaused, setSpeed } from './simulation';
import { createWorld, playerVillage, type WorldState } from './state';
import {
  cancelBuild,
  cancelRecruit,
  currentResources,
  isOperational,
  popUsed,
  queueBuild,
  queueDemolish,
  recruit,
  renameVillage,
  startResearch,
  type Village,
} from './village';

function setup(overrides = {}): { s: WorldState; v: Village } {
  const s = createWorld(createConfig('classic', 'Test', 1, overrides));
  setPaused(s, false);
  const v = playerVillage(s);
  if (!v) throw new Error('no village');
  return { s, v };
}

/** Runs game time forward by `ms` (speed 1, so real ms = game ms). */
function run(s: WorldState, ms: number): void {
  let left = ms;
  while (left > 0) {
    const step = Math.min(left, 10 * MINUTE);
    advance(s, step);
    left -= step;
  }
}

/** Gives the village plenty of resources and space for rule tests. */
function rich(v: Village, levels: Partial<Village['buildings']> = {}): void {
  Object.assign(v.buildings, { storage: 30, farm: 30 }, levels);
  v.res = [300000, 300000, 300000];
}

describe('new village', () => {
  it('starts with level 1 resource buildings, HQ, farm and storage, and 500 of each resource', () => {
    const { s, v } = setup();
    expect(v.buildings.main).toBe(1);
    expect(v.buildings.wood).toBe(1);
    expect(v.buildings.stone).toBe(1);
    expect(v.buildings.iron).toBe(1);
    expect(v.buildings.farm).toBe(1);
    expect(v.buildings.storage).toBe(1);
    expect(v.buildings.barracks).toBe(0);
    expect(currentResources(s.config, v, 0)).toEqual([500, 500, 500]);
    expect(v.researched.sort()).toEqual(['knight', 'snob', 'spear', 'sword']);
  });

  it('produces 30 per hour at level 1 (x10 by default) and stops at the storage cap', () => {
    const { s, v } = setup({ productionMultiplier: 1 });
    run(s, HOUR);
    expect(currentResources(s.config, v, s.time).map(Math.round)).toEqual([530, 530, 530]);
    const fast = setup();
    run(fast.s, HOUR);
    expect(currentResources(fast.s.config, fast.v, fast.s.time).map(Math.round)).toEqual([800, 800, 800]);
    run(s, 100 * HOUR);
    expect(currentResources(s.config, v, s.time)).toEqual([1000, 1000, 1000]);
  });
});

describe('building', () => {
  it('pays up front and finishes after the build time', () => {
    const { s, v } = setup();
    expect(queueBuild(s, v.id, 'wood')).toBeNull();
    const cost = buildingCost(s.config.buildings.wood, 2);
    expect(currentResources(s.config, v, s.time)).toEqual([500 - cost[0], 500 - cost[1], 500 - cost[2]]);
    const t = buildTimeMs(s.config, s.config.buildings.wood, 2, 1);
    run(s, t - SECOND);
    expect(v.buildings.wood).toBe(1);
    run(s, SECOND);
    expect(v.buildings.wood).toBe(2);
    expect(v.buildQueue).toHaveLength(0);
  });

  it('runs jobs one after another and caps the queue at 5', () => {
    const { s, v } = setup();
    rich(v);
    for (let i = 0; i < 5; i++) expect(queueBuild(s, v.id, 'wood')).toBeNull();
    expect(queueBuild(s, v.id, 'wood')).toBe('Bouwqueue is vol');
    expect(v.buildQueue.map((j) => j.level)).toEqual([2, 3, 4, 5, 6]);
    for (let i = 1; i < 5; i++) expect(v.buildQueue[i]?.start).toBe(v.buildQueue[i - 1]?.end);
    run(s, 10 * HOUR);
    expect(v.buildings.wood).toBe(6);
  });

  it('enforces requirements', () => {
    const { s, v } = setup();
    rich(v);
    expect(queueBuild(s, v.id, 'barracks')).toBe('Vereist: Hoofdgebouw 3');
    v.buildings.main = 3;
    expect(queueBuild(s, v.id, 'barracks')).toBeNull();
    expect(queueBuild(s, v.id, 'stable')).toMatch(/^Vereist: Hoofdgebouw 10, Kazerne 5, Smederij 5$/);
  });

  it('blocks on resources, storage size and farm space', () => {
    const { s, v } = setup();
    v.buildings.main = 20;
    v.buildings.smith = 20;
    v.buildings.market = 10;
    expect(queueBuild(s, v.id, 'snob')).toBe('Opslagplaats te klein');
    v.buildings.storage = 30;
    expect(queueBuild(s, v.id, 'snob')).toBe('Boerderij is vol');
    v.buildings.farm = 30;
    expect(queueBuild(s, v.id, 'snob')).toBe('Te weinig grondstoffen');
  });

  it('cancelling removes the highest queued level of that building and refunds 90% of it', () => {
    const { s, v } = setup();
    rich(v);
    queueBuild(s, v.id, 'wood'); // wood 2
    queueBuild(s, v.id, 'stone'); // stone 2
    queueBuild(s, v.id, 'wood'); // wood 3
    queueBuild(s, v.id, 'iron'); // iron 2
    const before = currentResources(s.config, v, s.time);
    const [wood2, stone2] = v.buildQueue;
    if (!wood2 || !stone2) throw new Error('queue');

    // clicking wood 2 cancels wood 3; wood 2 keeps running
    expect(cancelBuild(s, v.id, wood2.id)).toBeNull();
    expect(v.buildQueue.map((j) => `${j.building}${j.level}`)).toEqual(['wood2', 'stone2', 'iron2']);
    expect(v.buildQueue[2]?.start).toBe(stone2.end);

    const c3 = buildingCost(s.config.buildings.wood, 3);
    const after = currentResources(s.config, v, s.time);
    expect(after[0] - before[0]).toBe(Math.floor(c3[0] * 0.9));

    // cancelling the only wood level left: the queue moves up and starts now
    const stoneDuration = stone2.end - stone2.start;
    expect(cancelBuild(s, v.id, wood2.id)).toBeNull();
    expect(v.buildQueue.map((j) => `${j.building}${j.level}`)).toEqual(['stone2', 'iron2']);
    expect(v.buildQueue[0]?.start).toBe(s.time);
    expect(v.buildQueue[0]?.end).toBe(s.time + stoneDuration);

    run(s, 10 * HOUR); // stale events from the old schedule must not do anything
    expect(v.buildings.wood).toBe(1);
    expect(v.buildings.stone).toBe(2);
    expect(v.buildings.iron).toBe(2);
  });

  it('a finished HQ level speeds up the rest of the queue; new orders count queued HQ levels', () => {
    const { s, v } = setup();
    rich(v, { main: 5 });
    queueBuild(s, v.id, 'main'); // HQ 6
    queueBuild(s, v.id, 'wood'); // wood 2, after HQ 6
    const [hq, wood] = v.buildQueue;
    if (!hq || !wood) throw new Error('queue');
    expect(wood.end - wood.start).toBe(buildTimeMs(s.config, s.config.buildings.wood, 2, 6));

    // same, but ordered while HQ 6 is already running
    const { s: s2, v: v2 } = setup();
    rich(v2, { main: 5 });
    queueBuild(s2, v2.id, 'stone');
    queueBuild(s2, v2.id, 'main');
    const stone = v2.buildQueue[0];
    if (!stone) throw new Error('queue');
    run(s2, stone.end - s2.time);
    // HQ 6 now running; queue wood 2 behind it
    queueBuild(s2, v2.id, 'wood');
    const hqJob = v2.buildQueue[0];
    const woodJob = v2.buildQueue[1];
    if (!hqJob || !woodJob) throw new Error('queue');
    expect(woodJob.end - woodJob.start).toBe(buildTimeMs(s2.config, s2.config.buildings.wood, 2, 6));
    run(s2, hqJob.end - s2.time);
    expect(v2.buildings.main).toBe(6);
    expect(v2.buildQueue[0]?.end).toBe(s2.time + buildTimeMs(s2.config, s2.config.buildings.wood, 2, 6));
  });

  it('a finished HQ re-times jobs that were ordered at the old HQ speed', () => {
    const { s, v } = setup();
    rich(v, { main: 5 });
    queueBuild(s, v.id, 'main'); // HQ 6
    const hq = v.buildQueue[0];
    if (!hq) throw new Error('queue');
    queueBuild(s, v.id, 'wood');
    // simulate an old save where wood was timed at HQ 5
    const wood = v.buildQueue[1];
    if (!wood) throw new Error('queue');
    wood.end = wood.start + buildTimeMs(s.config, s.config.buildings.wood, 2, 5);
    run(s, hq.end - s.time);
    expect(v.buildQueue[0]?.end).toBe(s.time + buildTimeMs(s.config, s.config.buildings.wood, 2, 6));
    run(s, 10 * HOUR);
    expect(v.buildings.wood).toBe(2);
  });

  it('a higher HQ builds faster', () => {
    const { s, v } = setup();
    rich(v, { main: 20 });
    queueBuild(s, v.id, 'wood');
    expect(v.buildQueue[0]?.end).toBe(buildTimeMs(s.config, s.config.buildings.wood, 2, 20));
  });
});

describe('requirements that drop', () => {
  it('a building below its requirement stops working', () => {
    const { s, v } = setup();
    rich(v, { main: 10, barracks: 5, smith: 5, stable: 1 });
    expect(isOperational(s.config, v, 'stable')).toBe(true);
    v.researched.push('spy');
    expect(recruit(s, v.id, 'spy', 1)).toBeNull();
    v.buildings.smith = 4; // e.g. hit by catapults
    expect(isOperational(s.config, v, 'stable')).toBe(false);
    expect(recruit(s, v.id, 'spy', 1)).toBe('Stal werkt niet');
  });
});

describe('smithy and recruitment', () => {
  it('spears are available from the start; axes need research', () => {
    const { s, v } = setup();
    rich(v, { main: 5, barracks: 1 });
    expect(recruit(s, v.id, 'axe', 1)).toBe('Nog niet ontwikkeld in de smederij');
    expect(startResearch(s, v.id, 'axe')).toBe('Bouw eerst een smederij');
    v.buildings.smith = 1;
    expect(startResearch(s, v.id, 'axe')).toBe('Vereist: Smederij 2');
    v.buildings.smith = 2;
    expect(startResearch(s, v.id, 'axe')).toBeNull();
    expect(startResearch(s, v.id, 'light')).toBe('Smederij is al bezig');
    run(s, 2 * HOUR);
    expect(v.researched).toContain('axe');
    expect(recruit(s, v.id, 'axe', 3)).toBeNull();
  });

  it('recruits one unit at a time, at the building-level speed', () => {
    const { s, v } = setup();
    rich(v, { main: 3, barracks: 1 });
    expect(recruit(s, v.id, 'spear', 3)).toBeNull();
    const per = recruitTimeMs(s.config, s.config.units.spear, 1);
    run(s, per);
    expect(v.units.spear).toBe(1);
    run(s, 2 * per);
    expect(v.units.spear).toBe(3);
    expect(v.recruitQueues.barracks).toHaveLength(0);
  });

  it('a barracks upgrade speeds up every unit after the one in production', () => {
    const { s, v } = setup();
    rich(v, { main: 10, barracks: 1 });
    recruit(s, v.id, 'spear', 10);
    recruit(s, v.id, 'sword', 5);
    queueBuild(s, v.id, 'barracks'); // barracks 2
    const build = v.buildQueue[0];
    if (!build) throw new Error('queue');
    const slow = recruitTimeMs(s.config, s.config.units.spear, 1);
    const fast = recruitTimeMs(s.config, s.config.units.spear, 2);
    const fastSword = recruitTimeMs(s.config, s.config.units.sword, 2);
    run(s, build.end - s.time);
    expect(v.buildings.barracks).toBe(2);
    const spears = v.recruitQueues.barracks[0];
    const swords = v.recruitQueues.barracks[1];
    if (!spears || !swords) throw new Error('queue');
    const left = spears.total - spears.done;
    // the spear in production keeps its time, the rest is faster
    expect(spears.nextAt - s.time).toBeLessThanOrEqual(slow);
    const spearsEnd = spears.nextAt + (left - 1) * fast;
    expect(swords.nextAt).toBe(spearsEnd + fastSword);
    run(s, swords.nextAt + 4 * fastSword - s.time);
    expect(v.units.spear).toBe(10);
    expect(v.units.sword).toBe(5);
    run(s, 10 * HOUR); // no double units from stale events
    expect(v.units.sword).toBe(5);
  });

  it('batches in the same building run after each other; cancelling refunds the rest', () => {
    const { s, v } = setup();
    rich(v, { main: 3, barracks: 1 });
    recruit(s, v.id, 'spear', 2);
    recruit(s, v.id, 'sword', 2);
    const per = recruitTimeMs(s.config, s.config.units.spear, 1);
    run(s, per); // 1 spear done
    const firstJob = v.recruitQueues.barracks[0];
    if (!firstJob) throw new Error('job');
    const before = currentResources(s.config, v, s.time);
    expect(cancelRecruit(s, v.id, firstJob.id)).toBeNull();
    const after = currentResources(s.config, v, s.time);
    expect(after[0] - before[0]).toBe(Math.floor(50 * 1 * 0.9));
    run(s, 10 * HOUR);
    expect(v.units.spear).toBe(1);
    expect(v.units.sword).toBe(2);
  });

  it('respects farm space and the one-paladin limit', () => {
    const { s, v } = setup();
    v.buildings.statue = 1;
    v.res = [1000, 1000, 1000];
    expect(recruit(s, v.id, 'knight', 2)).toBe('Maximaal 1 mogelijk');
    expect(recruit(s, v.id, 'knight', 1)).toBeNull();
    expect(recruit(s, v.id, 'knight', 1)).toBe('Je hebt al een paladijn');

    const t = setup();
    t.v.buildings.main = 3;
    t.v.buildings.barracks = 1;
    t.v.buildings.storage = 30;
    t.v.res = [100000, 100000, 100000];
    // farm level 1 = 240 space; buildings already use some
    expect(recruit(t.s, t.v.id, 'spear', 240)).toMatch(/^Maximaal \d+ mogelijk$/);
  });

  it('a nobleman needs a coin', () => {
    const { s, v } = setup();
    rich(v, { main: 20, smith: 20, market: 10, snob: 1 });
    expect(recruit(s, v.id, 'snob', 1)).toBe('Meer munten nodig');
  });
});

describe('saves', () => {
  it('a save with running queues continues exactly like the original', () => {
    const { s: a, v } = setup();
    setSpeed(a, 10);
    rich(v, { main: 3, barracks: 1 });
    queueBuild(a, v.id, 'wood');
    queueBuild(a, v.id, 'main');
    recruit(a, v.id, 'spear', 20);
    run(a, 2 * MINUTE);

    const b = fromSaveData(JSON.parse(JSON.stringify(toSaveData(a, 0))));
    run(a, 3 * HOUR);
    run(b, 3 * HOUR);
    expect(b).toEqual(a);
    expect(playerVillage(b)?.units.spear).toBe(20);
  });

  it('migrates a phase-2 save without changing its speed', () => {
    const { s } = setup();
    const old = JSON.parse(JSON.stringify(toSaveData(s, 0)));
    old.version = 2;
    delete old.state.config.productionMultiplier;
    delete old.state.config.buildSpeed;
    delete old.state.config.recruitSpeed;
    const migrated = fromSaveData(old);
    expect(migrated.config.productionMultiplier).toBe(1);
    expect(migrated.config.buildSpeed).toBe(1);
  });

  it('migrates a phase-1 save', () => {
    const { s } = setup();
    const old = JSON.parse(JSON.stringify(toSaveData(s, 0)));
    old.version = 1;
    delete old.state.players;
    delete old.state.villages;
    delete old.state.nextId;
    delete old.state.config.buildings;
    delete old.state.config.units;
    delete old.state.config.village;
    const migrated = fromSaveData(old);
    expect(playerVillage(migrated)?.buildings.wood).toBe(1);
    expect(migrated.config.buildings.main.maxLevel).toBe(30);
  });
});

describe('demolishing and renaming', () => {
  it('tears down one level from HQ 15, costs nothing, frees farm space when done', () => {
    const { s, v } = setup();
    rich(v, { main: 14, barracks: 10 });
    v.resAt = s.time;
    expect(queueDemolish(s, v.id, 'barracks')).toBe('Hoofdgebouw 15 nodig');
    v.buildings.main = 15;
    const res = currentResources(s.config, v, s.time);
    const pop = popUsed(s.config, v);
    expect(queueDemolish(s, v.id, 'barracks')).toBeNull();
    expect(currentResources(s.config, v, s.time)).toEqual(res);
    expect(popUsed(s.config, v)).toBe(pop); // still standing
    const job = v.buildQueue[0];
    if (!job) throw new Error('no job');
    expect(job.end - job.start).toBe(buildTimeMs(s.config, s.config.buildings.barracks, 10, 15));
    run(s, job.end - s.time);
    expect(v.buildings.barracks).toBe(9);
    expect(popUsed(s.config, v)).toBeLessThan(pop);
  });

  it('build and demolish jobs chain: the last queued job sets the planned level', () => {
    const { s, v } = setup();
    rich(v, { main: 20, wood: 5 });
    v.resAt = s.time;
    expect(queueBuild(s, v.id, 'wood')).toBeNull(); // 6
    expect(queueDemolish(s, v.id, 'wood')).toBeNull(); // back to 5
    expect(queueDemolish(s, v.id, 'wood')).toBeNull(); // 4
    run(s, 6 * HOUR);
    expect(v.buildings.wood).toBe(4);
  });

  it('the HQ cannot go below its minimum, recruit buildings not to 0 while recruiting', () => {
    const { s, v } = setup();
    rich(v, { main: 15, barracks: 1 });
    v.resAt = s.time;
    expect(recruit(s, v.id, 'spear', 5)).toBeNull();
    expect(queueDemolish(s, v.id, 'barracks')).toBe('Rekruteren loopt nog');
    v.buildings.main = 1;
    expect(queueDemolish(s, v.id, 'main')).not.toBeNull();
  });

  it('renames with trimmed names up to 32 characters', () => {
    const { s, v } = setup();
    expect(renameVillage(s, v.id, '   ')).not.toBeNull();
    expect(renameVillage(s, v.id, 'x'.repeat(33))).not.toBeNull();
    expect(renameVillage(s, v.id, '  Fort   Kakkerlak ')).toBeNull();
    expect(v.name).toBe('Fort Kakkerlak');
  });
});

describe('population fun option', () => {
  it('farm × 2 doubles the population limit, buildings keep their workers', async () => {
    const { createConfig } = await import('../shared/config');
    const { createWorld, playerVillage } = await import('./state');
    const { popMax } = await import('./village');
    const one = createWorld(createConfig('classic', 'F', 4, { bots: { count: 0 }, map: { barbarianCount: 5 } } as never));
    const two = createWorld(createConfig('classic', 'F', 4, { farmMultiplier: 2, bots: { count: 0 }, map: { barbarianCount: 5 } } as never));
    const a = playerVillage(one)!, b = playerVillage(two)!;
    a.buildings.farm = 30; b.buildings.farm = 30;
    expect(popMax(one.config, a)).toBe(24000);
    expect(popMax(two.config, b)).toBe(48000);
  });
});
