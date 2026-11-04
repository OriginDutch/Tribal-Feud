/**
 * Everything that makes troops stronger or weaker than their base stats, per battle:
 * research levels (per unit, from the village the troops come from), paladin items (the
 * attacking paladin's item; every defending paladin's item for the units of its type there),
 * faith (churches: troops from a village without faith fight at half strength), flags, and the
 * night bonus (defense x2 at night). Defenders from several villages (own troops + support) get a
 * weighted average. Every modifier also comes with a line of text for the battle report.
 */
import { UNIT_IDS, type UnitCounts, type UnitId } from '../shared/gameData';
import { DAY, HOUR } from '../shared/time';
import { T, type Txt } from '../shared/i18n';
import type { BattleInput } from './combat';
import { faithFactor } from './church';
import { flagValue } from './flags';
import { defendingItems, equipped } from './paladin';
import type { WorldState } from './state';
import { techLevel, techMultiplier, type Village } from './village';

type Bonus = Pick<BattleInput, 'attackerUnitBonus' | 'defenderUnitBonus' | 'attackerFactor' | 'defenderFactor' | 'ramFactor' | 'catapultFactor'>;
/** Kept in the battle report: shown with txt() in the reader's language. */
export interface BonusNotes { attacker: Txt[]; defender: Txt[] }

/** Night bonus hours (game clock): defense counts double from 0:00 to 8:00. */
export const NIGHT_START = 0, NIGHT_END = 8;
export function isNight(time: number): boolean {
  const h = Math.floor((time % DAY) / HOUR);
  return h >= NIGHT_START && h < NIGHT_END;
}

const pct = (x: number) => `${x > 1 ? '+' : ''}${Math.round((x - 1) * 100)}%`;

/** Strength multiplier of unit `u` from village `v` (1 when nothing applies). */
function unitMultiplier(state: WorldState, v: Village | undefined, u: UnitId): number {
  if (!v || state.config.research === 'simple') return 1;
  return techMultiplier(state.config, Math.max(1, techLevel(state.config, v, u)));
}

