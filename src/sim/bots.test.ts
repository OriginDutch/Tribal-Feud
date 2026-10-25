import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../shared/botProfiles';
import { createConfig } from '../shared/config';
import { MINUTE } from '../shared/time';
import { villagePoints } from './barbarians';
import { totalUnits } from './bots';
import { fromSaveData, toSaveData } from './save';
import { advance, setPaused } from './simulation';
import { BARBARIAN, HUMAN_ID, createWorld, villagesOf, type WorldState } from './state';

function world(botCount = 30) {
  const s = createWorld(createConfig('classic', 'Bots', 11, { bots: { count: botCount } }));
  setPaused(s, false);
  return s;
}

function runDays(s: WorldState, days: number): void {
  for (let i = 0; i < days * 6 * 24; i++) advance(s, 10 * MINUTE);
}

const botVillages = (s: WorldState) => Object.values(s.villages).filter((v) => v.owner !== HUMAN_ID && v.owner !== BARBARIAN);

describe('bots', () => {
  it('every bot gets a personality, an activity and a scheduled turn', () => {
    const s = world();
    const bots = s.players.filter((p) => p.isBot);
    expect(bots).toHaveLength(30);
    for (const p of bots) {
      expect(ARCHETYPES).toContain(p.bot?.archetype);
      expect(p.bot?.activity).toBeGreaterThanOrEqual(0.3);
      expect(p.bot?.activity).toBeLessThanOrEqual(1);
    }
    // all archetypes show up in a big enough world
    const big = createWorld(createConfig('classic', 'Bots', 11));
    expect(new Set(big.players.map((p) => p.bot?.archetype).filter(Boolean)).size).toBe(ARCHETYPES.length);
  });

  it('bots grow: every bot builds, and none gets stuck', () => {
    const s = world();
    const start = new Map(botVillages(s).map((v) => [v.id, villagePoints(s.config, v)]));
    runDays(s, 2);
    for (const v of botVillages(s)) {
      expect(villagePoints(s.config, v)).toBeGreaterThan((start.get(v.id) ?? 0) + 100);
    }
    runDays(s, 2);
    const later = botVillages(s).map((v) => villagePoints(s.config, v));
    expect(Math.min(...later)).toBeGreaterThan(400);
  });

  it('bots recruit troops and farm barbarians', () => {
    const s = world();
    runDays(s, 3);
    const withTroops = botVillages(s).filter((v) => totalUnits(v) > 0);
    expect(withTroops.length).toBeGreaterThan(20);
    const farmed = s.players.filter((p) => p.bot && Object.keys(p.bot.farmLog).length > 0);
    expect(farmed.length).toBeGreaterThan(5);
  });

  it('bots never attack players (yet)', () => {
    const s = world();
    runDays(s, 3);
    for (const m of Object.values(s.movements)) {
      const target = s.villages[m.to];
      if (m.kind === 'attack' && m.owner !== HUMAN_ID) expect(target?.owner).toBe(BARBARIAN);
    }
    expect(villagesOf(s, HUMAN_ID)[0]?.units.spear).toBe(0);
  });

  it('a world with bots continues exactly like the original after a save', () => {
    const a = world(10);
    runDays(a, 1);
    const b = fromSaveData(JSON.parse(JSON.stringify(toSaveData(a, 0))));
    runDays(a, 1);
    runDays(b, 1);
    expect(b).toEqual(a);
  });

  it('200 bots stay cheap: a game day takes well under 3 seconds to simulate', () => {
    const s = createWorld(createConfig('classic', 'Perf', 2));
    setPaused(s, false);
    runDays(s, 1);
    const t = performance.now();
    runDays(s, 1);
    expect(performance.now() - t).toBeLessThan(3000);
  });
});
