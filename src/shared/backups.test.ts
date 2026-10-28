import { describe, expect, it } from 'vitest';
import { nextBackupSlot, slotLabel } from './protocol';

describe('rolling backups', () => {
  const p = 'backup:42:';
  it('fills free numbers first, then replaces the oldest', () => {
    expect(nextBackupSlot([], p)).toBe('backup:42:1');
    const five = [1, 2, 3, 4, 5].map((n) => ({ slot: `${p}${n}`, savedAt: [50, 10, 40, 30, 20][n - 1]! }));
    expect(nextBackupSlot(five.slice(0, 2), p)).toBe('backup:42:3');
    expect(nextBackupSlot(five, p)).toBe('backup:42:2'); // savedAt 10: the oldest
  });
  it('only counts backups of its own world', () => {
    const others = [1, 2, 3, 4, 5].map((n) => ({ slot: `backup:7:${n}`, savedAt: n }));
    expect(nextBackupSlot(others, p)).toBe('backup:42:1');
  });
  it('labels', () => {
    expect(slotLabel('autosave')).toBe('Autosave');
    expect(slotLabel('autosave:42')).toBe('Autosave');
    expect(slotLabel('backup:42:3')).toBe('Backup 3');
    expect(slotLabel('update:42:v14')).toBe('Voor update (v14)');
    expect(slotLabel('handmatig')).toBe('handmatig');
  });
});
