/**
 * Everything that makes troops stronger or weaker than their base stats, per battle:
 * research levels (per unit, from the village the troops come from). Later settings add to it.
 * Defenders from several villages (own troops + support) get a weighted average per unit.
 */
import { UNIT_IDS, type UnitCounts, type UnitId } from '../shared/gameData';
import type { BattleInput } from './combat';
import type { WorldState } from './state';
import { techLevel, techMultiplier, type Village } from './village';

type Bonus = Pick<BattleInput, 'attackerUnitBonus' | 'defenderUnitBonus' | 'attackerFactor' | 'defenderFactor'>;

/** Strength multiplier of unit `u` from village `v` (1 when nothing applies). */
function unitMultiplier(state: WorldState, v: Village | undefined, u: UnitId): number {
  if (!v || state.config.research === 'simple') return 1;
  return techMultiplier(state.config, Math.max(1, techLevel(state.config, v, u)));
}

export function battleBonus(state: WorldState, from: Village, target: Village, attacker: UnitCounts): Bonus {
  const out: Bonus = {};
  if (state.config.research !== 'simple') {
    const att: Partial<Record<UnitId, number>> = {};
    for (const u of UNIT_IDS) if ((attacker[u] ?? 0) > 0) { const m = unitMultiplier(state, from, u); if (m !== 1) att[u] = m; }
    out.attackerUnitBonus = att;
    // defenders: weighted by how many of each unit each village brings
    const sum: Partial<Record<UnitId, number>> = {}, n: Partial<Record<UnitId, number>> = {};
    const add = (v: Village | undefined, units: UnitCounts) => {
      for (const u of UNIT_IDS) {
        const c = units[u] ?? 0;
        if (c <= 0) continue;
        sum[u] = (sum[u] ?? 0) + c * unitMultiplier(state, v, u);
        n[u] = (n[u] ?? 0) + c;
      }
    };
    add(target, target.units);
    for (const [origin, units] of Object.entries(target.support ?? {})) add(state.villages[Number(origin)], units);
    const def: Partial<Record<UnitId, number>> = {};
    for (const u of UNIT_IDS) if (n[u]) { const m = sum[u]! / n[u]!; if (m !== 1) def[u] = m; }
    out.defenderUnitBonus = def;
  }
  return out;
}
