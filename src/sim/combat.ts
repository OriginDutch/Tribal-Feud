/**
 * Battle calculation. Pure: no state, no RNG (luck and morale are passed in),
 * so it is easy to test and to reuse later for a battle simulator.
 * Formulas: see the design doc, tab "Spelwaardes fase 2", section "Fase 3".
 */
import type { WorldConfig } from '../shared/config';
import { MIN_LEVEL_ONE, UNIT_CLASS, UNIT_IDS, type BuildingId, type UnitCounts, type UnitId } from '../shared/gameData';

export interface BattleInput {
  attacker: UnitCounts;
  defender: UnitCounts;
  wall: number;
  /** 0.3..1 */
  morale: number;
  /** -luckRange..+luckRange */
  luck: number;
  catapultTarget?: BuildingId;
  /** Current level of the catapult target. */
  targetLevel?: number;
  /** Per-unit strength multipliers (research levels, paladin items); missing = 1. */
  attackerUnitBonus?: Partial<Record<UnitId, number>>;
  defenderUnitBonus?: Partial<Record<UnitId, number>>;
  /** Whole-side multipliers (flags, faith); missing = 1. */
  attackerFactor?: number;
  defenderFactor?: number;
}

export interface BattleResult {
  /** True if the attacker won the main battle (or there was no main battle and only spies went). */
  attackerWon: boolean;
  attackerLost: UnitCounts;
  defenderLost: UnitCounts;
  /** Spies of the attacker that got through. */
  spiesSurvived: number;
  wallBefore: number;
  /** Wall level used in the fight after the rams' pre-battle effect. */
  wallEffective: number;
  wallAfter: number;
  buildingBefore?: number;
  buildingAfter?: number;
  attackStrength: number;
  defenseStrength: number;
}

function count(units: UnitCounts, u: UnitId): number {
  return units[u] ?? 0;
}

/** Spends `effective` rams/catapults level by level; each level costs perLevel * 1.09^level. */
function demolish(level: number, effective: number, perLevel: number, minLevel: number): number {
  let left = effective;
  let lvl = level;
  while (lvl > minLevel) {
    const cost = perLevel * 1.09 ** lvl;
    if (left < cost) break;
    left -= cost;
    lvl--;
  }
  return lvl;
}

