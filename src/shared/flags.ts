/** Flags (world setting): kinds, TW values per level 1-9, names. Shared by the simulation and the UI. */
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
  res: (p) => `+${p}% productie`, recruit: (p) => `${p}% sneller rekruteren`, attack: (p) => `+${p}% aanval`,
  defense: (p) => `+${p}% verdediging`, luck: (p) => `geluk ${p}% dichter bij 0 (aanval)`, pop: (p) => `+${p}% boerderij`,
  coin: (p) => `munten ${p}% goedkoper`, haul: (p) => `+${p}% buit`,
};
