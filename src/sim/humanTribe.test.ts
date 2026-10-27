import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { answerMessage, applyToHuman, applyToTribe, foundTribe, humanTribeTick, invitePlayer, kickMember, leaveTribe, proposeToHuman } from './humanTribe';
import { sendAttack } from './movement';
import { HUMAN_ID, createWorld, playerVillage, villagesOf, type WorldState } from './state';
import { declareWar, fitCheck, found, join, tribeOf, type Tribe } from './tribes';
import { grudge } from './botReact';

/** All bots pro (always online) so their answers come at the first tick. */
function world(seed = 31): WorldState {
  return createWorld(createConfig('classic', 'H', seed, { bots: { tiers: { pro: 1, mid: 0 }, count: 40 }, conquest: { protectionDays: 0 } } as never));
}
const home = (s: WorldState) => playerVillage(s)!;
function botsByDistance(s: WorldState) {
  const h = home(s);
  return s.players.filter((p) => p.bot && villagesOf(s, p.id).length).sort((a, b) => {
    const d = (id: number) => { const v = villagesOf(s, id)[0]!; return Math.hypot(v.x - h.x, v.y - h.y); };
    return d(a.id) - d(b.id);
  });
}
/** A bot tribe next to you, led by a diplomat (likes taking people in). */
function tribeNextDoor(s: WorldState): Tribe {
  const [lead] = botsByDistance(s);
  lead!.bot!.archetype = 'diplomat';
  return found(s, lead!);
}

describe('your tribe', () => {
  it('founding: checks name and tag, then you lead it', () => {
    const s = world();
    expect(foundTribe(s, 'X', 'AB')).toMatch(/3 tot 32/);
    expect(foundTribe(s, 'De Testers', 'a!')).toMatch(/tag/);
    expect(foundTribe(s, 'De Testers', 'test')).toBeNull();
    const t = tribeOf(s, HUMAN_ID)!;
    expect(t.tag).toBe('TEST');
    expect(t.leader).toBe(HUMAN_ID);
    expect(foundTribe(s, 'Nog een', 'NOG')).toMatch(/al in een stam/);
    expect(leaveTribe(s)).toBeNull();
    expect(tribeOf(s, HUMAN_ID)).toBeUndefined();
  });

  it('applying: a leader nearby takes you in; one far away says you are too far', () => {
    const s = world();
    const near = tribeNextDoor(s);
    const farLead = botsByDistance(s).at(-1)!;
    const far = found(s, farLead);
    applyToTribe(s, far.id);
    humanTribeTick(s);
    expect(s.inbox!.at(-1)!.text).toMatch(/te ver/);
    let joined = false;
    for (let i = 0; i < 10 && !joined; i++) { applyToTribe(s, near.id); humanTribeTick(s); joined = tribeOf(s, HUMAN_ID)?.id === near.id; }
    expect(joined).toBe(true);
    expect(near.leader).not.toBe(HUMAN_ID); // you are not the leader by default
  });

  it('inviting: a loner nearby joins your tribe; only the leader can invite', () => {
    const s = world();
    foundTribe(s, 'De Testers', 'TEST');
    const t = tribeOf(s, HUMAN_ID)!;
    const loner = botsByDistance(s)[0]!;
    loner.bot!.archetype = 'diplomat';
    let joined = false;
    for (let i = 0; i < 10 && !joined; i++) { invitePlayer(s, loner.id); humanTribeTick(s); joined = loner.tribe === t.id; }
    expect(joined).toBe(true);
    expect(kickMember(s, loner.id)).toBeNull();
    expect(loner.tribe).toBeUndefined();
    expect(loner.bot!.grudges?.[HUMAN_ID]?.score).toBeGreaterThan(0.5);
  });

  it('a bot that wants in asks you; accept and it is a member', () => {
    const s = world();
    foundTribe(s, 'De Testers', 'TEST');
    const t = tribeOf(s, HUMAN_ID)!;
    const p = botsByDistance(s)[0]!;
    applyToHuman(s, p, t);
    const m = s.inbox!.at(-1)!;
    expect(m.kind).toBe('application');
    expect(s.alert?.autoPause).toBe(true);
    expect(answerMessage(s, m.id, true)).toBeNull();
    expect(p.tribe).toBe(t.id);
  });

  it('war on your tribe lands in your inbox and pauses the game; can be turned off', () => {
    const s = world();
    foundTribe(s, 'De Testers', 'TEST');
    const mine = tribeOf(s, HUMAN_ID)!;
    const enemy = found(s, botsByDistance(s)[3]!);
    declareWar(s, enemy, mine);
    expect(s.inbox!.at(-1)!.kind).toBe('war');
    expect(s.alert?.autoPause).toBe(true);
    delete s.alert;
    s.tribePause = { war: false, requests: true };
    const other = found(s, botsByDistance(s)[5]!);
    declareWar(s, other, mine);
    expect(s.alert).toBeUndefined();
  });

  it('a treaty proposed to you takes effect when you accept', () => {
    const s = world();
    foundTribe(s, 'De Testers', 'TEST');
    const mine = tribeOf(s, HUMAN_ID)!;
    const o = found(s, botsByDistance(s)[2]!);
    proposeToHuman(s, o, 'nap');
    const m = s.inbox!.at(-1)!;
    expect(answerMessage(s, m.id, true)).toBeNull();
    expect(mine.relations[o.id]).toBe('nap');
  });

  it('you cannot attack a tribe mate', () => {
    const s = world();
    const t = tribeNextDoor(s);
    join(s, t, s.players[HUMAN_ID]!);
    const mate = s.players[t.leader]!;
    const v = home(s);
    v.buildings.place = 1; v.units.axe = 50;
    expect(sendAttack(s, v.id, villagesOf(s, mate.id)[0]!.id, { axe: 10 })).toMatch(/stamgenoot/);
  });
  it('counts refusals: an invited bot that says no, and a tribe that turns your application down', () => {
    const s = world();
    const far = found(s, botsByDistance(s).at(-1)!);
    applyToTribe(s, far.id);
    humanTribeTick(s);
    expect(s.tribeRefusals?.applications[far.id]).toBe(1);
    foundTribe(s, 'De Testers', 'TEST');
    const loner = botsByDistance(s).filter((p) => p.tribe === undefined).at(-1)!;
    invitePlayer(s, loner.id);
    humanTribeTick(s);
    invitePlayer(s, loner.id);
    humanTribeTick(s);
    expect(s.tribeRefusals?.invites[loner.id]).toBe(2);
  });
});

describe('difficulty: kindness to your tribe', () => {
  it('easy reaches further for you, hard less; grudges against you fade faster on easy', () => {
    const s = world();
    expect(foundTribe(s, 'Leeuwen', 'LEEUW')).toBeNull();
    const t = tribeOf(s, HUMAN_ID)!;
    const bot = botsByDistance(s)[0]!;
    const reach = (d: 'easy' | 'normal' | 'hard') => { s.config.bots.difficulty = d; return fitCheck(s, t, bot.id).reach; };
    expect(reach('easy')).toBeCloseTo(reach('normal') + 4);
    expect(reach('hard')).toBeCloseTo(reach('normal') - 2);
    bot.bot!.grudges = { [HUMAN_ID]: { score: 1, at: s.time } } as never;
    s.time += 12 * 3_600_000;
    s.config.bots.difficulty = 'normal';
    const normal = grudge(s, bot, HUMAN_ID);
    s.config.bots.difficulty = 'easy';
    expect(grudge(s, bot, HUMAN_ID)).toBeLessThan(normal);
  });
});
