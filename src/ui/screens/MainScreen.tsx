import { formatGameTime } from '../../shared/time';
import { Cost } from '../components/Cost';
import { duration } from '../format';
import { useState } from 'preact/hooks';
import type { BuildingId } from '../../shared/gameData';
import { send, snapshot } from '../store';
import { tr } from '../../shared/i18n';
import { trx } from '../i18n';

const DEMOLISH_HQ = 15;

/**
 * Layout rule for this screen: nothing may move when the game state changes.
 * The queue always shows all its slots, the table has fixed column widths, and every
 * building row always has the same button (disabled with the reason when it can't be built).
 */
export function MainScreen() {
  const s = snapshot.value;
  const v = s?.village;
  if (!s || !v) return null;
  const [tear, setTear] = useState<BuildingId | ''>('');
  const hq = v.buildings.find((b) => b.id === 'main')?.level ?? 0;
  const tearable = v.buildings.filter((b) => b.demolish);
  const picked = tearable.find((b) => b.id === tear) ?? null;
  const free = v.buildQueueSlots - v.buildQueue.length;
  const slots: (typeof v.buildQueue[number] | null)[] = [...v.buildQueue, ...(free > 0 ? [null] : [])];

  return (
    <div class="screen">
      <div class="screen-head">
        <h2>{tr('Hoofdgebouw')}</h2>
        <span class="chip gold">{tr('Level {n}', { n: v.buildings.find((b) => b.id === 'main')?.level })}</span>
      </div>

      <div class="main-grid">
      <section class="panel mg-queue" style={{ '--slots': v.buildQueueSlots } as Record<string, number>}>
        <h3>
          {tr('Bouwqueue {n}/{max}', { n: v.buildQueue.length, max: v.buildQueueSlots })}
        </h3>
        <table class="table fixed">
          <colgroup>
            <col />
            <col style={{ width: '104px' }} />
            <col style={{ width: '118px' }} />
            <col style={{ width: '92px' }} />
          </colgroup>
          <tbody>
            {slots.map((job, i) =>
              job ? (
                <tr key={`slot-${i}`}>
                  <td class="ellipsis">
                    {job.demolish ? (
                      <>
                        {trx('{tag} {name} → level {n}', { tag: <span class="warn">{tr('Afbreken')}</span>, name: job.name, n: job.level })}
                      </>
                    ) : (
                      <>
                        {tr('{name} → level {n}', { name: job.name, n: job.level })}
                      </>
                    )}
                  </td>
                  <td class="mono">{i === 0 ? tr('nog {time}', { time: duration(job.end - s.time) }) : <span class="muted">{tr('duurt {time}', { time: duration(job.end - job.start) })}</span>}</td>
                  <td class="mono muted">{formatGameTime(job.end)}</td>
                  <td class="right">
                    <button class="danger small" onClick={() => send({ type: 'cancelBuild', villageId: v.id, jobId: job.id })}>
                      {tr('Annuleer')}
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={`slot-${i}`} class="empty-slot">
                  <td colSpan={4} class="muted">
                    {free === 1 ? tr('1 plek vrij') : tr('{n} plekken vrij', { n: free })}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </section>

      <section class="panel mg-list">
        <h3>{tr('Gebouwen')}</h3>
        <table class="table fixed">
          <colgroup>
            <col style={{ width: '29%' }} />
            <col style={{ width: '31%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '22%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>{tr('Gebouw')}</th>
              <th>{tr('Kosten volgende level')}</th>
              <th class="right" title={tr('Arbeiders: extra boerderijplaatsen die het volgende level kost')}>{tr('Arb.')}</th>
              <th class="right">{tr('Bouwtijd')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {v.buildings.map((b) => (
              <tr key={b.id} class={!b.operational && b.level === 0 ? 'locked' : ''}>
                <td class="ellipsis">
                  <img class="building-thumb" src={`/buildings/${b.id}-s.webp`} alt="" width={36} height={36} loading="lazy" />
                  <strong>{b.name}</strong> <span class="muted">{b.level > 0 ? tr('level {n}', { n: b.level }) : tr('niet gebouwd')}</span>
                  {b.planned !== b.level && <span class="muted"> (→ {b.planned})</span>}
                  {b.level > 0 && !b.operational && <span class="warn"> · {tr('werkt niet')}</span>}
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
                    {!b.next ? tr('Volledig uitgebouwd') : b.blocker ?? (b.planned === 0 ? tr('Bouwen') : tr('Naar level {n}', { n: b.next.level }))}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section class="panel mg-tear">
        <h3>{tr('Afbreken')}</h3>
        {hq < DEMOLISH_HQ ? (
          <p class="muted">{tr('Vanaf hoofdgebouw {n} kun je gebouwen afbreken.', { n: DEMOLISH_HQ })}</p>
        ) : (
          <>
            <div class="row">
              <select value={tear} onChange={(e) => setTear(e.currentTarget.value as BuildingId | '')}>
                <option value="">{tr('Kies een gebouw…')}</option>
                {tearable.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name} {b.planned} → {b.demolish?.level}
                  </option>
                ))}
              </select>
              <button
                class="danger"
                disabled={!picked?.demolish || picked.demolish.blocker !== null}
                title={picked?.demolish?.blocker ?? ''}
                onClick={() => picked && send({ type: 'demolish', villageId: v.id, building: picked.id })}
              >
                {picked?.demolish?.blocker ?? tr('Eén level afbreken')}
              </button>
              {picked?.demolish && <span class="muted mono">{tr('duurt {time}', { time: duration(picked.demolish.time) })}</span>}
            </div>
            <p class="muted">{tr('Afbreken kost niets en geeft niets terug. Het neemt een plek in de bouwqueue; de arbeiders komen vrij als het klaar is.')}</p>
          </>
        )}
      </section>
      </div>
    </div>
  );
}
