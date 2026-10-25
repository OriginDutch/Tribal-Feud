import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { claimReward } from './quests';
import { BARBARIAN, HUMAN_ID, createWorld, currentVillage, invalidateOwners, playerVillage, villagesOf } from './state';
import { currentResources } from './village';

function world() {
  return createWorld(createConfig('classic', 'Multi', 9, { bots: { count: 0 } }));
}

describe('multiple villages', () => {
  it('the current village falls back to the first one and follows the selection', () => {
    const s = world();
    const first = playerVillage(s);
    const barb = Object.values(s.villages).find((v) => v.owner === BARBARIAN);
    if (!first || !barb) throw new Error('setup');
    expect(currentVillage(s)?.id).toBe(first.id);
    barb.owner = HUMAN_ID;
    invalidateOwners(s);
    s.current = barb.id;
    expect(currentVillage(s)?.id).toBe(barb.id);
    expect(villagesOf(s, HUMAN_ID)).toHaveLength(2);
    // lost again: back to the first village
    barb.owner = BARBARIAN;
    invalidateOwners(s);
    expect(currentVillage(s)?.id).toBe(first.id);
  });

  it('a reward goes into the chosen village', () => {
    const s = world();
    const barb = Object.values(s.villages).find((v) => v.owner === BARBARIAN);
    if (!barb) throw new Error('setup');
    barb.owner = HUMAN_ID;
    barb.res = [0, 0, 0];
    barb.resAt = s.time;
    invalidateOwners(s);
    s.rewards.push({ id: 5000, text: 'x', res: [100, 100, 100] });
    expect(claimReward(s, 5000, barb.id)).toBeNull();
    expect(currentResources(s.config, barb, s.time)).toEqual([100, 100, 100]);
  });
});
