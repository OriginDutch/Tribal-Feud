import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { MINUTE } from '../shared/time';
import { storageCapacity } from './formulas';
import { saveTemplate, setManager } from './manager';
import { distance } from './movement';
import { buildNeed, mintAll, planMintAll, planSurplus, sendSurplus, setSurplus } from './surplus';
import { advance, setPaused } from './simulation';
import { BARBARIAN, HUMAN_ID, createWorld, invalidateOwners, playerVillage, type WorldState } from './state';
import { currentResources, type Village } from './village';

function setup() {
  const s = createWorld(createConfig('classic', 'Overschot', 71, { worldSpeed: 1, bots: { count: 0 } }));
  setPaused(s, false);
  const rich = playerVillage(s)!;
  Object.assign(rich.buildings, { main: 20, storage: 20, market: 10, wood: 25, stone: 25, iron: 25, farm: 20 });
  const cap = storageCapacity(20);
  rich.res = [cap * 0.9, cap * 0.9, cap * 0.9];
  rich.resAt = s.time;
  const poor = Object.values(s.villages).filter((x) => x.owner === BARBARIAN).sort((a, b) => distance(a, rich) - distance(b, rich))[0] as Village;
  poor.owner = HUMAN_ID;
  delete poor.growth;
  invalidateOwners(s);
  Object.assign(poor.buildings, { main: 20, storage: 20, market: 1, farm: 20, wood: 22, stone: 22, iron: 22, barracks: 10, smith: 10 });
  poor.buildQueue = [];
  poor.res = [0, 0, 0];
  poor.resAt = s.time;
  return { s, rich, poor, cap };
}
const sum = (r: number[]) => r[0]! + r[1]! + r[2]!;

describe('surplus to building villages', () => {
  it('a village without a build template needs nothing', () => {
    const { s, poor } = setup();
    expect(sum(buildNeed(s, poor))).toBe(0);
    expect(planSurplus(s, { keep: 0.5, auto: false })).toEqual([]);
  });

  it('sends what is above the kept share to a building village that runs short', () => {
    const { s, rich, poor, cap } = setup();
    expect(setManager(s, poor.id, { template: 'preset:economy', troopShare: 0 })).toBeNull();
    poor.res = [0, 0, 0];
    poor.resAt = s.time;
    poor.buildQueue = [];
    const need = buildNeed(s, poor);
    expect(sum(need)).toBeGreaterThan(1000);
    const plan = planSurplus(s, { keep: 0.5, auto: false });
    expect(plan.length).toBe(1);
    expect(plan[0]!.from).toBe(rich.id);
    expect(plan[0]!.to).toBe(poor.id);
    for (const i of [0, 1, 2] as const) expect(plan[0]!.res[i]).toBeLessThanOrEqual(Math.max(need[i], 0));
    // nothing comes from below the kept share
    expect(planSurplus(s, { keep: 0.95, auto: false })).toEqual([]);
    expect(sendSurplus(s, { keep: 0.5, auto: false })).toBe(1);
    expect(currentResources(s.config, rich, s.time)[0]).toBeGreaterThanOrEqual(cap * 0.5 - 1);
    // on the way counts: no second shipment for the same need
    expect(planSurplus(s, { keep: 0.5, auto: false })).toEqual([]);
  });

  it('runs by itself at manager checks when switched on', () => {
    const { s, poor } = setup();
    expect(saveTemplate(s, { id: 'pits', name: 'Mijnen', steps: [['wood', 30], ['stone', 30], ['iron', 30]] })).toBeNull();
    setManager(s, poor.id, { template: 'pits', troopShare: 0 });
    poor.res = [0, 0, 0];
    poor.resAt = s.time;
    poor.buildQueue = [];
    expect(setSurplus(s, { keep: 0.5, auto: true })).toBeNull();
    const trades = (st: WorldState) => Object.values(st.movements).filter((m) => m.kind === 'trade').length;
    for (let i = 0; i < 12 && trades(s) === 0; i++) advance(s, 10 * MINUTE);
    expect(trades(s)).toBeGreaterThan(0);
  });
});

describe('coins in finished villages', () => {
  it('mints in villages whose template is done, keeping a share of storage', () => {
    const { s, rich, cap } = setup();
    Object.assign(rich.buildings, { snob: 1, smith: 20, market: 10, storage: 30 });
    const big = storageCapacity(30);
    expect(planMintAll(s, 0)).toEqual([]); // no template
    expect(saveTemplate(s, { id: 'done', name: 'Klaar', steps: [['main', 20]] })).toBeNull();
    setManager(s, rich.id, { template: 'done', troopShare: 0 });
    rich.buildQueue = [];
    rich.res = [big * 0.9, big * 0.9, big * 0.9];
    rich.resAt = s.time;
    void cap;
    const all = planMintAll(s, 0);
    expect(all.length).toBe(1);
    const half = planMintAll(s, 0.5)[0]!.coins;
    expect(half).toBeLessThan(all[0]!.coins);
    const coins = s.players[HUMAN_ID]!.coins ?? 0;
    expect(mintAll(s, 0.5)).toBe(half);
    expect(s.players[HUMAN_ID]!.coins).toBe(coins + half);
    expect(Math.min(...currentResources(s.config, rich, s.time))).toBeGreaterThanOrEqual(big * 0.5 - 1);
    // a template that isn't done: nothing
    saveTemplate(s, { id: 'more', name: 'Meer', steps: [['main', 30]] });
    setManager(s, rich.id, { template: 'more', troopShare: 0 });
    expect(planMintAll(s, 0)).toEqual([]);
  });
});
