import { describe, expect, it } from 'vitest';
import { BUILD_PRESETS } from './botProfiles';
import { templateToText, textToTemplate } from './templateText';

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
});
