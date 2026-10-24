import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { MINUTE, SECOND } from '../shared/time';
import { fromSaveData, toSaveData } from './save';
import { advance, schedule, scheduleRandom, setPaused, setSpeed } from './simulation';
import { createWorld } from './state';

const world = (seed = 1) => createWorld(createConfig('classic', 'Test', seed));

describe('simulation clock', () => {
  it('does not move while paused', () => {
    const s = world();
    expect(s.paused).toBe(true);
    advance(s, 1000);
    expect(s.time).toBe(0);
  });

  it('moves real time times speed', () => {
    const s = world();
    setPaused(s, false);
    advance(s, 1000);
    expect(s.time).toBe(1 * SECOND);
    setSpeed(s, 10);
    advance(s, 1000);
    expect(s.time).toBe(11 * SECOND);
  });
});

describe('events', () => {
  it('fire in order once their time is reached', () => {
    const s = world();
    setPaused(s, false);
    schedule(s, 5 * SECOND, { kind: 'test', label: 'b', autoPause: false });
    schedule(s, 2 * SECOND, { kind: 'test', label: 'a', autoPause: false });
    expect(advance(s, 1000).processed).toBe(0);
    expect(advance(s, 5000).processed).toBe(2);
    const texts = s.log.slice(-2).map((l) => l.text);
    expect(texts).toEqual(['Test-event: a', 'Test-event: b']);
  });

  it('auto-pause stops the clock exactly at the event', () => {
    const s = world();
    setPaused(s, false);
    setSpeed(s, 10);
    schedule(s, 3 * SECOND, { kind: 'test', label: 'stop', autoPause: true });
    schedule(s, 4 * SECOND, { kind: 'test', label: 'later', autoPause: false });
    const r = advance(s, 1000); // 10 game seconds in one step
    expect(r.autoPaused?.text).toBe('Test-event: stop');
    expect(s.time).toBe(3 * SECOND);
    expect(s.paused).toBe(true);
    // the later event has not happened yet
    expect(s.log.at(-1)?.text).toBe('Test-event: stop');
    setPaused(s, false);
    advance(s, 1000);
    expect(s.log.at(-1)?.text).toBe('Test-event: later');
  });
});

describe('determinism and saves', () => {
  const run = (seed: number) => {
    const s = world(seed);
    setPaused(s, false);
    setSpeed(s, 10);
    for (let i = 0; i < 20; i++) scheduleRandom(s);
    for (let i = 0; i < 50; i++) advance(s, 10 * SECOND);
    return s.log.map((l) => `${l.time}|${l.text}`);
  };

  it('same seed gives the same game', () => {
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });

  it('a loaded save continues exactly like the original', () => {
    const a = world(9);
    setPaused(a, false);
    for (let i = 0; i < 10; i++) scheduleRandom(a);
    advance(a, 20 * MINUTE);

    const b = fromSaveData(JSON.parse(JSON.stringify(toSaveData(a, 0))));
    for (const s of [a, b]) {
      for (let i = 0; i < 10; i++) scheduleRandom(s);
      advance(s, 60 * MINUTE);
    }
    expect(b).toEqual(a);
  });

  it('rejects saves from a newer version', () => {
    const data = toSaveData(world(), 0);
    expect(() => fromSaveData({ ...data, version: 999 })).toThrow();
  });
});
