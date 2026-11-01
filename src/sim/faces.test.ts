import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { FACE_COUNTS } from '../shared/faces';
import { faceOf } from './faces';
import { HUMAN_ID, createWorld } from './state';
import type { Tribe } from './tribes';

describe('bot faces', () => {
  it('each bot a face from its own kind, the same every time; none for you', () => {
    const s = createWorld(createConfig('classic', 'Faces', 9, { bots: { count: 120 } } as never));
    expect(faceOf(s, HUMAN_ID)).toBeNull();
    for (const p of s.players.filter((x) => x.bot)) {
      const f = faceOf(s, p.id)!;
      expect(f.pool).toBe(p.bot!.archetype);
      expect(f.index).toBeGreaterThanOrEqual(0);
      expect(f.index).toBeLessThan(FACE_COUNTS[f.pool]);
      expect(faceOf(s, p.id)).toEqual(f);
    }
  });

  it('tribe mates of the same kind never share a face', () => {
    const s = createWorld(createConfig('classic', 'Faces', 9, { bots: { count: 120 } } as never));
    const bots = s.players.filter((x) => x.bot).slice(0, 12);
    for (const b of bots) b.bot!.archetype = 'turtle';
    const t: Tribe = { id: 9501, name: 'T', tag: 'T', color: '#fff', leader: bots[0]!.id, members: bots.map((b) => b.id), founded: 0, relations: {} };
    s.tribes = { [t.id]: t };
    for (const b of bots) b.tribe = t.id;
    const faces = bots.map((b) => faceOf(s, b.id)!.index);
    expect(new Set(faces).size).toBe(bots.length);
  });
});
