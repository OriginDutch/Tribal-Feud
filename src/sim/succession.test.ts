import { txt } from '../shared/i18n';
import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { answerMessage } from './humanTribe';
import { BARBARIAN, HUMAN_ID, createWorld, invalidateOwners, villagesOf, type WorldState } from './state';
import { found, join, leave, setLeader } from './tribes';

function world(): WorldState {
  return createWorld(createConfig('classic', 'S', 41, { bots: { tiers: { pro: 1, mid: 0 }, count: 20 } } as never));
}

/** A bot-led tribe with you and two more bots in it. */
function tribe(s: WorldState) {
  const bots = s.players.filter((p) => p.bot && villagesOf(s, p.id).length).slice(0, 3);
  const t = found(s, bots[0]!);
  join(s, t, bots[1]!);
  join(s, t, bots[2]!);
  join(s, t, s.players[HUMAN_ID]!);
  return { t, lead: bots[0]!, a: bots[1]!, b: bots[2]! };
}

/** Makes a player tiny (one village, the rest goes barbarian) or big. */
function shrink(s: WorldState, id: number) {
  for (const v of villagesOf(s, id).slice(1)) v.owner = BARBARIAN;
  invalidateOwners(s);
}

describe('opvolging', () => {
  it('the strongest bot takes over; you hear about it', () => {
    const s = world();
    const { t, lead } = tribe(s);
    shrink(s, HUMAN_ID);
    for (const v of villagesOf(s, HUMAN_ID)) v.buildings.main = 1;
    leave(s, lead);
    expect(t.leader).not.toBe(HUMAN_ID);
    expect(t.members).not.toContain(lead.id);
    expect(s.inbox?.some((m) => m.kind === 'info' && /Nieuwe leider/.test(txt(m.title)))).toBe(true);
    expect(s.news?.some((n) => n.kind === 'leader')).toBe(true);
  });

  it('when you are the strongest a bot leads for now and you are asked; yes makes you leader', () => {
    const s = world();
    const { t, lead } = tribe(s);
    for (const v of villagesOf(s, HUMAN_ID)) for (const k of Object.keys(v.buildings) as (keyof typeof v.buildings)[]) v.buildings[k] = Math.max(v.buildings[k], 20);
    s.leaderOrder = { order: 'attack', village: 1, until: s.time + 1000, from: lead.id };
    leave(s, lead);
    expect(t.leader).not.toBe(HUMAN_ID);
    const offer = s.inbox!.find((m) => m.kind === 'lead' && m.status === 'open')!;
    expect(offer).toBeDefined();
    expect(answerMessage(s, offer.id, true)).toBeNull();
    expect(t.leader).toBe(HUMAN_ID);
    expect(s.standing).toBeUndefined();
    expect(s.leaderOrder).toBeUndefined();
  });

  it('no keeps the bot in charge', () => {
    const s = world();
    const { t, lead } = tribe(s);
    for (const v of villagesOf(s, HUMAN_ID)) for (const k of Object.keys(v.buildings) as (keyof typeof v.buildings)[]) v.buildings[k] = Math.max(v.buildings[k], 20);
    leave(s, lead);
    const interim = t.leader;
    const offer = s.inbox!.find((m) => m.kind === 'lead' && m.status === 'open')!;
    expect(answerMessage(s, offer.id, false)).toBeNull();
    expect(t.leader).toBe(interim);
    expect(offer.status).toBe('declined');
  });

  it('a new leader takes over half of your standing (halfway back to 60)', () => {
    const s = world();
    const { t, a, b } = tribe(s);
    s.standing = 100;
    setLeader(s, t, a.id);
    expect(s.standing).toBe(80);
    s.standing = 25;
    setLeader(s, t, b.id);
    expect(s.standing).toBe(43);
  });
});
