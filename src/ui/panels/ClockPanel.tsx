import { SPEEDS, formatGameTime } from '../../shared/time';
import { send, snapshot, togglePause } from '../store';

export function ClockPanel() {
  const s = snapshot.value;

  const status = !s ? '' : s.suspended ? 'Tabblad verborgen, tijd staat stil' : s.paused ? 'Gepauzeerd' : `Loopt op ${s.speed}x`;

  return (
    <section class="panel">
      <h2>Klok</h2>
      <div class="muted">
        {s ? `${s.worldName} · ${s.preset} · seed ${s.seed}` : 'Geen wereld geladen. Maak er een aan of laad een save.'}
      </div>
      <div class="clock">{s ? formatGameTime(s.time) : '—'}</div>
      <div class="muted">{status}</div>
      <div class="row">
        <button class="primary" disabled={!s} onClick={togglePause}>
          {s && !s.paused ? 'Pauze' : 'Start'}
        </button>
        <div class="speeds">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              disabled={!s}
              class={s?.speed === speed ? 'active' : ''}
              onClick={() => send({ type: 'setSpeed', speed })}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
      <p class="hint">Spatie = pauze/start. De tijd stopt vanzelf als dit tabblad verborgen is.</p>
    </section>
  );
}
