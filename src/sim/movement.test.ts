import { describe, expect, it } from 'vitest';
import { createConfig, type ConfigOverrides } from '../shared/config';
import { HOUR, MINUTE } from '../shared/time';
import { growBarbarian, growthIntervalMs, villagePoints } from './barbarians';
import { cancelMovement, distance, plunder, sendAttack, sendNobleTrain, travelTimeMs } from './movement';
import { sendResources } from './market';
import { HUMAN_ID } from './state';
import { currentResources } from './village';
import { fromSaveData, toSaveData } from './save';
import { advance, setPaused } from './simulation';
import { BARBARIAN, createWorld, playerVillage, type WorldState } from './state';
import type { Village } from './village';

function setup(overrides: ConfigOverrides = {}) {
  const s = createWorld(createConfig('classic', 'Test', 3, { luck: false, ...overrides }));
  setPaused(s, false);
  const v = playerVillage(s);
  if (!v) throw new Error('no village');
  return { s, v };
}

function run(s: WorldState, ms: number): void {
  let left = ms;
  while (left > 0) {
    const step = Math.min(left, 10 * MINUTE);
    advance(s, step);
    left -= step;
  }
}

function nearestBarbarian(s: WorldState, v: Village): Village {
  const barbs = Object.values(s.villages).filter((x) => x.owner === BARBARIAN);
  barbs.sort((a, b) => distance(a, v) - distance(b, v));
  const b = barbs[0];
  if (!b) throw new Error('no barbarians');
  return b;
}

describe('map', () => {
  it('has the player, ~200 bots and ~3000 barbarians on unique fields', () => {
    const { s } = setup();
    const villages = Object.values(s.villages);
    expect(villages.filter((x) => x.owner === BARBARIAN)).toHaveLength(3000);
    expect(s.players.filter((p) => p.isBot)).toHaveLength(200);
    expect(new Set(villages.map((x) => `${x.x}|${x.y}`)).size).toBe(villages.length);
    for (const x of villages) {
      expect(x.x).toBeGreaterThanOrEqual(0);
      expect(x.x).toBeLessThanOrEqual(999);
    }
  });

  it('is the same for the same seed', () => {
    const a = setup().s;
    const b = setup().s;
    expect(Object.values(a.villages).map((x) => `${x.x}|${x.y}|${x.owner}`)).toEqual(
      Object.values(b.villages).map((x) => `${x.x}|${x.y}|${x.owner}`),
    );
  });

  it('barbarians start between 30 and 300 points (give or take one building level)', () => {
    const { s } = setup();
    const points = Object.values(s.villages)
      .filter((x) => x.owner === BARBARIAN)
      .map((x) => villagePoints(s.config, x));
    expect(Math.min(...points)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...points)).toBeLessThan(400);
  });
});

describe('barbarian growth', () => {
  it('grows lazily, the same no matter how often it is caught up, up to the cap', () => {
    const a = setup({ barbarians: { growthCap: 600 } });
    const b = setup({ barbarians: { growthCap: 600 } });
    const va = nearestBarbarian(a.s, a.v);
    const vb = nearestBarbarian(b.s, b.v);
    const t = 50 * growthIntervalMs(a.s.config);
    for (let i = 1; i <= 10; i++) growBarbarian(a.s, va, (t * i) / 10);
    growBarbarian(b.s, vb, t);
    expect(va.buildings).toEqual(vb.buildings);
    growBarbarian(a.s, va, 10000 * growthIntervalMs(a.s.config));
    const p = villagePoints(a.s.config, va);
    expect(p).toBeGreaterThanOrEqual(600);
    expect(p).toBeLessThan(800);
  });
});

describe('attacks', () => {
  it('travel time follows the slowest unit', () => {
    const { s } = setup();
    expect(travelTimeMs(s, { light: 1 }, 10)).toBe(10 * 10 * MINUTE);
    expect(travelTimeMs(s, { light: 1, ram: 1 }, 10)).toBe(10 * 30 * MINUTE);
    const fast = setup({ marchSpeed: 2 });
    expect(travelTimeMs(fast.s, { light: 1 }, 10)).toBe(5 * 10 * MINUTE);
  });

  it('needs a rally point and enough troops', () => {
    const { s, v } = setup();
    const target = nearestBarbarian(s, v);
    expect(sendAttack(s, v.id, target.id, { axe: 5 })).toBe('Niet genoeg bijlstrijder in het dorp.');
    v.buildings.place = 0;
    v.units.axe = 5;
    expect(sendAttack(s, v.id, target.id, { axe: 5 })).toBe('Je hebt een werkende verzamelplaats nodig.');
  });

  it('farms a barbarian: win, loot within carry, troops come home with the loot', () => {
    const { s, v } = setup();
    v.units.light = 20;
    v.buildings.storage = 20;
    const target = nearestBarbarian(s, v);
    target.res = [5000, 5000, 5000];
    target.resAt = s.time;
    const out = travelTimeMs(s, { light: 1 }, distance(v, target));
    expect(sendAttack(s, v.id, target.id, { light: 20 })).toBeNull();
    expect(v.units.light).toBe(0);
    expect(v.outside.light).toBe(20);

    run(s, out);
    const report = s.reports.at(-1);
    expect(report?.result).toBe('win');
    const loot = report?.loot ?? [0, 0, 0];
    expect(loot[0] + loot[1] + loot[2]).toBe(20 * 80);
    expect(s.lastAttack[target.id]).toEqual({ time: report?.time, result: 'win', loot: 20 * 80 });

    const before = v.res[0];
    run(s, out);
    expect(v.units.light).toBe(20);
    expect(v.outside.light).toBe(0);
    expect(v.res[0]).toBeGreaterThanOrEqual(before + loot[0]);
  });

  it('a lost attack kills everyone and tells nothing about the defender', () => {
    const { s, v } = setup();
    v.units.spear = 1;
    const target = nearestBarbarian(s, v);
    target.buildings.wall = 5;
    sendAttack(s, v.id, target.id, { spear: 1 });
    run(s, 10 * HOUR);
    const report = s.reports.at(-1);
    expect(report?.result).toBe('loss');
    expect(report?.defenderUnits).toBeNull();
    expect(v.outside.spear).toBe(0);
    expect(v.units.spear).toBe(0);
  });

  it('spies report resources, buildings and troops', () => {
    const { s, v } = setup();
    v.units.spy = 3;
    const target = nearestBarbarian(s, v);
    sendAttack(s, v.id, target.id, { spy: 3 });
    run(s, 10 * HOUR);
    const report = s.reports.at(-1);
    expect(report?.scouted?.buildings.main).toBeGreaterThanOrEqual(1);
    expect(v.units.spy).toBe(3);
  });

  it('a save with troops on the road continues exactly like the original', () => {
    const { s: a, v } = setup();
    v.units.light = 10;
    const target = nearestBarbarian(a, v);
    sendAttack(a, v.id, target.id, { light: 10 });
    run(a, 5 * MINUTE);
    const b = fromSaveData(JSON.parse(JSON.stringify(toSaveData(a, 0))));
    run(a, 10 * HOUR);
    run(b, 10 * HOUR);
    expect(b).toEqual(a);
  });
});

