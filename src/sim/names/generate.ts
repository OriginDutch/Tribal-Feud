/**
 * Player and tribe names as people make them on a Dutch Tribal Wars server. Pros pick clean
 * handles, mids a first name with a year or a "SirFarmalot", casuals whatever comes up. Hundreds
 * of thousands of possibilities, so worlds hardly ever share names; within a world never twice.
 */
import { ADJECTIVES, ADJECTIVES_NL, FIRST_NAMES, HANDLES, NOUNS, NOUNS_NL, PLACES, PRO_ADJECTIVES, PRO_NOUNS, ROLES, SILLY, TAG_STYLES, TITLES, TITLE_TAILS, TRIBES, TRIBE_FIRST, TRIBE_SECOND } from './words';

export type Tier = 'pro' | 'mid' | 'casual';
type Rand = () => number;

const pick = <T>(list: readonly T[], r: Rand): T => list[Math.floor(r() * list.length)]!;
const chance = (p: number, r: Rand) => r() < p;
/** 1962–2009, skipping 1969 (same joke as below). */
const year = (r: Rand) => { const y = 1962 + Math.floor(r() * 47); return y >= 1969 ? y + 1 : y; };
/** 1–99, without the one number every lobby turns into a joke. */
const small = (r: Rand) => { const n = 1 + Math.floor(r() * 98); return n >= 69 ? n + 1 : n; };
const lower = (s: string) => s.toLowerCase();

/** A bit of leetspeak now and then: e→3, a→4, o→0, i→1. */
function leet(s: string, r: Rand): string {
  const map: Record<string, string> = { e: '3', a: '4', o: '0', i: '1' };
  return s.replace(/[eaoi]/g, (c) => (chance(0.5, r) ? map[c]! : c));
}

const pro = (r: Rand) => {
  const a = pick(PRO_ADJECTIVES, r);
  let n = pick(PRO_NOUNS, r);
  while (n === a) n = pick(PRO_NOUNS, r);
  return a + n;
};
const PRO: ((r: Rand) => string)[] = [
  (r) => pick(HANDLES, r),
  pro,
  pro,
  pro,
  (r) => `${pick(HANDLES, r)}${pick(['_NL', 'NL', '_TW', '_BE', '01', '1', 'II', 'III', '_', 'X'], r)}`,
  (r) => `The${pro(r)}`,
  (r) => pick(ADJECTIVES_NL, r) + pick(NOUNS_NL, r),
];

const MID: ((r: Rand) => string)[] = [
  (r) => `${lower(pick(FIRST_NAMES, r))}${year(r)}`,
  (r) => `${pick(FIRST_NAMES, r)}${year(r) % 100}`.replace(/(\D)(\d)$/, '$10$2'),
  (r) => `${pick(FIRST_NAMES, r)}_${pick('ABCDEFGHIJKLMNOPRSTVWZ'.split(''), r)}`,
  (r) => `${pick(FIRST_NAMES, r)}${pick(['vd', 'van', 'de', 'v'], r)}${pick(['Berg', 'Veen', 'Dijk', 'Meer', 'Bos', 'Brink', 'Heuvel', 'Wal', 'Linden', 'Akker'], r)}`,
  (r) => `${pick(TITLES, r)}${pick(TITLE_TAILS, r)}`,
  (r) => `${pick(TITLES, r)}${pick(FIRST_NAMES, r)}`,
  (r) => `${pick(PLACES, r)}${pick(ROLES, r)}`,
  (r) => `${pick(PLACES, r)}${pick(ROLES, r)}${small(r)}`,
  (r) => `${pick(FIRST_NAMES, r)}${pick(['TheGreat', 'DeGrote', 'DeEerste', 'TheBrave', 'DeDappere', 'DeSlimme', 'TheBold', 'DeSterke'], r)}`,
  (r) => `${pick(ADJECTIVES_NL, r)}${pick(NOUNS_NL, r)}${small(r)}`,
];

