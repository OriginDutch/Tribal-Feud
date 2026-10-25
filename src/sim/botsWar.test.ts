import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY, HOUR, MINUTE } from '../shared/time';
import { onIncomingAttack } from './alerts';
import { advance, setPaused } from './simulation';
import { BARBARIAN, HUMAN_ID, createWorld, playerVillage, villagesOf, type WorldState } from './state';

function run(s: WorldState, ms: number): void {
  setPaused(s, false);
  for (let left = ms; left > 0; left -= 30 * MINUTE) {
    const r = advance(s, Math.min(left, 30 * MINUTE));
    if (r.autoPaused) setPaused(s, false);
  }
}

describe('bots at war', () => {
  it('a bot with an academy mints a coin, trains a nobleman and takes a barbarian village', () => {
    const s = createWorld(createConfig('classic', 'War', 31, { bots: { count: 1 }, unitSpeed: 20 }));
    const bot = s.players.find((p) => p.isBot);
    const v = bot ? villagesOf(s, bot.id)[0] : undefined;
    if (!bot?.bot || !v) throw new Error('setup');
    bot.bot.archetype = 'farmer';
    Object.assign(v.buildings, { main: 20, smith: 20, market: 10, snob: 1, storage: 30, farm: 30, barracks: 10, place: 1 });
    v.res = [800000, 800000, 800000];
    v.units.axe = 300;
    v.units.spear = 300;
    run(s, 2 * DAY);
    expect(bot.coins ?? 0).toBeGreaterThanOrEqual(1);
    const mine = villagesOf(s, bot.id);
    expect(mine.length).toBeGreaterThan(1);
    expect(mine.some((x) => x.loyalty !== undefined && x.id !== v.id)).toBe(true);
  });

  it('aggressive bots farm players once protection is over, defensive ones keep a defense', () => {
    const s = createWorld(createConfig('classic', 'War', 32, { bots: { count: 1 }, unitSpeed: 20, conquest: { protectionDays: 1 } }));
    const bot = s.players.find((p) => p.isBot);
    const v = bot ? villagesOf(s, bot.id)[0] : undefined;
    const human = playerVillage(s);
    if (!bot?.bot || !v || !human) throw new Error('setup');
    bot.bot.archetype = 'rusher';
    // put the human right next to the bot, with nothing to defend
    human.x = v.x + 1;
    human.y = v.y;
    v.buildings.place = 1;
    v.buildings.barracks = 5;
    v.units.light = 50;
    v.researched.push('light');
    run(s, 0.5 * DAY);
    const before = s.reports.filter((r) => r.defense).length;
    expect(before).toBe(0);
    run(s, 1 * DAY);
    expect(s.reports.filter((r) => r.defense).length).toBeGreaterThan(0);
  });

  it('turtles recruit defense in proportion to their points', () => {
    const s = createWorld(createConfig('classic', 'War', 33, { bots: { count: 1 } }));
    const bot = s.players.find((p) => p.isBot);
    const v = bot ? villagesOf(s, bot.id)[0] : undefined;
    if (!bot?.bot || !v) throw new Error('setup');
    bot.bot.archetype = 'turtle';
    Object.assign(v.buildings, { main: 15, barracks: 10, storage: 20, farm: 20, wood: 15, stone: 15, iron: 15 });
    v.res = [100000, 100000, 100000];
    run(s, HOUR);
    // spears and swords at home, out farming, or in training
    let n = 0;
    for (const u of ['spear', 'sword'] as const) {
      n += v.units[u] + v.outside[u];
      for (const job of v.recruitQueues.barracks) if (job.unit === u) n += job.total - job.done;
    }
    expect(n).toBeGreaterThan(50);
  });
});

describe('alert modes', () => {
  it('perVillage pauses once per attacking village per day; lostOnly and off never for attacks', () => {
    const s = createWorld(createConfig('classic', 'Alerts', 34, { bots: { count: 0 } }));
    const text = (): string | undefined => s.alert?.text;
    onIncomingAttack(s, 7, 'a');
    expect(text()).toBe('a');
    delete s.alert;
    onIncomingAttack(s, 7, 'b');
    expect(s.alert).toBeUndefined();
    onIncomingAttack(s, 8, 'c');
    expect(text()).toBe('c');
    delete s.alert;
    s.time += DAY;
    onIncomingAttack(s, 7, 'd');
    expect(text()).toBe('d');
    delete s.alert;
    s.alertMode = 'every';
    onIncomingAttack(s, 7, 'e');
    onIncomingAttack(s, 7, 'f');
    expect(text()).toBe('e · f');
    delete s.alert;
    s.alertMode = 'lostOnly';
    onIncomingAttack(s, 9, 'g');
    expect(s.alert).toBeUndefined();
    expect(HUMAN_ID).toBe(0);
    expect(BARBARIAN).toBe(-1);
  });
});
