/**
 * Sound effects: reports, orders, an attack leaving. Only the tab you look at plays them, and at
 * most one every GAP_MS: when several come at once the most important one plays (a lost battle
 * over a won one), and what comes during the gap waits for its end (only the most important).
 * Volume and on/off are separate from the music, and every sound can be turned off on its own.
 */
import { signal } from '@preact/signals';
import { SFX_PRIORITY, type Sfx } from '../shared/reportOutcome';

const SETTINGS_KEY = 'tf-sfx';
/** Bump when the sound files change (they are cached for a year). */
const VERSION = 2;
/** At most one sound per this many ms (real time). */
const GAP_MS = 2000;

export const SFX_IDS: Sfx[] = ['battle-won', 'battle-heavy', 'battle-lost', 'mission-received', 'mission-complete', 'mission-failed', 'march'];
export const SFX_NAMES: Record<Sfx, string> = {
  'battle-won': 'Veldslag gewonnen',
  'battle-heavy': 'Gewonnen met zware verliezen',
  'battle-lost': 'Veldslag verloren',
  'mission-received': 'Opdracht ontvangen',
  'mission-complete': 'Opdracht voltooid',
  'mission-failed': 'Opdracht mislukt',
  march: 'Aanval vertrekt',
};

interface Settings {
  volume: number;
  muted: boolean;
  /** Sounds turned off one by one. */
  off: Sfx[];
}

function load(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return {
      volume: typeof s.volume === 'number' ? Math.min(1, Math.max(0, s.volume)) : 0.6,
      muted: s.muted === true,
      off: Array.isArray(s.off) ? s.off.filter((x): x is Sfx => SFX_IDS.includes(x)) : [],
    };
  } catch {
    return { volume: 0.6, muted: false, off: [] };
  }
}

export const sfxSettings = signal<Settings>(load());

export function setSfx(change: Partial<Settings>): void {
  sfxSettings.value = { ...sfxSettings.value, ...change };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(sfxSettings.value));
  } catch {
    /* private mode */
  }
}

const ext = (() => {
  try {
    return new Audio().canPlayType('audio/webm; codecs="opus"') ? 'webm' : 'm4a';
  } catch {
    return 'm4a';
  }
})();

const els = new Map<Sfx, HTMLAudioElement>();
function el(id: Sfx): HTMLAudioElement {
  let a = els.get(id);
  if (!a) {
    a = new Audio(`/sfx/${id}.${ext}?v=${VERSION}`);
    a.preload = 'auto';
    els.set(id, a);
  }
  return a;
}

let quietUntil = 0;
let waiting: Sfx | null = null;
let timer: number | undefined;

const allowed = (id: Sfx) => !sfxSettings.value.muted && !sfxSettings.value.off.includes(id) && sfxSettings.value.volume > 0;
const best = (list: Sfx[]) => list.reduce<Sfx | null>((a, b) => (a === null || SFX_PRIORITY[b] > SFX_PRIORITY[a] ? b : a), null);

function start(id: Sfx): void {
  const a = el(id);
  a.volume = sfxSettings.value.volume;
  a.currentTime = 0;
  a.play().catch(() => undefined);
  quietUntil = Date.now() + GAP_MS;
}

/** Sounds that came in: the most important one plays now, or right after the current one. */
export function playSounds(list: Sfx[]): void {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  const pick = best(list.filter(allowed));
  if (!pick) return;
  if (Date.now() >= quietUntil) { start(pick); return; }
  waiting = waiting && SFX_PRIORITY[waiting] >= SFX_PRIORITY[pick] ? waiting : pick;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const w = waiting;
    waiting = null;
    if (w && allowed(w)) start(w);
  }, quietUntil - Date.now());
}

/** For the settings: play one now (ignores the gap). */
export function testSound(id: Sfx): void {
  const a = el(id);
  a.volume = sfxSettings.value.volume;
  a.currentTime = 0;
  a.play().catch(() => undefined);
}