export function fight(config: WorldConfig, input: BattleInput): BattleResult {
  const { units, combat } = config;
  const attackerLost: UnitCounts = {};
  const defenderLost: UnitCounts = {};

  // --- 1. spies fight spies first ---
  const attSpies = count(input.attacker, 'spy');
  const defSpies = count(input.defender, 'spy');
  let spiesSurvived = 0;
  if (attSpies > 0) {
    if (attSpies > defSpies) {
      const lost = Math.round(attSpies * (defSpies / attSpies) ** 1.5);
      attackerLost.spy = lost;
      spiesSurvived = attSpies - lost;
    } else {
      attackerLost.spy = attSpies;
    }
  }

  // --- 2. main battle (attacking spies don't take part) ---
  const fighters = UNIT_IDS.filter((u) => u !== 'spy' && count(input.attacker, u) > 0);
  const wallBefore = input.wall;
  const rams = count(input.attacker, 'ram');
  const lowered = Math.min(Math.floor(wallBefore / 2), Math.round((rams / 4) * 1.09 ** -wallBefore));
  const wallEffective = wallBefore - lowered;

  if (fighters.length === 0) {
    // spy-only attack: nothing else happens
    return {
      attackerWon: spiesSurvived > 0,
      attackerLost,
      defenderLost,
      spiesSurvived,
      wallBefore,
      wallEffective: wallBefore,
      wallAfter: wallBefore,
      attackStrength: 0,
      defenseStrength: 0,
    };
  }

  const attackByClass = { infantry: 0, cavalry: 0, archer: 0 };
  for (const u of fighters) attackByClass[UNIT_CLASS[u]] += count(input.attacker, u) * units[u].attack * (input.attackerUnitBonus?.[u] ?? 1);
  const attackTotal = attackByClass.infantry + attackByClass.cavalry + attackByClass.archer;

  let defenseUnits = 0;
  for (const u of UNIT_IDS) {
    const n = count(input.defender, u);
    if (n === 0) continue;
    const def = units[u];
    const weighted =
      attackTotal > 0
        ? (attackByClass.infantry * def.defense + attackByClass.cavalry * def.defenseCavalry + attackByClass.archer * def.defenseArcher) /
          attackTotal
        : def.defense;
    defenseUnits += n * weighted * (input.defenderUnitBonus?.[u] ?? 1);
  }
  defenseUnits *= input.defenderFactor ?? 1;
  const defense =
    (defenseUnits + combat.baseDefense + combat.wallDefensePerLevel * wallEffective) * combat.wallFactor ** wallEffective;
  const attack = attackTotal * (1 + input.luck) * input.morale * (input.attackerFactor ?? 1);
  const attackerWon = attack > defense;

  if (attackerWon) {
    const ratio = (defense / attack) ** 1.5;
    for (const u of fighters) attackerLost[u] = Math.round(count(input.attacker, u) * ratio);
    for (const u of UNIT_IDS) if (count(input.defender, u) > 0) defenderLost[u] = count(input.defender, u);
  } else {
    const ratio = attack > 0 ? (attack / defense) ** 1.5 : 0;
    for (const u of fighters) attackerLost[u] = count(input.attacker, u);
    for (const u of UNIT_IDS) {
      const n = count(input.defender, u);
      if (n > 0) defenderLost[u] = Math.round(n * ratio);
    }
  }

  // --- 3. rams and catapults after the battle ---
  // Won: survivors count fully, the fallen half. Lost: they only fought for part of the battle.
  const share = attackerWon ? 1 : attack / defense;
  const siegeEffect = (u: 'ram' | 'catapult') => {
    const sent = count(input.attacker, u);
    if (sent === 0) return { effective: 0, perLevel: 2 };
    const lost = count(attackerLost, u);
    return attackerWon
      ? { effective: sent - lost + lost / 2, perLevel: 2 }
      : { effective: sent * share ** 1.5, perLevel: 4 };
  };

  const ram = siegeEffect('ram');
  const wallAfter = ram.effective > 0 ? demolish(wallBefore, ram.effective, ram.perLevel, 0) : wallBefore;

  let buildingBefore: number | undefined;
  let buildingAfter: number | undefined;
  if (input.catapultTarget && input.targetLevel !== undefined && count(input.attacker, 'catapult') > 0) {
    const cat = siegeEffect('catapult');
    const min = MIN_LEVEL_ONE.includes(input.catapultTarget) ? 1 : 0;
    // catapults aimed at the wall hit the level the rams left
    const start = input.catapultTarget === 'wall' ? wallAfter : input.targetLevel;
    buildingBefore = input.catapultTarget === 'wall' ? wallBefore : input.targetLevel;
    buildingAfter = demolish(start, cat.effective, cat.perLevel, min);
  }

  const result: BattleResult = {
    attackerWon,
    attackerLost,
    defenderLost,
    spiesSurvived,
    wallBefore,
    wallEffective,
    wallAfter: input.catapultTarget === 'wall' && buildingAfter !== undefined ? buildingAfter : wallAfter,
    attackStrength: attack,
    defenseStrength: defense,
  };
  if (buildingBefore !== undefined) result.buildingBefore = buildingBefore;
  if (buildingAfter !== undefined) result.buildingAfter = buildingAfter;
  return result;
}

/** Morale for an attack from a player with `attackerPoints` on one with `defenderPoints`. */
export function morale(config: WorldConfig, attackerPoints: number, defenderPoints: number, defenderIsBarbarian: boolean): number {
  if (config.morale === 'off' || defenderIsBarbarian || attackerPoints <= 0) return 1;
  return Math.min(1, Math.max(0.3, (3 * defenderPoints) / attackerPoints + 0.3));
}
