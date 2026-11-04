import { PlayerLink } from '../components/PlayerLink';
import { FaceIcon } from '../components/FaceIcon';
import { useSaved } from '../useSaved';
import { useEffect, useState } from 'preact/hooks';
import { MapLink } from '../components/MapLink';
import { num } from '../format';
import { openTribe, ranking, send, tribes } from '../store';
import { tr } from '../../shared/i18n';

export function RankingScreen() {
  const [debug, setDebug] = useState(false);
  const [limit, setLimit] = useSaved('ranking-limit', 50);

  useEffect(() => {
    send({ type: 'getRanking' });
    const t = window.setInterval(() => send({ type: 'getRanking' }), 5000);
    return () => window.clearInterval(t);
  }, []);

  const rows = ranking.value;
  const tribeById = new Map(tribes.value.map((t) => [t.id, t]));
  const meIndex = rows.findIndex((r) => !r.isBot);

  return (
    <div class="screen">
      <div class="row">
        <h2 style={{ margin: 0, flex: 1 }}>{tr('Ranglijst')}</h2>
        {meIndex >= 0 && <span class="muted">{tr('Jij staat op plek {n} van {total}', { n: meIndex + 1, total: rows.length })}</span>}
        <label class="inline-check">
          <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.currentTarget.checked)} /> {tr('bot-info (debug)')}
        </label>
      </div>
      <section class="panel">
        <table class="table fixed">
          <colgroup>
            <col style={{ width: '60px' }} />
            <col />
            <col style={{ width: '90px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '90px' }} />
            {debug && <col style={{ width: '130px' }} />}
            {debug && <col style={{ width: '90px' }} />}
          </colgroup>
          <thead>
            <tr>
              <th class="right">#</th>
              <th>{tr('Speler')}</th>
              <th>{tr('Stam')}</th>
              <th class="right">{tr('Punten')}</th>
              <th class="right">{tr('Dorpen')}</th>
              {debug && <th>{tr('Persoonlijkheid')}</th>}
              {debug && <th class="right">{tr('Activiteit')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, Math.max(limit, meIndex + 1)).map((r, i) => (
              <tr key={r.id} class={r.isBot ? '' : 'me'}>
                <td class="right mono">{i + 1}</td>
                <td class="ellipsis">
                  <FaceIcon face={r.face} size={24} /> <PlayerLink id={r.id} name={r.name} strong={!r.isBot} />
                  {r.villages > 0 && <MapLink owner={r.id} />}
                </td>
                <td>
                  {r.tribe !== undefined && tribeById.get(r.tribe) && (
                    <button class="link tribe-tag" style={{ '--tc': tribeById.get(r.tribe)!.color }} onClick={() => openTribe(r.tribe!)}>
                      [{tribeById.get(r.tribe)!.tag}]
                    </button>
                  )}
                </td>
                <td class="right mono">{num(r.points)}</td>
                <td class="right mono">{r.villages}</td>
                {debug && <td class="muted">{r.archetype ?? '—'}</td>}
                {debug && <td class="right mono muted">{r.activity !== undefined ? `${Math.round(r.activity * 100)}%` : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > limit && (
          <button class="small" onClick={() => setLimit(limit + 50)}>
            {tr('Meer tonen')}
          </button>
        )}
      </section>
    </div>
  );
}
