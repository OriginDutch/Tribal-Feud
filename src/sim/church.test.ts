import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { battleBonus } from './battleBonus';
import { hasFaith } from './church';
import { BARBARIAN, HUMAN_ID, createWorld, invalidateOwners, playerVillage } from './state';
import { buildBlocker } from './village';

describe('churches', () => {
  it('the first village starts with a first church; far villages have no faith and fight at half strength', () => {
    const s = createWorld(createConfig('classic', 'K', 6, { churches: true, bots: { count: 0 } } as never));
    const v = playerVillage(s)!;
    expect(v.buildings.church_f).toBe(1);
    expect(hasFaith(s, v)).toBe(true);
    const far = Object.values(s.villages).filter((x) => x.owner === BARBARIAN).sort((a, b) => Math.hypot(b.x - v.x, b.y - v.y) - Math.hypot(a.x - v.x, a.y - v.y))[0]!;
    far.owner = HUMAN_ID;
    invalidateOwners(s);
    expect(hasFaith(s, far)).toBe(false);
    const enemy = Object.values(s.villages).find((x) => x.owner === BARBARIAN)!;
    expect(battleBonus(s, far, enemy, { axe: 100 }).attackerFactor).toBe(0.5);
    expect(battleBonus(s, v, enemy, { axe: 100 }).attackerFactor).toBe(1);
    // only one first church; a second village can get a normal church
    expect(buildBlocker(s, far, 'church_f')).toBe('Je hebt al een eerste kerk');
    expect(buildBlocker(s, far, 'church')).toMatch(/Vereist/);
  });

  it('without churches the buildings do not exist', () => {
    const s = createWorld(createConfig('classic', 'K', 6, { bots: { count: 0 } } as never));
    const v = playerVillage(s)!;
    expect(v.buildings.church_f).toBe(0);
    expect(buildBlocker(s, v, 'church')).toBe('Niet actief op deze wereld');
    expect(hasFaith(s, v)).toBe(true);
  });
});
