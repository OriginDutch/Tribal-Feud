import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY } from '../shared/time';
import { answerMessage, foundTribe } from './humanTribe';
import { checkLeaderOrder, leaderOrderLanded } from './tribeOrders';
import { sendAttack } from './movement';
import { advance } from './simulation';
import { playerVillage } from './state';
import { HUMAN_ID, createWorld, villagesOf, type WorldState } from './state';
import { found, join, setRelation, tribeOf } from './tribes';
import { addMessage } from './humanTribe';

function world(): WorldState {
  return createWorld(createConfig('classic', 'O', 31, { bots: { tiers: { pro: 1, mid: 0 }, count: 20 } } as never));
}

describe('your bot leader gives orders', () => {
  it('yes + done raises standing, yes + not done lowers it more than a no', () => {
    const s = world();
    const lead = s.players.find((p) => p.bot && villagesOf(s, p.id).length)!;
    const t = found(s, lead);
    join(s, t, s.players[HUMAN_ID]!);
    const target = Object.values(s.villages).find((v) => v.owner !== HUMAN_ID && v.owner !== lead.id)!;
    const msg = addMessage(s, { kind: 'request', from: lead.id, title: 'Order', text: 'Val aan', request: { type: 'order', order: 'attack', village: target.id, x: target.x, y: target.y }, status: 'open', expires: s.time + DAY });
    expect(answerMessage(s, msg.id, true)).toBeNull();
    // scouts, or a small army: does not count
    leaderOrderLanded(s, target.id, { spy: 500 });
    leaderOrderLanded(s, target.id, { axe: 10 });
    expect(s.standing ?? 60).toBe(60);
    expect(s.leaderOrder).toBeDefined();
    leaderOrderLanded(s, target.id, { axe: 100 });
    expect(s.standing).toBe(66);
    const msg2 = addMessage(s, { kind: 'request', from: lead.id, title: 'Order', text: 'Val aan', request: { type: 'order', order: 'attack', village: target.id, x: target.x, y: target.y }, status: 'open', expires: s.time + DAY });
    answerMessage(s, msg2.id, true);
    s.time += DAY;
    checkLeaderOrder(s);
    expect(s.standing).toBe(58);
    const msg3 = addMessage(s, { kind: 'request', from: lead.id, title: 'Order', text: 'Val aan', request: { type: 'order', order: 'attack', village: target.id, x: target.x, y: target.y }, status: 'open', expires: s.time + DAY });
    answerMessage(s, msg3.id, false);
    expect(s.standing).toBe(54);
  });

  it('the order counts when the attack lands, not when it leaves (a recalled attack never does)', () => {
    const s = world();
    s.paused = false;
    const lead = s.players.find((p) => p.bot && villagesOf(s, p.id).length)!;
    const t = found(s, lead);
    join(s, t, s.players[HUMAN_ID]!);
    const home = playerVillage(s)!;
    home.units.axe = 200;
    const target = Object.values(s.villages).filter((v) => v.owner !== HUMAN_ID && v.owner !== lead.id).sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y))[0]!;
    const msg = addMessage(s, { kind: 'request', from: lead.id, title: 'Order', text: 'Val aan', request: { type: 'order', order: 'attack', village: target.id, x: target.x, y: target.y }, status: 'open', expires: s.time + DAY });
    answerMessage(s, msg.id, true);
    expect(sendAttack(s, home.id, target.id, { axe: 200 })).toBeNull();
    expect(s.leaderOrder).toBeDefined(); // sent, not landed yet
    for (let i = 0; i < 2000 && s.leaderOrder; i++) advance(s, 60_000);
    expect(s.leaderOrder).toBeUndefined();
    expect(s.standing).toBe(66);
  });

  it('a merger proposal: their tribe goes up in yours', () => {
    const s = world();
    expect(foundTribe(s, 'Leeuwen', 'LEEUW')).toBeNull();
    const mine = tribeOf(s, HUMAN_ID)!;
    const [a, b] = s.players.filter((p) => p.bot && villagesOf(s, p.id).length);
    const theirs = found(s, a!);
    join(s, theirs, b!);
    setRelation(s, mine, theirs, 'ally');
    const msg = addMessage(s, { kind: 'merge', from: a!.id, tribe: theirs.id, merge: 'theirsIntoYours', title: 'Fusie', text: '', status: 'open', expires: s.time + DAY });
    expect(answerMessage(s, msg.id, true)).toBeNull();
    expect(mine.members).toContain(a!.id);
    expect(mine.members).toContain(b!.id);
    expect(s.tribes?.[theirs.id]).toBeUndefined();
  });
});
