import { describe, expect, it } from 'vitest';
import { lang } from '../shared/i18n';
import '../shared/i18n/en';
import { localizeNames } from './defaultNames';
import { createWorld, HUMAN_ID } from './state';
import { createConfig } from '../shared/config';

describe('default names follow the language', () => {
  it('renames you, your first village and empty barbarian villages, nothing chosen', () => {
    const s = createWorld(createConfig('classic', 'Names', 7, { bots: { count: 5 } } as never));
    lang.value = 'nl';
    localizeNames(s, 'nl');
    const mine = Object.values(s.villages).find((v) => v.owner === HUMAN_ID)!;
    s.players[HUMAN_ID]!.name = 'Jij';
    mine.name = 'Jouw dorp';
    const chosen = Object.values(s.villages).find((v) => v.owner !== HUMAN_ID)!;
    chosen.name = 'Mijn fort';
    lang.value = 'en';
    localizeNames(s, 'en');
    expect(s.players[HUMAN_ID]!.name).toBe('You');
    expect(mine.name).toBe('Your village');
    expect(chosen.name).toBe('Mijn fort');
    lang.value = 'nl';
    localizeNames(s, 'nl');
    expect(s.players[HUMAN_ID]!.name).toBe('Jij');
    expect(mine.name).toBe('Jouw dorp');
    lang.value = 'en';
  });
});
