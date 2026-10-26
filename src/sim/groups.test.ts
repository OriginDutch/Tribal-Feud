import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { deleteGroup, saveGroup, setGroup } from './groups';
import { createWorld, playerVillage } from './state';

function setup() {
  const s = createWorld(createConfig('classic', 'Groups', 52, { bots: { count: 0 } }));
  const v = playerVillage(s)!;
  return { s, v };
}

describe('village groups', () => {
  it('creates, validates and renames groups', () => {
    const { s } = setup();
    expect(saveGroup(s, { id: 'g1', name: 'OFF', color: '#e5533f' })).toBeNull();
    expect(saveGroup(s, { id: 'g2', name: 'off', color: '#e5533f' })).toBe('Die groep bestaat al.');
    expect(saveGroup(s, { id: 'g2', name: '  ', color: '#e5533f' })).not.toBeNull();
    expect(saveGroup(s, { id: 'g2', name: 'DEF', color: 'red' })).not.toBeNull();
    expect(saveGroup(s, { id: 'g1', name: 'Aanval', color: '#E5533F' })).toBeNull();
    expect(s.villageGroups).toEqual([{ id: 'g1', name: 'Aanval', color: '#e5533f' }]);
  });

  it('a village can be in several groups; deleting a group clears it', () => {
    const { s, v } = setup();
    saveGroup(s, { id: 'off', name: 'OFF', color: '#e5533f' });
    saveGroup(s, { id: 'front', name: 'Front', color: '#4f8fd6' });
    expect(setGroup(s, 'off', [v.id], true)).toBeNull();
    expect(setGroup(s, 'front', [v.id], true)).toBeNull();
    setGroup(s, 'off', [v.id], true);
    expect(v.groups).toEqual(['off', 'front']);
    setGroup(s, 'off', [v.id], false);
    expect(v.groups).toEqual(['front']);
    deleteGroup(s, 'front');
    expect(v.groups).toEqual([]);
    expect(setGroup(s, 'nope', [v.id], true)).not.toBeNull();
  });

  it('only own villages join a group', () => {
    const { s, v } = setup();
    saveGroup(s, { id: 'off', name: 'OFF', color: '#e5533f' });
    const other = Object.values(s.villages).find((x) => x.owner !== v.owner)!;
    setGroup(s, 'off', [other.id], true);
    expect(other.groups ?? []).toEqual([]);
  });

  it('a group template is given to villages added to it', () => {
    const { s, v } = setup();
    expect(saveGroup(s, { id: 'eco', name: 'Eco', color: '#7fbf5a', template: 'nope' })).not.toBeNull();
    expect(saveGroup(s, { id: 'eco', name: 'Eco', color: '#7fbf5a', template: 'preset:economy' })).toBeNull();
    setGroup(s, 'eco', [v.id], true);
    expect(v.manager?.template).toBe('preset:economy');
  });
});
