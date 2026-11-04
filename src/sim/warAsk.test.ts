import { txt } from '../shared/i18n';
import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { DAY } from '../shared/time';
import { askLeaderWar, humanTribeTick, warAskInfo, warAskVerdict, WAR_ASK_COOLDOWN } from './humanTribe';
import { HUMAN_ID, createWorld, villagesOf, type WorldState } from './state';
import { REACH, inContact, onDiplomacy, tribeCentre, tribeContacts, contactKey, type Tribe } from './tribes';
import { WAR_FRICTION, addFriction } from './warCause';
import { villagePoints } from './barbarians';

/**
 * Tribe A (bot leader, a bot mate and you) and tribe B (two bots on the border and a heavier
 * one further back). Villages are put by hand so the front line touches at y 200..206 while
 * both centres lie far behind it (the ONV case: centres far apart, villages side by side).
 */
function setup(opts: { contact?: boolean } = {}) {
  const s = createWorld(createConfig('classic', 'W', 12, { bots: { tiers: { pro: 1, mid: 0 }, count: 40 }, conquest: { protectionDays: 0 } } as never));
  s.time = 3 * DAY;
  const bots = s.players.filter((p) => p.isBot && villagesOf(s, p.id).length).slice(0, 5);
  const [lead, mate, b1, b2, big] = bots as [typeof bots[0], typeof bots[0], typeof bots[0], typeof bots[0], typeof bots[0]];
  const put = (id: number, x: number, y: number) => { const v = villagesOf(s, id)[0]!; v.x = x; v.y = y; return v; };
  /** Grow a village until it is worth about `times` a normal one (drags its tribe's centre). */
  const heavy = (id: number, times: number) => {
    const v = villagesOf(s, id)[0]!, base = villagePoints(s.config, villagesOf(s, lead.id)[0]!);
    const keys = Object.keys(v.buildings) as (keyof typeof v.buildings)[];
    for (let i = 0; i < 500 && villagePoints(s.config, v) < base * times; i++) v.buildings[keys[i % keys.length]!]++;
  };
  const contact = opts.contact ?? true;
  put(lead.id, 200, 200);
  put(mate.id, 200, 203);
  put(HUMAN_ID, 200, 170);
  heavy(HUMAN_ID, 3);
  put(b1.id, contact ? 203 : 330, 206);
  put(b2.id, contact ? 197 : 330, 206);
  put(big.id, 200, 236);
  heavy(big.id, 3);
  lead.bot!.archetype = 'turtle';
  const ta: Tribe = { id: 9101, name: 'Speer', tag: 'SPEER', color: '#fff', leader: lead.id, members: [lead.id, mate.id, HUMAN_ID], founded: 0, relations: {} };
  const tb: Tribe = { id: 9102, name: 'Onv', tag: 'ONV', color: '#000', leader: big.id, members: [big.id, b1.id, b2.id], founded: 0, relations: {} };
  s.tribes = { [ta.id]: ta, [tb.id]: tb };
  lead.tribe = mate.tribe = s.players[HUMAN_ID]!.tribe = ta.id;
  b1.tribe = b2.tribe = big.tribe = tb.id;
  // A clearly stronger
  villagesOf(s, lead.id)[0]!.units.axe = 5000;
  for (const id of [b1.id, b2.id, big.id]) villagesOf(s, id)[0]!.units.spear = 50;
  return { s, ta, tb, lead, b1 };
}
const centreDistance = (s: WorldState, a: Tribe, b: Tribe) => {
  const ca = tribeCentre(s, a)!, cb = tribeCentre(s, b)!;
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
};
/** Ticks until your ask is answered (the leader is a pro: online at once, or soon). */
function answer(s: WorldState): void {
  for (let i = 0; i < 50 && (s.tribeAsks ?? []).some((a) => a.kind === 'war'); i++) { humanTribeTick(s); s.time += 30 * 60_000; }
}

