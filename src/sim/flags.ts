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
import { T, tr, type Txt } from '../shared/i18n';

import { FLAG_NAMES, FLAG_TYPES, FLAG_VALUES, dropLevel, type FlagType } from '../shared/flags';
export { FLAG_TYPES, FLAG_VALUES, FLAG_NAMES, type FlagType } from '../shared/flags';

/**
 * Per player: how many flags of each kind and level (index 0 = level 1), kills towards the next,
 * and (yours) whether flags merge by themselves. `drops`: earned flags were re-drawn once from the
 * level table (saves from before it).
 */
export interface FlagStock { have: Record<FlagType, number[]>; kills: number; auto?: boolean; drops?: number }

/** The bonus of a village's flag of this kind (0 when none or flags are off). */
export function flagValue(config: WorldConfig, v: Village | undefined, type: FlagType): number {
  if (!config.flags || !v?.flag || v.flag.type !== type) return 0;
  return FLAG_VALUES[type][v.flag.level - 1] ?? 0;
}

/** Bump to re-draw the earned flags of every save once more. */
const DROPS_VERSION = 1;

const empty = (): Record<FlagType, number[]> => Object.fromEntries(FLAG_TYPES.map((t) => [t, Array(9).fill(0)])) as Record<FlagType, number[]>;
function stock(p: Player): FlagStock {
  // a fresh stock already follows the drop table (only old saves get their flags re-drawn)
  return (p.flags ??= { have: empty(), kills: 0, drops: DROPS_VERSION });
}
/** A flag of a random kind, its level from the drop table (`bonus` levels higher). */
function draw(state: WorldState, bonus = 0): { type: FlagType; level: number } {
  const type = FLAG_TYPES[Math.floor(nextFloat(state.rng) * FLAG_TYPES.length)]!;
  return { type, level: dropLevel(nextFloat(state.rng), bonus) };
}

/** Rare enough to tell you about it. */
const RARE = 4;

/** Kept text: a list of items ("a, b, c"). */
function listTxt(items: Txt[]): Txt {
  return items.slice(1).reduce<Txt>((a, b) => T('{a}, {b}', { a, b }), items[0] ?? '');
}
const flagList = (fs: { type: FlagType; level: number }[]): Txt => listTxt(fs.map((f) => T('{flag} L{level}', { flag: FLAG_NAMES[f.type], level: String(f.level) })));

function gift(state: WorldState, p: Player, n: number, why: string, bonus = 0, fixedLevel?: number): void {
  const s = stock(p);
  const got: { type: FlagType; level: number }[] = [];
  for (let i = 0; i < n; i++) {
    const f = fixedLevel ? { type: FLAG_TYPES[Math.floor(nextFloat(state.rng) * FLAG_TYPES.length)]!, level: fixedLevel } : draw(state, bonus);
    s.have[f.type][f.level - 1]!++;
    got.push(f);
  }
  if (p.id === HUMAN_ID) {
    const rare = got.filter((f) => f.level >= RARE);
    addMessage(state, {
      kind: 'info', from: -1,
      title: rare.length ? T('Zeldzame vlag: {flags}!', { flags: flagList(rare) }) : n > 1 ? T('Vlaggen gekregen') : T('Vlag gekregen'),
      text: T('{why}: {flags}. Hang ze op in het dorpenscherm.', { why, flags: flagList(got) }),
    });
  }
  if (p.id === HUMAN_ID && s.auto) mergeAll(state, p);
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
  if (!state.config.flags || !p) return tr('Vlaggen staan uit op deze wereld.');
  if (level < 1 || level > 8) return tr('Dat level kan niet hoger.');
  if (freeFlags(state, p, type, level) < 3) return tr('Je hebt drie losse vlaggen van dit soort en level nodig.');
  const s = stock(p);
  s.have[type][level - 1]! -= 3;
  s.have[type][level]!++;
  return null;
}

