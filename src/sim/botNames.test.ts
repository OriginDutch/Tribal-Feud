import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { conquer } from './movement';
import { BARBARIAN, createWorld, villagesOf } from './state';

describe('bot village names', () => {
  it('a pro names a taken barbarian village in its style; new worlds start named', () => {
    const s = createWorld(createConfig('classic', 'Namen', 8, { bots: { count: 120 }, map: { barbarianCount: 800 } } as never));
    const pro = s.players.find((p) => p.bot?.tier === 'pro')!;
    const barb = Object.values(s.villages).find((v) => v.owner === BARBARIAN)!;
    conquer(s, barb, pro.id);
    expect(barb.name).not.toBe('Barbarendorp');
    expect(barb.name).toMatch(/\d/);
    // mids and pros have no default "Barbarendorp" names; some casuals don't bother
    const mids = s.players.filter((p) => p.bot?.tier === 'mid').flatMap((p) => villagesOf(s, p.id));
    expect(mids.every((v) => v.name !== 'Barbarendorp')).toBe(true);
  });
});
