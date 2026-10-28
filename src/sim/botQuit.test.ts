import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY } from '../shared/time';
import { onBotTurn, skillOf } from './bots';
import { BARBARIAN, createWorld, villagesOf } from './state';

describe('casual players', () => {
  it('skill slides inside each tier, casuals mostly at the sloppy end', () => {
    const s = createWorld(createConfig('classic', 'Q', 3, { bots: { count: 500 } } as never));
    const by = (t: string) => s.players.filter((p) => p.bot?.tier === t).map((p) => skillOf(s, p.id, p.bot!));
    const pros = by('pro'), mids = by('mid'), cas = by('casual');
    expect(pros.length).toBe(35);
    expect(mids.length).toBe(115);
    expect(cas.length).toBe(350);
    expect(Math.min(...pros)).toBeGreaterThan(Math.max(...mids) - 1e-9);
    expect(Math.min(...mids)).toBeGreaterThan(Math.max(...cas) - 1e-9);
    const median = [...cas].sort((a, b) => a - b)[cas.length >> 1]!;
    expect(median).toBeLessThan(0.45);
  });

  it('a casual can stop playing: his village goes to the barbarians and he takes no more turns', () => {
    const s = createWorld(createConfig('classic', 'Q', 4, { bots: { count: 60 } } as never));
    const casuals = s.players.filter((p) => p.bot?.tier === 'casual');
    let quit = 0;
    for (const p of casuals) {
      const v = villagesOf(s, p.id)[0]!;
      // a very long absence: the chance to have quit in between is near 1 for the sloppiest
      p.bot!.lastTurnAt = s.time - 2000 * DAY;
      delete p.bot!.presence;
      p.bot!.nextTurn = s.time;
      onBotTurn(s, p.id);
      if (p.bot!.quit) {
        quit++;
        expect(v.owner).toBe(BARBARIAN);
        expect(villagesOf(s, p.id)).toHaveLength(0);
      }
    }
    expect(quit).toBeGreaterThan(casuals.length / 3);
    // pros never quit
    const pro = s.players.find((p) => p.bot?.tier === 'pro')!;
    pro.bot!.lastTurnAt = s.time - 2000 * DAY;
    delete pro.bot!.presence;
    pro.bot!.nextTurn = s.time;
    onBotTurn(s, pro.id);
    expect(pro.bot!.quit).toBeUndefined();
  });
});
