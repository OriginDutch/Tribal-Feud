import { describe, expect, it } from 'vitest';
import { MENU_TRACKS, MIN_GAP, TRACKS, nextTrack, startPlaylist, type Track } from './playlist';

function seeded(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

function play(n: number, rand: () => number): Track[] {
  const start = startPlaylist(rand);
  const out: Track[] = [start.first];
  let p = start.playlist;
  for (let i = 1; i < n; i++) {
    const r = nextTrack(p, rand);
    out.push(r.track);
    p = r.playlist;
  }
  return out;
}

describe('playlist', () => {
  it('opens with a menu theme', () => {
    for (let s = 1; s < 50; s++) expect(MENU_TRACKS).toContain(play(1, seeded(s))[0]);
  });

  it('every round plays every track once', () => {
    for (let s = 1; s < 30; s++) {
      const list = play(TRACKS.length * 20, seeded(s));
      for (let r = 0; r < 20; r++) expect(new Set(list.slice(r * TRACKS.length, (r + 1) * TRACKS.length)).size).toBe(TRACKS.length);
    }
  });

  it(`never the same track within ${MIN_GAP} tracks, also across rounds`, () => {
    for (let s = 1; s < 200; s++) {
      const list = play(TRACKS.length * 10, seeded(s));
      list.forEach((t, i) => {
        for (let k = 1; k <= MIN_GAP; k++) expect(list[i + k]).not.toBe(t);
      });
    }
  });

  it('rounds do not all come out in the same order', () => {
    const list = play(TRACKS.length * 4, seeded(7));
    const rounds = [1, 2, 3].map((r) => list.slice(r * TRACKS.length, (r + 1) * TRACKS.length).join());
    expect(new Set(rounds).size).toBeGreaterThan(1);
  });
});
