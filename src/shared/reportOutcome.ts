/**
 * How a report went, for the coloured dot in the list and the sound it makes. Losses count in
 * population (a nobleman weighs more than a spear): under LIGHT is a clean result, up to HEAVY a
 * few losses, above that heavy losses.
 */
import type { Report } from '../sim/movement';
import { DEFAULT_UNITS, UNIT_IDS, type UnitCounts } from './gameData';

/** Under this share lost: no real losses. */
export const LIGHT = 0.05;
/** Above this share lost: heavy losses. */
export const HEAVY = 0.4;

export type Outcome =
  // your attack
  | 'won' | 'some' | 'heavy' | 'lost' | 'conquest'
  // your scouts
  | 'scout' | 'scout-some' | 'scout-heavy'
  // your village (or your troops standing there as support) was attacked
  | 'def' | 'def-some' | 'def-heavy' | 'def-lost' | 'village-lost';

export type Sfx = 'battle-won' | 'battle-heavy' | 'battle-lost' | 'mission-received' | 'mission-complete' | 'mission-failed' | 'march';

const popOf = (u: UnitCounts) => UNIT_IDS.reduce((a, id) => a + (u[id] ?? 0) * DEFAULT_UNITS[id].pop, 0);
const share = (had: UnitCounts, lost: UnitCounts) => { const h = popOf(had); return h > 0 ? popOf(lost) / h : 0; };
const grade = (x: number) => (x < LIGHT ? 0 : x <= HEAVY ? 1 : 2);

const scoutOnly = (r: Report) => Object.entries(r.attackerUnits.sent).every(([u, n]) => u === 'spy' || !n);

export function reportOutcome(r: Report): Outcome {
  if (r.defense) {
    if (r.conquered) return 'village-lost';
    // their scouts: whether they got through or not, you only count what you lost
    if (scoutOnly(r)) { const d = r.defenderUnits; return (['def', 'def-some', 'def-heavy'] as const)[d ? grade(share(d.present, d.lost)) : 0]; }
    // the attacker won: whatever stood there is gone
    if (r.result !== 'loss') return 'def-lost';
    const mine = r.supportUnits ?? r.defenderUnits;
    const g = mine ? grade(share('present' in mine ? mine.present : {}, mine.lost)) : 0;
    return (['def', 'def-some', 'def-heavy'] as const)[g];
  }
  if (r.conquered) return 'conquest';
  if (r.result === 'loss') return 'lost';
  const g = grade(share(r.attackerUnits.sent, r.attackerUnits.lost));
  return scoutOnly(r) ? (['scout', 'scout-some', 'scout-heavy'] as const)[g] : (['won', 'some', 'heavy'] as const)[g];
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  won: 'Gewonnen', some: 'Gewonnen, wat verliezen', heavy: 'Gewonnen, zware verliezen', lost: 'Verloren', conquest: 'Veroverd',
  scout: 'Verkend', 'scout-some': 'Verkend, wat verkenners kwijt', 'scout-heavy': 'Verkend, veel verkenners kwijt',
  def: 'Verdedigd', 'def-some': 'Verdedigd, wat verliezen', 'def-heavy': 'Verdedigd, zware verliezen', 'def-lost': 'Doorgebroken', 'village-lost': 'Dorp verloren',
};

/** The sound of a report; farm runs (auto-farm, or an attack on barbarians that didn't take it) are silent. */
export function reportSound(r: Report): Sfx | null {
  // a farm run: by the farm tools (old reports: any attack on barbarians that didn't take it)
  if (r.auto || r.farm || (r.farm === undefined && !r.defense && r.defender?.owner === -1 && !r.conquered) || !r.attackerUnits) return null;
  const o = reportOutcome(r);
  if (o === 'lost' || o === 'def-lost' || o === 'village-lost') return 'battle-lost';
  if (o === 'heavy' || o === 'scout-heavy' || o === 'def-heavy') return 'battle-heavy';
  return 'battle-won';
}

/** When several sounds come at once, the most important one plays. */
export const SFX_PRIORITY: Record<Sfx, number> = {
  'battle-lost': 7, 'mission-failed': 7, 'battle-heavy': 6, 'mission-received': 5, 'mission-complete': 5, 'battle-won': 3, march: 1,
};
