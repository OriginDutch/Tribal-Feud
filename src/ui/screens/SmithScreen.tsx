import { formatGameTime } from '../../shared/time';
import { UnitIcon } from '../units/UnitIcon';
import { BuildingHeader } from '../buildings/BuildingHeader';
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
      <div class="screen-head">
        <h2>Smederij</h2>
        {smith && smith.level > 0 && <span class="chip gold">Level {smith.level}</span>}
      </div>
      <BuildingHeader village={v} id="smith" />
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
                  <span class="unit-name">
                    <UnitIcon id={u.id} size={26} /> <strong>{u.name}</strong>
                  </span>
                </td>
                {u.tech && u.tech.level >= 1 ? (
                  u.tech.next ? (
                    <>
                      <td>
                        <span class="chip">Level {u.tech.level}/{u.tech.max}</span>{' '}
                        <span class="muted">×{u.tech.multiplier.toLocaleString('nl-NL', { maximumFractionDigits: 2 })}</span>
                        <br />
                        <Cost cost={u.tech.next.cost} have={v.res} />
                      </td>
                      <td class="right mono">{duration(u.tech.next.time)}</td>
                      <td class="right">
                        <button
                          class="small action"
                          disabled={u.tech.next.blocker !== null}
                          title={u.tech.next.blocker ?? ''}
                          onClick={() => send({ type: 'research', villageId: v.id, unit: u.id })}
                        >
                          {u.tech.next.blocker ?? `Naar level ${u.tech.next.level}`}
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td colSpan={2} class="muted">Level {u.tech.level}/{u.tech.max} · ×{u.tech.multiplier.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} sterker</td>
                      <td class="right good">✓</td>
                    </>
                  )
                ) : u.researched ? (
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
        <p class="hint">
          * Ontwikkeltijden zijn voorlopig: de echte TW-waardes zijn nog niet gevonden.
          {units.some((u) => u.tech) && ' Researchlevels: elk level maakt de eenheid sterker in aanval en verdediging (troepen uit dit dorp, ook als support elders).'}
        </p>
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
