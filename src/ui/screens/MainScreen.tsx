import { formatGameTime } from '../../shared/time';
import { Cost } from '../components/Cost';
import { duration } from '../format';
import { send, snapshot } from '../store';

/**
 * Layout rule for this screen: nothing may move when the game state changes.
 * The queue always shows all its slots, the table has fixed column widths, and every
 * building row always has the same button (disabled with the reason when it can't be built).
 */
export function MainScreen() {
  const s = snapshot.value;
  const v = s?.village;
  if (!s || !v) return null;
  const slots = Array.from({ length: v.buildQueueSlots }, (_, i) => v.buildQueue[i] ?? null);

  return (
    <div class="screen">
      <h2>Hoofdgebouw (level {v.buildings.find((b) => b.id === 'main')?.level})</h2>

      <section class="panel">
        <h3>
          Bouwqueue {v.buildQueue.length}/{v.buildQueueSlots}
        </h3>
        <table class="table fixed">
          <colgroup>
            <col />
            <col style={{ width: '170px' }} />
            <col style={{ width: '170px' }} />
            <col style={{ width: '110px' }} />
          </colgroup>
          <tbody>
            {slots.map((job, i) =>
              job ? (
                <tr key={`slot-${i}`}>
                  <td class="ellipsis">
                    {job.name} → level {job.level}
                  </td>
                  <td class="mono">{i === 0 ? `nog ${duration(job.end - s.time)}` : <span class="muted">duurt {duration(job.end - job.start)}</span>}</td>
                  <td class="mono muted">{formatGameTime(job.end)}</td>
                  <td class="right">
                    <button class="danger small" onClick={() => send({ type: 'cancelBuild', villageId: v.id, jobId: job.id })}>
                      Annuleer
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={`slot-${i}`} class="empty-slot">
                  <td colSpan={4} class="muted">
                    vrij
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </section>

      <section class="panel">
        <h3>Gebouwen</h3>
        <table class="table fixed">
          <colgroup>
            <col />
            <col style={{ width: '240px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '240px' }} />
          </colgroup>
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
                <td class="ellipsis">
                  <strong>{b.name}</strong> <span class="muted">{b.level > 0 ? `level ${b.level}` : 'niet gebouwd'}</span>
                  {b.planned > b.level && <span class="muted"> (→ {b.planned})</span>}
                  {b.level > 0 && !b.operational && <span class="warn"> · werkt niet</span>}
                </td>
                <td>{b.next ? <Cost cost={b.next.cost} have={v.res} /> : <span class="muted">—</span>}</td>
                <td class="right mono">{b.next && b.next.pop > 0 ? `+${b.next.pop}` : '—'}</td>
                <td class="right mono">{b.next ? duration(b.next.time) : '—'}</td>
                <td class="right">
                  <button
                    class="small action"
                    disabled={!b.next || b.blocker !== null}
                    title={b.blocker ?? ''}
                    onClick={() => send({ type: 'build', villageId: v.id, building: b.id })}
                  >
                    {!b.next ? 'Volledig uitgebouwd' : b.blocker ?? (b.planned === 0 ? 'Bouwen' : `Naar level ${b.next.level}`)}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
