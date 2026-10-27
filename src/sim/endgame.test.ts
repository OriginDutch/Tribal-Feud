import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY } from '../shared/time';
import { endgameTick, tribeShares } from './endgame';
import { foundTribe } from './humanTribe';
import { HUMAN_ID, createWorld, invalidateOwners, type WorldState } from './state';
import { found, tribeOf } from './tribes';

function world(): WorldState {
  return createWorld(createConfig('classic', 'Eind', 81, { bots: { count: 10 } }));
}
/** Hands `share` of all villages to `owner`. */
function give(s: WorldState, owner: number, share: number): void {
  const all = Object.values(s.villages);
  const want = Math.ceil(all.length * share);
  let have = all.filter((v) => v.owner === owner).length;
  for (const v of all) {
    if (have >= want) break;
    if (v.owner === owner) continue;
    v.owner = owner;
    have++;
  }
  invalidateOwners(s);
}

describe('endgame', () => {
  it('your tribe holding 75% for 3 game days wins; a warning comes first', () => {
    const s = world();
    expect(foundTribe(s, 'Leeuwen', 'LEEUW')).toBeNull();
    give(s, HUMAN_ID, 0.65);
    endgameTick(s);
    expect(s.endgame?.warned).toEqual([tribeOf(s, HUMAN_ID)!.id]);
    expect(s.endgame?.leader).toBeUndefined();
    give(s, HUMAN_ID, 0.8);
    endgameTick(s);
    expect(s.endgame?.leader).toBe(tribeOf(s, HUMAN_ID)!.id);
    s.time += 2 * DAY;
    endgameTick(s);
    expect(s.endgame?.winner).toBeUndefined();
    s.time += DAY;
    endgameTick(s);
    expect(s.endgame?.winner?.you).toBe(true);
  });

  it('dropping below the target resets the clock; a bot tribe winning is a loss', () => {
    const s = world();
    const bot = s.players.find((p) => p.bot)!;
    const t = found(s, bot);
    give(s, bot.id, 0.8);
    endgameTick(s);
    expect(s.endgame?.leader).toBe(t.id);
    // drop: hand villages back to the barbarians
    for (const v of Object.values(s.villages).filter((x) => x.owner === bot.id).slice(0, Math.ceil(Object.keys(s.villages).length * 0.2))) v.owner = -1;
    invalidateOwners(s);
    s.time += DAY;
    endgameTick(s);
    expect(s.endgame?.leader).toBeUndefined();
    give(s, bot.id, 0.8);
    endgameTick(s);
    s.time += 3 * DAY;
    endgameTick(s);
    expect(s.endgame?.winner?.you).toBe(false);
  });

  it('without barbarians in the total, the share is of player villages', () => {
    const s = createWorld(createConfig('classic', 'Eind', 82, { bots: { count: 10 }, winCondition: { villageShare: 0.75, countBarbarians: false } }));
    expect(foundTribe(s, 'Leeuwen', 'LEEUW')).toBeNull();
    const players = Object.values(s.villages).filter((v) => v.owner >= 0).length;
    const mine = tribeShares(s)[0]!;
    expect(mine.share).toBeCloseTo(1 / players);
  });
});
