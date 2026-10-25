import { formatGameTime } from '../../shared/time';
import { duration, num } from '../format';
import { screen, snapshot } from '../store';

export function OverviewScreen() {
  const s = snapshot.value;
  const v = s?.village;
  if (!s || !v) return null;
  const built = v.buildings.filter((b) => b.level > 0);
  const units = v.units.filter((u) => u.home > 0);
  const recruiting = Object.values(v.recruitQueues).flat();
  const names = ['Hout', 'Leem', 'IJzer'];

  return (
    <div class="screen">
      <h2>
        {v.name} <span class="muted">({v.x}|{v.y}) · {num(v.points)} punten</span>
      </h2>
      {s.incoming.length > 0 && (
        <section class="panel incoming">
          <h3>⚔ Inkomende aanvallen ({s.incoming.length})</h3>
          <table class="table">
            <thead>
              <tr>
                <th>Doel</th>
                <th>Van</th>
                <th>Aankomst</th>
                <th class="right">Nog</th>
              </tr>
            </thead>
            <tbody>
              {s.incoming.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.to.name} ({m.to.x}|{m.to.y})
                  </td>
                  <td>
                    {m.from.name} ({m.from.x}|{m.from.y}) <span class="muted">· {m.from.ownerName}</span>
                  </td>
                  <td class="mono muted">{formatGameTime(m.arrives)}</td>
                  <td class="right mono">{duration(m.arrives - s.time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {v.loyalty < 100 && <p class="warn">Toestemming van dit dorp: {v.loyalty}</p>}
      {s.time < s.protectionEndsAt && (
        <p class="muted">Beginnersbescherming tot {formatGameTime(s.protectionEndsAt)}: niemand kan jou aanvallen, en jij hen niet.</p>
      )}
      <p class="muted">
        Wereld: snelheid ×{s.multipliers.world} · productie ×{s.multipliers.production} · bouwen ×{s.multipliers.build} ·
        rekruteren ×{s.multipliers.recruit}
      </p>
      <div class="grid">
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
          <h3>Troepen in het dorp</h3>
          {units.length === 0 ? (
            <p class="muted">Nog geen troepen.</p>
          ) : (
            <table class="table compact">
              <tbody>
                {units.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td class="right mono">{num(u.home)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section class="panel">
          <h3>Bezig</h3>
          {v.buildQueue.length === 0 && recruiting.length === 0 && !v.research && <p class="muted">Niets.</p>}
          <ul class="plain">
            {v.buildQueue[0] && (
              <li>
                <button class="link" onClick={() => (screen.value = 'main')}>
                  {v.buildQueue[0].name} → {v.buildQueue[0].level}
                </button>{' '}
                <span class="mono muted">{duration(v.buildQueue[0].end - s.time)}</span>
                {v.buildQueue.length > 1 && <span class="muted"> (+{v.buildQueue.length - 1} in queue)</span>}
              </li>
            )}
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
        </section>
      </div>
    </div>
  );
}
