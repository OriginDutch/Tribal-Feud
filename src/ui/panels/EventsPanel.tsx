import { MINUTE } from '../../shared/time';
import { send, snapshot } from '../store';

export function EventsPanel() {
  const s = snapshot.value;
  return (
    <section class="panel">
      <h2>Events & cheats</h2>
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
        <button disabled={!s} onClick={() => send({ type: 'debugGive', resources: 5000 })}>
          Cheat: +5000 van elke grondstof
        </button>
        <button disabled={!s} onClick={() => send({ type: 'debugGive', units: { axe: 200, light: 50, spy: 5, ram: 10, catapult: 10 } })}>
          Cheat: aanvalsleger (200 bijl, 50 LC, 5 verk., 10 ram, 10 kata)
        </button>
        <button
          disabled={!s}
          onClick={() =>
            send({
              type: 'debugGive',
              resources: 300000,
              buildings: { main: 20, smith: 20, market: 10, snob: 1, storage: 30, farm: 30, barracks: 10 },
            })
          }
        >
          Cheat: klaar voor edels (HQ 20, smederij 20, markt 10, adelshoeve, opslag 30, +300k)
        </button>
        <button disabled={!s} onClick={() => send({ type: 'debugConquer' })}>
          Cheat: dichtstbijzijnde barbarendorp overnemen
        </button>
      </div>
      {s && <div class="muted">{s.queueSize} event(s) in de queue</div>}
    </section>
  );
}
