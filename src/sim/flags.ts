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

import { FLAG_DROP, FLAG_NAMES, FLAG_TYPES, FLAG_VALUES, KILLS_PER_FLAG, dropLevel, type FlagType } from '../shared/flags';
export { FLAG_TYPES, FLAG_VALUES, FLAG_NAMES, type FlagType } from '../shared/flags';

/**
 * Per player: how many flags of each kind and level (index 0 = level 1), kills towards the next,
 * and (yours) whether flags merge by themselves. `drops`: earned flags were re-drawn once from the
 * level table (saves from before it).
 */
export interface FlagStock {
  have: Record<FlagType, number[]>; kills: number; auto?: boolean; drops?: number;
  /** Hang flags by themselves: 'keep' = every village upgrades its own kind (empty ones take the best), a kind = every village that kind. */
  hang?: 'keep' | FlagType;
}

/** The bonus of a village's flag of this kind (0 when none or flags are off). */
export function flagValue(config: WorldConfig, v: Village | undefined, type: FlagType): number {
  if (!config.flags || !v?.flag || v.flag.type !== type) return 0;
  return FLAG_VALUES[type][v.flag.level - 1] ?? 0;
}

/** Bump to re-draw the earned flags of every save once more. */
const DROPS_VERSION = 2;

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

/** Kept text: received flags per level, lowest first ("3× L1: Buit ×2, Geluk"). */
function overview(got: { type: FlagType; level: number }[]): Txt {
  const lines: Txt[] = [];
  for (let l = 1; l <= 9; l++) {
    const at = got.filter((f) => f.level === l);
    if (!at.length) continue;
    const kinds = FLAG_TYPES.flatMap((t) => {
      const n = at.filter((f) => f.type === t).length;
      return n === 0 ? [] : [n > 1 ? T('{flag} ×{n}', { flag: FLAG_NAMES[t], n }) : T(FLAG_NAMES[t])];
    });
    lines.push(T('{n}× L{level}: {kinds}', { n: at.length, level: String(l), kinds: listTxt(kinds) }));
  }
  return lines.slice(1).reduce<Txt>((a, b) => T('{a}\n{b}', { a, b }), lines[0] ?? '');
}

function gift(state: WorldState, p: Player, n: number, why: Txt, bonus = 0, fixedLevel?: number): void {
  if (n <= 0) return;
  const s = stock(p);
  const got: { type: FlagType; level: number }[] = [];
  for (let i = 0; i < n; i++) {
    const f = fixedLevel ? { type: FLAG_TYPES[Math.floor(nextFloat(state.rng) * FLAG_TYPES.length)]!, level: fixedLevel } : draw(state, bonus);
    s.have[f.type][f.level - 1]!++;
    got.push(f);
  }
  if (p.id === HUMAN_ID) {
    const top = Math.max(...got.map((f) => f.level));
    addMessage(state, {
      kind: 'info', from: -1,
      title: n > 1
        ? (top >= RARE ? T('{n} vlaggen ontvangen (tot L{level})', { n, level: String(top) }) : T('{n} vlaggen ontvangen', { n }))
        : (top >= RARE ? T('Zeldzame vlag: {flags}!', { flags: flagList(got) }) : T('Vlag gekregen')),
      text: T('{why}:\n{flags}', { why, flags: overview(got) }),
    });
  }
  if (p.id === HUMAN_ID) afterNewFlags(state, p);
}

