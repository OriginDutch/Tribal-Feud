/**
 * Rooftocht math, shared by the simulation and the UI (live previews and mass planning).
 * See src/sim/scavenge.ts for the rules.
 */
import type { UnitCounts, UnitId } from './gameData';

export const SCAV_LEVELS = 4;
export const SCAV_NAMES = ['Luie zoekers', 'Bescheiden verzamelaars', 'Slimme speurders', 'Grote sjouwers'] as const;
/** Share of the carry capacity brought back (TW). */
export const SCAV_FACTORS = [0.1, 0.25, 0.5, 0.75] as const;
/** Attack value needed to lose nothing. */
export const SCAV_SAFE = [150, 1000, 3000, 8000] as const;
/** Losses at zero strength; they drop linearly to 0 at the safe strength. */
export const SCAV_MAX_LOSS = 0.2;
/** Units that can go (TW: everything that carries, paladin included). */
export const SCAV_UNITS: UnitId[] = ['spear', 'sword', 'axe', 'archer', 'light', 'marcher', 'heavy', 'knight'];

export interface ScavParams {
  worldSpeed: number;
  productionMultiplier: number;
  units: Record<UnitId, { attack: number; carry: number }>;
}

export interface ScavPreview {
  level: number;
  carry: number;
  strength: number;
  safe: number;
  /** strength / safe, capped at 1 */
  ratio: number;
  lossShare: number;
  /** Total resources (a third of each). */
  loot: number;
  durationMs: number;
}

export function scavSum(p: ScavParams, units: UnitCounts, key: 'carry' | 'attack'): number {
  return SCAV_UNITS.reduce((n, u) => n + (units[u] ?? 0) * p.units[u][key], 0);
}

/** What a run would do (before losses are rolled). */
export function previewScav(p: ScavParams, level: number, units: UnitCounts): ScavPreview {
  const carry = scavSum(p, units, 'carry');
  const strength = scavSum(p, units, 'attack');
  const safe = SCAV_SAFE[level]!;
  const ratio = Math.min(1, strength / safe);
  const haul = carry * SCAV_FACTORS[level]!;
  // TW: ((haul^2 * 100)^0.45 + 1800) s, faster on fast worlds (speed^-0.55)
  const seconds = (Math.pow(haul * haul * 100, 0.45) + 1800) * Math.pow(p.worldSpeed, -0.55);
  const lossShare = SCAV_MAX_LOSS * (1 - ratio);
  // production multiplier: barbarians grow with it too, so a run keeps up the same way
  const loot = Math.floor(haul * (0.5 + 0.5 * ratio) * p.productionMultiplier);
  return { level, carry, strength, safe, ratio, lossShare, loot, durationMs: Math.round(seconds * 1000) };
}

/** How a template uses a unit: not at all, or all but `keep` at home. */
export interface ScavUnitRule { use: boolean; keep: number }

export interface ScavTemplate {
  id: string;
  name: string;
  units: Partial<Record<UnitId, ScavUnitRule>>;
  /** Which levels to fill (only open, free ones are used). */
  levels: boolean[];
  /** Drop levels that would lose troops, so every run is safe. */
  safeOnly: boolean;
}

export const DEFAULT_SCAV_TEMPLATE: ScavTemplate = {
  id: 'standaard',
  name: 'Standaard',
  units: { spear: { use: true, keep: 0 }, sword: { use: true, keep: 0 }, axe: { use: true, keep: 0 }, archer: { use: true, keep: 0 }, light: { use: true, keep: 0 }, marcher: { use: true, keep: 0 }, heavy: { use: true, keep: 0 } },
  levels: [true, true, true, true],
  safeOnly: false,
};

/**
 * Splits troops over levels so all runs take about as long (TW's "same time": equal haul per
 * level, so carry per level goes as 1/factor). Returns units per level (empty = not sent).
 */
export function planScav(p: ScavParams, home: UnitCounts, open: number, busy: number[], tpl: ScavTemplate): UnitCounts[] {
  const pool: UnitCounts = {};
  for (const u of SCAV_UNITS) {
    const rule = tpl.units[u];
    if (!rule?.use) continue;
    const n = Math.max(0, (home[u] ?? 0) - Math.max(0, rule.keep));
    if (n > 0) pool[u] = n;
  }
  let levels = [0, 1, 2, 3].filter((l) => l <= open && tpl.levels[l] && !busy.includes(l));
  for (;;) {
    const plan = split(pool, levels);
    if (!tpl.safeOnly) return plan;
    // the highest level that isn't safe goes; the others get its share
    const unsafe = [...levels].reverse().find((l) => scavSum(p, plan[l]!, 'carry') > 0 && previewScav(p, l, plan[l]!).ratio < 1);
    if (unsafe === undefined) return plan;
    levels = levels.filter((l) => l !== unsafe);
  }
}

function split(pool: UnitCounts, levels: number[]): UnitCounts[] {
  const out: UnitCounts[] = [{}, {}, {}, {}];
  if (!levels.length) return out;
  const weights = levels.map((l) => 1 / SCAV_FACTORS[l]!);
  const total = weights.reduce((a, b) => a + b, 0);
  for (const [u, n] of Object.entries(pool) as [UnitId, number][]) {
    let given = 0;
    levels.forEach((l, i) => {
      const k = Math.floor((n * weights[i]!) / total);
      if (k) out[l]![u] = k;
      given += k;
    });
    // rounding leftovers: to the highest chosen level, where a few more troops matter most
    const rest = n - given;
    const top = levels[levels.length - 1]!;
    if (rest) out[top]![u] = (out[top]![u] ?? 0) + rest;
  }
  return out;
}
