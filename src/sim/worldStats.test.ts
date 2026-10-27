import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY, HOUR } from '../shared/time';
import { advance, setPaused } from './simulation';
import { createWorld } from './state';

describe('world statistics', () => {
  it('counts attacks and conquests per game day, and per player', () => {
    const s = createWorld(createConfig('classic', 'Stat', 5, { worldSpeed: 20, bots: { count: 30 } } as never));
    setPaused(s, false);
    for (let t = 0; t < 2 * DAY; t += HOUR) { const r = advance(s, HOUR); if (r.autoPaused) setPaused(s, false); }
    const ws = s.worldStats!;
    expect(ws.days.length).toBeGreaterThanOrEqual(2);
    const attacks = ws.days.reduce((a, d) => a + d.attacksBarb + d.attacksPvp, 0);
    expect(attacks).toBeGreaterThan(0);
    const perPlayer = Object.values(ws.players).reduce((a, p) => a + p.barb + p.pvp, 0);
    expect(perPlayer).toBe(attacks);
    const conquests = ws.days.reduce((a, d) => a + d.conquestsBarb + d.conquestsPvp, 0);
    expect(conquests).toBe((s.conquests?.barbarian ?? 0) + (s.conquests?.player ?? 0));
    // a closed day has its tribe snapshot
    expect(ws.days[0]!.tribes).toBeDefined();
  });
});
