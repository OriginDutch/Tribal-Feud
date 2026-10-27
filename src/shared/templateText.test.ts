import { describe, expect, it } from 'vitest';
import { BUILD_PRESETS } from './botProfiles';
import { templateToText, textToTemplate, textToTrain, textToTroops, trainToText, troopsToText } from './templateText';

describe('template text', () => {
  it('round-trips every preset', () => {
    for (const t of BUILD_PRESETS) {
      const back = textToTemplate(templateToText(t.name, t.steps));
      expect(back).toEqual({ name: t.name, steps: t.steps });
    }
  });
  it('takes ids and odd spacing, and says which line is wrong', () => {
    expect(textToTemplate('wood 3\n  HOOFDGEBOUW: 5 ')).toEqual({ name: 'Geïmporteerd sjabloon', steps: [['wood', 3], ['main', 5]] });
    expect(textToTemplate('Houthakker 2\nKasteel 4')).toEqual({ error: 'Regel 2 snap ik niet: "Kasteel 4"' });
    expect('error' in textToTemplate('Muur 40')).toBe(true);
  });
  it('troops: names, short names and thousand dots; round-trips', () => {
    expect(textToTroops('# Nuke\nBijl 8.000\nLC 2000\nram 250\nScouts 50')).toEqual({ name: 'Nuke', troops: { axe: 8000, light: 2000, ram: 250, spy: 50 } });
    const t = { axe: 6500, light: 3000, ram: 300, catapult: 50 };
    expect(textToTroops(troopsToText('Off', t))).toEqual({ name: 'Off', troops: t });
    expect(textToTroops('Draak 3')).toEqual({ error: 'Regel 1 snap ik niet: "Draak 3"' });
  });
  it('noble trains round-trip, with catapult target', () => {
    const t = { first: { axe: 6000, light: 2000, ram: 250, catapult: 50 }, escorts: [{ axe: 200, light: 50 }, { light: 100 }], catapultTarget: 'smith' as const };
    expect(textToTrain(trainToText('Clear', t.first, t.escorts, t.catapultTarget))).toEqual({ name: 'Clear', ...t });
    expect(textToTrain('Edel 1: Bijl 10')).toEqual({ error: 'Een edeltrein heeft minstens Edel 1 en Edel 2.' });
    expect(textToTrain('Edel 1: Bijl 10\nEdel 3: LC 5')).toEqual({ error: 'Regel 2: verwacht Edel 2.' });
  });
  it('noble trains with a pure clear (first wave without noble) round-trip', () => {
    const text = trainToText('Pure', { axe: 6000 }, [{ axe: 100 }, { axe: 100 }], undefined, true);
    expect(text).toContain('Eerste wave zonder edel');
    expect(textToTrain(text)).toEqual({ name: 'Pure', first: { axe: 6000 }, escorts: [{ axe: 100 }, { axe: 100 }], clearFirst: true });
  });
});
