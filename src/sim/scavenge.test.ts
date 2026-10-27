import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DEFAULT_SCAV_TEMPLATE, planScav, previewScav } from '../shared/scavenge';
import { HOUR, MINUTE } from '../shared/time';
import { advance, setPaused } from './simulation';
import { createWorld, playerVillage, type WorldState } from './state';
import { planFor, scavOf, scavParams, sendScavenge } from './scavenge';

function setup() {
  const s = createWorld(createConfig('classic', 'R', 9, { bots: { count: 0 }, luck: false } as never));
  setPaused(s, false);
  const v = playerVillage(s)!;
  v.buildings.place = 1;
  v.buildings.storage = 30;
  v.res = [0, 0, 0];
  return { s, v };
}
const run = (s: WorldState, ms: number) => { for (let left = ms; left > 0; left -= 10 * MINUTE) advance(s, Math.min(left, 10 * MINUTE)); };

describe('rooftocht', () => {
  it('a safe run comes back whole with resources and opens the next level', () => {
    const { s, v } = setup();
    v.units.axe = 100; // 4000 attack, safe for level 1
    expect(sendScavenge(s, v.id, 1, { axe: 10 })).toMatch(/veilig/);
    expect(sendScavenge(s, v.id, 0, { axe: 100 })).toBeNull();
    expect(v.units.axe).toBe(0);
    expect(v.outside.axe).toBe(100);
    expect(sendScavenge(s, v.id, 0, { axe: 1 })).toMatch(/onderweg|weinig/);
    const before = v.res[0];
    run(s, 24 * HOUR);
    expect(v.units.axe).toBe(100);
    expect(v.outside.axe).toBe(0);
    expect(v.res[0]).toBeGreaterThan(before);
    expect(scavOf(v).unlocked).toBe(1);
  });

  it('too weak: troops die and the haul is smaller', () => {
    const { s, v } = setup();
    v.units.spear = 1000;
    scavOf(v).unlocked = 3;
    const p = previewScav(scavParams(s), 3, { spear: 100 }); // 1000 of 8000
    expect(p.ratio).toBeCloseTo(0.125);
    expect(p.lossShare).toBeCloseTo(0.175);
    expect(p.loot).toBeLessThan(previewScav({ ...scavParams(s) }, 3, { axe: 250 }).loot);
    expect(sendScavenge(s, v.id, 3, { spear: 100 })).toBeNull();
    run(s, 48 * HOUR);
    expect(v.units.spear).toBeLessThan(1000);
    expect(v.units.spear).toBeGreaterThan(950);
    expect(scavOf(v).unlocked).toBe(3);
  });

  it('repeat sends the survivors out again', () => {
    const { s, v } = setup();
    v.units.axe = 50;
    scavOf(v).repeat = true;
    sendScavenge(s, v.id, 0, { axe: 50 });
    run(s, 24 * HOUR);
    expect(scavOf(v).runs).toHaveLength(1);
    expect(v.outside.axe).toBe(50);
  });

  it('the plan splits for equal time and safe-only drops weak levels', () => {
    const { s, v } = setup();
    v.units.spear = 300;
    scavOf(v).unlocked = 3;
    const p = scavParams(s);
    const all = planScav(p, v.units, 3, [], DEFAULT_SCAV_TEMPLATE);
    expect(all.reduce((n, u) => n + (u.spear ?? 0), 0)).toBe(300);
    const times = all.map((u, l) => previewScav(p, l, u).durationMs);
    expect(Math.max(...times) / Math.min(...times)).toBeLessThan(1.2);
    const safe = planFor(s, v, { ...DEFAULT_SCAV_TEMPLATE, safeOnly: true });
    safe.forEach((u, l) => { if (u.spear) expect(previewScav(p, l, u).ratio).toBe(1); });
    expect(safe[0]!.spear).toBe(300);
  });
});