export function setFlag(state: WorldState, owner: number, villageId: number, flag: { type: FlagType; level: number } | null): string | null {
  const p = state.players[owner];
  const v = state.villages[villageId];
  if (!state.config.flags || !p) return tr('Vlaggen staan uit op deze wereld.');
  if (!v || v.owner !== owner) return tr('Dat is niet jouw dorp.');
  if (v.flag?.type === 'pop' && (!flag || flag.type !== 'pop' || flag.level < v.flag.level)) {
    const cap = farmCapacityIn(state.config, v.buildings.farm) * (1 + (flag?.type === 'pop' ? FLAG_VALUES.pop[flag.level - 1]! : 0));
    if (popUsed(state.config, v) > Math.round(cap)) return tr('Eerst bevolking terug onder de grens zonder deze vlag.');
  }
  if (flag && !(v.flag?.type === flag.type && v.flag.level === flag.level) && freeFlags(state, p, flag.type, flag.level) < 1) return tr('Die vlag heb je niet (los).');
  settle(state.config, v, state.time);
  if (flag) v.flag = { ...flag };
  else delete v.flag;
  return null;
}

/**
 * Earned flags: one for every village taken (from a player one level higher), one per 1,500
 * enemies killed; the level comes from the drop table.
 */
export function flagForConquest(state: WorldState, owner: number, fromPlayer = false): void {
  const p = state.players[owner];
  if (state.config.flags && p) gift(state, p, 1, fromPlayer ? 'Voor je verovering op een speler' : 'Voor je verovering', fromPlayer ? 1 : 0);
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
    if (!p.flags) gift(state, p, 3, 'Startvlaggen', 0, 1);
    if (stock(p).drops !== DROPS_VERSION) redrawEarned(state, p);
    if (!p.bot) { if (p.flags?.auto) mergeAll(state, p); continue; }
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


/**
 * Saves from before the drop table: every flag earned so far (worked out from what you hold, merges
 * included, minus the three to start with) is drawn once more; a level 2 or higher comes on top of
 * what you have. Conquests on players draw a level higher. You never lose a flag by it.
 */
function redrawEarned(state: WorldState, p: Player): void {
  const s = stock(p);
  s.drops = DROPS_VERSION;
  let worth = 0;
  for (const t of FLAG_TYPES) s.have[t].forEach((n, i) => (worth += n * 3 ** i));
  const st = state.worldStats?.players[p.id];
  const fromPlayers = Math.min(st?.took ?? 0, Math.max(0, worth - 3));
  const rest = Math.max(0, worth - 3 - fromPlayers);
  const extra: number[] = Array(9).fill(0);
  for (let i = 0; i < fromPlayers + rest; i++) {
    const f = draw(state, i < fromPlayers ? 1 : 0);
    if (f.level < 2) continue;
    s.have[f.type][f.level - 1]!++;
    extra[f.level - 1]!++;
  }
  if (p.id === HUMAN_ID && extra.some((n) => n > 0)) {
    const extras = extra.flatMap((n, i) => (n ? [T('{n}× L{level}', { n, level: String(i + 1) })] : []));
    addMessage(state, { kind: 'info', from: -1, title: T('Vlaggen herzien'), text: T('Nieuwe vlaggen krijgen nu een level van 1 tot 8, hoe hoger hoe zeldzamer. Voor je {n} eerder verdiende vlaggen is opnieuw getrokken; je krijgt erbij: {extra}. Je bestaande vlaggen houd je.', { n: fromPlayers + rest, extra: listTxt(extras) }) });
  }
}

/** Right after loading: saves from before the drop table get their flags re-drawn at once. */
export function redrawOnLoad(state: WorldState): void {
  if (!state.config.flags) return;
  for (const p of state.players) if (p.flags && p.flags.drops !== DROPS_VERSION) redrawEarned(state, p);
}

/**
 * Merges what can be merged, low levels first, but keeps at least as many flags as you have
 * villages (each merge costs two), so every village can still hang one. `only`: one kind.
 */
export function mergeAll(state: WorldState, p: Player, only?: FlagType): number {
  if (!state.config.flags || !p.flags) return 0;
  const villages = villagesOf(state, p.id).length;
  let total = FLAG_TYPES.reduce((a, t) => a + p.flags!.have[t].reduce((x, n) => x + n, 0), 0);
  let merged = 0;
  // low levels first, the kinds in turn: when the village limit stops it, no kind was left behind
  const kinds = only ? [only] : FLAG_TYPES;
  for (let l = 1; l <= 8; l++) {
    for (let any = true; any && total - 2 >= villages; ) {
      any = false;
      for (const t of kinds) {
        if (total - 2 < villages || freeFlags(state, p, t, l) < 3) continue;
        if (upgradeFlag(state, p.id, t, l) !== null) continue;
        total -= 2;
        merged++;
        any = true;
      }
    }
  }
  return merged;
}
