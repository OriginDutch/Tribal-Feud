import { describe, expect, it } from 'vitest';
import { createConfig } from '../../shared/config';
import { fromSaveData, toSaveData } from '../save';
import { HUMAN_ID, createWorld, villagesOf } from '../state';
import { found } from '../tribes';
import { playerName, tribeName, type Tier } from './generate';

function rand(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

const BANNED = /zwartepiet|tokkie|boerenlul|lekkerding|fuck|kut|hoer|nazi|hitler|69|420/i;

describe('name generator', () => {
  it('thousands of names per tier, never twice in one world, short, nothing crude', () => {
    for (const tier of ['pro', 'mid', 'casual'] as Tier[]) {
      const taken = new Set<string>();
      const r = rand(tier.length * 7);
      const names = Array.from({ length: 3000 }, () => playerName(tier, r, taken));
      expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(3000);
      for (const n of names) {
        expect(n.length).toBeLessThanOrEqual(24);
        expect(n).not.toMatch(BANNED);
        expect(n).not.toMatch(/\s/);
      }
    }
  });

  it('two worlds hardly share names', () => {
    const world = (seed: number) => {
      const taken = new Set<string>();
      const r = rand(seed);
      return new Set([...Array.from({ length: 35 }, () => playerName('pro', r, taken)), ...Array.from({ length: 115 }, () => playerName('mid', r, taken)), ...Array.from({ length: 350 }, () => playerName('casual', r, taken))]);
    };
    const a = world(1), b = world(2);
    const shared = [...a].filter((n) => b.has(n)).length;
    expect(shared).toBeLessThan(25); // of 500: some lone handles like "Ragnar" or "ninja" may
  });

  it('tribes: unique names and tags, tags dressed like players do', () => {
    const taken = new Set<string>();
    const r = rand(5);
    const tribes = Array.from({ length: 400 }, () => tribeName(r, taken));
    expect(new Set(tribes.map(([n]) => n.toLowerCase())).size).toBe(400);
    expect(new Set(tribes.map(([, t]) => t.replace(/[^A-Za-z0-9&]/g, '').toLowerCase())).size).toBe(400);
  });
});

describe('names in a world', () => {
  it('a new world: every bot has its own gamertag, start villages follow it', () => {
    const s = createWorld(createConfig('classic', 'Namen', 91, { bots: { count: 60 } }));
    const bots = s.players.filter((p) => p.bot);
    expect(new Set(bots.map((p) => p.name.toLowerCase())).size).toBe(bots.length);
    for (const p of bots) expect(p.name).not.toMatch(/\s/);
    const names = Object.values(s.villages).map((v) => v.name);
    expect(names.some((n) => /s dorp/.test(n) && !/'s dorp/.test(n) && n !== 'Jouw dorp')).toBe(false);
  });

  it('an old save gets new bot and tribe names; your tribe and the world stay as they were', () => {
    const s = createWorld(createConfig('classic', 'Oud', 92, { bots: { count: 30 } }));
    const bots = s.players.filter((p) => p.bot);
    // make it look like before: medieval names, villages named after them, an old bot tribe and yours
    bots.forEach((p, i) => (p.name = `Gorwin${i} de Stille`));
    const b0 = bots[0]!, b1 = bots[1]!;
    const [v0] = villagesOf(s, b0.id);
    v0!.name = `Gorwin0s dorp 3`;
    const theirs = found(s, b1);
    theirs.name = 'De Wolven';
    theirs.tag = 'WOLF';
    const [v1] = villagesOf(s, b1.id);
    v1!.name = '[WOLF] 004';
    const yours = found(s, s.players[HUMAN_ID]!, { name: 'Mijn Stam', tag: 'MIJN' });
    const villages = Object.keys(s.villages).length;
    const data = toSaveData(s, 0);
    data.version = 19;
    const after = fromSaveData(data);
    const nb = after.players.filter((p) => p.bot);
    expect(nb.every((p) => !p.name.startsWith('Gorwin'))).toBe(true);
    expect(after.villages[v0!.id]!.name).toBe(`${after.players[b0.id]!.name}'s dorp 3`);
    expect(after.tribes![theirs.id]!.name).not.toBe('De Wolven');
    expect(after.villages[v1!.id]!.name).toBe(`[${after.tribes![theirs.id]!.tag}] 004`);
    expect(after.tribes![yours.id]!.name).toBe('Mijn Stam');
    expect(after.players[HUMAN_ID]!.name).toBe(s.players[HUMAN_ID]!.name);
    expect(Object.keys(after.villages).length).toBe(villages);
  });
});
