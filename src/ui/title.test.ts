import { describe, expect, it, vi } from 'vitest';
vi.mock('./store', () => ({ screen: { value: 'map' }, snapshot: { value: null } }));
import { screenLabel } from './title';

describe('tab title', () => {
  it('names every kind of screen', () => {
    expect(screenLabel('map')).toBe('Kaart');
    expect(screenLabel('reports')).toBe('Rapporten');
    expect(screenLabel('barracks')).toBe('Kazerne');
    expect(screenLabel('player')).toBe('Speler');
    expect(screenLabel('settings')).toBe('Sneltoetsen');
  });
});
