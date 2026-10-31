import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { sendAttack } from './movement';
import { advance, setPaused } from './simulation';
import { HUMAN_ID, createWorld, playerVillage, villagesOf } from './state';
import type { Tribe } from './tribes';

/** You in a bot tribe; a mate 20 fields away (past the 12 bots keep for each other), an enemy far away (a slow attack: time to react). */
function setup() {
  const s = createWorld(createConfig('classic', 'Help', 41, { bots: { tiers: { pro: 1, mid: 0 }, count: 30 }, conquest: { protectionDays: 0 } } as never));
  const [mate, enemy] = s.players.filter((p) => p.isBot && villagesOf(s, p.id).length);
  const home = playerVillage(s)!;
  const mv = villagesOf(s, mate!.id)[0]!, ev = villagesOf(s, enemy!.id)[0]!;
  mv.x = home.x + 20; mv.y = home.y;
  ev.x = home.x - 70; ev.y = home.y;
  mate!.bot!.archetype = 'supporter';
  Object.assign(mv.units, { spear: 3000, sword: 2000 });
  mv.buildings.place = Math.max(1, mv.buildings.place);
  Object.assign(ev.units, { axe: 3000 });
  ev.buildings.place = Math.max(1, ev.buildings.place);
  const t: Tribe = { id: 9301, name: 'Speer', tag: 'SPEER', color: '#fff', leader: mate!.id, members: [mate!.id, HUMAN_ID], founded: 0, relations: {} };
  s.tribes = { [t.id]: t };
  mate!.tribe = t.id; s.players[HUMAN_ID]!.tribe = t.id;
  return { s, home, mv, ev, mate: mate! };
}

describe('your tribe defends you', () => {
  it('a mate sends defense to your village under a real attack, without being asked, from 20 fields', () => {
    const { s, home, ev, mate } = setup();
    // a slow attack (rams) gives the mate time to see it and get there
    ev.units.ram = 200;
    expect(sendAttack(s, ev.id, home.id, { axe: 3000, ram: 200 })).toBeNull();
    setPaused(s, false);
    let helped = false;
    for (let i = 0; i < 12 * 60 && !helped; i++) {
      setPaused(s, false); advance(s, 60_000);
      helped = Object.values(s.movements).some((m) => m.kind === 'support' && m.owner === mate.id && m.to === home.id) || Object.keys(home.support ?? {}).length > 0;
    }
    expect(helped).toBe(true);
  });
});