/** Yours: merge and hang by themselves when you asked for it. */
function afterNewFlags(state: WorldState, p: Player): void {
  // hanging one kind everywhere: the other kinds are of no use, so they melt into it first
  if (p.flags?.auto && p.flags.hang && p.flags.hang !== 'keep') meltAll(state, p, p.flags.hang);
  if (p.flags?.auto) mergeAll(state, p);
  if (p.flags?.hang) autoHang(state, p);
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
  if (state.config.flags && p) gift(state, p, 1, fromPlayer ? T('Voor je verovering op een speler') : T('Voor je verovering'), fromPlayer ? 1 : 0);
}
export function flagKills(state: WorldState, owner: number, killed: number): void {
  const p = state.players[owner];
  if (!state.config.flags || !p || killed <= 0) return;
  const s = stock(p);
  s.kills += killed;
  const n = Math.floor(s.kills / KILLS_PER_FLAG);
  if (!n) return;
  s.kills -= n * KILLS_PER_FLAG;
  gift(state, p, n, T('Voor {kills} verslagen vijanden', { kills: n * KILLS_PER_FLAG }));
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
    if (!p.flags) gift(state, p, 3, T('Startvlaggen'), 0, 1);
    if (stock(p).drops !== DROPS_VERSION) redrawEarned(state, p);
    if (!p.bot) { afterNewFlags(state, p); continue; }
    const pref = PREFER[p.bot.archetype];
    // flags of kinds it doesn't care for melt into its favourite
    meltAll(state, p, pref[0]!, pref);
    for (const t of FLAG_TYPES) for (let l = 1; l <= 8; l++) while (freeFlags(state, p, t, l) >= 3) upgradeFlag(state, p.id, t, l);
    for (const v of villagesOf(state, p.id)) {
      if (v.flag) continue;
      const pick = pref.flatMap((t) => [9, 8, 7, 6, 5, 4, 3, 2, 1].map((l) => ({ type: t, level: l }))).find((f) => freeFlags(state, p, f.type, f.level) > 0);
      if (!pick) break;
      setFlag(state, p.id, v.id, pick);
    }
  }
}


/** The drop table before the generous one (version 1), to work out what a stock was earned with. */
const OLD_DROP = [0.6, 0.25, 0.1, 0.035, 0.011, 0.003, 0.0008, 0.0002, 0];
const meanWorth = (table: number[], bonus: number) => table.reduce((a, q, i) => a + q * 3 ** Math.min(8, i + bonus), 0);
/** Kill flags came one per 1,500 before; now one per KILLS_PER_FLAG. */
const OLD_KILLS_PER_FLAG = 1500;

/**
 * New flag rules: the whole stock, hung flags included, is drawn again as if the current rules had
 * always held. What was earned is worked out from the stock: the three to start with, every conquest
 * (from a player a level higher), and the kill flags, estimated from what the stock is worth (saves
 * from before any drop table had only level-1 flags, each one earned). Villages keep their kind,
 * now with the best of the new flags of that kind.
 */
function redrawEarned(state: WorldState, p: Player): void {
  const s = stock(p);
  const before = s.drops ?? 0;
  s.drops = DROPS_VERSION;
  let worth = 0;
  for (const t of FLAG_TYPES) s.have[t].forEach((n, i) => (worth += n * 3 ** i));
  const st = state.worldStats?.players[p.id];
  const took = st?.took ?? 0;
  const barb = st?.tookBarb ?? 0;
  const oldKills = before >= 1
    ? Math.max(0, Math.round((worth - 3 - took * meanWorth(OLD_DROP, 1) - barb * meanWorth(OLD_DROP, 0)) / meanWorth(OLD_DROP, 0)))
    : Math.max(0, worth - 3 - took - barb);
  const kills = Math.round((oldKills * OLD_KILLS_PER_FLAG) / KILLS_PER_FLAG);

  const kinds = new Map<Village, FlagType>();
  for (const v of villagesOf(state, p.id)) {
    if (!v.flag) continue;
    kinds.set(v, v.flag.type);
    settle(state.config, v, state.time);
    delete v.flag;
  }
  s.have = empty();
  const got: { type: FlagType; level: number }[] = [];
  const add = (f: { type: FlagType; level: number }) => { s.have[f.type][f.level - 1]!++; got.push(f); };
  for (let i = 0; i < 3; i++) add({ type: FLAG_TYPES[Math.floor(nextFloat(state.rng) * FLAG_TYPES.length)]!, level: 1 });
  for (let i = 0; i < took; i++) add(draw(state, 1));
  for (let i = 0; i < barb + kills; i++) add(draw(state));
  // back in the villages: the best free flag of the kind that hung there
  const byLevel = [...kinds.keys()];
  for (const v of byLevel) {
    const free = freeFlagsByLevel(state, p, kinds.get(v)!);
    for (let l = 9; l >= 1; l--) if ((free[l - 1] ?? 0) > 0) { setFlag(state, p.id, v.id, { type: kinds.get(v)!, level: l }); break; }
  }
  if (p.id === HUMAN_ID) {
    addMessage(state, {
      kind: 'info', from: -1, title: T('Vlaggen opnieuw getrokken'),
      text: T('Nieuwe vlaggenregels: een vlag per {kills} verslagen vijanden en hogere levels. Je hele voorraad, ook de opgehangen vlaggen, is opnieuw getrokken alsof dit altijd zo was: 3 startvlaggen, {took} veroveringen op spelers, {barb} op barbaren en {n} vlaggen voor verslagen vijanden. Je dorpen houden hun soort met de beste nieuwe vlag daarvan.\n{flags}', {
        kills: KILLS_PER_FLAG, took, barb, n: kills, flags: overview(got),
      }),
    });
  }
}