describe('tribes touch where their villages do', () => {
  it('three pairs of villages within reach make contact; two do not', () => {
    const { s, ta, tb, b1 } = setup();
    // A: lead + mate on the border, B: b1 + b2 -> 4 pairs
    expect(inContact(s, ta, tb)).toBe(true);
    // one of B's near villages gone far: 2 pairs left
    villagesOf(s, b1.id)[0]!.x = 300;
    s.time += 10 * 60_000; // contacts are cached per 10 game minutes
    expect(tribeContacts(s).has(contactKey(ta.id, tb.id))).toBe(false);
  });

  it('a front line counts even when the centres lie far apart: war comes', () => {
    const { s, ta, tb } = setup();
    expect(centreDistance(s, ta, tb)).toBeGreaterThan(REACH * 2.4);
    addFriction(s, ta.members[0]!, tb.members[1]!, WAR_FRICTION * 4, 'conquest');
    for (let i = 0; i < 12 && ta.relations[tb.id] !== 'war'; i++) onDiplomacy(s);
    expect(tb.members).toHaveLength(3); // nobody left: the war came from the front line, not a shrunken tribe
    expect(ta.relations[tb.id]).toBe('war');
  });

  it('far apart without a front line: no war, however much friction', () => {
    const { s, ta, tb } = setup({ contact: false });
    expect(centreDistance(s, ta, tb)).toBeGreaterThan(REACH * 2.4);
    addFriction(s, ta.members[0]!, tb.members[1]!, WAR_FRICTION * 4, 'conquest');
    for (let i = 0; i < 12; i++) onDiplomacy(s);
    expect(ta.relations[tb.id]).not.toBe('war');
  });
});

describe('asking your leader for a war', () => {
  it('only against a tribe you touch and have no treaty with', () => {
    const far = setup({ contact: false });
    expect(askLeaderWar(far.s, far.tb.id)).toMatch(/grenst nergens/);
    expect(warAskInfo(far.s).contact).toEqual([]);
    const { s, ta, tb } = setup();
    expect(warAskInfo(s).contact).toEqual([tb.id]);
    ta.relations[tb.id] = 'nap'; tb.relations[ta.id] = 'nap';
    expect(askLeaderWar(s, tb.id)).toMatch(/verdrag/);
  });

  it('enough friction: the leader declares war, for your sake', () => {
    const { s, ta, tb } = setup();
    addFriction(s, ta.members[0]!, tb.members[1]!, WAR_FRICTION * 1.2, 'conquest');
    expect(askLeaderWar(s, tb.id)).toBeNull();
    expect(askLeaderWar(s, tb.id)).toMatch(/al om een oorlog/);
    answer(s);
    expect(ta.relations[tb.id]).toBe('war');
    expect((s.tribeNews ?? []).some((n) => txt(n.text).includes('op jouw verzoek'))).toBe(true);
  });

  it('no reason: the leader says no, with why, and you wait a game day', () => {
    const { s, ta, tb } = setup();
    expect(askLeaderWar(s, tb.id)).toBeNull();
    answer(s);
    expect(ta.relations[tb.id]).toBeUndefined();
    const reply = s.inbox!.at(-1)!;
    expect(reply.title).toMatch(/geen oorlog/);
    expect(reply.text).toMatch(/aanleiding/);
    expect(askLeaderWar(s, tb.id)).toMatch(/wacht een speldag/i);
    expect(warAskInfo(s).waitUntil).toBeDefined();
    s.time += WAR_ASK_COOLDOWN;
    expect(askLeaderWar(s, tb.id)).toBeNull();
  });

  it('not strong enough: no, whatever the friction', () => {
    const { s, ta, tb, lead } = setup();
    villagesOf(s, lead.id)[0]!.units.axe = 0;
    addFriction(s, ta.members[0]!, tb.members[1]!, WAR_FRICTION * 5, 'conquest');
    expect(warAskVerdict(s, ta, tb, lead)).toMatch(/niet sterk genoeg/);
  });

  it('a leader that thinks highly of you needs less of a reason', () => {
    const { s, ta, tb, lead } = setup();
    addFriction(s, ta.members[0]!, tb.members[1]!, 9, 'conquest');
    s.standing = 30;
    expect(warAskVerdict(s, ta, tb, lead)).toMatch(/aanleiding/);
    s.standing = 96;
    expect(warAskVerdict(s, ta, tb, lead)).toBeNull();
  });
});

describe('friction overview', () => {
  it('your tribe: friction, what a war needs, the source and whether you touch', async () => {
    const { frictionView } = await import('./humanTribe');
    const { s, ta, tb } = setup();
    addFriction(s, ta.members[0]!, tb.members[1]!, 6, 'conquest');
    const [row] = frictionView(s);
    expect(row).toMatchObject({ tribe: tb.id, starter: 'us', why: 'conquest', contact: true, even: false });
    expect(row!.friction).toBeCloseTo(6);
    expect(row!.need).toBeCloseTo(WAR_FRICTION * 1.45);
    expect(row!.asked).toBeLessThan(row!.need);
    ta.relations[tb.id] = 'nap'; tb.relations[ta.id] = 'nap';
    expect(frictionView(s)[0]!.asked).toBeUndefined();
  });
});
