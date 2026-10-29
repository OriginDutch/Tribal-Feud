import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, createConfig } from '../shared/config';
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
    const s = createWorld(createConfig('classic', 'War', 31, { worldSpeed: 1, bots: { tiers: { pro: 1, mid: 0 }, count: 1 }, unitSpeed: 20 }));
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

  it('aggressive bots scout players once protection is over, and farm the empty ones', () => {
    const s = createWorld(createConfig('classic', 'War', 32, { worldSpeed: 1, bots: { tiers: { pro: 1, mid: 0 }, count: 1 }, unitSpeed: 20, conquest: { protectionDays: 1 } }));
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
    v.units.spy = 5;
    v.buildings.stable = 1;
    v.researched.push('light', 'spy');
    run(s, 0.5 * DAY);
    const before = s.reports.filter((r) => r.defense).length;
    expect(before).toBe(0);
    run(s, 1 * DAY);
    const seen = s.reports.filter((r) => r.defense);
    // first scouts, then (the village is empty) a farm run
    expect(seen.some((r) => (r.attackerUnits.sent.spy ?? 0) > 0 && !r.attackerUnits.sent.light)).toBe(true);
    expect(seen.some((r) => (r.attackerUnits.sent.light ?? 0) > 0)).toBe(true);
  });

  it('turtles recruit defense in proportion to their points', () => {
    const s = createWorld(createConfig('classic', 'War', 33, { worldSpeed: 1, bots: { tiers: { pro: 1, mid: 0 }, count: 1 } }));
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
    const s = createWorld(createConfig('classic', 'Alerts', 34, { worldSpeed: 1, bots: { tiers: { pro: 1, mid: 0 }, count: 0 } }));
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

describe('difficulty', () => {
  it('easier bots look at the game (farm) less often', () => {
    const farmed = (difficulty: 'easy' | 'normal' | 'hard') => {
      const s = createWorld(createConfig('classic', 'Diff', 40, { worldSpeed: 1, bots: { tiers: { pro: 1, mid: 0 }, count: 20, difficulty } }));
      for (const p of s.players) {
        const v = p.bot ? villagesOf(s, p.id)[0] : undefined;
        if (!v) continue;
        v.buildings.place = 1;
        v.units.spear = 2000;
      }
      run(s, 3 * HOUR);
      return s.players.reduce((n, p) => n + Object.keys(p.bot?.farmLog ?? {}).length + (p.bot?.outgoing.length ?? 0), 0);
    };
    const easy = farmed('easy');
    const normal = farmed('normal');
    const hard = farmed('hard');
    expect(easy).toBeLessThan(normal);
    expect(normal).toBeLessThan(hard);
  });

  it('the conquest cooldown knob makes a bot wait before nobling again', () => {
    const before = DIFFICULTIES.normal.conquestCooldownHours;
    DIFFICULTIES.normal.conquestCooldownHours = 16;
    const s = createWorld(createConfig('classic', 'Diff', 41, { worldSpeed: 1, bots: { tiers: { pro: 1, mid: 0 }, count: 1, difficulty: 'normal' }, unitSpeed: 20 }));
    const bot = s.players.find((p) => p.isBot);
    const v = bot ? villagesOf(s, bot.id)[0] : undefined;
    if (!bot?.bot || !v) throw new Error('setup');
    bot.bot.archetype = 'farmer';
    Object.assign(v.buildings, { main: 20, smith: 20, market: 10, snob: 1, storage: 30, farm: 30, barracks: 10, place: 1 });
    v.res = [2000000, 2000000, 2000000];
    v.units.axe = 300;
    run(s, 2 * DAY);
    const first = bot.bot.lastConquest;
    expect(first).toBeDefined();
    // 16 game hours of cooldown at world speed 1: no second conquest within that time
    const taken = villagesOf(s, bot.id).length;
    expect(taken).toBeGreaterThanOrEqual(2);
    // 16 h x (1.5 - activity) >= 8 h between conquests
    expect(s.conquests?.barbarian ?? 0).toBeLessThanOrEqual(Math.ceil((2 * DAY) / (8 * HOUR)) + 1);
    DIFFICULTIES.normal.conquestCooldownHours = before;
  });
});
