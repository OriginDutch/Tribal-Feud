import { useState } from 'preact/hooks';
import { BuildingHeader } from '../buildings/BuildingHeader';
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
          <button class="small action" disabled title={u.recruit.blocker}>
            {u.recruit.blocker}
          </button>
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

function CoinPanel() {
  const v = snapshot.value?.village;
  const [count, setCount] = useState('1');
  if (!v) return null;
  const n = v.nobles;
  const coins = n.mode === 'coins';
  const word = coins ? 'munten' : 'pakketten';
  const amount = Math.max(1, Math.floor(Number(count) || 1));
  return (
    <section class="panel">
      <h3>{coins ? 'Munten slaan' : 'Pakketten opslaan'}</h3>
      <table class="table compact">
        <tbody>
          <tr>
            <td>{coins ? 'Munten (voor al je dorpen)' : 'Pakketten in dit dorp'}</td>
            <td class="right mono">{num(n.have)}</td>
          </tr>
          <tr>
            <td>Edel-plekken in gebruik (extra dorpen + edels)</td>
            <td class="right mono">{n.slotsUsed}</td>
          </tr>
          <tr>
            <td>Volgende edel vereist</td>
            <td class="right mono">
              {coins ? `${n.need} munten in totaal` : `${n.need} pakketten`}
            </td>
          </tr>
          <tr>
            <td>Edels die je nu nog mag trainen</td>
            <td class="right mono">{n.allowed}</td>
          </tr>
          <tr>
            <td>Max afstand edelman</td>
            <td class="right mono">{n.maxDistance} velden</td>
          </tr>
        </tbody>
      </table>
      <div class="row">
        <span>
          1 {coins ? 'munt' : 'pakket'}: <Cost cost={n.coinCost} have={v.res} />
        </span>
        <input type="number" min={1} max={Math.max(1, n.maxMint)} value={count} onInput={(e) => setCount(e.currentTarget.value)} style={{ width: '80px' }} />
        <span class="muted">({n.maxMint})</span>
        <button
          class="action"
          disabled={n.mintBlocker !== null}
          title={n.mintBlocker ?? ''}
          onClick={() => send({ type: 'mintCoins', villageId: v.id, count: amount })}
        >
          {n.mintBlocker ?? (coins ? 'Slaan' : 'Opslaan')}
        </button>
      </div>
      <p class="hint">
        {coins
          ? 'Elke edel en elk extra dorp neemt een plek in. Plek 1 kost 1 munt, plek 2 nog 2, plek 3 nog 3, enz. Munten raak je niet kwijt als een edel sneuvelt.'
          : 'Pakketten blijven in dit dorp en worden opgebruikt bij het trainen van een edel.'}{' '}
        Je hebt nu {word} genoeg voor {n.allowed} edel{n.allowed === 1 ? '' : 's'}.
      </p>
    </section>
  );
}

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
      <BuildingHeader village={v} id={building} />
      {b && b.level === 0 ? (
        <section class="panel">
          <p class="muted">Dit gebouw bestaat nog niet. Bouw het hierboven of in het hoofdgebouw.</p>
        </section>
      ) : (
        <>
          {building === 'snob' && <CoinPanel />}
          <section class="panel">
            <table class="table fixed">
              <colgroup>
                <col />
                <col style={{ width: '220px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '270px' }} />
              </colgroup>
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
          {queue.length > 0 && (
            <section class="panel">
              <h3>Rekruteren</h3>
              <p class="queue-total">
                Totaal {num(queue.reduce((n, j) => n + j.total - j.done, 0))} units · nog{' '}
                <span class="mono">{duration((queue.at(-1)?.end ?? s.time) - s.time)}</span> · klaar op{' '}
                <span class="mono">{formatGameTime(queue.at(-1)?.end ?? s.time)}</span>
              </p>
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
        </>
      )}
    </div>
  );
}
