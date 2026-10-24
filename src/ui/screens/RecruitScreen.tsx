import { useState } from 'preact/hooks';
import type { RecruitBuilding, UnitId } from '../../shared/gameData';
import { formatGameTime } from '../../shared/time';
import type { UnitView } from '../../sim/view';
import { Cost } from '../components/Cost';
import { duration, num } from '../format';
import { send, snapshot } from '../store';

function UnitRow({ villageId, u, have }: { villageId: number; u: UnitView; have: [number, number, number] }) {
  const [count, setCount] = useState('');
  const n = Number(count);
  const go = () => {
    if (Number.isInteger(n) && n > 0) {
      send({ type: 'recruit', villageId, unit: u.id as UnitId, count: n });
      setCount('');
    }
  };
  return (
    <tr>
      <td>
        <strong>{u.name}</strong>
      </td>
      <td>
        <Cost cost={u.cost} have={have} />
      </td>
      <td class="right mono">{u.pop}</td>
      <td class="right mono">{duration(u.recruit.perUnit)}</td>
      <td class="right mono">{num(u.home)}</td>
      <td class="right">
        {u.recruit.blocker ? (
          <span class="blocker">{u.recruit.blocker}</span>
        ) : (
          <span class="recruit-input">
            <input
              type="number"
              min={1}
              max={u.recruit.max}
              value={count}
              placeholder="0"
              onInput={(e) => setCount(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
            />
            <button class="link" onClick={() => setCount(String(u.recruit.max))} title="Maximaal">
              ({num(u.recruit.max)})
            </button>
            <button class="small" disabled={!(n > 0)} onClick={go}>
              Rekruteer
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

const TITLES: Record<RecruitBuilding, string> = {
  barracks: 'Kazerne',
  stable: 'Stal',
  garage: 'Werkplaats',
  statue: 'Standbeeld',
  snob: 'Adelshoeve',
};

export function RecruitScreen({ building }: { building: RecruitBuilding }) {
  const s = snapshot.value;
  const v = s?.village;
  if (!s || !v) return null;
  const b = v.buildings.find((x) => x.id === building);
  const units = v.units.filter((u) => u.building === building && u.enabled);
  const queue = v.recruitQueues[building];

  return (
    <div class="screen">
      <h2>
        {TITLES[building]} {b && b.level > 0 ? `(level ${b.level})` : ''}
      </h2>
      {b && b.level === 0 ? (
        <section class="panel">
          <p class="muted">Dit gebouw bestaat nog niet. Bouw het in het hoofdgebouw.</p>
          {b.blocker && <p class="blocker">{b.blocker}</p>}
        </section>
      ) : (
        <>
          {queue.length > 0 && (
            <section class="panel">
              <h3>Rekruteren</h3>
              <table class="table">
                <thead>
                  <tr>
                    <th>Opdracht</th>
                    <th>Volgende</th>
                    <th>Alles klaar op</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {queue.map((job, i) => (
                    <tr key={job.id}>
                      <td>
                        {job.total - job.done}× {job.name}
                        {job.done > 0 && <span class="muted"> ({job.done} klaar)</span>}
                      </td>
                      <td class="mono">{i === 0 ? duration(job.nextAt - s.time) : '—'}</td>
                      <td class="mono muted">{formatGameTime(job.end)}</td>
                      <td class="right">
                        <button class="danger small" onClick={() => send({ type: 'cancelRecruit', villageId: v.id, jobId: job.id })}>
                          Annuleer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <section class="panel">
            <table class="table">
              <thead>
                <tr>
                  <th>Eenheid</th>
                  <th>Kosten</th>
                  <th class="right">Boerderij</th>
                  <th class="right">Tijd per stuk</th>
                  <th class="right">In dorp</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <UnitRow key={u.id} villageId={v.id} u={u} have={v.res} />
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