/** Right after loading: saves from before the drop table get their flags re-drawn at once. */
export function redrawOnLoad(state: WorldState): void {
  if (!state.config.flags) return;
  for (const p of state.players) if (p.flags && p.flags.drops !== DROPS_VERSION) redrawEarned(state, p);
}

/** Merging brings every village up to this level first (when the flags allow), then pushes the top. */
const FLOOR = 5;

/**
 * Merges what can be merged so your villages get the best they can. Only the flags that end up hanging
 * count: as many as you have villages, of the kind you hang everywhere (otherwise of any kind). So:
 * pick the highest floor up to FLOOR that every village can reach when the lower flags climb as far as
 * they go and merge everything below it upwards; then lift as many villages as the spare flags allow
 * towards FLOOR; only once every village is at FLOOR does the rest climb to the top (highest first,
 * so the rare ones go up). Kinds no village needs merge all the way. With
 * hanging by itself on, hung flags join in (it hangs them again afterwards). `only`: one kind.
 */
export function mergeAll(state: WorldState, p: Player, only?: FlagType): number {
  if (!state.config.flags || !p.flags) return 0;
  const have = p.flags.have;
  const villages = villagesOf(state, p.id).length;
  const kind = p.flags.hang && p.flags.hang !== 'keep' ? p.flags.hang : null;
  const counted = kind ? [kind] : FLAG_TYPES;
  const kinds = only ? [only] : FLAG_TYPES;
  if (p.flags.hang) {
    for (const v of villagesOf(state, p.id)) {
      if (!v.flag || v.flag.type === 'pop') continue;
      settle(state.config, v, state.time);
      delete v.flag;
    }
  }
  // flags of a counted kind at level f or higher, once everything below f has climbed
  const reach = (f: number) => counted.reduce((a, t) => {
    const free = kinds.includes(t) ? freeFlagsByLevel(state, p, t) : Array(9).fill(0);
    let carry = 0;
    for (let l = 1; l < f; l++) carry = Math.floor((free[l - 1]! + carry) / 3);
    return a + carry + have[t].slice(f - 1).reduce((x, n) => x + n, 0);
  }, 0);
  let floor = 1;
  for (let f = 2; f <= FLOOR; f++) if (reach(f) >= villages) floor = f;
  let merged = 0;
  const one = (t: FlagType, l: number) => {
    if (freeFlags(state, p, t, l) < 3 || upgradeFlag(state, p.id, t, l) !== null) return false;
    merged++;
    return true;
  };
  const atLeast = (f: number) => counted.reduce((a, t) => a + have[t].slice(f - 1).reduce((x, n) => x + n, 0), 0);
  for (const t of kinds) {
    const all = !counted.includes(t);
    for (let l = 1; l < (all ? 9 : floor); l++) while (one(t, l));
  }
  // as many villages as the spare flags allow one level up, towards FLOOR
  for (let l = floor; l < FLOOR; l++) {
    for (let any = true; any && atLeast(floor) - 2 >= villages; ) {
      any = false;
      for (const t of kinds) if (counted.includes(t) && atLeast(floor) - 2 >= villages && one(t, l)) any = true;
    }
  }
  // every village at FLOOR: what's left over climbs to the top, the highest first
  if (atLeast(FLOOR) >= villages) {
    top: while (atLeast(FLOOR) - 2 >= villages) {
      for (let l = 8; l >= FLOOR; l--) for (const t of kinds) if (counted.includes(t) && one(t, l)) continue top;
      break;
    }
  }
  return merged;
}

