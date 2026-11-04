import { tr } from '../shared/i18n';
import { HUMAN_ID, type WorldState } from './state';

/**
 * Names the game hands out itself (you, your first village, an empty barbarian village) follow the
 * language. They're real names in the save, so on a language switch (or loading an older save) the
 * ones still at their default are renamed; names the player or a bot chose are never touched.
 */
const DEFAULTS: [nl: string, en: string][] = [
  ['Jij', 'You'],
  ['Jouw dorp', 'Your village'],
  ['Barbarendorp', 'Barbarian village'],
];

const variant = (name: string) => DEFAULTS.find(([nl, en]) => name === nl || name === en)?.[0];

/** The default name in the current language, when `name` is one of the defaults in either language. */
export function localName(name: string): string {
  const nl = variant(name);
  return nl ? tr(nl) : name;
}

let done: { s: WorldState; lang: string } | null = null;

/** Rename leftover default names to the current language; cheap when nothing changed since. */
export function localizeNames(s: WorldState, lang: string): void {
  if (done && done.s === s && done.lang === lang) return;
  done = { s, lang };
  const me = s.players[HUMAN_ID];
  if (me) me.name = localName(me.name);
  for (const v of Object.values(s.villages)) v.name = localName(v.name);
}
