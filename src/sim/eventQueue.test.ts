import { describe, expect, it } from 'vitest';
import { createQueue, peek, pop, push, size } from './eventQueue';

describe('eventQueue', () => {
  it('pops in time order', () => {
    const q = createQueue<string>();
    for (const [t, e] of [[50, 'c'], [10, 'a'], [30, 'b'], [90, 'e'], [70, 'd']] as const) push(q, t, e);
    const out: string[] = [];
    let item;
    while ((item = pop(q))) out.push(item.event);
    expect(out).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('breaks ties by insertion order', () => {
    const q = createQueue<number>();
    for (let i = 0; i < 20; i++) push(q, 100, i);
    const out: number[] = [];
    let item;
    while ((item = pop(q))) out.push(item.event);
    expect(out).toEqual([...Array(20).keys()]);
  });

  it('stays sorted under random load and survives JSON round trips', () => {
    let q = createQueue<number>();
    let seed = 1;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 2000; i++) {
      push(q, Math.floor(rand() * 1000), i);
      if (i % 500 === 0) q = JSON.parse(JSON.stringify(q));
    }
    expect(size(q)).toBe(2000);
    let prev = -1;
    let prevSeq = -1;
    let item;
    while ((item = pop(q))) {
      expect(item.time >= prev).toBe(true);
      if (item.time === prev) expect(item.seq > prevSeq).toBe(true);
      prev = item.time;
      prevSeq = item.seq;
    }
    expect(peek(q)).toBeUndefined();
  });

  it('rejects invalid times', () => {
    expect(() => push(createQueue<number>(), Number.NaN, 1)).toThrow();
  });
});