describe('plunder', () => {
  it('spreads evenly and gives leftovers to what is still there', () => {
    expect(plunder([1000, 1000, 1000], 300)).toEqual([100, 100, 100]);
    expect(plunder([0, 1000, 1000], 300)).toEqual([0, 150, 150]);
    expect(plunder([50, 1000, 1000], 300)).toEqual([50, 125, 125]);
    expect(plunder([10, 10, 10], 300)).toEqual([10, 10, 10]);
  });
});

describe('cancelling commands', () => {
  it('an attack turns around within 10 minutes and is home after the time it walked', () => {
    const { s, v } = setup();
    v.units.axe = 100;
    const b = nearestBarbarian(s, v);
    expect(sendAttack(s, v.id, b.id, { axe: 100 })).toBeNull();
    const id = Number(Object.keys(s.movements)[0]);
    run(s, 4 * MINUTE);
    expect(cancelMovement(s, id, HUMAN_ID)).toBeNull();
    expect(v.units.axe).toBe(0);
    run(s, 4 * MINUTE + 1);
    expect(v.units.axe).toBe(100);
    expect(v.outside.axe).toBe(0);
    expect(s.reports).toHaveLength(0);
  });

  it('not after 10 minutes, and not by someone else', () => {
    const { s, v } = setup();
    v.units.spear = 10;
    const far = Object.values(s.villages)
      .filter((x) => x.owner === BARBARIAN)
      .sort((a, c) => distance(c, v) - distance(a, v))[0];
    if (!far) throw new Error('no barb');
    expect(sendAttack(s, v.id, far.id, { spear: 10 })).toBeNull();
    const id = Number(Object.keys(s.movements)[0]);
    expect(cancelMovement(s, id, 1)).not.toBeNull();
    run(s, 11 * MINUTE);
    expect(cancelMovement(s, id, HUMAN_ID)).toBe('Annuleren kan alleen in de eerste 10 minuten.');
  });

  it('a noble train comes back as a whole', () => {
    const { s, v } = setup();
    Object.assign(v.buildings, { main: 20, smith: 20, snob: 1, place: 1 });
    v.units.snob = 2;
    v.units.axe = 400;
    const b = nearestBarbarian(s, v);
    expect(sendNobleTrain(s, v.id, b.id, { axe: 200 }, [{ axe: 200 }])).toBeNull();
    const ids = Object.keys(s.movements).map(Number);
    expect(ids).toHaveLength(2);
    run(s, MINUTE);
    expect(cancelMovement(s, ids[1]!, HUMAN_ID)).toBeNull();
    expect(Object.values(s.movements).every((m) => m.kind === 'return')).toBe(true);
    run(s, 2 * MINUTE);
    expect(v.units.snob).toBe(2);
    expect(v.units.axe).toBe(400);
  });

  it('merchants bring their load back in full', () => {
    const { s, v } = setup();
    Object.assign(v.buildings, { main: 5, storage: 15, market: 5 });
    v.res = [5000, 5000, 5000];
    v.resAt = s.time;
    const w = Object.values(s.villages).find((x) => x.owner !== HUMAN_ID && x.owner !== BARBARIAN);
    if (!w) throw new Error('no bot');
    expect(sendResources(s, v.id, w.id, [3000, 0, 0])).toBeNull();
    const id = Number(Object.keys(s.movements).find((k) => s.movements[Number(k)]?.kind === 'trade'));
    run(s, 2 * MINUTE);
    expect(cancelMovement(s, id, HUMAN_ID)).toBeNull();
    run(s, 2 * MINUTE + 1);
    expect(currentResources(s.config, v, s.time)[0]).toBeGreaterThanOrEqual(5000);
  });
});
