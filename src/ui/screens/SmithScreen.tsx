import { tr } from '../../shared/i18n';
import { formatGameTime } from '../../shared/time';
import { UnitIcon } from '../units/UnitIcon';
import { BuildingHeader } from '../buildings/BuildingHeader';
import { Cost } from '../components/Cost';
import { duration, upToDec2 } from '../format';
import { send, snapshot } from '../store';
import { trx } from '../i18n';

export function SmithScreen() {
  const s = snapshot.value;
  const v = s?.village;
  if (!s || !v) return null;
  const smith = v.buildings.find((b) => b.id === 'smith');
  const units = v.units.filter((u) => u.enabled);

  return (
    <div class="screen">
      <div class="screen-head">
        <h2>{tr('Smederij')}</h2>
        {smith && smith.level > 0 && <span class="chip gold">{tr('Level {n}', { n: smith.level })}</span>}
      </div>
      <BuildingHeader village={v} id="smith" />
      {smith && smith.level === 0 && (
        <section class="panel">
          <p class="muted">{tr('Je hebt nog geen smederij. Speerdragers en zwaardvechters kun je zonder smederij rekruteren.')}</p>
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
              <th>{tr('Eenheid')}</th>
              <th>{tr('Kosten')}</th>
              <th class="right" title={tr('Voorlopige waarde: de echte ontwikkeltijden zijn nog niet gevonden')}>{tr('Tijd')}*</th>
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
                        <span class="chip">{tr('Level {n}/{max}', { n: u.tech.level, max: u.tech.max })}</span>{' '}
                        <span class="muted">×{upToDec2(u.tech.multiplier)}</span>
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
                          {u.tech.next.blocker ?? tr('Naar level {n}', { n: u.tech.next.level })}
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td colSpan={2} class="muted">{tr('Level {n}/{max} · ×{mult} sterker', { n: u.tech.level, max: u.tech.max, mult: upToDec2(u.tech.multiplier) })}</td>
                      <td class="right good">✓</td>
                    </>
                  )
                ) : u.researched ? (
                  <>
                    <td colSpan={2} class="muted">
                      {u.research ? tr('Ontwikkeld') : u.id === 'spear' || u.id === 'sword' ? tr('Beschikbaar vanaf de start') : tr('Geen ontwikkeling nodig')}
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
                        {u.research.blocker ?? tr('Ontwikkel')}
                      </button>
                    </td>
                  </>
                ) : (
                  <td colSpan={3} class="muted">
                    {tr('Geen ontwikkeling nodig')}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <p class="hint">
          * {tr('Ontwikkeltijden zijn voorlopig: de echte TW-waardes zijn nog niet gevonden.')}
          {units.some((u) => u.tech) && ' ' + tr('Researchlevels: elk level maakt de eenheid sterker in aanval en verdediging (troepen uit dit dorp, ook als support elders).')}
        </p>
      </section>
      {v.research && (
        <section class="panel">
          <h3>{tr('Bezig met ontwikkelen')}</h3>
          <p>
            {trx('{name} · nog {time}', { name: v.research.name, time: <span class="mono">{duration(v.research.end - s.time)}</span> })}{' '}
            <span class="muted">{tr('(klaar op {time})', { time: formatGameTime(v.research.end) })}</span>{' '}
            <button class="danger small" onClick={() => send({ type: 'cancelResearch', villageId: v.id })}>
              {tr('Annuleer')}
            </button>
          </p>
        </section>
      )}

    </div>
  );
}