export function battleBonus(state: WorldState, from: Village, target: Village, attacker: UnitCounts): Bonus & { notes: BonusNotes } {
  const { config } = state;
  const out: Bonus & { notes: BonusNotes } = { notes: { attacker: [], defender: [] } };
  // a Dutch unit name: translated when the report is shown
  const name = (u: UnitId) => config.units[u].name;
  // every village that has troops in the defense, with its troops
  const defenders: [Village | undefined, UnitCounts][] = [[target, target.units], ...Object.entries(target.support ?? {}).map(([o, u]) => [state.villages[Number(o)], u] as [Village | undefined, UnitCounts])];

  if (config.research !== 'simple') {
    const att: Partial<Record<UnitId, number>> = {};
    for (const u of UNIT_IDS) if ((attacker[u] ?? 0) > 0) { const m = unitMultiplier(state, from, u); if (m !== 1) att[u] = m; }
    out.attackerUnitBonus = att;
    for (const [u, m] of Object.entries(att) as [UnitId, number][]) out.notes.attacker.push(T('Researchlevel {unit} {pct}', { unit: name(u), pct: pct(m) }));
    const sum: Partial<Record<UnitId, number>> = {}, n: Partial<Record<UnitId, number>> = {};
    for (const [v, units] of defenders) {
      for (const u of UNIT_IDS) {
        const c = units[u] ?? 0;
        if (c <= 0) continue;
        sum[u] = (sum[u] ?? 0) + c * unitMultiplier(state, v, u);
        n[u] = (n[u] ?? 0) + c;
      }
    }
    const def: Partial<Record<UnitId, number>> = {};
    for (const u of UNIT_IDS) if (n[u]) { const m = sum[u]! / n[u]!; if (m !== 1) def[u] = m; }
    out.defenderUnitBonus = def;
    for (const [u, m] of Object.entries(def) as [UnitId, number][]) out.notes.defender.push(T('Researchlevel {unit} {pct}', { unit: name(u), pct: pct(m) }));
  }
  // churches: troops from a village without faith fight at half strength
  if (config.churches) {
    out.attackerFactor = faithFactor(state, from);
    if (out.attackerFactor < 1) out.notes.attacker.push(T('Geen geloof {pct}', { pct: pct(out.attackerFactor) }));
    let sum = 0, n = 0;
    for (const [v, units] of defenders) {
      const c = UNIT_IDS.reduce((t, u) => t + (units[u] ?? 0) * config.units[u].pop, 0);
      sum += c * faithFactor(state, v);
      n += c;
    }
    if (n > 0) {
      out.defenderFactor = sum / n;
      if (out.defenderFactor < 1) out.notes.defender.push(T(out.defenderFactor <= 0.5 ? 'Geen geloof {pct}' : 'Deels zonder geloof {pct}', { pct: pct(out.defenderFactor) }));
    }
  }
  // flags: attack strength of the attacking village, defense strength of the defending one
  if (config.flags) {
    const a = flagValue(config, from, 'attack'), d = flagValue(config, target, 'defense');
    if (a) { out.attackerFactor = (out.attackerFactor ?? 1) * (1 + a); out.notes.attacker.push(T('Vlag aanvalskracht {pct}', { pct: pct(1 + a) })); }
    if (d) { out.defenderFactor = (out.defenderFactor ?? 1) * (1 + d); out.notes.defender.push(T('Vlag verdedigingskracht {pct}', { pct: pct(1 + d) })); }
    const l = flagValue(config, from, 'luck');
    if (l) out.notes.attacker.push(T('Gelukvlag: geluk {n}% dichter bij 0', { n: Math.round(l * 100) }));
  }
  // paladin items
  if (config.paladin === 'items') {
    const it = (attacker.knight ?? 0) > 0 ? equipped(state, from.owner) : null;
    if (it?.unit && it.attack) {
      out.attackerUnitBonus = { ...out.attackerUnitBonus, [it.unit]: (out.attackerUnitBonus?.[it.unit] ?? 1) * (1 + it.attack) };
      out.notes.attacker.push(T('{item}: {unit} {pct}', { item: it.name, unit: name(it.unit), pct: pct(1 + it.attack) }));
    }
    if (it?.id === 'morningstar') { out.ramFactor = 2; out.notes.attacker.push(T('{item}: rammen ×2', { item: it.name })); }
    if (it?.id === 'bonfire') { out.catapultFactor = 2; out.notes.attacker.push(T('{item}: katapulten ×2', { item: it.name })); }
    if (it?.id === 'scepter') out.notes.attacker.push(T('{item}: toestemming −30 of meer', { item: it.name }));
    const best: Partial<Record<UnitId, number>> = {};
    for (const d of defendingItems(state, target)) {
      if (d.unit && d.defense && 1 + d.defense > (best[d.unit] ?? 1)) { best[d.unit] = 1 + d.defense; out.notes.defender.push(T('{item}: {unit} {pct}', { item: d.name, unit: name(d.unit), pct: pct(1 + d.defense) })); }
      if (d.id === 'bonfire') { best.catapult = 11; out.notes.defender.push(T('{item}: katapulten ×11', { item: d.name })); }
    }
    if (Object.keys(best).length) {
      const def = { ...out.defenderUnitBonus };
      for (const [u, m] of Object.entries(best) as [UnitId, number][]) def[u] = (def[u] ?? 1) * m;
      out.defenderUnitBonus = def;
    }
  }
  // night bonus: players' villages defend double at night
  if (config.nightBonus && target.owner >= 0 && isNight(state.time)) {
    out.defenderFactor = (out.defenderFactor ?? 1) * 2;
    out.notes.defender.push(T('Nachtbonus ×2'));
  }
  return out;
}
