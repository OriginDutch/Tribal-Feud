import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { incomingViews } from './mapView';
import { sendAttack } from './movement';
import { createWorld, playerVillage, villagesOf } from './state';

describe('incoming attacks as you see them', () => {
  it('show the attacker, the distance and the pace (slowest unit that fits), never the troops', () => {
    const s = createWorld(createConfig('classic', 'I', 8, { bots: { count: 5 }, conquest: { protectionDays: 0 } } as never));
    const me = playerVillage(s)!;
    const bot = s.players.find((p) => p.bot)!;
    const bv = villagesOf(s, bot.id)[0]!;
    bv.buildings.place = 1; bv.units.axe = 100; bv.units.ram = 5; bv.units.light = 20;
    sendAttack(s, bv.id, me.id, { axe: 100, ram: 5 });
    sendAttack(s, bv.id, me.id, { light: 20 });
    const [a, b] = incomingViews(s).sort((x, y) => y.arrives - x.arrives);
    expect(a!.from.owner).toBe(bot.id);
    expect(a!.pace).toBe('siege');
    expect(b!.pace).toBe('cav');
    expect(a!.distance).toBeCloseTo(Math.hypot(bv.x - me.x, bv.y - me.y), 1);
    expect(a).not.toHaveProperty('units');
  });
});
