import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY } from '../shared/time';
import { answerMessage } from './humanTribe';
import { sendAttack } from './movement';
import { cededTo, offerTreaty, treatiesTick } from './peace';
import { HUMAN_ID, createWorld, invalidateOwners, villagesOf, type WorldState } from './state';
import { setRelation, type Tribe } from './tribes';
import { createVillage } from './village';

function setup(humanLeadsLoser = false) {
  const s = createWorld(createConfig('classic', 'Vrede', 5, { bots: { count: 30 }, conquest: { protectionDays: 0 } } as never));
  s.time = 5 * DAY;
  const bots = s.players.filter((p) => p.bot && villagesOf(s, p.id).length);
  const w = bots[0]!, l = humanLeadsLoser ? s.players[HUMAN_ID]! : bots[1]!;
  // the loser has a few villages, the nearest ones to the winner get ceded
  const home = villagesOf(s, l.id)[0]!;
  for (let i = 1; i <= 3; i++) {
    const v = createVillage(s.config, 900000 + i, l.id, `L${i}`, home.x + i * 2, home.y + 1, s.time);
    v.buildings.place = 1;
    v.units.spear = 500;
    s.villages[v.id] = v;
  }
  invalidateOwners(s);
  const mk = (id: number, tag: string, leader: number): Tribe => ({ id, name: tag, tag, color: '#fff', leader, members: [leader], founded: 0, relations: {} });
  const tw = mk(1, 'WIN', w.id), tl = mk(2, 'LOS', l.id);
  s.tribes = { 1: tw, 2: tl };
  w.tribe = 1; l.tribe = 2;
  setRelation(s, tw, tl, 'war');
  return { s, w, l, tw, tl };
}

const defenders = (s: WorldState, id: number) => s.villages[id]!.units.spear;

describe('peace with evacuation', () => {
  it('a clear defeat: the loser cedes border villages, they are emptied, the winner may take them, then a NAP', () => {
    const { s, w, l, tw, tl } = setup();
    // no refusals for this test
    s.players[l.id]!.bot!.archetype = 'supporter';
    expect(offerTreaty(s, tw, tl, 3)).toBe(true);
    const t = s.treaties![0]!;
    expect(t.status).toBe('signed');
    expect(t.villages.length).toBeGreaterThanOrEqual(1);
    expect(tw.relations[tl.id]).toBe('nap');
    for (const id of t.villages) expect(defenders(s, id)).toBe(0);
    // the winner may attack exactly those villages
    const from = villagesOf(s, w.id)[0]!;
    from.units.axe = 100;
    from.buildings.place = 1;
    expect(cededTo(s, w.id, t.villages[0]!)).toBe(true);
    expect(sendAttack(s, from.id, t.villages[0]!, { axe: 10 })).toBeNull();
    const other = villagesOf(s, l.id).find((v) => !t.villages.includes(v.id))!;
    expect(sendAttack(s, from.id, other.id, { axe: 10 })).toMatch(/NAP/);
    // after the window: only the NAP
    s.time = t.until + 1;
    treatiesTick(s);
    expect(s.treaties).toHaveLength(0);
  });

  it('defense sent back into a ceded village breaks the treaty: war again', () => {
    const { s, l, tw, tl } = setup();
    s.players[l.id]!.bot!.archetype = 'supporter';
    offerTreaty(s, tw, tl, 3);
    const t = s.treaties![0]!;
    const other = villagesOf(s, l.id).find((v) => !t.villages.includes(v.id))!;
    s.villages[t.villages[0]!]!.support = { [other.id]: { spear: 300 } };
    treatiesTick(s);
    expect(tw.relations[tl.id]).toBe('war');
    expect(s.treaties).toHaveLength(0);
  });

  it('you lead the loser: the terms come to your inbox; signing empties the villages', () => {
    const { s, tw, tl } = setup(true);
    expect(offerTreaty(s, tw, tl, 3)).toBe(true);
    const t = s.treaties![0]!;
    expect(t.status).toBe('offered');
    expect(tw.relations[tl.id]).toBe('war');
    const msg = s.inbox!.find((m) => m.kind === 'treaty')!;
    expect(answerMessage(s, msg.id, true)).toBeNull();
    expect(t.status).toBe('signed');
    for (const id of t.villages) expect(defenders(s, id)).toBe(0);
    expect(tw.relations[tl.id]).toBe('nap');
  });

  it('refusing the terms as leader: the war goes on', () => {
    const { s, tw, tl } = setup(true);
    offerTreaty(s, tw, tl, 3);
    const msg = s.inbox!.find((m) => m.kind === 'treaty')!;
    expect(answerMessage(s, msg.id, false)).toBeNull();
    expect(s.treaties).toHaveLength(0);
    expect(tw.relations[tl.id]).toBe('war');
  });
});
