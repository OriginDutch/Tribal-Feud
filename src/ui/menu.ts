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

/**
 * On a phone: five places in the bottom bar. The village with its buildings as a tab, messages
 * with the quests; the rest (farm, army, tribe, world, settings) behind "Meer".
 */
export const MOBILE_GROUPS: MenuGroup[] = [
  { id: 'dorp', label: 'Dorp', icon: 'overview', tabs: [{ screen: 'overview', label: 'Overzicht' }, { screen: 'buildings', label: 'Gebouwen' }] },
  GROUPS.find((g) => g.id === 'dorpen')!,
  GROUPS.find((g) => g.id === 'kaart')!,
  { id: 'berichten', label: 'Berichten', icon: 'mail', tabs: [{ screen: 'reports', label: 'Rapporten' }, { screen: 'inbox', label: 'Inbox' }, { screen: 'quests', label: 'Opdrachten' }] },
];
/** Behind "Meer" on a phone. */
export const MORE_IDS = ['farm', 'leger', 'stam', 'wereld'] as const;

export const SETTINGS: MenuGroup = {
  id: 'instellingen',
  label: 'Instellingen',
  icon: 'gear',
  tabs: [{ screen: 'settings', label: 'Sneltoetsen' }, { screen: 'rules', label: 'Wereld' }, { screen: 'sound', label: 'Geluid' }, { screen: 'debug', label: 'Log & debug' }, { screen: 'admin', label: 'Admin' }],
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

/** Tabs this player sees (the admin tab only for the admin). */
export function visibleTabs(g: MenuGroup, admin: boolean): MenuGroup['tabs'] {
  return admin ? g.tabs : g.tabs.filter((t) => t.screen !== 'admin');
}

/** The group a screen belongs to (buildings and the player profile have none). */
export function groupOf(screen: Screen, mobile = false): MenuGroup | undefined {
  return [...(mobile ? MOBILE_GROUPS : []), ...GROUPS, SETTINGS].find((g) => g.tabs.some((t) => t.screen === screen));
}

export function isMenuBuilding(screen: Screen): boolean {
  return MENU_BUILDINGS.some((b) => b.screen === screen) || screen === 'building';
}
