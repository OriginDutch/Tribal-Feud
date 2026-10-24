import { describe, expect, it } from 'vitest';
import { createConfig, validateConfig } from './config';

describe('WorldConfig', () => {
  it('presets are valid', () => {
    for (const p of ['classic', 'speed', 'hardcore'] as const) {
      expect(validateConfig(createConfig(p, 'x', 1))).toEqual([]);
    }
  });

  it('overrides turn a preset into custom', () => {
    const c = createConfig('classic', 'x', 1, { bots: { count: 50 } });
    expect(c.preset).toBe('custom');
    expect(c.bots).toEqual({ count: 50, difficulty: 'normal' });
  });

  it('rejects settings the bots cannot play with yet', () => {
    const c = createConfig('classic', 'x', 1, { churches: true, research: 'levels10' });
    expect(validateConfig(c)).toHaveLength(2);
  });
});
