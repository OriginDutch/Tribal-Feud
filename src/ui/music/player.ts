/**
 * Background music. One tab of the game plays: the one you looked at last. In a desktop browser it
 * keeps playing when you switch away from the game; as an installed app or on a phone it pauses when
 * the game goes to the background and carries on when you come back; switch to another tab of the game and that one carries on where
 * the music was, with a short cross-fade. Tracks cross-fade. Browsers allow
 * sound only after the first click or key press, so music starts then at the latest.
 */
import { signal } from '@preact/signals';
import { nextTrack, startPlaylist, type Playlist, type Track } from './playlist';

const SETTINGS_KEY = 'tf-music';
const FADE_MS = 4000;
const CHANNEL = 'tf-music';

interface Settings {
  volume: number;
  muted: boolean;
}

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return { volume: typeof s.volume === 'number' ? Math.min(1, Math.max(0, s.volume)) : 0.4, muted: s.muted === true };
  } catch {
    return { volume: 0.4, muted: false };
  }
}

export const musicSettings = signal<Settings>(loadSettings());
/** The track playing (or paused) in this tab. */
export const nowPlaying = signal<Track | null>(null);
/** This tab is the one making sound. */
export const playingHere = signal(false);

/** What a tab hands over: the track, where it was, and the rest of the rotation. */
interface Shared {
  track: Track;
  time: number;
  /** the music was running at `at` (so it has moved on since) */
  playing?: boolean;
  playlist: Playlist;
  at: number;
}

const ext = (() => {
  try {
    return new Audio().canPlayType('audio/webm; codecs="opus"') ? 'webm' : 'm4a';
  } catch {
    return 'm4a';
  }
})();
const src = (t: Track) => `/music/${t}.${ext}`;

let playlist: Playlist | null = null;
let current: { track: Track; el: HTMLAudioElement } | null = null;
let fading: HTMLAudioElement | null = null;
let unlocked = false;
let shared: Shared | null = null;
let channel: BroadcastChannel | null = null;
let fadeTimer: number | undefined;
/** when this tab last went quiet */
let lastPaused = 0;

const target = () => (musicSettings.value.muted ? 0 : musicSettings.value.volume);
const mayPlay = () => unlocked && active && !background && !musicSettings.value.muted;
/** As an app (installed, or on a touch screen) the music stops while the game is in the background. */
const appLike = () => {
  try { return matchMedia('(display-mode: standalone)').matches || matchMedia('(pointer: coarse)').matches; } catch { return false; }
};
let background = false;
/** This tab is the one that plays (the last one you looked at). */
let active = true;

function state(): Shared | null {
  return current && playlist ? { track: current.track, time: current.el.currentTime, playing: !current.el.paused, playlist, at: Date.now() } : null;
}

function broadcast(type: 'state' | 'take'): void {
  const s = state();
  try {
    channel?.postMessage({ type, state: s });
  } catch {
    /* closed */
  }
}

function make(track: Track, time = 0): HTMLAudioElement {
  const el = new Audio(src(track));
  el.preload = 'auto';
  el.volume = 0;
  if (time > 0) el.currentTime = time;
  el.addEventListener('timeupdate', () => {
    if (el !== current?.el || fading) return;
    if (Number.isFinite(el.duration) && el.duration - el.currentTime <= FADE_MS / 1000) crossfade();
  });
  el.addEventListener('ended', () => {
    if (el === current?.el && !fading) crossfade();
  });
  return el;
}

/** Volume ramps: the current track to the target volume, a fading one to silence. */
function ramp(): void {
  window.clearInterval(fadeTimer);
  const step = 50 / FADE_MS;
  fadeTimer = window.setInterval(() => {
    let busy = false;
    if (current) {
      const want = target();
      const v = current.el.volume;
      if (Math.abs(v - want) > step) { current.el.volume = v + Math.sign(want - v) * step; busy = true; } else current.el.volume = want;
    }
    if (fading) {
      if (fading.volume > step) { fading.volume -= step; busy = true; } else { fading.pause(); fading.src = ''; fading = null; }
    }
    if (!busy) window.clearInterval(fadeTimer);
  }, 50);
}

function begin(track: Track, time = 0): void {
  current = { track, el: make(track, time) };
  nowPlaying.value = track;
  current.el.addEventListener('play', () => (playingHere.value = true));
  current.el.addEventListener('pause', () => (playingHere.value = false));
  if (mayPlay()) current.el.play().catch(() => undefined);
  ramp();
}

