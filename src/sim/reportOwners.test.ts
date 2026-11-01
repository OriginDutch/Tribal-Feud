import { describe, expect, it } from 'vitest';
import { createConfig } from '../shared/config';
import { nowHeld } from '../shared/reportHeld';
import { reportOwners, type Report } from './movement';
import { BARBARIAN, HUMAN_ID, createWorld, invalidateOwners } from './state';

function world() {
  return createWorld(createConfig('classic', 'B', 71, { worldSpeed: 1, bots: { tiers: { pro: 1, mid: 0 }, count: 20 } } as never));
}
const scout = (id: number, v: { id: number; name: string; x: number; y: number; owner: number }, ownerName: string): Report => ({
  id, time: 0, read: true, result: 'win', luck: 0, morale: 1,
  attacker: { id: 0, name: 'x', x: 0, y: 0, ownerName: 'jij', owner: HUMAN_ID },
  defender: { id: v.id, name: v.name, x: v.x, y: v.y, ownerName, owner: v.owner },
  attackerUnits: { sent: { spy: 1 }, lost: {} }, defenderUnits: null,
});

describe('report targets that changed hands', () => {
  it('says the scouted barbarian village is yours now, or whose', () => {
    const s = world();
    const [a, b, c] = Object.values(s.villages).filter((v) => v.owner === BARBARIAN);
    s.reports = [scout(1, a!, 'Barbaren'), scout(2, b!, 'Barbaren'), scout(3, c!, 'Barbaren')];
    const bot = s.players.find((p) => p.bot)!;
    a!.owner = HUMAN_ID; b!.owner = bot.id; invalidateOwners(s);
    const now = reportOwners(s);
    expect(nowHeld(s.reports[0]!, now)).toEqual({ mine: true, label: 'nu van jou' });
    expect(nowHeld(s.reports[1]!, now)).toEqual({ mine: false, label: `nu van ${bot.name}` });
    expect(nowHeld(s.reports[2]!, now)).toBeNull();
  });
  it('old reports without an owner id compare by name', () => {
    const s = world();
    const [a] = Object.values(s.villages).filter((v) => v.owner === BARBARIAN);
    const r = scout(1, a!, 'Barbaren');
    delete r.defender.owner;
    s.reports = [r];
    expect(nowHeld(r, reportOwners(s))).toBeNull();
    a!.owner = HUMAN_ID; invalidateOwners(s);
    expect(nowHeld(r, reportOwners(s))?.mine).toBe(true);
  });
});
