/**
 * Connection to the simulation worker + UI state as signals.
 * Components read these signals; only the parts that use a changed signal re-render.
 */
import { signal } from '@preact/signals';
import type { RecruitBuilding } from '../shared/gameData';
import type { Command, Snapshot, WorkerMessage } from '../shared/protocol';
import type { LogEntry } from '../sim/state';
import type { SaveMeta } from '../sim/save';

export type Screen = 'overview' | 'main' | RecruitBuilding | 'smith' | 'debug';

export const snapshot = signal<Snapshot | null>(null);
export const saves = signal<SaveMeta[]>([]);
/** Set when an event auto-paused the game; cleared when the player resumes. */
export const autoPause = signal<LogEntry | null>(null);
export const notice = signal<{ text: string; level: 'info' | 'error' } | null>(null);
export const screen = signal<Screen>('overview');

const worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });

export function send(cmd: Command): void {
  worker.postMessage(cmd);
}

let noticeTimer: number | undefined;
export function showNotice(text: string, level: 'info' | 'error'): void {
  notice.value = { text, level };
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (notice.value = null), level === 'error' ? 6000 : 3000);
}

worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'snapshot':
      snapshot.value = msg.snapshot;
      break;
    case 'autoPaused':
      autoPause.value = msg.entry;
      break;
    case 'saves':
      saves.value = msg.saves;
      break;
    case 'notice':
      showNotice(msg.text, msg.level);
      break;
  }
};

worker.onerror = (e) => showNotice(`Worker-fout: ${e.message}`, 'error');

document.addEventListener('visibilitychange', () => {
  send({ type: 'setVisible', visible: document.visibilityState === 'visible' });
});

/** Pause/resume; resuming clears the auto-pause banner. */
export function togglePause(): void {
  const s = snapshot.value;
  if (!s) return;
  autoPause.value = null;
  send({ type: 'setPaused', paused: !s.paused });
}