const CASUAL: ((r: Rand) => string)[] = [
  (r) => `${pick(SILLY, r)}${small(r)}`,
  (r) => pick(SILLY, r),
  (r) => `xX${pick(SILLY, r)}Xx`,
  (r) => `xX${pick(ADJECTIVES, r)}${pick(NOUNS, r)}Xx`,
  (r) => `${pick(SILLY, r)}${year(r)}`,
  (r) => leet(pick(SILLY, r), r),
  (r) => `${lower(pick(FIRST_NAMES, r))}${small(r)}`,
  (r) => `${pick(['de', 'het', 'ik', 'mr', 'mrs', 'kleine', 'grote', 'dikke', 'boze'], r)}${pick(SILLY, r)}`,
  (r) => `${pick(SILLY, r)}_${pick(SILLY, r)}`,
  (r) => `${lower(pick(FIRST_NAMES, r))}${pick(['_', '.', ''], r)}${pick(['gamer', 'boy', 'meisje', 'nl', 'xd', 'lol', 'tw', 'pro', '123', '007'], r)}`,
];

const STYLES: Record<Tier, ((r: Rand) => string)[]> = { pro: PRO, mid: MID, casual: CASUAL };

/** A player name nobody in `taken` has yet (compared without case). */
export function playerName(tier: Tier, r: Rand, taken: Set<string>): string {
  for (let i = 0; i < 40; i++) {
    const name = pick(STYLES[tier], r)(r).slice(0, 24);
    if (!taken.has(name.toLowerCase())) { taken.add(name.toLowerCase()); return name; }
  }
  // extremely crowded: add a number until free
  const base = pick(STYLES[tier], r)(r).slice(0, 20);
  for (let n = 2; ; n++) {
    const name = `${base}${n}`;
    if (!taken.has(name.toLowerCase())) { taken.add(name.toLowerCase()); return name; }
  }
}

const dressTag = (tag: string, r: Rand) => pick(TAG_STYLES, r).replace('{}', tag);

/** A tribe name and tag not used in `taken` (names and tags compared without case). */
export function tribeName(r: Rand, taken: Set<string>): [string, string] {
  const free = (name: string, tag: string) => !taken.has(`n:${name.toLowerCase()}`) && !taken.has(`t:${tag.toLowerCase().replace(/[^a-z0-9&]/g, '')}`);
  const take = (name: string, tag: string): [string, string] => {
    taken.add(`n:${name.toLowerCase()}`);
    taken.add(`t:${tag.toLowerCase().replace(/[^a-z0-9&]/g, '')}`);
    return [name, tag];
  };
  for (let i = 0; i < 30; i++) {
    const [name, tag] = pick(TRIBES, r);
    const dressed = dressTag(tag, r);
    if (free(name, dressed)) return take(name, dressed);
  }
  for (let i = 0; i < 60; i++) {
    const [a, at] = pick(TRIBE_FIRST, r);
    const [b, bt] = pick(TRIBE_SECOND, r);
    const name = chance(0.3, r) ? `The ${a} ${b}` : `${a} ${b}`;
    const tag = dressTag(`${at}${bt}`, r);
    if (free(name, tag)) return take(name, tag);
  }
  for (let n = 2; ; n++) if (free(`Stam ${n}`, `STAM${n}`)) return take(`Stam ${n}`, `STAM${n}`);
}

/** How many different player names a style can make (for the record; not exact for templates that repeat a list). */
export function nameSpace(): Record<Tier, number> {
  const A = ADJECTIVES.length, N = NOUNS.length, H = HANDLES.length, F = FIRST_NAMES.length, S = SILLY.length;
  return {
    pro: H + A * N + H * 10 + A * N + N * 8,
    mid: F * 48 + F * 48 + F * 22 + F * 40 + TITLES.length * TITLE_TAILS.length + TITLES.length * F + PLACES.length * ROLES.length * 100 + F * 8 + ROLES.length * F,
    casual: S * 99 + S + S + A * N + S * 48 + S * 4 + F * 5 * 100 + 9 * S + S * S + F * 3 * 10,
  };
}
