import { formatGameTime } from '../../shared/time';
import { Coords } from '../components/Coords';
import { UnitIcon } from '../units/UnitIcon';
import { UNIT_SHORT, unitsText } from '../units';
import { UNIT_IDS, type UnitId } from '../../shared/gameData';
import { IncomingPanel } from '../components/IncomingPanel';
import { MapLink } from '../components/MapLink';
import { duration, num } from '../format';
import { openSupport, screen, snapshot } from '../store';
import { VillageScene } from '../village/VillageScene';

export function OverviewScreen() {
  const s = snapshot.value;
  const v = s?.village;
  if (!s || !v) return null;
  const built = v.buildings.filter((b) => b.level > 0);
  const units = v.units.filter((u) => u.home > 0);
  const recruiting = Object.values(v.recruitQueues).flat();
  const names = ['Hout', 'Leem', 'IJzer'];

  return (
    <div class="screen wide">
      <h2 class="sr-only">Dorpsoverzicht</h2>
      <IncomingPanel />
      {v.loyalty < 100 && <p class="warn">Toestemming van dit dorp: {v.loyalty}</p>}
      {s.time < s.protectionEndsAt && (
        <p class="muted">Beginnersbescherming tot {formatGameTime(s.protectionEndsAt)}: niemand kan jou aanvallen, en jij hen niet.</p>
      )}
      <div class="ov-layout">
      <div class="ov-main">
      <VillageScene village={v} />
      <p class="muted">
        Wereld: snelheid ×{s.multipliers.world} · productie ×{s.multipliers.production} · bouwen ×{s.multipliers.build} ·
        rekruteren ×{s.multipliers.recruit}
        {s.multipliers.farm !== 1 && <> · bevolking ×{s.multipliers.farm.toLocaleString('nl-NL')}</>}
      </p>
      </div>
      <div class="grid ov-side">
        <section class="panel">
          <h3>Productie per uur</h3>
          <table class="table compact">
            <tbody>
              {v.rates.map((r, i) => (
                <tr key={i}>
                  <td>{names[i]}</td>
                  <td class="right mono">{num(r)}</td>
                </tr>
              ))}
              <tr>
                <td>Opslag</td>
                <td class="right mono">{num(v.storage)}</td>
              </tr>
              <tr>
                <td>Verborgen in schuilplaats</td>
                <td class="right mono">{num(v.hide)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel">
          <h3>Gebouwen</h3>
          <table class="table compact">
            <tbody>
              {built.map((b) => (
                <tr key={b.id}>
                  <td>
                    {b.name}
                    {!b.operational && <span class="warn"> · werkt niet</span>}
                  </td>
                  <td class="right mono">{b.level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section class="panel">
          <h3>Troepen</h3>
          {(() => {
            // own troops: at home, away (on the move, scavenging, support elsewhere), total; support standing here apart
            const support: Partial<Record<UnitId, number>> = {};
            for (const x of v.supportHere) for (const [u, n] of Object.entries(x.units) as [UnitId, number][]) support[u] = (support[u] ?? 0) + n;
            const view = (u: UnitId) => v.units.find((x) => x.id === u);
            const ids = UNIT_IDS.filter((u) => (view(u)?.home ?? 0) + (view(u)?.away.total ?? 0) > 0 || (support[u] ?? 0) > 0);
            const hasSupport = v.supportHere.length > 0;
            const hasAway = ids.some((u) => (view(u)?.away.total ?? 0) > 0);
            if (!ids.length) return <p class="muted">Nog geen troepen.</p>;
            const awayTitle = (u: UnitId) => {
              const a = view(u)!.away;
              const parts = [a.moving && `${num(a.moving)} onderweg`, a.scavenging && `${num(a.scavenging)} op rooftocht`, a.support && `${num(a.support)} als steun elders`].filter(Boolean);
              return parts.join(' · ');
            };
            return (
              <>
                <table class="table compact">
                  <thead>
                    <tr>
                      <th />
                      <th class="right">Thuis</th>
                      {hasAway && <th class="right">Buiten</th>}
                      <th class="right">Totaal</th>
                      {hasSupport && <th class="right" title="Troepen van anderen die hier als steun staan">Steun hier</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {ids.map((u) => {
                      const x = view(u)!;
                      const sup = support[u] ?? 0;
                      return (
                        <tr key={u}>
                          <td>
                            <span class="unit-name">
                              <UnitIcon id={u} size={20} /> {x.name ?? UNIT_SHORT[u]}
                            </span>
                          </td>
                          <td class="right mono">{num(x.home)}</td>
                          {hasAway && <td class="right mono muted" title={awayTitle(u)}>{x.away.total ? num(x.away.total) : '—'}</td>}
                          <td class="right mono"><strong>{num(x.home + x.away.total)}</strong></td>
                          {hasSupport && <td class="right mono muted">{sup ? num(sup) : '—'}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {hasSupport && (
                  <ul class="support-from">
                    {v.supportHere.map((x) => (
                      <li key={x.origin.id}>
                        <span class="muted">Steun van</span> {x.origin.name} <Coords x={x.origin.x} y={x.origin.y} />
                        {!s.villages.some((o) => o.id === x.origin.id) && <span class="muted"> · {x.origin.ownerName}</span>}
                        <div class="muted small-text">{unitsText(x.units)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            );
          })()}
        </section>

        <div class="ov-stack">
          <section class="panel">
            <h3>Bouwen</h3>
            {v.buildQueue.length === 0 ? (
              <p class="muted">Niets in aanbouw.</p>
            ) : (
              <ul class="plain">
                {v.buildQueue.map((job) => (
                  <li key={job.id}>
                    <button class="link" onClick={() => (screen.value = 'main')}>
                      {job.demolish ? 'Afbreken: ' : ''}
                      {job.name} → {job.level}
                    </button>{' '}
                    <span class="mono muted">klaar over {duration(job.end - s.time)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section class="panel">
            <h3>Rekruteren</h3>
            {recruiting.length === 0 && !v.research ? (
              <p class="muted">Niets in opleiding.</p>
            ) : (
              <ul class="plain">
                {recruiting.map((job) => (
                  <li key={job.id}>
                    {job.total - job.done}× {job.name} <span class="mono muted">klaar over {duration(job.end - s.time)}</span>
                  </li>
                ))}
                {v.research && (
                  <li>
                    Ontwikkelen: {v.research.name} <span class="mono muted">{duration(v.research.end - s.time)}</span>
                  </li>
                )}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
    </div>
  );
}
