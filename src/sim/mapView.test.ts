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

describe('one village in detail', () => {
  it('your reports about it (with the report of the last attack), notes, marks and the scout eye', async () => {
    const { mapData, villageInfo } = await import('./mapView');
    const { advance } = await import('./simulation');
    const s = createWorld(createConfig('classic', 'V', 9, { worldSpeed: 1, bots: { count: 5 }, conquest: { protectionDays: 0 } } as never));
    const me = playerVillage(s)!;
    const bot = s.players.find((p) => p.bot)!;
    const bv = villagesOf(s, bot.id)[0]!;
    me.buildings.place = 1; me.units.spy = 5;
    expect(sendAttack(s, me.id, bv.id, { spy: 5 })).toBeNull();
    s.paused = false;
    while (Object.keys(s.movements).length) { s.paused = false; advance(s, 3_600_000); }
    const info = villageInfo(s, bv.id)!;
    expect(info.reports.length).toBe(1);
    expect(info.scout).not.toBeNull();
    const mv = mapData(s).villages.find((v) => v.id === bv.id)!;
    expect(mv.last?.report).toBe(info.reports[0]!.id);
    expect(mv.scoutedAt).toBe(info.scout!.time);
    s.notes = { villages: { [bv.id]: 'edeldoel' }, players: {} };
    s.mapMarks = { players: { [bot.id]: '#e5533f' }, tribes: {} };
    const data = mapData(s);
    expect(data.villages.find((v) => v.id === bv.id)!.note).toBe(true);
    expect(data.marks.players[bot.id]).toBe('#e5533f');
    expect(villageInfo(s, bv.id)!.note).toBe('edeldoel');
  });
});
