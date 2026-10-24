import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { HOUR, MINUTE } from '../shared/time';
import { buildingCost } from './formulas';
import { distance, sendAttack } from './movement';
import { claimAllRewards, claimReward } from './quests';
import { fromSaveData, toSaveData } from './save';
import { advance, setPaused } from './simulation';
import { BARBARIAN, createWorld, playerVillage, type WorldState } from './state';
import { queueBuild } from './village';

function setup() {
  const s = createWorld(createConfig('classic', 'Test', 5, { luck: false }));
  setPaused(s, false);
  const v = playerVillage(s);
  if (!v) throw new Error('no village');
  return { s, v };
}

function run(s: WorldState, ms: number): void {
  for (let left = ms; left > 0; left -= 10 * MINUTE) advance(s, Math.min(left, 10 * MINUTE));
}

describe('quests', () => {
  it('the first two construction quests are done from the start', () => {
    const { s } = setup();
    expect(s.questProgress.construction).toBe(2);
    expect(s.questProgress.farming ?? 0).toBe(0);
  });

  it('a finished building gives 50% of its cost as a reward (up to level 10)', () => {
    const { s, v } = setup();
    queueBuild(s, v.id, 'wood');
    run(s, HOUR);
    const cost = buildingCost(s.config.buildings.wood, 2);
    const reward = s.rewards.find((r) => r.text === 'Houthakker level 2');
    expect(reward?.res).toEqual(cost.map((c) => Math.floor(c / 2)));

    v.buildings.wood = 10;
    v.res = [100000, 100000, 100000];
    v.buildings.storage = 30;
    queueBuild(s, v.id, 'wood'); // to 11: no reward
    run(s, 50 * HOUR);
    expect(s.rewards.some((r) => r.text === 'Houthakker level 11')).toBe(false);
  });

  it('claiming fills up to the storage cap; the rest stays claimable', () => {
    const { s, v } = setup();
    s.rewards.push({ id: 9999, text: 'test', res: [800, 800, 800] });
    v.res = [500, 500, 500];
    v.resAt = s.time;
    expect(claimReward(s, 9999)).toBeNull();
    expect(v.res).toEqual([1000, 1000, 1000]);
    expect(s.rewards.find((r) => r.id === 9999)?.res).toEqual([300, 300, 300]);
    expect(claimReward(s, 9999)).toBe('Je opslag zit vol.');
  });

  it('quest 5 (claim a reward) completes when a reward is claimed', () => {
    const { s, v } = setup();
    v.buildings.wood = 2;
    v.buildings.stone = 2;
    v.buildings.main = 2;
    advance(s, 1);
    // c3 and c4 are done now; c5 waits for a claim
    queueBuild(s, v.id, 'iron');
    run(s, HOUR);
    expect(s.questProgress.construction).toBe(4);
    claimAllRewards(s);
    expect(s.questProgress.construction).toBeGreaterThanOrEqual(5);
  });

  it('plunder quests count won attacks on barbarians and give resources', () => {
    const { s, v } = setup();
    v.units.light = 10;
    const barbs = Object.values(s.villages).filter((x) => x.owner === BARBARIAN);
    barbs.sort((a, b) => distance(a, v) - distance(b, v));
    const target = barbs[0];
    if (!target) throw new Error('no barb');
    target.res = [1000, 1000, 1000];
    target.resAt = s.time;
    sendAttack(s, v.id, target.id, { light: 10 });
    run(s, 10 * HOUR);
    expect(s.stats.plunders).toBe(1);
    expect(s.stats.loot).toBeGreaterThan(0);
    expect(s.questProgress.farming).toBe(1);
    expect(s.rewards.some((r) => r.text === 'Opdracht: Eerste buit')).toBe(true);
  });

  it('quest progress and rewards survive a save', () => {
    const { s } = setup();
    s.rewards.push({ id: 9999, text: 'test', res: [1, 2, 3] });
    const b = fromSaveData(JSON.parse(JSON.stringify(toSaveData(s, 0))));
    expect(b.questProgress).toEqual(s.questProgress);
    expect(b.rewards).toEqual(s.rewards);
  });
});
