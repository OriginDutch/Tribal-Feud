import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { farmAll, planFarmAll, type FarmAllOptions } from './farmAll';
import { distance, sendAttack } from './movement';
import { BARBARIAN, createWorld, playerVillage } from './state';

const opts = (o: Partial<FarmAllOptions> = {}): FarmAllOptions => ({ template: 'A', skipLost: true, maxWall: null, maxDistance: null, ...o });

function setup() {
  const s = createWorld(createConfig('classic', 'F', 4, { bots: { count: 0 } } as never));
  const v = playerVillage(s)!;
  v.buildings.place = 1;
  s.farmTemplates.A = { light: 5 };
  v.units.light = 15; // three attacks
  const barbs = Object.values(s.villages).filter((x) => x.owner === BARBARIAN).sort((a, b) => distance(v, a) - distance(v, b));
  return { s, v, barbs };
}

describe('farm alles', () => {
  it('nearest barbarians first, one attack each, until the troops run out', () => {
    const { s, barbs } = setup();
    const plan = planFarmAll(s, opts());
    expect(plan.sends.map((x) => x.to)).toEqual(barbs.slice(0, 3).map((b) => b.id));
    expect(plan.able).toBe(1);
    expect(plan.left).toBeGreaterThan(0);
  });

  it('skips targets already under attack, lost ones and high walls', () => {
    const { s, v, barbs } = setup();
    v.units.light = 20;
    expect(sendAttack(s, v.id, barbs[0]!.id, { light: 5 })).toBeNull();
    s.lastAttack[barbs[1]!.id] = { time: 0, result: 'loss', loot: 0 } as never;
    s.intel[barbs[2]!.id] = { wall: 5 };
    const plan = planFarmAll(s, opts({ maxWall: 2 }));
    expect(plan.skipped).toMatchObject({ busy: 1, lost: 1, wall: 1 });
    expect(plan.sends.map((x) => x.to)).toEqual(barbs.slice(3, 6).map((b) => b.id));
  });

  it('warns when the template does not fit, and sends the plan', () => {
    const { s, v } = setup();
    v.units.light = 3;
    expect(planFarmAll(s, opts()).able).toBe(0);
    v.units.light = 10;
    expect(farmAll(s, opts()).sent).toBe(2);
    expect(v.units.light).toBe(0);
  });

  it('any letter A to J works; a missing letter sends nothing; * goes by the scouted loot', async () => {
    const { definedLetters } = await import('../shared/farmTemplates');
    const { s, v, barbs } = setup();
    s.farmTemplates.G = { light: 3 };
    expect(definedLetters(s.farmTemplates)).toEqual(['A', 'B', 'G']);
    expect(planFarmAll(s, opts({ template: 'G' })).sends.length).toBe(5);
    expect(planFarmAll(s, opts({ template: 'E' })).sends.length).toBe(0);
    s.intel[barbs[0]!.id] = { scouted: [400, 400, 400] } as never;
    const star = planFarmAll(s, opts({ template: '*' }));
    expect(star.skipped.noScout).toBeGreaterThan(0);
    void v;
  });

  it('auto-farm runs farm alles every little while until switched off', async () => {
    const { setAutoFarm, autoFarmInterval } = await import('./farmAll');
    const { advance } = await import('./simulation');
    const { s, v } = setup();
    s.config.unitSpeed = 50;
    v.units.light = 10; // two attacks per round
    s.paused = false;
    setAutoFarm(s, opts());
    advance(s, 1);
    expect(s.autoFarm?.last?.sent).toBe(2);
    // after the troops are back, the next round goes again
    advance(s, 3 * autoFarmInterval(s));
    const out = Object.values(s.movements).filter((m) => m.kind === 'attack').length;
    expect(s.autoFarm?.last?.time).toBeGreaterThan(0);
    expect(out + (s.autoFarm?.last?.sent ?? 0)).toBeGreaterThan(0);
    setAutoFarm(s, null);
    const queued = s.queue.heap.filter((e) => e.event.kind === 'autoFarm').length;
    advance(s, 3 * autoFarmInterval(s));
    expect(s.autoFarm).toBeUndefined();
    expect(queued).toBeLessThanOrEqual(1);
  });

  it('auto-farm reports come in read, and have their own limit', async () => {
    const { setAutoFarm } = await import('./farmAll');
    const { advance } = await import('./simulation');
    const { addReport, MAX_AUTO_REPORTS, MAX_REPORTS } = await import('./movement');
    const { s, v } = setup();
    s.config.unitSpeed = 50;
    v.units.light = 10;
    s.paused = false;
    setAutoFarm(s, opts());
    advance(s, 60 * 60_000);
    const auto = s.reports.filter((r) => r.auto);
    expect(auto.length).toBeGreaterThan(0);
    expect(auto.every((r) => r.read)).toBe(true);
    // a flood of auto reports never pushes out the others
    s.reports = [];
    for (let i = 0; i < 50; i++) addReport(s, { id: 1e6 + i, time: i, read: true } as never);
    for (let i = 0; i < MAX_AUTO_REPORTS + 100; i++) addReport(s, { id: 2e6 + i, time: i, read: true, auto: true } as never);
    expect(s.reports.filter((r) => !r.auto)).toHaveLength(50);
    expect(s.reports.filter((r) => r.auto)).toHaveLength(MAX_AUTO_REPORTS);
    expect(s.reports.find((r) => r.auto)!.id).toBe(2e6 + 100);
    for (let i = 0; i < MAX_REPORTS + 10; i++) addReport(s, { id: 3e6 + i, time: i, read: true } as never);
    expect(s.reports.filter((r) => !r.auto)).toHaveLength(MAX_REPORTS);
    expect(s.reports.filter((r) => r.auto)).toHaveLength(MAX_AUTO_REPORTS);
  });
});

describe('farm runs are marked by how they were sent', () => {
  it('farm all marks them; an attack by hand on barbarians is a normal attack (with a sound)', async () => {
    const { reportSound } = await import('../shared/reportOutcome');
    const { s, v, barbs } = setup();
    v.units.light = 20;
    expect(farmAll(s, opts()).sent).toBeGreaterThan(0);
    const farm = Object.values(s.movements).filter((m) => m.kind === 'attack');
    expect(farm.every((m) => m.farm === true)).toBe(true);
    v.units.axe = 1;
    expect(sendAttack(s, v.id, barbs[10]!.id, { axe: 1 })).toBeNull();
    const byHand = Object.values(s.movements).find((m) => m.to === barbs[10]!.id)!;
    expect(byHand.farm).toBe(false);
    s.sfx = [];
    expect(reportSound({ id: 1, time: 0, read: false, luck: 0, morale: 1, result: 'win', farm: false, attacker: { id: v.id, name: '', x: 0, y: 0, ownerName: '', owner: 0 }, defender: { id: 1, name: '', x: 0, y: 0, ownerName: '', owner: -1 }, attackerUnits: { sent: { axe: 1 }, lost: {} }, defenderUnits: null })).toBe('battle-won');
  });
});

describe('farm templates with "Meldingen tonen"', () => {
  it('their runs stay normal attacks for you (also with auto-farm), with the march', () => {
    const { s, v } = setup();
    v.units.light = 20;
    s.farmNotify = ['A'];
    s.sfx = [];
    expect(farmAll(s, opts(), true).sent).toBeGreaterThan(0);
    const sent = Object.values(s.movements).filter((m) => m.kind === 'attack');
    expect(sent.every((m) => m.farm === false && !m.auto)).toBe(true);
    expect(s.sfx).toContain('march');
  });
});
