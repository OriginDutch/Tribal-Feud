import type { AlertMode } from '../../sim/state';
import { MINUTE } from '../../shared/time';
import { send, snapshot } from '../store';
import { tr } from '../../shared/i18n';

export function EventsPanel() {
  const s = snapshot.value;
  return (
    <section class="panel">
      <h2>{tr('Events & cheats')}</h2>
      <div class="stack">
        <button disabled={!s} onClick={() => send({ type: 'scheduleTest', delayMs: 10 * MINUTE, autoPause: false })}>
          {tr('Test-event over 10 min')}
        </button>
        <button disabled={!s} onClick={() => send({ type: 'scheduleTest', delayMs: 10 * MINUTE, autoPause: true })}>
          {tr('Auto-pause event over 10 min')}
        </button>
        <button disabled={!s} onClick={() => send({ type: 'scheduleRandom' })}>
          {tr('Willekeurig event (seeded RNG)')}
        </button>
        <button disabled={!s} onClick={() => send({ type: 'debugGive', resources: 5000 })}>
          {tr('Cheat: +5000 van elke grondstof')}
        </button>
        <button disabled={!s} onClick={() => send({ type: 'debugGive', units: { axe: 200, light: 50, spy: 5, ram: 10, catapult: 10 } })}>
          {tr('Cheat: aanvalsleger (200 bijl, 50 LC, 5 verk., 10 ram, 10 kata)')}
        </button>
        <button
          disabled={!s}
          onClick={() =>
            send({
              type: 'debugGive',
              resources: 300000,
              buildings: { main: 20, smith: 20, market: 10, snob: 1, storage: 30, farm: 30, barracks: 10 },
              units: { snob: 5, axe: 1000 },
            })
          }
        >
          {tr('Cheat: klaar voor edels (HQ 20, smederij 20, markt 10, adelshoeve, opslag 30, +300k, 5 edels, 1000 bijl)')}
        </button>
        <label>
          {tr('Auto-pause bij aanvallen')}
          <select
            disabled={!s}
            value={s?.alertMode ?? 'perVillage'}
            onChange={(e) => send({ type: 'setAlertMode', mode: e.currentTarget.value as AlertMode })}
          >
            <option value="every">{tr('Elke inkomende aanval')}</option>
            <option value="perVillage">{tr('Eerste aanval per aanvallend dorp (per speldag)')}</option>
            <option value="lostOnly">{tr('Alleen als je een dorp verliest')}</option>
            <option value="off">{tr('Nooit')}</option>
          </select>
        </label>
        <button disabled={!s} onClick={() => send({ type: 'debugSkip', hours: 24 })}>
          {tr('Cheat: 1 dag doorspoelen')}
        </button>
        <button disabled={!s} onClick={() => send({ type: 'debugConquer' })}>
          {tr('Cheat: dichtstbijzijnde barbarendorp overnemen')}
        </button>
      </div>
      {s && <div class="muted">{tr('{n} event(s) in de queue', { n: s.queueSize })}</div>}
    </section>
  );
}
