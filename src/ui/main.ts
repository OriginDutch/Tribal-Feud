/**
 * Phase 1 debug UI. Sends commands to the worker and draws the snapshots it gets back.
 */
import type { PresetId } from '../shared/config';
import { AUTOSAVE_SLOT, type Command, type Snapshot, type WorkerMessage } from '../shared/protocol';
import { MINUTE, SPEEDS, formatGameTime } from '../shared/time';
import type { SaveMeta } from '../sim/save';

const worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
const send = (cmd: Command): void => worker.postMessage(cmd);

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Element #${id} ontbreekt`);
  return node as T;
}

const ui = {
  worldName: el('world-name'),
  clock: el('clock'),
  clockStatus: el('clock-status'),
  pause: el<HTMLButtonElement>('btn-pause'),
  speeds: el('speeds'),
  name: el<HTMLInputElement>('in-name'),
  preset: el<HTMLSelectElement>('in-preset'),
  seed: el<HTMLInputElement>('in-seed'),
  newWorld: el<HTMLButtonElement>('btn-new'),
  test: el<HTMLButtonElement>('btn-test'),
  testPause: el<HTMLButtonElement>('btn-test-pause'),
  random: el<HTMLButtonElement>('btn-random'),
  queue: el('queue'),
  save: el<HTMLButtonElement>('btn-save'),
  saves: el('saves'),
  log: el('log'),
  banner: el('banner'),
  notice: el('notice'),
};

let current: Snapshot | null = null;

// --- speed buttons ---
const speedButtons = SPEEDS.map((speed) => {
  const b = document.createElement('button');
  b.textContent = `${speed}x`;
  b.disabled = true;
  b.addEventListener('click', () => send({ type: 'setSpeed', speed }));
  ui.speeds.append(b);
  return { speed, b };
});

// --- controls ---
function togglePause(): void {
  if (!current) return;
  ui.banner.hidden = true;
  send({ type: 'setPaused', paused: !current.paused });
}

ui.pause.addEventListener('click', togglePause);
document.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null;
  if (e.code === 'Space' && target?.tagName !== 'INPUT' && target?.tagName !== 'SELECT') {
    e.preventDefault();
    togglePause();
  }
});

ui.newWorld.addEventListener('click', () => {
  const seedText = ui.seed.value.trim();
  const cmd: Command = {
    type: 'newWorld',
    preset: ui.preset.value as Exclude<PresetId, 'custom'>,
    name: ui.name.value,
  };
  if (seedText !== '') cmd.seed = Number(seedText) >>> 0;
  ui.banner.hidden = true;
  send(cmd);
});

ui.test.addEventListener('click', () => send({ type: 'scheduleTest', delayMs: 10 * MINUTE, autoPause: false }));
ui.testPause.addEventListener('click', () => send({ type: 'scheduleTest', delayMs: 10 * MINUTE, autoPause: true }));
ui.random.addEventListener('click', () => send({ type: 'scheduleRandom' }));
ui.save.addEventListener('click', () => send({ type: 'save', slot: 'handmatig' }));

document.addEventListener('visibilitychange', () => {
  send({ type: 'setVisible', visible: document.visibilityState === 'visible' });
});

// --- rendering ---
let noticeTimer: number | undefined;
function showNotice(text: string, level: 'info' | 'error'): void {
  ui.notice.textContent = text;
  ui.notice.className = `notice ${level}`;
  ui.notice.hidden = false;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (ui.notice.hidden = true), level === 'error' ? 8000 : 3000);
}

let lastLogKey = '';
function renderSnapshot(s: Snapshot | null): void {
  current = s;
  const has = s !== null;
  for (const b of [ui.pause, ui.test, ui.testPause, ui.random, ui.save]) b.disabled = !has;
  for (const { b } of speedButtons) b.disabled = !has;

  if (!s) {
    ui.worldName.textContent = 'Geen wereld geladen. Maak er een aan of laad een save.';
    ui.clock.textContent = '—';
    ui.clockStatus.textContent = '';
    ui.queue.textContent = '';
    ui.log.replaceChildren();
    return;
  }

  ui.worldName.textContent = `${s.worldName} · ${s.preset} · seed ${s.seed}`;
  ui.clock.textContent = formatGameTime(s.time);
  ui.clockStatus.textContent = s.suspended
    ? 'Tabblad verborgen, tijd staat stil'
    : s.paused
      ? 'Gepauzeerd'
      : `Loopt op ${s.speed}x`;
  ui.pause.textContent = s.paused ? 'Start' : 'Pauze';
  for (const { speed, b } of speedButtons) b.classList.toggle('active', speed === s.speed);
  ui.queue.textContent = `${s.queueSize} event(s) in de queue`;

  const last = s.log.at(-1);
  const key = `${s.log.length}|${last?.time}|${last?.text}`;
  if (key !== lastLogKey) {
    lastLogKey = key;
    ui.log.replaceChildren(
      ...[...s.log].reverse().map((entry) => {
        const li = document.createElement('li');
        if (entry.autoPause) li.className = 'pause';
        const t = document.createElement('span');
        t.className = 't';
        t.textContent = formatGameTime(entry.time);
        li.append(t, entry.text);
        return li;
      }),
    );
  }
}

function renderSaves(saves: SaveMeta[]): void {
  if (saves.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Nog geen saves.';
    ui.saves.replaceChildren(li);
    return;
  }
  ui.saves.replaceChildren(
    ...saves.map((save) => {
      const li = document.createElement('li');
      const meta = document.createElement('div');
      meta.className = 'meta';
      const title = document.createElement('strong');
      title.textContent = `${save.slot === AUTOSAVE_SLOT ? 'Autosave' : save.slot} · ${save.worldName}`;
      const sub = document.createElement('span');
      sub.className = 'muted';
      sub.textContent = `${formatGameTime(save.gameTime)} · ${new Date(save.savedAt).toLocaleString('nl-NL')}`;
      meta.append(title, sub);

      const actions = document.createElement('div');
      actions.className = 'row';
      const load = document.createElement('button');
      load.textContent = 'Laden';
      load.addEventListener('click', () => {
        ui.banner.hidden = true;
        send({ type: 'load', slot: save.slot });
      });
      const del = document.createElement('button');
      del.textContent = 'Verwijder';
      del.className = 'danger';
      del.addEventListener('click', () => send({ type: 'deleteSave', slot: save.slot }));
      actions.append(load, del);

      li.append(meta, actions);
      return li;
    }),
  );
}

worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'snapshot':
      renderSnapshot(msg.snapshot);
      break;
    case 'autoPaused':
      ui.banner.textContent = `Auto-pause · ${formatGameTime(msg.entry.time)} · ${msg.entry.text}`;
      ui.banner.hidden = false;
      break;
    case 'saves':
      renderSaves(msg.saves);
      break;
    case 'notice':
      showNotice(msg.text, msg.level);
      break;
  }
};

worker.onerror = (e) => showNotice(`Worker-fout: ${e.message}`, 'error');
