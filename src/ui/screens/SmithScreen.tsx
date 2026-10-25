import { formatGameTime } from '../../shared/time';
import { Cost } from '../components/Cost';
import { duration } from '../format';
import { send, snapshot } from '../store';

export function SmithScreen() {
  const s = snapshot.value;
  const v = s?.village;
  if (!s || !v) return null;
  const smith = v.buildings.find((b) => b.id === 'smith');
  const units = v.units.filter((u) => u.enabled);

  return (
    <div class="screen">
      <h2>Smederij {smith && smith.level > 0 ? `(level ${smith.level})` : ''}</h2>
      {smith && smith.level === 0 && (
        <section class="panel">
          <p class="muted">Je hebt nog geen smederij. Speerdragers en zwaardvechters kun je zonder smederij rekruteren.</p>
        </section>
      )}
      <section class="panel">
        <table class="table fixed">
          <colgroup>
            <col />
            <col style={{ width: '240px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '240px' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Eenheid</th>
              <th>Kosten</th>
              <th class="right" title="Voorlopige waarde: de echte ontwikkeltijden zijn nog niet gevonden">Tijd*</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                </td>
                {u.researched ? (
                  <>
                    <td colSpan={2} class="muted">
                      {u.research ? 'Ontwikkeld' : u.id === 'spear' || u.id === 'sword' ? 'Beschikbaar vanaf de start' : 'Geen ontwikkeling nodig'}
                    </td>
                    <td class="right good">✓</td>
                  </>
                ) : u.research ? (
                  <>
                    <td>
                      <Cost cost={u.research.cost} have={v.res} />
                    </td>
                    <td class="right mono">{duration(u.research.time)}</td>
                    <td class="right">
                      <button
                        class="small action"
                        disabled={u.research.blocker !== null}
                        title={u.research.blocker ?? ''}
                        onClick={() => send({ type: 'research', villageId: v.id, unit: u.id })}
                      >
                        {u.research.blocker ?? 'Ontwikkel'}
                      </button>
                    </td>
                  </>
                ) : (
                  <td colSpan={3} class="muted">
                    Geen ontwikkeling nodig
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <p class="hint">* Ontwikkeltijden zijn voorlopig: de echte TW-waardes zijn nog niet gevonden.</p>
      </section>
      {v.research && (
        <section class="panel">
          <h3>Bezig met ontwikkelen</h3>
          <p>
            {v.research.name} · nog <span class="mono">{duration(v.research.end - s.time)}</span>{' '}
            <span class="muted">(klaar op {formatGameTime(v.research.end)})</span>{' '}
            <button class="danger small" onClick={() => send({ type: 'cancelResearch', villageId: v.id })}>
              Annuleer
            </button>
          </p>
        </section>
      )}

    </div>
  );
}
