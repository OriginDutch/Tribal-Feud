import { describe, expect, it } from 'vitest';
import { nextFloat, nextInt, nextUint32, seedRng } from './rng';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = seedRng(42);
    const b = seedRng(42);
    for (let i = 0; i < 100; i++) expect(nextUint32(a)).toBe(nextUint32(b));
  });

  it('differs between seeds', () => {
    const a = seedRng(1);
    const b = seedRng(2);
    const sa = Array.from({ length: 10 }, () => nextUint32(a));
    const sb = Array.from({ length: 10 }, () => nextUint32(b));
    expect(sa).not.toEqual(sb);
  });

  it('continues identically after a JSON round trip', () => {
    const a = seedRng(7);
    for (let i = 0; i < 10; i++) nextUint32(a);
    const b = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 50; i++) expect(nextUint32(a)).toBe(nextUint32(b));
  });

  it('stays in range', () => {
    const r = seedRng(123);
    for (let i = 0; i < 10000; i++) {
      const f = nextFloat(r);
      expect(f >= 0 && f < 1).toBe(true);
      const n = nextInt(r, 3, 7);
      expect(n >= 3 && n <= 7 && Number.isInteger(n)).toBe(true);
    }
  });

  it('hits every value of a small range', () => {
    const r = seedRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(nextInt(r, 1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
