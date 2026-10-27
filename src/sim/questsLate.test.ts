import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { checkQuests } from './quests';
import { fromSaveData, toSaveData } from './save';
import { HUMAN_ID, createWorld, playerVillage } from './state';
import { found } from './tribes';
import { flagsTick, setFlag } from './flags';

const world = (extra: object = {}) => createWorld(createConfig('classic', 'Q', 7, { bots: { count: 0 }, ...extra } as never));

describe('late-game quests', () => {
  it('setting-bound chains only exist when the setting is on', () => {
    const plain = world();
    plain.questProgress = {};
    checkQuests(plain);
    expect(plain.questProgress.faith).toBeUndefined();
    expect(plain.questProgress.flags).toBeUndefined();
    const s = world({ churches: true, flags: true });
    expect(s.config.quests.chains.map((c) => c.id)).toEqual(['construction', 'farming', 'tribe', 'empire', 'faith', 'items', 'flags']);
  });

  it('founding a tribe completes the first tribe quest with a reward', () => {
    const s = world();
    expect(s.questProgress.tribe ?? 0).toBe(0);
    found(s, s.players[HUMAN_ID]!, { name: 'Test', tag: 'TST' });
    checkQuests(s);
    expect(s.questProgress.tribe).toBe(1);
    expect(s.rewards.some((r) => r.text === 'Opdracht: Samen sterk')).toBe(true);
  });

  it('a church and a placed flag complete their first quests', () => {
    const s = world({ churches: true, flags: true });
    const v = playerVillage(s)!;
    v.buildings.church = 1;
    flagsTick(s);
    const type = (Object.entries(s.players[HUMAN_ID]!.flags!.have).find(([, l]) => l[0]! > 0)![0]) as 'res';
    expect(setFlag(s, HUMAN_ID, v.id, { type, level: 1 })).toBeNull();
    checkQuests(s);
    expect(s.questProgress.faith).toBe(1);
    expect(s.questProgress.flags).toBe(1);
  });

  it('old saves get the new chains', () => {
    const s = world();
    s.config.quests.chains = s.config.quests.chains.slice(0, 2);
    const data = toSaveData(s, 0) as unknown as { version: number };
    data.version = 15;
    const loaded = fromSaveData(data as never);
    expect(loaded.config.quests.chains.map((c) => c.id)).toContain('empire');
  });
});
