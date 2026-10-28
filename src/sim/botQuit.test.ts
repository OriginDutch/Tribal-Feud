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

  it('casuals never quit: they go away for a while, or (small ones) start over', () => {
    const s = createWorld(createConfig('classic', 'Q', 4, { bots: { count: 60 } } as never));
    const casuals = s.players.filter((p) => p.bot?.tier === 'casual');
    let away = 0, restarted = 0;
    for (const p of casuals) {
      const before = villagesOf(s, p.id)[0]!;
      // a very long time since the last turn: near-certain for the sloppiest
      p.bot!.lastTurnAt = s.time - 2000 * DAY;
      delete p.bot!.presence;
      p.bot!.nextTurn = s.time;
      onBotTurn(s, p.id);
      expect(p.bot!.quit).toBeUndefined();
      expect(villagesOf(s, p.id).length).toBeGreaterThan(0);
      if (before.owner === BARBARIAN) restarted++;
      if (p.bot!.awayUntil !== undefined) {
        away++;
        expect(p.bot!.nextTurn).toBe(p.bot!.awayUntil);
        // while away nothing happens
        const at = p.bot!.awayUntil;
        p.bot!.nextTurn = s.time;
        onBotTurn(s, p.id);
        expect(p.bot!.nextTurn).toBe(at);
      }
    }
    expect(away).toBeGreaterThan(casuals.length / 3);
    expect(restarted).toBeGreaterThan(0);
    // pros never go away
    const pro = s.players.find((p) => p.bot?.tier === 'pro')!;
    pro.bot!.lastTurnAt = s.time - 2000 * DAY;
    delete pro.bot!.presence;
    pro.bot!.nextTurn = s.time;
    onBotTurn(s, pro.id);
    expect(pro.bot!.awayUntil).toBeUndefined();
  });
});