function crossfade(): void {
  if (!playlist) return;
  const next = nextTrack(playlist);
  playlist = next.playlist;
  if (current) fading = current.el;
  begin(next.track);
  broadcast('state');
}

/** Where the shared music is now: it kept running since the other tab told us. */
const sharedTime = (x: Shared) => x.time + (x.playing ? (Date.now() - x.at) / 1000 : 0);

function start(): void {
  if (current) return resume();
  // another tab already plays: carry on with its music
  if (shared && Date.now() - shared.at < 60_000) {
    playlist = shared.playlist;
    begin(shared.track, sharedTime(shared));
  } else {
    const s = startPlaylist();
    playlist = s.playlist;
    begin(s.first);
  }
  broadcast('take');
}

function resume(): void {
  if (!current) return start();
  // the music moved on in another tab meanwhile
  if (shared && shared.at > lastPaused && (shared.track !== current.track || Math.abs(sharedTime(shared) - current.el.currentTime) > 2)) {
    current.el.pause();
    current.el.src = '';
    playlist = shared.playlist;
    begin(shared.track, sharedTime(shared));
  } else {
    current.el.play().catch(() => undefined);
    ramp();
  }
  broadcast('take');
}

/** Fade out over `ms`, then stop. Never an abrupt cut. */
let quieting: number | undefined;
function pause(ms = 800): void {
  if (!current || current.el.paused) return;
  const el = current.el;
  if (fading) { fading.pause(); fading.src = ''; fading = null; }
  window.clearInterval(fadeTimer);
  window.clearInterval(quieting);
  const step = el.volume / Math.max(1, ms / 50);
  quieting = window.setInterval(() => {
    if (mayPlay() && el === current?.el) { window.clearInterval(quieting); ramp(); return; } // wanted again meanwhile
    if (el.volume > step) { el.volume -= step; return; }
    window.clearInterval(quieting);
    el.pause();
    lastPaused = Date.now();
    broadcast('state');
  }, 50);
}

function update(): void {
  if (mayPlay()) {
    window.clearInterval(quieting);
    if (!current || current.el.paused) start();
    else ramp();
  } else pause(musicSettings.value.muted ? 600 : 800);
}

/** You look at this tab (or clicked in it): the music moves here. */
function take(): void {
  if (!unlocked || musicSettings.value.muted) return;
  if (!active || !current || current.el.paused) {
    active = true;
    update();
  }
  broadcast('take');
}

export function setMusic(change: Partial<Settings>): void {
  if (change.muted === false) active = true;
  musicSettings.value = { ...musicSettings.value, ...change };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(musicSettings.value));
  } catch {
    /* fine */
  }
  update();
}

export const toggleMute = () => setMusic({ muted: !musicSettings.value.muted });

export function initMusic(): void {
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e: MessageEvent<{ type: 'state' | 'take' | 'ask'; state: Shared | null }>) => {
      if (e.data.type === 'ask') { if (current) broadcast('state'); return; }
      if (e.data.state && (!shared || e.data.state.at >= shared.at)) shared = e.data.state;
      // another tab took over: this one fades out
      if (e.data.type === 'take') { active = false; pause(); }
    };
    channel.postMessage({ type: 'ask', state: null });
  } catch {
    /* no BroadcastChannel: every tab plays on its own */
  }
  const unlock = () => {
    if (!unlocked) { unlocked = true; active = true; update(); broadcast('take'); return; }
    if (!active) take();
  };
  for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, unlock, { capture: true });
  // looking at a tab moves the music there; looking away keeps it playing
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { background = false; take(); return; }
    if (!appLike()) return;
    // minimised: stop right away (timers for a fade barely run in the background)
    background = true;
    window.clearInterval(quieting);
    if (fading) { fading.pause(); fading.src = ''; fading = null; }
    if (current && !current.el.paused) { current.el.pause(); lastPaused = Date.now(); broadcast('state'); }
  });
  window.addEventListener('focus', take);
  // settings changed in another tab
  window.addEventListener('storage', (e) => {
    if (e.key !== SETTINGS_KEY) return;
    const wasMuted = musicSettings.value.muted;
    musicSettings.value = loadSettings();
    // muted elsewhere: quiet here too; unmuted elsewhere: that tab plays, not this one; volume: follow it
    if (musicSettings.value.muted) update();
    else if (wasMuted) active = false;
    else if (current && !current.el.paused) ramp();
  });
  // a playing tab tells the others where it is now and then, so a switch carries on in step
  window.setInterval(() => { if (current && !current.el.paused) broadcast('state'); }, 2000);
  window.addEventListener('pagehide', () => broadcast('state'));
}
