import { describe, expect, it } from 'vitest';
import type { Report } from '../sim/movement';
import { reportOutcome, reportSound } from './reportOutcome';

const base = (o: Partial<Report>): Report => ({
  id: 1, time: 0, read: false, luck: 0, morale: 1, result: 'win',
  attacker: { id: 1, name: 'A', x: 0, y: 0, ownerName: 'jij', owner: 0 },
  defender: { id: 2, name: 'B', x: 1, y: 1, ownerName: 'X', owner: 5 },
  attackerUnits: { sent: { axe: 100 }, lost: {} }, defenderUnits: { present: {}, lost: {} }, ...o,
});

describe('report outcomes', () => {
  it('attacks: clean under 5%, some up to 40%, heavy above; lost; conquest', () => {
    expect(reportOutcome(base({ attackerUnits: { sent: { axe: 100 }, lost: { axe: 4 } } }))).toBe('won');
    expect(reportOutcome(base({ result: 'winLosses', attackerUnits: { sent: { axe: 100 }, lost: { axe: 20 } } }))).toBe('some');
    expect(reportOutcome(base({ result: 'winLosses', attackerUnits: { sent: { axe: 100 }, lost: { axe: 41 } } }))).toBe('heavy');
    expect(reportOutcome(base({ result: 'loss' }))).toBe('lost');
    expect(reportOutcome(base({ conquered: true }))).toBe('conquest');
  });
  it('scouts are blue, with their losses', () => {
    expect(reportOutcome(base({ attackerUnits: { sent: { spy: 100 }, lost: {} } }))).toBe('scout');
    expect(reportOutcome(base({ attackerUnits: { sent: { spy: 100 }, lost: { spy: 50 } } }))).toBe('scout-heavy');
    expect(reportOutcome(base({ result: 'loss', attackerUnits: { sent: { spy: 100 }, lost: { spy: 100 } } }))).toBe('lost');
  });
  it('defence: held with your losses, broken, village lost; their scouts count as defence', () => {
    const d = (o: Partial<Report>) => base({ defense: true, result: 'loss', defenderUnits: { present: { spear: 100 }, lost: {} }, ...o });
    expect(reportOutcome(d({}))).toBe('def');
    expect(reportOutcome(d({ defenderUnits: { present: { spear: 100 }, lost: { spear: 10 } } }))).toBe('def-some');
    expect(reportOutcome(d({ result: 'win' }))).toBe('def-lost');
    expect(reportOutcome(d({ result: 'win', conquered: true }))).toBe('village-lost');
    expect(reportOutcome(d({ result: 'win', attackerUnits: { sent: { spy: 5 }, lost: {} } }))).toBe('def');
  });
  it('sounds: farm runs are silent; a lost one sounds lost', () => {
    expect(reportSound(base({ auto: true }))).toBeNull();
    expect(reportSound(base({ defender: { id: 2, name: 'B', x: 1, y: 1, ownerName: 'Barbaren', owner: -1 } }))).toBeNull();
    expect(reportSound(base({ defender: { id: 2, name: 'B', x: 1, y: 1, ownerName: 'Barbaren', owner: -1 }, conquered: true }))).toBe('battle-won');
    expect(reportSound(base({ result: 'loss' }))).toBe('battle-lost');
    expect(reportSound(base({ result: 'winLosses', attackerUnits: { sent: { axe: 100 }, lost: { axe: 60 } } }))).toBe('battle-heavy');
  });
});
