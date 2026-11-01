import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { HOUR, MINUTE } from '../shared/time';
import { planFarmAll } from './farmAll';
import { distance, sendAttack, travelTimeMs } from './movement';
import { cancelPlanned, earliestLanding, planAttack, planOrder, plannedViews } from './planned';
import { advance, setPaused } from './simulation';
import { BARBARIAN, HUMAN_ID, createWorld, playerVillage, type WorldState } from './state';
import { dismissUnits } from './village';

function setup() {
  const s = createWorld(createConfig('classic', 'P', 5, { bots: { count: 0 }, luck: false } as never));
  setPaused(s, false);
  s.alertMode = 'off';
  const v = playerVillage(s)!;
  v.buildings.place = 1;
  v.units.axe = 1000;
  v.units.light = 200;
  v.units.snob = 3;
  const barbs = Object.values(s.villages).filter((x) => x.owner === BARBARIAN).sort((a, b) => distance(v, a) - distance(v, b));
  return { s, v, t: barbs[0]!, barbs };
}

/** Runs until a given game time (the sim pauses on alerts: keep it going). */
function runTo(s: WorldState, at: number): void {
  while (s.time < at) {
    s.paused = false;
    advance(s, Math.min(10 * MINUTE, at - s.time));
  }
}

const attacksTo = (s: WorldState, to: number) => Object.values(s.movements).filter((m) => m.owner === HUMAN_ID && m.kind === 'attack' && m.to === to);

describe('ingeplande aanvallen', () => {
  it('leaves by itself and lands at the chosen time; until then the troops are held', () => {
    const { s, v, t, barbs } = setup();
    const landAt = s.time + 3 * HOUR;
    expect(planAttack(s, { from: v.id, to: t.id, first: { axe: 600 }, landAt })).toBeNull();
    // held: not for another attack, farming or dismissing, but the rest is free
    expect(sendAttack(s, v.id, barbs[1]!.id, { axe: 500 })).toMatch(/ingeplande aanval/);
    expect(sendAttack(s, v.id, barbs[1]!.id, { axe: 400 })).toBeNull();
    expect(dismissUnits(s, v.id, { axe: 1 })).toMatch(/ingeplande aanval/);
    s.farmTemplates.A = { axe: 10 };
    expect(planFarmAll(s, { template: 'A', skipLost: false, maxWall: null, maxDistance: null }).able).toBe(0);
    expect(plannedViews(s)[0]).toMatchObject({ waves: 1, landAt, units: { axe: 600 } });

    const sendAt = landAt - travelTimeMs(s, { axe: 1 }, distance(v, t));
    runTo(s, sendAt - MINUTE);
    expect(attacksTo(s, t.id)).toHaveLength(0);
    runTo(s, sendAt + 1);
    const [m] = attacksTo(s, t.id);
    expect(m).toBeDefined();
    expect(m!.arrives).toBe(landAt);
    expect(m!.units).toEqual({ axe: 600 });
    expect(s.planned).toHaveLength(0);
  });

  it('refuses what cannot land in time, and cancelling frees the troops', () => {
    const { s, v, t } = setup();
    const soonest = earliestLanding(s, { from: v.id, to: t.id, first: { axe: 1 } });
    expect(planAttack(s, { from: v.id, to: t.id, first: { axe: 600 }, landAt: soonest - MINUTE })).toMatch(/Te laat/);
    expect(planAttack(s, { from: v.id, to: t.id, first: { axe: 2000 }, landAt: soonest + HOUR })).toMatch(/Niet genoeg/);
    expect(planAttack(s, { from: v.id, to: t.id, first: { axe: 1000 }, landAt: soonest + HOUR })).toBeNull();
    expect(dismissUnits(s, v.id, { axe: 1 })).not.toBeNull();
    expect(cancelPlanned(s, s.planned![0]!.id)).toBeNull();
    expect(dismissUnits(s, v.id, { axe: 1 })).toBeNull();
    // the stale event does nothing
    runTo(s, soonest + 2 * HOUR);
    expect(attacksTo(s, t.id)).toHaveLength(0);
  });

  it('goes with what is left when troops died meanwhile, and lapses (with a log line) when nothing is', () => {
    const { s, v, t, barbs } = setup();
    const landAt = s.time + 4 * HOUR;
    planAttack(s, { from: v.id, to: t.id, first: { axe: 600, light: 100 }, landAt });
    planAttack(s, { from: v.id, to: barbs[1]!.id, first: { light: 50 }, landAt });
    v.units.axe = 250; // lost in a defence
    v.units.light = 0;
    runTo(s, landAt - 1);
    const [m] = attacksTo(s, t.id);
    expect(m!.units).toEqual({ axe: 250 });
    expect(m!.arrives).toBe(landAt); // on time
    expect(attacksTo(s, barbs[1]!.id)).toHaveLength(0);
    expect(s.log.some((l) => /vervalt: er staan geen troepen meer/.test(l.text))).toBe(true);
    expect(s.log.some((l) => /minder troepen dan gepland/.test(l.text))).toBe(true);
  });

  it('a lighter army than planned still lands at the planned time', () => {
    const { s, v, t } = setup();
    v.units.ram = 10;
    const landAt = s.time + 5 * HOUR;
    planAttack(s, { from: v.id, to: t.id, first: { axe: 100, ram: 10 }, landAt });
    v.units.ram = 0; // rams gone: the axes would be quicker
    runTo(s, landAt - 1);
    expect(attacksTo(s, t.id)[0]!.arrives).toBe(landAt);
  });

  it('a planned noble train lands together, in order; a missing nobleman drops his wave', () => {
    const { s, v, t } = setup();
    const landAt = s.time + 6 * HOUR;
    expect(planAttack(s, { from: v.id, to: t.id, first: { axe: 500 }, escorts: [{ axe: 100 }, { axe: 100 }], clearFirst: true, landAt })).toBeNull();
    expect(plannedViews(s)[0]).toMatchObject({ waves: 3, units: { axe: 700, snob: 2 } });
    v.units.snob = 1;
    runTo(s, landAt - 1);
    const ms = attacksTo(s, t.id).sort((a, b) => a.id - b.id);
    expect(ms.map((m) => m.units)).toEqual([{ axe: 500 }, { axe: 100, snob: 1 }]);
    expect(ms.every((m) => m.arrives === landAt && m.train === ms[0]!.train)).toBe(true);
  });

  it('for an order: the free attacking army of a village, or its spies', () => {
    const { s, v, t, barbs } = setup();
    v.units.spy = 30;
    const landAt = s.time + 3 * HOUR;
    expect(planAttack(s, { from: v.id, to: barbs[1]!.id, first: { light: 50 }, landAt })).toBeNull();
    expect(planOrder(s, v.id, t.id, landAt)).toBeNull();
    expect(s.planned![1]!.waves).toEqual([{ axe: 1000, light: 150 }]);
    expect(planOrder(s, v.id, barbs[2]!.id, landAt)).toMatch(/Geen vrije aanvallende/);
    expect(planOrder(s, v.id, barbs[2]!.id, landAt, true)).toBeNull();
    expect(s.planned![2]!.waves).toEqual([{ spy: 30 }]);
  });
});