/**
 * Room to lose flags: hanging one kind everywhere needs that many of the kind (the others can all
 * go); otherwise any flag will do, so the total has to stay at the number of villages.
 */
function room(state: WorldState, p: Player): (t: FlagType) => boolean {
  const villages = villagesOf(state, p.id).length;
  const count = (t: FlagType) => p.flags!.have[t].reduce((x, n) => x + n, 0);
  const kind = p.flags?.hang && p.flags.hang !== 'keep' ? p.flags.hang : null;
  return (t) => {
    if (kind) return t !== kind || count(t) - 2 >= villages;
    return FLAG_TYPES.reduce((a, k) => a + count(k), 0) - 2 >= villages;
  };
}

/**
 * Melting: three free flags of one level, any kinds, make one of that level of the kind `to`. Every
 * level, as long as there's room (see room; a bot melts only kinds outside `keep`). Returns how many.
 */
export function meltAll(state: WorldState, p: Player, to: FlagType, keep: FlagType[] = [to]): number {
  if (!state.config.flags || !p.flags) return 0;
  const ok = p.bot ? () => true : room(state, p);
  const from = FLAG_TYPES.filter((t) => !keep.includes(t) && t !== to);
  let melted = 0;
  for (let l = 1; l <= 9; l++) {
    const free = new Map(from.map((t) => [t, freeFlags(state, p, t, l)]));
    for (;;) {
      const sum = [...free.values()].reduce((a, n) => a + n, 0);
      if (sum < 3 || !ok(from.find((t) => free.get(t)! > 0) ?? to)) break;
      for (let i = 0; i < 3; i++) {
        const t = from.reduce((a, b) => (free.get(b)! > free.get(a)! ? b : a));
        free.set(t, free.get(t)! - 1);
        p.flags.have[t][l - 1]!--;
      }
      p.flags.have[to][l - 1]!++;
      melted++;
    }
  }
  return melted;
}

/**
 * Hangs flags by themselves (your setting `hang`): every village takes the best free flag of its
 * manager's kind, else of its own kind ('keep'; an empty village the best of any kind) or of the
 * chosen kind, and lets go of the one it had. Lowest villages first, again until nothing improves.
 */
export function autoHang(state: WorldState, p: Player): number {
  const mode = p.flags?.hang;
  if (!state.config.flags || !mode) return 0;
  const vs = villagesOf(state, p.id);
  let changed = 0;
  for (let pass = 0; pass < 9; pass++) {
    let any = false;
    for (const v of [...vs].sort((a, b) => (a.flag?.level ?? 0) - (b.flag?.level ?? 0))) {
      const want = v.manager?.flag ?? (mode === 'keep' ? v.flag?.type : mode);
      const cur = v.flag && (!want || v.flag.type === want) ? v.flag.level : 0;
      let best: { type: FlagType; level: number } | null = null;
      for (const t of want ? [want] : FLAG_TYPES) {
        const free = freeFlagsByLevel(state, p, t);
        for (let l = 9; l > (best?.level ?? 0); l--) if ((free[l - 1] ?? 0) > 0) { best = { type: t, level: l }; break; }
      }
      if (best && best.level > cur && setFlag(state, p.id, v.id, best) === null) { changed++; any = true; }
    }
    if (!any) break;
  }
  return changed;
}
