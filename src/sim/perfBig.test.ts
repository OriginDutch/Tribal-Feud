/**
 * Performance guard on a big world, shaped like a real one on day 5: ~500 bots and thousands of
 * villages, you with 60 villages under the village manager, in a bot tribe, at the quests that
 * look at the whole world, with surplus on and lots of bot activity. Catches the kind of bug where
 * something small counts the whole world after every event (it cost 77% of all time once).
 *
 * The budget is generous for slow CI machines; a regression of that kind blows it many times over.
 */
import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { HOUR, MINUTE } from '../shared/time';
import { setManager } from './manager';
import { conquer } from './movement';
import { advance, setPaused } from './simulation';
import { HUMAN_ID, createWorld, playerVillage, villagesOf } from './state';
import { found, join } from './tribes';

describe('a big world stays fast', () => {
  it('an hour of a day-5-sized world with 60 managed villages simulates in well under the budget', () => {
    const s = createWorld(createConfig('classic', 'PerfBig', 5, { worldSpeed: 20, unitSpeed: 2, bots: { count: 500 }, map: { barbarianCount: 6500 } } as never));
    const home = playerVillage(s)!;
    // your empire: the 59 bot villages nearest to you
    const near = Object.values(s.villages)
      .filter((v) => v.owner >= 0 && v.owner !== HUMAN_ID)
      .sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y))
      .slice(0, 59);
    for (const v of near) conquer(s, v, HUMAN_ID);
    for (const v of villagesOf(s, HUMAN_ID)) {
      Object.assign(v.buildings, { main: 20, barracks: 15, stable: 10, market: 10, storage: 20, farm: 20, place: 1, wall: 10 });
      v.res = [50000, 50000, 50000];
      expect(setManager(s, v.id, { template: 'preset:offense', troops: { axe: 3000, light: 1000, spy: 50 }, troopShare: 0.5 })).toBeNull();
    }
    s.surplus = { ...(s.surplus ?? { keep: 0.5 }), auto: true } as never;
    // in a bot tribe, at the quest "your tribe holds 10% of the world"
    const lead = s.players.find((p) => p.bot && villagesOf(s, p.id).length)!;
    join(s, found(s, lead), s.players[HUMAN_ID]!);
    s.questProgress.empire = 3;
    setPaused(s, false);
    // warm up (JIT, first bot turns), then measure
    for (let t = 0; t < 30; t++) { setPaused(s, false); advance(s, MINUTE); }
    const t0 = performance.now();
    let events = 0;
    const start = s.time;
    while (s.time - start < HOUR) { setPaused(s, false); events += advance(s, MINUTE).processed; }
    const ms = performance.now() - t0;
    const line = `perfBig: ${Object.keys(s.villages).length} villages, ${events} events, ${Math.round(ms)} ms for a game hour (budget 4500)`;
    // on CI: an annotation, so the number shows on the run page without opening the logs
    console.log(process.env.CI ? `::notice title=Prestatie::${line}` : line);
    expect(events).toBeGreaterThan(5000);
    expect(ms).toBeLessThan(4500);
  }, 120_000);
});
