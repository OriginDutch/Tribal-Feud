import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY, HOUR } from '../shared/time';
import { battleBonus, isNight } from './battleBonus';
import { moraleFor } from './movement';
import { BARBARIAN, HUMAN_ID, createWorld, invalidateOwners, playerVillage } from './state';

describe('battle modifiers', () => {
  it('night bonus doubles defense of player villages at night, with a note', () => {
    const s = createWorld(createConfig('classic', 'N', 9, { nightBonus: true, bots: { count: 3 } } as never));
    const v = playerVillage(s)!;
    const bot = Object.values(s.villages).find((x) => x.owner > 0)!;
    s.time = 2 * HOUR;
    expect(isNight(s.time)).toBe(true);
    const night = battleBonus(s, bot, v, { axe: 10 });
    expect(night.defenderFactor).toBe(2);
    expect(night.notes.defender).toContain('Nachtbonus ×2');
    s.time = 12 * HOUR;
    expect(battleBonus(s, bot, v, { axe: 10 }).defenderFactor).toBeUndefined();
    const barb = Object.values(s.villages).find((x) => x.owner === BARBARIAN)!;
    s.time = 2 * HOUR;
    expect(battleBonus(s, v, barb, { axe: 10 }).defenderFactor).toBeUndefined();
  });

  it('time-based morale: the floor rises to 50% over the defender first 30 days', () => {
    const s = createWorld(createConfig('classic', 'M', 9, { morale: 'pointsTime', bots: { count: 3 } } as never));
    const big = s.players.find((p) => p.bot)!;
    // make the bot huge so points morale is at its 30% floor
    for (const v of Object.values(s.villages).filter((x) => x.owner === BARBARIAN).slice(0, 200)) v.owner = big.id;
    invalidateOwners(s);
    expect(moraleFor(s, big.id, HUMAN_ID)).toBeCloseTo(0.3, 2);
    s.time = 30 * DAY;
    expect(moraleFor(s, big.id, HUMAN_ID)).toBeCloseTo(0.5, 2);
  });

  it('modifiers come with readable notes (faith)', () => {
    const s = createWorld(createConfig('classic', 'F', 9, { churches: true, bots: { count: 0 } } as never));
    const v = playerVillage(s)!;
    const far = Object.values(s.villages).filter((x) => x.owner === BARBARIAN).sort((a, b) => Math.hypot(b.x - v.x, b.y - v.y) - Math.hypot(a.x - v.x, a.y - v.y))[0]!;
    far.owner = HUMAN_ID;
    invalidateOwners(s);
    const target = Object.values(s.villages).find((x) => x.owner === BARBARIAN)!;
    expect(battleBonus(s, far, target, { axe: 10 }).notes.attacker[0]).toMatch(/Geen geloof/);
  });
});
