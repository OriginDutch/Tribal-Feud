/** Flags (world setting): kinds, TW values per level 1-9, names. Shared by the simulation and the UI. */
import { tr } from './i18n';

export type FlagType = 'res' | 'recruit' | 'attack' | 'defense' | 'luck' | 'pop' | 'coin' | 'haul';
export const FLAG_TYPES: FlagType[] = ['res', 'recruit', 'attack', 'defense', 'luck', 'pop', 'coin', 'haul'];

const STEP2 = [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1];
/** Bonus per level (index 0 = level 1). */
export const FLAG_VALUES: Record<FlagType, number[]> = {
  res: [0.04, 0.06, 0.08, 0.1, 0.12, 0.14, 0.16, 0.17, 0.18],
  recruit: [0.06, 0.08, 0.1, 0.12, 0.14, 0.16, 0.18, 0.19, 0.2],
  attack: STEP2,
  defense: STEP2,
  luck: STEP2,
  pop: STEP2,
  coin: [0.06, 0.08, 0.1, 0.12, 0.14, 0.16, 0.18, 0.19, 0.2],
  haul: STEP2,
};
export const FLAG_NAMES: Record<FlagType, string> = {
  res: 'Grondstofproductie', recruit: 'Rekruteersnelheid', attack: 'Aanvalskracht', defense: 'Verdedigingskracht',
  luck: 'Geluk', pop: 'Bevolking', coin: 'Goedkopere munten', haul: 'Buitcapaciteit',
};
export const FLAG_TEXT: Record<FlagType, (p: number) => string> = {
  res: (p) => tr('+{p}% productie', { p }), recruit: (p) => tr('{p}% sneller rekruteren', { p }), attack: (p) => tr('+{p}% aanval', { p }),
  defense: (p) => tr('+{p}% verdediging', { p }), luck: (p) => tr('geluk {p}% dichter bij 0 (aanval)', { p }), pop: (p) => tr('+{p}% boerderij', { p }),
  coin: (p) => tr('munten {p}% goedkoper', { p }), haul: (p) => tr('+{p}% buit', { p }),
};

/**
 * The level a new flag comes with: each level about three times rarer than the one below (the top
 * ones a bit more), so every level adds about as much on average (~5.8 level-1 flags per flag).
 * Level 9 only by merging. Index = level - 1.
 */
export const FLAG_DROP = [0.6, 0.25, 0.1, 0.035, 0.011, 0.003, 0.0008, 0.0002, 0];

/** A level from FLAG_DROP for a roll in [0, 1); `bonus` levels higher (a conquest on a player: 1). */
export function dropLevel(roll: number, bonus = 0): number {
  let acc = 0;
  for (let i = 0; i < FLAG_DROP.length; i++) {
    acc += FLAG_DROP[i]!;
    if (roll < acc) return Math.min(9, i + 1 + bonus);
  }
  return Math.min(9, 1 + bonus);
}
