/**
 * Flags (world setting, TW): one flag per village, eight kinds, levels 1-9 (three of a level make
 * one of the next). You start with three level-1 flags and earn more by taking villages and by
 * killing enemy units. Values per level follow TW's flag table.
 */
import type { Archetype } from '../shared/botProfiles';
import type { WorldConfig } from '../shared/config';
import { addMessage } from './humanTribe';
import { nextFloat } from './rng';
import { HUMAN_ID, villagesOf, type Player, type WorldState } from './state';
import { farmCapacityIn } from './formulas';
import { popUsed, settle, type Village } from './village';

import { FLAG_NAMES, FLAG_TYPES, FLAG_VALUES, type FlagType } from '../shared/flags';
export { FLAG_TYPES, FLAG_VALUES, FLAG_NAMES, type FlagType } from '../shared/flags';

/** Per player: how many flags of each kind and level (index 0 = level 1), and kills towards the next. */
export interface FlagStock { have: Record<FlagType, number[]>; kills: number }

/** The bonus of a village's flag of this kind (0 when none or flags are off). */
export function flagValue(config: WorldConfig, v: Village | undefined, type: FlagType): number {
  if (!config.flags || !v?.flag || v.flag.type !== type) return 0;
  return FLAG_VALUES[type][v.flag.level - 1] ?? 0;
}

const empty = (): Record<FlagType, number[]> => Object.fromEntries(FLAG_TYPES.map((t) => [t, Array(9).fill(0)])) as Record<FlagType, number[]>;
function stock(p: Player): FlagStock {
  return (p.flags ??= { have: empty(), kills: 0 });
}
function gift(state: WorldState, p: Player, n: number, why: string): void {
  const s = stock(p);
  const got: FlagType[] = [];
  for (let i = 0; i < n; i++) {
    const t = FLAG_TYPES[Math.floor(nextFloat(state.rng) * FLAG_TYPES.length)]!;
    s.have[t][0]!++;
    got.push(t);
  }
  if (p.id === HUMAN_ID) addMessage(state, { kind: 'info', from: -1, title: `Vlag${n > 1 ? 'gen' : ''} gekregen`, text: `${why}: ${got.map((t) => FLAG_NAMES[t]).join(', ')} (level 1). Hang ze op in het dorpenscherm.` });
}

/** Free flags in stock (not hanging in a village). */
/** Free flags of one kind per level (index = level - 1), counting the villages once. */
export function freeFlagsByLevel(state: WorldState, p: Player, type: FlagType): number[] {
  const free = [...(p.flags?.have[type] ?? [])];
  for (const v of villagesOf(state, p.id)) if (v.flag?.type === type && free[v.flag.level - 1] !== undefined) free[v.flag.level - 1]!--;
  return free;
}

export function freeFlags(state: WorldState, p: Player, type: FlagType, level: number): number {
  const total = p.flags?.have[type][level - 1] ?? 0;
  const used = villagesOf(state, p.id).filter((v) => v.flag?.type === type && v.flag.level === level).length;
  return total - used;
}

export function upgradeFlag(state: WorldState, owner: number, type: FlagType, level: number): string | null {
  const p = state.players[owner];
  if (!state.config.flags || !p) return 'Vlaggen staan uit op deze wereld.';
  if (level < 1 || level > 8) return 'Dat level kan niet hoger.';
  if (freeFlags(state, p, type, level) < 3) return 'Je hebt drie losse vlaggen van dit soort en level nodig.';
  const s = stock(p);
  s.have[type][level - 1]! -= 3;
  s.have[type][level]!++;
  return null;
}

export function setFlag(state: WorldState, owner: number, villageId: number, flag: { type: FlagType; level: number } | null): string | null {
  const p = state.players[owner];
  const v = state.villages[villageId];
  if (!state.config.flags || !p) return 'Vlaggen staan uit op deze wereld.';
  if (!v || v.owner !== owner) return 'Dat is niet jouw dorp.';
  if (v.flag?.type === 'pop' && (!flag || flag.type !== 'pop' || flag.level < v.flag.level)) {
    const cap = farmCapacityIn(state.config, v.buildings.farm) * (1 + (flag?.type === 'pop' ? FLAG_VALUES.pop[flag.level - 1]! : 0));
    if (popUsed(state.config, v) > Math.round(cap)) return 'Eerst bevolking terug onder de grens zonder deze vlag.';
  }
  if (flag && !(v.flag?.type === flag.type && v.flag.level === flag.level) && freeFlags(state, p, flag.type, flag.level) < 1) return 'Die vlag heb je niet (los).';
  settle(state.config, v, state.time);
  if (flag) v.flag = { ...flag };
  else delete v.flag;
  return null;
}

/** Earned flags: one for every village taken from a player or barbarians, one per 1,500 enemies killed. */
export function flagForConquest(state: WorldState, owner: number): void {
  const p = state.players[owner];
  if (state.config.flags && p) gift(state, p, 1, 'Voor je verovering');
}
export function flagKills(state: WorldState, owner: number, killed: number): void {
  const p = state.players[owner];
  if (!state.config.flags || !p || killed <= 0) return;
  const s = stock(p);
  s.kills += killed;
  while (s.kills >= 1500) { s.kills -= 1500; gift(state, p, 1, 'Voor 1.500 verslagen vijanden'); }
}

const PREFER: Record<Archetype, FlagType[]> = {
  rusher: ['attack', 'haul', 'recruit', 'res'],
  opportunist: ['attack', 'coin', 'res', 'haul'],
  farmer: ['haul', 'res', 'recruit'],
  turtle: ['defense', 'res', 'pop'],
  supporter: ['defense', 'recruit', 'res'],
  diplomat: ['res', 'coin', 'defense'],
};

/** Runs with the diplomacy tick: starting flags for everyone; bots upgrade and hang theirs. */
export function flagsTick(state: WorldState): void {
  if (!state.config.flags) return;
  for (const p of state.players) {
    if (!villagesOf(state, p.id).length) continue;
    if (!p.flags) gift(state, p, 3, 'Startvlaggen');
    if (!p.bot) continue;
    for (const t of FLAG_TYPES) for (let l = 1; l <= 8; l++) while (freeFlags(state, p, t, l) >= 3) upgradeFlag(state, p.id, t, l);
    const pref = PREFER[p.bot.archetype];
    for (const v of villagesOf(state, p.id)) {
      if (v.flag) continue;
      const pick = pref.flatMap((t) => [9, 8, 7, 6, 5, 4, 3, 2, 1].map((l) => ({ type: t, level: l }))).find((f) => freeFlags(state, p, f.type, f.level) > 0);
      if (!pick) break;
      setFlag(state, p.id, v.id, pick);
    }
  }
}
