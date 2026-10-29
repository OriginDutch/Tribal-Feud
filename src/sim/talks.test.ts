import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY } from '../shared/time';
import { sendAttack } from './movement';
import { cededTo, treatiesTick } from './peace';
import { reparationsTick } from './reparations';
import { HUMAN_ID, createWorld, invalidateOwners, villagesOf, type WorldState } from './state';
import { MAX_BIDS, cedable, isOutlaw, onTalksRound, proposeTalks, startTalks, tally, voteTalks, type Talks } from './talks';
import { applyToTribe } from './humanTribe';
import { mayAttack, setRelation, targetWeight, type Tribe } from './tribes';
import { createVillage } from './village';

function setup(humanIn: 'none' | 'leadsLoser' | 'memberLoser' = 'none') {
  const s = createWorld(createConfig('classic', 'Vrede', 5, { worldSpeed: 1, bots: { count: 30 }, conquest: { protectionDays: 0 } } as never));
  s.time = 5 * DAY;
  const bots = s.players.filter((p) => p.bot && villagesOf(s, p.id).length);
  const w = bots[0]!, l = humanIn === 'leadsLoser' ? s.players[HUMAN_ID]! : bots[1]!;
  const lm = bots[2]!;
  // the loser has a few extra villages of different size; its home stays
  const home = villagesOf(s, l.id)[0]!;
  for (let i = 1; i <= 3; i++) {
    const v = createVillage(s.config, 900000 + i, l.id, `L${i}`, home.x + i * 2, home.y + 1, s.time);
    v.buildings.place = 1;
    v.buildings.main = i * 3;
    v.units.spear = 500;
    s.villages[v.id] = v;
  }
  invalidateOwners(s);
  const mk = (id: number, tag: string, leader: number): Tribe => ({ id, name: tag, tag, color: '#fff', leader, members: [leader], founded: 0, relations: {} });
  const tw = mk(1, 'WIN', w.id), tl = mk(2, 'LOS', l.id);
  tl.members.push(lm.id);
  if (humanIn === 'memberLoser') tl.members.push(HUMAN_ID);
  s.tribes = { 1: tw, 2: tl };
  w.tribe = 1; l.tribe = 2; lm.tribe = 2;
  if (humanIn === 'memberLoser') s.players[HUMAN_ID]!.tribe = 2;
  // the winner is much stronger
  for (const v of villagesOf(s, w.id)) { v.units.axe = 5000; v.buildings.place = 1; }
  setRelation(s, tw, tl, 'war');
  return { s, w, l, lm, tw, tl };
}

/** Ends the current round now with these votes. */
function decide(s: WorldState, t: Talks, kind: 'accept' | 'bid' | 'reject') {
  const o = t.options.find((x) => x.kind === kind)!;
  t.votes = { [s.tribes![t.side]!.leader]: o.id };
  s.time = t.until;
  onTalksRound(s, t.id);
}

