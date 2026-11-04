import { txt } from '../shared/i18n';
import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { HOUR, MINUTE } from '../shared/time';
import { buildingCost } from './formulas';
import { distance, sendAttack } from './movement';
import { claimAllRewards, claimReward, dismissToast } from './quests';
import { fromSaveData, toSaveData } from './save';
import { advance, setPaused } from './simulation';
import { BARBARIAN, createWorld, playerVillage, type WorldState } from './state';
import { queueBuild } from './village';

function setup() {
  const s = createWorld(createConfig('classic', 'Test', 5, { worldSpeed: 1, luck: false, bots: { count: 100 }, map: { barbarianCount: 1000 } } as never));
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
    const reward = s.rewards.find((r) => txt(r.text) === 'Houthakker level 2');
    expect(reward?.res).toEqual(cost.map((c) => Math.floor(c / 2)));

    v.buildings.wood = 10;
    v.res = [100000, 100000, 100000];
    v.buildings.storage = 30;
    queueBuild(s, v.id, 'wood'); // to 11: no reward
    run(s, 50 * HOUR);
    expect(s.rewards.some((r) => txt(r.text) === 'Houthakker level 11')).toBe(false);
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
    expect(s.rewards.some((r) => txt(r.text) === 'Opdracht: Eerste buit')).toBe(true);
  });

  it('quest progress and rewards survive a save', () => {
    const { s } = setup();
    s.rewards.push({ id: 9999, text: 'test', res: [1, 2, 3] });
    const b = fromSaveData(JSON.parse(JSON.stringify(toSaveData(s, 0))));
    expect(b.questProgress).toEqual(s.questProgress);
    expect(b.rewards).toEqual(s.rewards);
  });
});

describe('quest toasts', () => {
  it('every finished quest gets a toast; closing it removes it', () => {
    const { s } = setup();
    // c1 (wood 1) is done from the start
    const toast = s.questToasts.find((t) => t.title === 'Laten we beginnen');
    expect(toast).toBeDefined();
    dismissToast(s, toast?.id ?? -1);
    expect(s.questToasts.some((t) => t.id === toast?.id)).toBe(false);
    s.questToasts.push({ id: 1, title: 'a' }, { id: 2, title: 'b' });
    dismissToast(s, 'all');
    expect(s.questToasts).toHaveLength(0);
  });

  it('a quest reward can be claimed from its toast, which then disappears', () => {
    const config = createConfig('classic', 'Test', 5, { worldSpeed: 1, luck: false, bots: { count: 100 }, map: { barbarianCount: 1000 } } as never);
    const first = config.quests.chains[0]?.quests[0];
    if (!first) throw new Error('no quest');
    first.reward = { res: [10, 10, 10] };
    const s = createWorld(config);
    const toast = s.questToasts.find((t) => t.title === first.title);
    expect(toast?.rewardId).toBeDefined();
    expect(claimReward(s, toast?.rewardId ?? -1)).toBeNull();
    expect(s.questToasts.some((t) => t.id === toast?.id)).toBe(false);
  });

  it('old saves get an empty toast list', () => {
    const { s } = setup();
    const data = toSaveData(s, 0) as unknown as { version: number; state: Record<string, unknown> };
    data.version = 7;
    delete data.state.questToasts;
    expect(fromSaveData(data).questToasts).toEqual([]);
  });
});

describe('auto rewards', () => {
  it('a reward that fits goes in by itself; one that fits nowhere waits', async () => {
    const { autoClaimRewards } = await import('./quests');
    const { createWorld: cw, playerVillage: pv } = await import('./state');
    const { createConfig: cc } = await import('../shared/config');
    const s = cw(cc('classic', 'R', 9, { worldSpeed: 1, bots: { count: 0 } } as never));
    const v = pv(s)!;
    v.res = [100, 100, 100];
    v.resAt = s.time;
    s.rewards = [
      { id: 1, text: 'klein', res: [200, 200, 200] },
      { id: 2, text: 'te groot', res: [999999, 0, 0] },
    ] as never;
    autoClaimRewards(s);
    expect(s.rewards.map((r) => r.id)).toEqual([1, 2]); // off by default
    s.autoRewards = true;
    autoClaimRewards(s);
    expect(s.rewards.map((r) => r.id)).toEqual([2]);
    expect(v.res[0]).toBeGreaterThanOrEqual(300);
  });
});
