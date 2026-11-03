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
/** Sounds of the interface itself (not from the game): a click on buttons. */
export type UiSfx = Sfx | 'click';
/** What the settings list: the game's sounds and the click. */
export const ALL_SFX: UiSfx[] = [...SFX_IDS, 'click'];
export const SFX_NAMES: Record<UiSfx, string> = {
  click: 'Klik op knoppen (proef)',
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
  off: UiSfx[];
}

function load(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return {
      volume: typeof s.volume === 'number' ? Math.min(1, Math.max(0, s.volume)) : 0.6,
      muted: s.muted === true,
      off: Array.isArray(s.off) ? s.off.filter((x): x is UiSfx => ALL_SFX.includes(x)) : [],
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
export function testSound(id: UiSfx): void {
  if (id === 'click') { click(true); return; }
  const a = el(id);
  a.volume = sfxSettings.value.volume;
  a.currentTime = 0;
  a.play().catch(() => undefined);
}

// --- the click: Web Audio, so it plays without delay and many times in a row -------------------

/** Clicks are softer than the game's sounds. */
const CLICK_GAIN = 0.5;
let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let loading = false;

function loadClick(): void {
  if (loading || typeof window === 'undefined') return;
  loading = true;
  try {
    ctx = new AudioContext();
    fetch(`/sfx/click.${ext}?v=${VERSION}`)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx!.decodeAudioData(b))
      .then((b) => { buffer = b; })
      .catch(() => { loading = false; });
  } catch {
    loading = false;
  }
}

/** One click (when it is on, or always for the settings' test button). */
export function click(force = false): void {
  const s = sfxSettings.value;
  if (!force && (s.muted || s.off.includes('click') || s.volume <= 0)) return;
  if (!ctx) loadClick();
  if (!ctx || !buffer) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = s.volume * CLICK_GAIN;
  src.connect(gain).connect(ctx.destination);
  src.start();
}

/** Every press on something you can click (buttons, links, tabs, checkboxes) clicks. */
export function initClicks(): void {
  if (typeof window === 'undefined') return;
  const CLICKABLE = 'button, a[href], [role="button"], [role="tab"], input[type="checkbox"], input[type="radio"], select, summary';
  window.addEventListener('pointerdown', (e) => {
    // the first press only wakes the sound up (browsers allow sound after a press)
    if (!ctx) { loadClick(); return; }
    const t = e.target as Element | null;
    const hit = t?.closest?.(CLICKABLE) as HTMLElement | null;
    if (!hit || (hit as HTMLButtonElement).disabled) return;
    click();
  }, { capture: true, passive: true });
}