describe('peace talks', () => {
  it('start: a NAP while they talk, attacks underway turn around, the winner bids first', () => {
    const { s, w, l, tw, tl } = setup();
    const from = villagesOf(s, w.id)[0]!;
    expect(sendAttack(s, from.id, villagesOf(s, l.id)[0]!.id, { axe: 100 })).toBeNull();
    const t = startTalks(s, tw, tl)!;
    expect(Object.values(s.movements).some((m) => m.kind === 'attack' && m.owner === w.id)).toBe(false);
    expect(Object.values(s.movements).some((m) => m.kind === 'return' && m.owner === w.id)).toBe(true);
    expect(t.side).toBe(tw.id);
    expect(t.options.map((o) => o.kind)).toContain('bid');
    expect(mayAttack(s, w.id, l.id)).toBe(false);
    expect(sendAttack(s, from.id, villagesOf(s, l.id)[0]!.id, { axe: 10 })).toMatch(/vredesbesprekingen/);
    expect(s.news!.some((n) => n.kind === 'talks')).toBe(true);
  });

  it('offer, counter, counter: then the other side may only accept or break off', () => {
    const { s, tw, tl } = setup();
    const t = startTalks(s, tw, tl)!;
    decide(s, t, 'bid'); // winner offers
    expect(t.side).toBe(tl.id);
    decide(s, t, 'bid'); // loser counters
    decide(s, t, 'bid'); // winner's last word
    expect(t.bids).toHaveLength(MAX_BIDS);
    expect(t.side).toBe(tl.id);
    expect(t.options.map((o) => o.kind).sort()).toEqual(['accept', 'reject']);
    decide(s, t, 'reject');
    expect(s.talks).toHaveLength(0);
    expect(tw.relations[tl.id]).toBe('war');
    expect(s.news!.at(-1)!.kind).toBe('talksFailed');
  });

  it('accepted: the lowest-scoring villages are ceded and emptied (never the home or last village), then a NAP', () => {
    const { s, w, l, lm, tw, tl } = setup();
    const t = startTalks(s, tw, tl)!;
    const bid = t.options.find((o) => o.kind === 'bid')!;
    bid.terms = { villages: 2, resources: 0 };
    decide(s, t, 'bid');
    decide(s, t, 'accept');
    expect(tw.relations[tl.id]).toBe('nap');
    const treaty = s.treaties![0]!;
    expect(treaty.villages).toEqual(['L1', 'L2'].map((n) => villagesOf(s, l.id).find((v) => v.name === n)!.id));
    for (const id of treaty.villages) expect(s.villages[id]!.units.spear).toBe(0);
    expect(treaty.villages).not.toContain(villagesOf(s, l.id)[0]!.id);
    expect(villagesOf(s, lm.id).some((v) => treaty.villages.includes(v.id))).toBe(false); // his only village
    expect(cededTo(s, w.id, treaty.villages[0]!)).toBe(true);
    s.time = treaty.until + 1;
    treatiesTick(s);
    expect(s.treaties).toHaveLength(0);
    expect(s.news!.at(-1)!.kind).toBe('treaty');
  });

  it('nothing to cede: only resources; every loser member pays his share of the points, with merchants', () => {
    const { s, w, l, lm, tw, tl } = setup();
    for (const v of villagesOf(s, l.id).slice(1)) v.owner = w.id;
    invalidateOwners(s);
    expect(cedable(s, tl)).toHaveLength(0);
    for (const id of [l.id, lm.id]) for (const v of villagesOf(s, id)) { v.buildings.market = 10; v.buildings.main = 10; v.buildings.storage = 20; v.buildings.wood = 10; v.res = [50000, 50000, 50000]; v.resAt = s.time; }
    const t = startTalks(s, tw, tl)!;
    expect(t.options.find((o) => o.kind === 'bid')!.terms!.villages).toBe(0);
    t.options.find((o) => o.kind === 'bid')!.terms = { villages: 5, resources: 60000 };
    decide(s, t, 'bid');
    expect(t.bids[0]!.terms.villages).toBe(0); // clamped: nothing to give
    decide(s, t, 'accept');
    const trades = Object.values(s.movements).filter((m) => m.kind === 'trade');
    expect(trades.length).toBeGreaterThan(0);
    const paid = (id: number) => trades.filter((m) => m.owner === id).reduce((sum, m) => sum + m.res!.reduce((a, b) => a + b, 0), 0) + (s.reparations ?? []).filter((d) => d.from === id).reduce((sum, d) => sum + d.left, 0);
    expect(paid(l.id) + paid(lm.id)).toBeGreaterThan(59000);
    expect(trades.every((m) => s.villages[m.to]!.owner === w.id)).toBe(true);
    reparationsTick(s);
  });

  it('a tie goes the leader\'s way; who does not vote does not count', () => {
    const t = { options: [{ id: 1, kind: 'accept' }, { id: 2, kind: 'bid', author: 7 }, { id: 3, kind: 'reject' }], votes: { 7: 2, 8: 1 } } as unknown as Talks;
    expect(tally(t, 7).id).toBe(2);
    t.votes = { 8: 1, 9: 1, 7: 2 };
    expect(tally(t, 7).id).toBe(1);
    t.votes = {};
    expect(tally(t, 7).id).toBe(2);
  });

  it('you attack during the talks: out of your tribe and outlawed; both tribes may hunt you', () => {
    const { s, w, tl, tw } = setup('memberLoser');
    const me = villagesOf(s, HUMAN_ID)[0]!;
    me.units.axe = 100;
    me.buildings.place = 1;
    startTalks(s, tw, tl);
    const target = villagesOf(s, w.id)[0]!;
    expect(sendAttack(s, me.id, target.id, { axe: 50 })).toMatch(/vredesbesprekingen/);
    expect(sendAttack(s, me.id, target.id, { axe: 50 }, undefined, undefined, 0, undefined, true)).toBeNull();
    expect(s.players[HUMAN_ID]!.tribe).toBeUndefined();
    expect(tl.members).not.toContain(HUMAN_ID);
    expect(isOutlaw(s, HUMAN_ID)).toBe(true);
    expect(s.news!.at(-1)!.kind).toBe('outlaw');
    expect(applyToTribe(s, tw.id)).toMatch(/vogelvrij/);
    expect(targetWeight(s, w.id, HUMAN_ID)).toBeGreaterThan(targetWeight(s, w.id, tl.leader));
    expect(mayAttack(s, w.id, HUMAN_ID)).toBe(true);
  });

  it('your vote and bid: as leader your bid is the leader\'s suggestion, as member an alternative', () => {
    const lead = setup('leadsLoser');
    const t1 = startTalks(lead.s, lead.tw, lead.tl)!;
    decide(lead.s, t1, 'bid');
    expect(t1.side).toBe(lead.tl.id);
    const before = t1.options.filter((o) => o.kind === 'bid').length;
    expect(proposeTalks(lead.s, t1.id, { villages: 1, resources: 1000 })).toBeNull();
    expect(t1.options.filter((o) => o.kind === 'bid')).toHaveLength(before);
    expect(t1.options.find((o) => o.author === HUMAN_ID)!.terms).toEqual({ villages: 1, resources: 1000 });
    expect(lead.s.inbox!.some((m) => m.kind === 'talks')).toBe(true);

    const mem = setup('memberLoser');
    const t2 = startTalks(mem.s, mem.tw, mem.tl)!;
    expect(voteTalks(mem.s, t2.id, t2.options[0]!.id)).toMatch(/niet aan zet/);
    decide(mem.s, t2, 'bid');
    const n = t2.options.length;
    expect(proposeTalks(mem.s, t2.id, { villages: 0, resources: 5000 })).toBeNull();
    expect(t2.options).toHaveLength(n + 1);
    expect(t2.votes[HUMAN_ID]).toBe(t2.options.find((o) => o.author === HUMAN_ID)!.id);
  });

  it('defense sent back into a ceded village breaks the treaty: war again', () => {
    const { s, l, tw, tl } = setup();
    const t = startTalks(s, tw, tl)!;
    t.options.find((o) => o.kind === 'bid')!.terms = { villages: 1, resources: 0 };
    decide(s, t, 'bid');
    decide(s, t, 'accept');
    const treaty = s.treaties![0]!;
    const other = villagesOf(s, l.id).find((v) => !treaty.villages.includes(v.id))!;
    s.villages[treaty.villages[0]!]!.support = { [other.id]: { spear: 300 } };
    treatiesTick(s);
    expect(tw.relations[tl.id]).toBe('war');
  });
});
