import { useEffect } from 'preact/hooks';
import { autoPause, notice, togglePause } from './store';
import { ClockPanel } from './panels/ClockPanel';
import { EventsPanel } from './panels/EventsPanel';
import { LogPanel } from './panels/LogPanel';
import { NewWorldPanel } from './panels/NewWorldPanel';
import { SavesPanel } from './panels/SavesPanel';
import { formatGameTime } from '../shared/time';

/** Spacebar toggles pause, except while typing in a field. */
function useSpacebarPause(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      // preventDefault also stops a focused button from being "clicked" by the spacebar
      if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'SELECT') {
        e.preventDefault();
        togglePause();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  useSpacebarPause();
  const paused = autoPause.value;
  const n = notice.value;

  return (
    <>
      <header class="topbar">
        <h1>Tribal Feud</h1>
        <span class="tag">fase 1 · debug</span>
      </header>

      {paused && (
        <div class="banner">
          Auto-pause · {formatGameTime(paused.time)} · {paused.text}
        </div>
      )}
      {n && <div class={`notice ${n.level}`}>{n.text}</div>}

      <main class="grid">
        <ClockPanel />
        <NewWorldPanel />
        <EventsPanel />
        <SavesPanel />
        <LogPanel />
      </main>
    </>
  );
}
