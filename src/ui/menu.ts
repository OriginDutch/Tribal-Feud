/**
 * The menu: main groups (each with one or more screens shown as tabs) and the buildings with a
 * function. One data structure for the side rail now and a bottom bar on phones later.
 */
import type { Screen } from './store';

export interface MenuGroup {
  id: string;
  label: string;
  icon: string;
  /** Screens of this group, as tabs; the first one opens. */
  tabs: { screen: Screen; label: string }[];
}

export const GROUPS: MenuGroup[] = [
  { id: 'dorp', label: 'Dorp', icon: 'overview', tabs: [{ screen: 'overview', label: 'Overzicht' }] },
  { id: 'dorpen', label: 'Dorpen', icon: 'villages', tabs: [{ screen: 'villages', label: 'Dorpen' }, { screen: 'manager', label: 'Accountmanager' }] },
  { id: 'kaart', label: 'Kaart', icon: 'map', tabs: [{ screen: 'map', label: 'Kaart' }] },
  { id: 'farm', label: 'Farm', icon: 'farm', tabs: [{ screen: 'farm', label: 'Farm-assistent' }] },
  { id: 'leger', label: 'Leger', icon: 'army', tabs: [{ screen: 'scavenge', label: 'Rooftocht' }, { screen: 'support', label: 'Support' }, { screen: 'simulator', label: 'Simulator' }] },
  { id: 'berichten', label: 'Berichten', icon: 'mail', tabs: [{ screen: 'reports', label: 'Rapporten' }, { screen: 'inbox', label: 'Inbox' }] },
  { id: 'stam', label: 'Stam', icon: 'tribes', tabs: [{ screen: 'tribes', label: 'Stammen' }, { screen: 'relations', label: 'Relaties' }] },
  { id: 'wereld', label: 'Wereld', icon: 'world', tabs: [{ screen: 'news', label: 'Nieuws' }, { screen: 'ranking', label: 'Ranglijst' }, { screen: 'stats', label: 'Statistiek' }] },
  { id: 'opdrachten', label: 'Opdrachten', icon: 'quests', tabs: [{ screen: 'quests', label: 'Opdrachten' }] },
];

export const SETTINGS: MenuGroup = {
  id: 'instellingen',
  label: 'Instellingen',
  icon: 'gear',
  tabs: [{ screen: 'settings', label: 'Sneltoetsen' }, { screen: 'debug', label: 'Log & debug' }],
};

/** Buildings you do something in (static ones like mines or the wall open from the village). */
export const MENU_BUILDINGS: { screen: Screen; label: string; building: string }[] = [
  { screen: 'main', label: 'Hoofdgebouw', building: 'main' },
  { screen: 'barracks', label: 'Kazerne', building: 'barracks' },
  { screen: 'stable', label: 'Stal', building: 'stable' },
  { screen: 'garage', label: 'Werkplaats', building: 'garage' },
  { screen: 'statue', label: 'Standbeeld', building: 'statue' },
  { screen: 'snob', label: 'Adelshoeve', building: 'snob' },
  { screen: 'smith', label: 'Smederij', building: 'smith' },
  { screen: 'place', label: 'Verzamelplaats', building: 'place' },
  { screen: 'market', label: 'Marktplaats', building: 'market' },
];

/** The group a screen belongs to (buildings and the player profile have none). */
export function groupOf(screen: Screen): MenuGroup | undefined {
  return [...GROUPS, SETTINGS].find((g) => g.tabs.some((t) => t.screen === screen));
}

export function isMenuBuilding(screen: Screen): boolean {
  return MENU_BUILDINGS.some((b) => b.screen === screen) || screen === 'building';
}
