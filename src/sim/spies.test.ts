import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { raiseSpies, spiesToKeep, spyLevel } from './botStrategy';
import { createWorld } from './state';

const world = (difficulty: 'normal' | 'hard' = 'normal') => createWorld(createConfig('classic', 'Spies', 77, { bots: { count: 200, difficulty } } as never));

describe('scouts per bot', () => {
  it('each bot its own level within its tier, the same after every load; most a bit above the old fixed numbers', () => {
    const s = world();
    const bots = s.players.filter((p) => p.bot);
    const range = { pro: [8, 60], mid: [3, 25], casual: [1, 12] } as const;
    for (const p of bots) {
      const n = spyLevel(s, p);
      const [lo, hi] = range[p.bot!.tier ?? 'pro'];
      expect(n).toBeGreaterThanOrEqual(lo);
      expect(n).toBeLessThanOrEqual(hi);
      expect(spyLevel(s, p)).toBe(n);
    }
    // as pros, all of them (a big sample)
    for (const p of bots) p.bot!.tier = 'pro';
    const pros = bots.map((p) => spyLevel(s, p)).sort((a, b) => a - b);
    const median = pros[Math.floor(pros.length / 2)]!;
    expect(median).toBeGreaterThanOrEqual(12);
    expect(median).toBeLessThanOrEqual(30);
    // a few that are hard to look into
    expect(pros.some((n) => n >= 40)).toBe(true);
  });

  it('arms race: up to three times its own level, at most 150; hard worlds keep more', () => {
    const s = world();
    const p = s.players.find((x) => x.bot && (x.bot.tier ?? 'pro') === 'pro')!;
    const lvl = spyLevel(s, p);
    raiseSpies(s, p, 1000);
    expect(spiesToKeep(s, p)).toBe(Math.min(150, 3 * lvl));
    raiseSpies(s, p, 1); // never goes down
    expect(spiesToKeep(s, p)).toBe(Math.min(150, 3 * lvl));
    const h = world('hard');
    const ph = h.players.find((x) => x.id === p.id)!;
    expect(spyLevel(h, ph)).toBeGreaterThanOrEqual(lvl);
  });
});
