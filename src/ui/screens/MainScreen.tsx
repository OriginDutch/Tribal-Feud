import { formatGameTime } from '../../shared/time';
import { Cost } from '../components/Cost';
import { duration } from '../format';
import { send, snapshot } from '../store';

export function MainScreen() {
  const s = snapshot.value;
  const v = s?.village;
  if (!s || !v) return null;

  return (
    <div class="screen">
      <h2>Hoofdgebouw (level {v.buildings.find((b) => b.id === 'main')?.level})</h2>

      <section class="panel">
        <h3>
          Bouwqueue {v.buildQueue.length}/{v.buildQueueSlots}
        </h3>
        {v.buildQueue.length === 0 ? (
          <p class="muted">Er wordt niets gebouwd.</p>
        ) : (
          <table class="table">
            <thead>
              <tr>
                <th>Opdracht</th>
                <th>Tijd</th>
                <th>Klaar op</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {v.buildQueue.map((job, i) => (
                <tr key={job.id}>
                  <td>
                    {job.name} → level {job.level}
                  </td>
                  <td class="mono">
                    {i === 0 ? (
                      `nog ${duration(job.end - s.time)}`
                    ) : (
                      <span class="muted">duurt {duration(job.end - job.start)}</span>
                    )}
                  </td>
                  <td class="mono muted">{formatGameTime(job.end)}</td>
                  <td class="right">
                    <button class="danger small" onClick={() => send({ type: 'cancelBuild', villageId: v.id, jobId: job.id })}>
                      Annuleer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section class="panel">
        <h3>Gebouwen</h3>
        <table class="table">
          <thead>
            <tr>
              <th>Gebouw</th>
              <th>Kosten volgende level</th>
              <th class="right">Arbeiders</th>
              <th class="right">Bouwtijd</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {v.buildings.map((b) => (
              <tr key={b.id} class={!b.operational && b.level === 0 ? 'locked' : ''}>
                <td>
                  <strong>{b.name}</strong>{' '}
                  <span class="muted">{b.level > 0 ? `level ${b.level}` : 'niet gebouwd'}</span>
                  {b.planned > b.level && <span class="muted"> (→ {b.planned})</span>}
                  {b.level > 0 && !b.operational && <span class="warn"> · werkt niet</span>}
                </td>
                {b.next ? (
                  <>
                    <td>
                      <Cost cost={b.next.cost} have={v.res} />
                    </td>
                    <td class="right mono">{b.next.pop > 0 ? `+${b.next.pop}` : '—'}</td>
                    <td class="right mono">{duration(b.next.time)}</td>
                    <td class="right">
                      {b.blocker ? (
                        <span class="blocker">{b.blocker}</span>
                      ) : (
                        <button class="small" onClick={() => send({ type: 'build', villageId: v.id, building: b.id })}>
                          {b.planned === 0 ? 'Bouwen' : `Naar level ${b.next.level}`}
                        </button>
                      )}
                    </td>
                  </>
                ) : (
                  <td colSpan={4} class="muted">
                    Volledig uitgebouwd
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
