/** The tab title: the open screen, so several tabs of one world are told apart ("Kaart · Tribal Feud"). */
import { effect } from '@preact/signals';
import { GROUPS, MENU_BUILDINGS, SETTINGS } from './menu';
import { screen, snapshot, type Screen } from './store';

const OTHER: Partial<Record<Screen, string>> = { player: 'Speler', building: 'Gebouw', admin: 'Admin', sound: 'Geluid' };

export function screenLabel(s: Screen): string {
  for (const g of [...GROUPS, SETTINGS]) {
    const t = g.tabs.find((x) => x.screen === s);
    if (t) return t.label;
  }
  return MENU_BUILDINGS.find((b) => b.screen === s)?.label ?? OTHER[s] ?? 'Tribal Feud';
}

export function watchTitle(): void {
  effect(() => {
    const inWorld = snapshot.value?.village != null;
    document.title = inWorld ? `${screenLabel(screen.value)} · Tribal Feud` : 'Tribal Feud';
  });
}
