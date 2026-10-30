import { SPEEDS, formatGameTime } from '../../shared/time';
import { num } from '../format';
import { paletteOpen, send, snapshot, togglePause } from '../store';
import { NavIcon } from './NavIcon';
import { VillageSwitcher } from './VillageSwitcher';
import { AccountButton } from './Account';
import { keyLabel, keyOf } from '../keys';

const RES = [
  { key: 'wood', name: 'Hout' },
  { key: 'stone', name: 'Leem' },
  { key: 'iron', name: 'IJzer' },
] as const;

/** One resource: amount, production per hour, and a thin bar for how full the storage is. */
function ResTile({ i }: { i: 0 | 1 | 2 }) {
  const v = snapshot.value?.village;
  if (!v) return null;
  const amount = v.res[i] ?? 0;
  const fill = Math.min(1, amount / Math.max(1, v.storage));
  const full = amount >= v.storage;
  const r = RES[i];
  return (
    <div class={`res-tile ${full ? 'full' : ''}`} title={`${r.name}: ${num(amount)} van ${num(v.storage)} · +${num(v.rates[i] ?? 0)} per uur`}>
      <div class="res-v">
        <i class={`swatch ${r.key}`} />
        {num(amount)}
      </div>
      <small>{full ? 'opslag vol' : `+${num(v.rates[i] ?? 0)} / u`}</small>
      <div class="res-fill">
        <b class={r.key} style={{ width: `${fill * 100}%` }} />
      </div>
    </div>
  );
}

function PopTile() {
  const v = snapshot.value?.village;
  if (!v) return null;
  const fill = Math.min(1, v.pop.used / Math.max(1, v.pop.max));
  const full = v.pop.used >= v.pop.max;
  return (
    <div class={`res-tile ${full ? 'full' : ''}`} title={`Boerderij: ${num(v.pop.used)} van ${num(v.pop.max)} inwoners aan het werk`}>
      <div class="res-v">
        <NavIcon name="overview" size={13} />
        {num(v.pop.used)}
      </div>
      <small>{full ? 'boerderij vol' : `/ ${num(v.pop.max)}`}</small>
      <div class="res-fill">
        <b class="pop" style={{ width: `${fill * 100}%` }} />
      </div>
    </div>
  );
}

export function TopBar() {
  const s = snapshot.value;
  const hasVillage = s?.village != null;
  return (
    <header class="topbar">
      <div class="crest" title={s ? `Tribal Feud · ${s.worldName}` : 'Tribal Feud'}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2 L20 6 V12 C20 17 16 20.5 12 22 C8 20.5 4 17 4 12 V6 Z" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="M8 11 L12 7 L16 11 M12 7 V17" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" />
        </svg>
      </div>
      {hasVillage ? <VillageSwitcher /> : <span class="brand-name">Tribal Feud</span>}
      {hasVillage && (
        <div class="res-tiles">
          <ResTile i={0} />
          <ResTile i={1} />
          <ResTile i={2} />
          <PopTile />
        </div>
      )}
      {hasVillage && (
        <button class="search-btn" onClick={() => (paletteOpen.value = true)} title="Zoeken (Ctrl K)">
          <NavIcon name="search" size={15} />
          <span>Zoeken…</span>
          <kbd>Ctrl K</kbd>
        </button>
      )}
      {s && (
        <div class="clock">
          <span class="clock-time">{formatGameTime(s.time)}</span>
          <div class="speed-seg" role="group" aria-label="Speelsnelheid">
            {SPEEDS.map((speed) => (
              <button key={speed} class={s.speed === speed ? 'on' : ''} onClick={() => send({ type: 'setSpeed', speed })}>
                {speed}x
              </button>
            ))}
          </div>
          <button class={`play ${s.paused ? 'paused' : ''}`} onClick={togglePause} title={s.paused ? 'Start (spatie)' : 'Pauze (spatie)'} aria-label={s.paused ? 'Start' : 'Pauze'}>
            {s.paused ? (
              <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4v16l13-8z" fill="currentColor" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="4" width="5" height="16" rx="1" fill="currentColor" />
                <rect x="14" y="4" width="5" height="16" rx="1" fill="currentColor" />
              </svg>
            )}
          </button>
          <button class="save-btn" onClick={() => send({ type: 'saveWorld' })} title={`Wereld opslaan (${keyLabel(keyOf('save'))})`} aria-label="Wereld opslaan">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 3h11l3 3v15H5z" />
              <path d="M8 3v6h8V3" />
              <rect x="8" y="13" width="8" height="6" rx="1" />
            </svg>
          </button>
          {s.suspended && <span class="muted">tab verborgen</span>}
        </div>
      )}
      <AccountButton />
    </header>
  );
}
