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
});
