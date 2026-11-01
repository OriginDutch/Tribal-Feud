/**
 * The performance meter (Instellingen › Log & debug): frames per second, main-thread blockades
 * (long tasks) and game updates, so you can see on your own phone how the game runs.
 */
import { signal } from '@preact/signals';

const KEY = 'tf-perf';
export const perfOn = signal<boolean>((() => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } })());
export function setPerf(on: boolean): void {
  perfOn.value = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
  if (on) start(); else stop();
}

export interface PerfStats {
  fps: number;
  /** Blockades over 50 ms in the last 10 s: how many, total and longest. */
  long: { n: number; total: number; max: number };
  /** Game updates per second, and how long handling one took (ms, average). */
  snaps: number;
  handle: number;
}
export const perfStats = signal<PerfStats | null>(null);

let frames = 0, raf = 0, timer: number | undefined, obs: PerformanceObserver | null = null;
let snapCount = 0, handleMs = 0;
const longs: { at: number; d: number }[] = [];

/** Called by the store for every snapshot it handles. */
export function noteSnapshot(ms: number): void {
  if (!timer) return;
  snapCount++;
  handleMs += ms;
}

function start(): void {
  if (timer) return;
  const loop = () => { frames++; raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  try {
    obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ at: performance.now(), d: e.duration }); });
    obs.observe({ type: 'longtask', buffered: false });
  } catch { obs = null; }
  let last = performance.now();
  timer = window.setInterval(() => {
    const now = performance.now(), dt = (now - last) / 1000;
    last = now;
    while (longs.length && now - longs[0]!.at > 10_000) longs.shift();
    perfStats.value = {
      fps: Math.round(frames / dt),
      long: { n: longs.length, total: Math.round(longs.reduce((a, b) => a + b.d, 0)), max: Math.round(Math.max(0, ...longs.map((x) => x.d))) },
      snaps: Math.round(snapCount / dt),
      handle: snapCount ? Math.round((handleMs / snapCount) * 10) / 10 : 0,
    };
    frames = 0; snapCount = 0; handleMs = 0;
  }, 1000);
}

function stop(): void {
  cancelAnimationFrame(raf);
  window.clearInterval(timer);
  timer = undefined;
  obs?.disconnect();
  obs = null;
  longs.length = 0;
  perfStats.value = null;
}

if (perfOn.value && typeof window !== 'undefined') start();
