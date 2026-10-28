import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { createWorld, HUMAN_ID, villagesOf } from './state';

const world = (seed: number, extra: object = {}) =>
  createWorld(createConfig('classic', 'Start', seed, { bots: { count: 300 }, map: { barbarianCount: 1500 }, ...extra } as never));

describe('where everyone starts', () => {
  it('you start anywhere among the bots (not always 500|500), or in the middle if you choose', () => {
    const spots = [1, 2, 3, 4].map((seed) => villagesOf(world(seed), HUMAN_ID)[0]!);
    expect(spots.some((v) => v.x !== 500 || v.y !== 500)).toBe(true);
    const mid = villagesOf(world(1, { map: { barbarianCount: 1500, playerStart: 'center' } }), HUMAN_ID)[0]!;
    expect([mid.x, mid.y]).toEqual([500, 500]);
  });

  it('pros are spread over the map: no clusters, never right next to you', () => {
    for (const seed of [5, 6, 7]) {
      const s = world(seed);
      const me = villagesOf(s, HUMAN_ID)[0]!;
      const pros = s.players.filter((p) => p.bot?.tier === 'pro').map((p) => villagesOf(s, p.id)[0]!);
      expect(pros.length).toBe(30);
      expect(s.players.filter((p) => p.bot?.tier === 'mid').length).toBe(90);
      // nearest other pro: with 30 pros spread over the map, never a handful of fields
      const all = s.players.filter((p) => p.bot).map((p) => villagesOf(s, p.id)[0]!);
      const radius = Math.max(...all.map((v) => Math.hypot(v.x - 500, v.y - 500)));
      const fair = radius * Math.sqrt(Math.PI / pros.length) * 0.5;
      for (const a of pros) {
        const nearest = Math.min(...pros.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y)));
        expect(nearest).toBeGreaterThan(fair);
        expect(Math.hypot(a.x - me.x, a.y - me.y)).toBeGreaterThan(fair);
      }
    }
  });
});
