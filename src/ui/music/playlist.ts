/**
 * Which track plays next. The very first track after opening the game is one of the menu themes;
 * after that the tracks go round in shuffled rounds: every track plays once per round, and a
 * track never comes back within MIN_GAP tracks, also across the end of a round.
 */
export const TRACKS = ['menu-1', 'menu-2', 'realm', 'dusk-1', 'dusk-2', 'morning-1', 'morning-2'] as const;
export type Track = (typeof TRACKS)[number];
export const MENU_TRACKS: readonly Track[] = ['menu-1', 'menu-2'];
/** At least this many other tracks between two plays of the same one. */
export const MIN_GAP = 3;

export const TRACK_NAMES: Record<Track, string> = {
  'menu-1': 'Tribal Feud Theme',
  'menu-2': 'Tribal Feud Theme (V2)',
  realm: 'The Realm',
  'dusk-1': 'Village Dusk',
  'dusk-2': 'Village Dusk (V2)',
  'morning-1': 'Village Morning',
  'morning-2': 'Village Morning (V2)',
};

export interface Playlist {
  /** still to play in this round, next first */
  round: Track[];
  /** the last tracks played, newest last */
  recent: Track[];
}

type Rand = () => number;

function shuffle<T>(list: T[], rand: Rand): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Too close to the end of the last round: track at position i of the new one, with `recent` before it. */
const tooSoon = (order: Track[], recent: Track[]) =>
  order.slice(0, MIN_GAP).some((t, i) => recent.slice(recent.length - (MIN_GAP - i)).includes(t));

function newRound(recent: Track[], rand: Rand): Track[] {
  let order = shuffle([...TRACKS], rand);
  for (let tries = 0; tries < 50 && tooSoon(order, recent); tries++) order = shuffle([...TRACKS], rand);
  // still unlucky (practically never): move the offenders to the back, in order
  if (tooSoon(order, recent)) {
    const blocked = new Set(recent.slice(-MIN_GAP));
    order = [...order.filter((t) => !blocked.has(t)), ...order.filter((t) => blocked.has(t))];
  }
  return order;
}

/** Opening the game: a menu theme, then the rest of the first round. */
export function startPlaylist(rand: Rand = Math.random): { first: Track; playlist: Playlist } {
  const first = MENU_TRACKS[Math.floor(rand() * MENU_TRACKS.length)]!;
  return { first, playlist: { round: shuffle(TRACKS.filter((t) => t !== first), rand), recent: [first] } };
}

export function nextTrack(p: Playlist, rand: Rand = Math.random): { track: Track; playlist: Playlist } {
  const round = p.round.length ? p.round : newRound(p.recent, rand);
  const [track, ...rest] = round as [Track, ...Track[]];
  return { track, playlist: { round: rest, recent: [...p.recent, track].slice(-MIN_GAP) } };
}
