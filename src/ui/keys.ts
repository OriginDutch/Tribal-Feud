/**
 * Keyboard shortcuts: every action has a default key (or none) and the player can bind any key to
 * it in the settings. Bindings are stored in this browser. A key is written as its code with
 * modifiers ("Space", "KeyA", "Digit1", "Ctrl+KeyK"), so it works the same on any keyboard layout.
 */
import { signal } from '@preact/signals';
import { SPEEDS, type Speed } from '../shared/time';
import { GROUPS, MENU_BUILDINGS, SETTINGS } from './menu';
import { toggleMute } from './music/player';
import { openBuilding, paletteOpen, send, screen, snapshot, togglePause, type Screen } from './store';
import type { BuildingId } from '../shared/gameData';
import { tr } from '../shared/i18n';
import { stepVillage } from './components/VillageSwitcher';

export type KeyGroup = 'Algemeen' | 'Hoofdmenu' | 'Schermen' | 'Gebouwen';
export interface KeyAction {
  id: string;
  label: string;
  group: KeyGroup;
  def: string | null;
  run: () => void;
}

/** Opens the buildings menu in the rail (set by the rail). */
export const buildingsMenuOpen = signal(false);
/** True while the settings wait for a new key: shortcuts are off then. */
export const capturingKey = signal(false);

function stepSpeed(delta: number): void {
  const s = snapshot.value;
  if (!s) return;
  const i = SPEEDS.indexOf(s.speed);
  const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + delta))] as Speed;
  if (next !== s.speed) send({ type: 'setSpeed', speed: next });
}

const go = (sc: Screen) => () => (screen.value = sc);

export const ACTIONS: KeyAction[] = [
  { id: 'pause', label: 'Pauze / verder', group: 'Algemeen', def: 'Space', run: togglePause },
  { id: 'prevVillage', label: 'Vorig dorp', group: 'Algemeen', def: 'KeyA', run: () => stepVillage(-1) },
  { id: 'nextVillage', label: 'Volgend dorp', group: 'Algemeen', def: 'KeyD', run: () => stepVillage(1) },
  { id: 'palette', label: 'Zoeken', group: 'Algemeen', def: 'Ctrl+KeyK', run: () => (paletteOpen.value = !paletteOpen.value) },
  { id: 'save', label: 'Wereld opslaan', group: 'Algemeen', def: 'Ctrl+KeyS', run: () => send({ type: 'saveWorld' }) },
  { id: 'mute', label: 'Muziek aan / uit', group: 'Algemeen', def: 'KeyM', run: () => toggleMute() },
  { id: 'speedUp', label: 'Sneller', group: 'Algemeen', def: 'Equal', run: () => stepSpeed(1) },
  { id: 'speedDown', label: 'Langzamer', group: 'Algemeen', def: 'Minus', run: () => stepSpeed(-1) },
  ...GROUPS.map((g, i): KeyAction => ({ id: `group:${g.id}`, label: g.label, group: 'Hoofdmenu', def: `Digit${i + 1}`, run: go(g.tabs[0]!.screen) })),
  { id: 'buildings', label: 'Gebouwen (menu)', group: 'Hoofdmenu', def: 'Digit0', run: () => (buildingsMenuOpen.value = !buildingsMenuOpen.value) },
  { id: `group:${SETTINGS.id}`, label: SETTINGS.label, group: 'Hoofdmenu', def: null, run: go('settings') },
  ...[...GROUPS, SETTINGS]
    .filter((g) => g.tabs.length > 1)
    .flatMap((g) => g.tabs.map((t): KeyAction => ({ id: `screen:${t.screen}`, label: t.label, group: 'Schermen', def: null, run: go(t.screen) }))),
  ...MENU_BUILDINGS.map((b): KeyAction => ({ id: `building:${b.building}`, label: b.label, group: 'Gebouwen', def: null, run: () => openBuilding(b.building as BuildingId) })),
];

const STORE = 'keybinds';
function load(): Record<string, string | null> {
  try { return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, string | null>; } catch { return {}; }
}
/** The player's changes to the defaults (action id → key, or null for none). */
export const keyOverrides = signal<Record<string, string | null>>(load());

export function keyOf(id: string): string | null {
  const o = keyOverrides.value;
  if (id in o) return o[id] ?? null;
  return ACTIONS.find((a) => a.id === id)?.def ?? null;
}

export function setKey(id: string, key: string | null): void {
  const next = { ...keyOverrides.value };
  // a key belongs to one action: whoever had it loses it
  if (key) for (const a of ACTIONS) if (a.id !== id && keyOf(a.id) === key) next[a.id] = null;
  const def = ACTIONS.find((a) => a.id === id)?.def ?? null;
  if (key === def) delete next[id];
  else next[id] = key;
  keyOverrides.value = next;
  try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* private mode: this visit only */ }
}

export function resetKeys(): void {
  keyOverrides.value = {};
  try { localStorage.removeItem(STORE); } catch { /* ignore */ }
}

/** Who already has this key (other than `except`). */
export function actionWithKey(key: string, except?: string): KeyAction | undefined {
  return ACTIONS.find((a) => a.id !== except && keyOf(a.id) === key);
}

/** The key of a keydown event, or null for a bare modifier. */
export function keyFromEvent(e: KeyboardEvent): string | null {
  if (['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return null;
  const mods = [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : ''].filter(Boolean);
  return [...mods, e.code].join('+');
}

const NAMES: Record<string, string> = { Space: 'Spatie', Equal: '+', Minus: '−', NumpadAdd: 'Num +', NumpadSubtract: 'Num −', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backquote: '`', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\' };

/** "Ctrl+KeyK" → "Ctrl + K". */
export function keyLabel(key: string | null): string {
  if (!key) return '—';
  return key.split('+').map((p) => (p === 'Space' ? tr('Spatie') : NAMES[p] ?? p.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ').replace(/^Arrow/, tr('Pijl ')))).join(' + ');
}

/** Short form for the rail (only plain single keys). */
export function keyHint(id: string): string {
  const k = keyOf(id);
  if (!k || k.includes('+')) return '';
  const l = keyLabel(k);
  return l.length <= 2 ? l : '';
}

/** The one keydown handler of the game. */
export function onShortcut(e: KeyboardEvent): void {
  if (capturingKey.value) return;
  const el = e.target as HTMLElement | null;
  const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  const key = keyFromEvent(e);
  if (!key) return;
  // while typing only combinations with Ctrl work (Ctrl+K)
  if (typing && !key.startsWith('Ctrl+')) return;
  const action = ACTIONS.find((a) => keyOf(a.id) === key);
  if (!action) return;
  // the palette's own keys stay its own, except its toggle
  if (paletteOpen.value && action.id !== 'palette') return;
  e.preventDefault();
  action.run();
}
