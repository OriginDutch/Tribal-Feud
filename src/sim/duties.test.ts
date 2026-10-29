import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY } from '../shared/time';
import { addDuty, dutiesTick } from './duties';
import { sendAttack } from './movement';
import { HUMAN_ID, createWorld, villagesOf } from './state';
import { onTalksRound, startTalks, termsText } from './talks';
import { setRelation, type Tribe } from './tribes';

function setup() {
  const s = createWorld(createConfig('classic', 'Hulp', 8, { worldSpeed: 1, bots: { count: 30 }, conquest: { protectionDays: 0 } } as never));
  s.time = 5 * DAY;
  const bots = s.players.filter((p) => p.bot && villagesOf(s, p.id).length);
  const mk = (id: number, tag: string, leader: number, members: number[]): Tribe => ({ id, name: tag, tag, color: '#fff', leader, members: [leader, ...members], founded: 0, relations: {} });
  const w = bots[0]!, lead = bots[1]!, mate = bots[2]!, enemy = bots[3]!;
  const tw = mk(1, 'WIN', w.id, []), tl = mk(2, 'LOS', lead.id, [mate.id, HUMAN_ID]), te = mk(3, 'VIJ', enemy.id, []);
  s.tribes = { 1: tw, 2: tl, 3: te };
  w.tribe = 1; lead.tribe = 2; mate.tribe = 2; s.players[HUMAN_ID]!.tribe = 2; enemy.tribe = 3;
  setRelation(s, tw, te, 'war');
  for (const id of [HUMAN_ID, mate.id, lead.id]) for (const v of villagesOf(s, id)) { v.buildings.place = 1; v.units.axe = 1000; }
  return { s, tw, tl, te, mate, enemy, lead };
}

describe('help in attacks (peace term)', () => {
  it('reads as a term', () => {
    const { s, te } = setup();
    expect(termsText({ villages: 0, resources: 0, help: { target: te.id, space: 500 } }, s)).toBe('hulp: 500 boerderijplekken aanval per lid tegen [VIJ]');
  });

  it('attacks on the target tribe count, from all villages together; bots do their part by themselves', () => {
    const { s, tw, tl, te, mate, enemy } = setup();
    addDuty(s, tw, tl, te.id, 800);
    const d = s.duties![0]!;
    const target = villagesOf(s, enemy.id)[0]!;
    expect(sendAttack(s, villagesOf(s, HUMAN_ID)[0]!.id, target.id, { axe: 300 })).toBeNull();
    expect(d.sent[HUMAN_ID]).toBe(300);
    dutiesTick(s);
    expect(d.sent[mate.id]).toBeGreaterThanOrEqual(800);
  });

  it('you could have helped and did not: standing to just above the line; a second time and you are out', () => {
    const { s, tw, tl, te } = setup();
    s.standing = 70;
    addDuty(s, tw, tl, te.id, 500);
    s.time = s.duties![0]!.due + 1;
    dutiesTick(s);
    expect(s.standing).toBe(22);
    expect(s.players[HUMAN_ID]!.tribe).toBe(tl.id);
    addDuty(s, tw, tl, te.id, 500);
    s.time = s.duties![0]!.due + 1;
    dutiesTick(s);
    expect(s.players[HUMAN_ID]!.tribe).toBeUndefined();
  });

  it('you could not (not enough troops): nothing happens', () => {
    const { s, tw, tl, te } = setup();
    for (const v of villagesOf(s, HUMAN_ID)) v.units.axe = 10;
    s.standing = 70;
    addDuty(s, tw, tl, te.id, 500);
    s.time = s.duties![0]!.due + 1;
    dutiesTick(s);
    expect(s.standing).toBe(70);
  });

  it('a bot that held back: its mood drops to just above leaving', () => {
    const { s, tw, tl, te, mate } = setup();
    mate.bot!.awayUntil = s.time + 10 * DAY; // away: it does not send, but it could have
    mate.bot!.mood = 80;
    addDuty(s, tw, tl, te.id, 500);
    s.time = s.duties![0]!.due + 1;
    dutiesTick(s);
    expect(mate.bot!.mood).toBe(27);
  });

  it('talks: a winner at war with another tribe asks for help against it; agreed, it becomes a duty', () => {
    const { s, tw, tl, te } = setup();
    for (const v of villagesOf(s, tw.leader)) v.units.axe = 20000;
    setRelation(s, tw, tl, 'war');
    const t = startTalks(s, tw, tl)!;
    const bid = t.options.find((o) => o.kind === 'bid' && o.author === tw.leader)!;
    expect(bid.terms!.help?.target).toBe(te.id);
    t.votes = { [tw.leader]: bid.id };
    s.time = t.until;
    onTalksRound(s, t.id);
    t.votes = { [tl.leader]: t.options.find((o) => o.kind === 'accept')!.id };
    s.time = t.until;
    onTalksRound(s, t.id);
    expect(s.duties?.[0]?.target).toBe(te.id);
    expect(s.news!.at(-1)!.dry).toContain('hulp:');
  });
});
