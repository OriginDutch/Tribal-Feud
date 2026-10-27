/**
 * Everything that makes troops stronger or weaker than their base stats, per battle:
 * research levels (per unit, from the village the troops come from) and paladin items (the
 * attacking paladin's item; every defending paladin's item for the units of its type there).
 * Defenders from several villages (own troops + support) get a weighted average per unit.
 */
import { UNIT_IDS, type UnitCounts, type UnitId } from '../shared/gameData';
import type { BattleInput } from './combat';
import { defendingItems, equipped } from './paladin';
import type { WorldState } from './state';
import { techLevel, techMultiplier, type Village } from './village';

type Bonus = Pick<BattleInput, 'attackerUnitBonus' | 'defenderUnitBonus' | 'attackerFactor' | 'defenderFactor' | 'ramFactor' | 'catapultFactor'>;

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
  // paladin items
  if (state.config.paladin === 'items') {
    const it = (attacker.knight ?? 0) > 0 ? equipped(state, from.owner) : null;
    if (it?.unit && it.attack) out.attackerUnitBonus = { ...out.attackerUnitBonus, [it.unit]: (out.attackerUnitBonus?.[it.unit] ?? 1) * (1 + it.attack) };
    if (it?.id === 'morningstar') out.ramFactor = 2;
    if (it?.id === 'bonfire') out.catapultFactor = 2;
    const best: Partial<Record<UnitId, number>> = {};
    for (const d of defendingItems(state, target)) {
      if (d.unit && d.defense) best[d.unit] = Math.max(best[d.unit] ?? 1, 1 + d.defense);
      if (d.id === 'bonfire') best.catapult = 11;
    }
    if (Object.keys(best).length) {
      const def = { ...out.defenderUnitBonus };
      for (const [u, m] of Object.entries(best) as [UnitId, number][]) def[u] = (def[u] ?? 1) * m;
      out.defenderUnitBonus = def;
    }
  }
  return out;
}
