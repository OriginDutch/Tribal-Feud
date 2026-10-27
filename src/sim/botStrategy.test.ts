import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY, MINUTE } from '../shared/time';
import { advance, setPaused } from './simulation';
import { HUMAN_ID, createWorld, playerVillage, villagesOf, type WorldState } from './state';

function run(s: WorldState, ms: number): void {
  setPaused(s, false);
  for (let left = ms; left > 0; left -= 30 * MINUTE) {
    const r = advance(s, Math.min(left, 30 * MINUTE));
    if (r.autoPaused) setPaused(s, false);
  }
}

function setup(seed: number) {
  const s = createWorld(createConfig('classic', 'S', seed, { bots: { tiers: { pro: 1, mid: 0 }, count: 1 }, unitSpeed: 20, conquest: { protectionDays: 0 } } as never));
  const bot = s.players.find((p) => p.isBot)!;
  const v = villagesOf(s, bot.id)[0]!;
  const human = playerVillage(s)!;
  human.x = v.x + 2;
  human.y = v.y;
  Object.assign(v.buildings, { place: 1, barracks: 10, stable: 5, smith: 10 });
  v.researched.push('light', 'spy', 'axe');
  v.units.spy = 5;
  return { s, bot, v, human };
}

const onYou = (s: WorldState) => s.reports.filter((r) => r.defense);
const real = (s: WorldState) => onYou(s).filter((r) => Object.entries(r.attackerUnits.sent).some(([u, n]) => u !== 'spy' && n));

describe('bot strategy', () => {
  it('a farmer scouts a strong player, sends no farm runs and leaves him alone', () => {
    const { s, bot, v, human } = setup(41);
    bot.bot!.archetype = 'rusher';
    v.units.light = 60;
    human.units.spear = 2000;
    human.units.sword = 2000;
    human.buildings.wall = 10;
    run(s, 1 * DAY);
    expect(onYou(s).length).toBeGreaterThan(0); // the scouts came
    expect(real(s)).toHaveLength(0);
    expect(bot.bot!.wary?.[HUMAN_ID] ?? 0).toBeGreaterThan(s.time - DAY);
  });

  it('a grudge turns into a real attack on a village it scouted and can beat', () => {
    const { s, bot, v } = setup(42);
    bot.bot!.archetype = 'turtle'; // not a farmer: this is revenge, not farming
    v.units.axe = 3000;
    v.units.light = 500;
    bot.bot!.grudges = { [HUMAN_ID]: { score: 3, at: 0, why: 'test' } };
    s.config.bots.difficulty = 'hard';
    run(s, 1 * DAY);
    const hits = real(s);
    expect(hits.length).toBeGreaterThan(0);
    // a real army, not a farm group
    expect((hits[0]!.attackerUnits.sent.axe ?? 0) + (hits[0]!.attackerUnits.sent.light ?? 0)).toBeGreaterThan(1000);
  });

  it('without a reason a non-farmer never attacks you', () => {
    const { s, bot, v } = setup(43);
    bot.bot!.archetype = 'turtle';
    v.units.axe = 3000;
    run(s, 1 * DAY);
    expect(real(s)).toHaveLength(0);
  });
});
