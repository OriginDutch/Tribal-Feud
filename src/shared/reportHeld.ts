import type { Report } from '../sim/movement';
import type { ReportOwners } from './protocol';
import { tr } from './i18n';

/** Player ids as the sim uses them (sim/state HUMAN_ID, BARBARIAN); the UI can't import sim values. */
const HUMAN_ID = 0;
const BARBARIAN = -1;

/** Old reports have only names; 'Jij' and 'You' are the same player in either language. */
const me = (n: string) => (n === 'You' ? 'Jij' : n);
const sameName = (a: string, b: string) => me(a) === me(b);

/** The target changed hands since the report: who holds it now (null = same owner, or unknown). */
export function nowHeld(r: Report, now: ReportOwners): { mine: boolean; label: string } | null {
  const v = now[r.defender.id];
  if (!v) return null;
  const same = r.defender.owner !== undefined ? v.owner === r.defender.owner : sameName(v.ownerName, r.defender.ownerName);
  if (same) return null;
  if (v.owner === HUMAN_ID) return { mine: true, label: tr('nu van jou') };
  if (v.owner === BARBARIAN) return { mine: false, label: tr('nu barbaars') };
  return { mine: false, label: tr('nu van {name}', { name: v.ownerName }) };
}
