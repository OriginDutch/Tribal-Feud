import { SPEEDS, formatGameTime } from '../../shared/time';
import { num } from '../format';
import { send, snapshot, togglePause } from '../store';

function ResourceBar() {
  const v = snapshot.value?.village;
  if (!v) return null;
  const keys = ['wood', 'stone', 'iron'] as const;
  const names = ['Hout', 'Leem', 'IJzer'] as const;
  return (
    <div class="resbar">
      {v.res.map((amount, i) => (
        <span
          key={i}
          class={`res res-${keys[i]} ${amount >= v.storage ? 'full' : ''}`}
          title={`${names[i]}: +${num(v.rates[i] ?? 0)} per uur`}
        >
          {num(amount)}
        </span>
      ))}
      <span class="storage" title="Opslagcapaciteit">
        / {num(v.storage)}
      </span>
      <span class={`pop ${v.pop.used >= v.pop.max ? 'full' : ''}`} title="Boerderij: gebruikt / maximaal">
        {num(v.pop.used)} / {num(v.pop.max)}
      </span>
      <span class="points" title="Punten">
        {num(v.points)} p
      </span>
    </div>
  );
}

export function TopBar() {
  const s = snapshot.value;
  return (
    <header class="topbar">
      <div class="brand">
        <h1>Tribal Feud</h1>
        {s && <span class="tag">{s.worldName}</span>}
      </div>
      <ResourceBar />
      {s && (
        <div class="clockbar">
          <span class="clock-sm">{formatGameTime(s.time)}</span>
          <button class="primary" onClick={togglePause} title="Spatie">
            {s.paused ? 'Start' : 'Pauze'}
          </button>
          <div class="speeds">
            {SPEEDS.map((speed) => (
              <button key={speed} class={s.speed === speed ? 'active' : ''} onClick={() => send({ type: 'setSpeed', speed })}>
                {speed}x
              </button>
            ))}
          </div>
          {s.suspended && <span class="muted">tab verborgen</span>}
        </div>
      )}
    </header>
  );
}
