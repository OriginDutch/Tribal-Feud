import { MINUTE } from '../../shared/time';
import { send, snapshot } from '../store';

export function EventsPanel() {
  const s = snapshot.value;
  return (
    <section class="panel">
      <h2>Events</h2>
      <div class="stack">
        <button disabled={!s} onClick={() => send({ type: 'scheduleTest', delayMs: 10 * MINUTE, autoPause: false })}>
          Test-event over 10 min
        </button>
        <button disabled={!s} onClick={() => send({ type: 'scheduleTest', delayMs: 10 * MINUTE, autoPause: true })}>
          Auto-pause event over 10 min
        </button>
        <button disabled={!s} onClick={() => send({ type: 'scheduleRandom' })}>
          Willekeurig event (seeded RNG)
        </button>
      </div>
      {s && <div class="muted">{s.queueSize} event(s) in de queue</div>}
    </section>
  );
}
