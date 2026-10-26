import { useEffect } from 'preact/hooks';
import type { TribeRelation, TribeView } from '../../shared/protocol';
import { formatGameTime } from '../../shared/time';
import { MapLink } from '../components/MapLink';
import { num } from '../format';
import { ranking, send, tribeFocus, tribeNews, tribes } from '../store';
import { MAX_MEMBERS } from '../../shared/tribes';

const REL: Record<TribeRelation, string> = { ally: 'Bondgenoot', nap: 'Niet-aanvalsverdrag', war: 'Oorlog' };

function Tag({ t, onClick }: { t: TribeView; onClick?: () => void }) {
  return (
    <button class="link tribe-tag" style={{ '--tc': t.color }} onClick={onClick}>
      [{t.tag}]
    </button>
  );
}

/** Tribes: who belongs where, how strong they are and who is at war with whom. */
export function TribesScreen() {
  useEffect(() => {
    send({ type: 'getRanking' });
    const t = window.setInterval(() => send({ type: 'getRanking' }), 5000);
    return () => window.clearInterval(t);
  }, []);

  const list = tribes.value;
  const players = new Map(ranking.value.map((r) => [r.id, r]));
  const byId = new Map(list.map((t) => [t.id, t]));
  const open = (tribeFocus.value !== null ? byId.get(tribeFocus.value) : undefined) ?? list[0];
  const solo = ranking.value.filter((r) => r.villages > 0 && r.tribe === undefined).length;

  return (
    <div class="screen">
      <div class="row">
        <h2 style={{ margin: 0, flex: 1 }}>Stammen</h2>
        <span class="muted">
          {list.length} stammen · {solo} spelers zonder stam
        </span>
      </div>
      {!list.length ? (
        <section class="panel">
          <p class="muted">Nog geen stammen. Bots zoeken elkaar op naarmate de wereld ouder wordt.</p>
        </section>
      ) : (
        <div class="tribes-layout">
          <section class="panel">
            <table class="table fixed">
              <colgroup>
                <col style={{ width: '44px' }} />
                <col />
                <col style={{ width: '70px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '70px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th class="right">#</th>
                  <th>Stam</th>
                  <th class="right">Leden</th>
                  <th class="right">Punten</th>
                  <th class="right">Dorpen</th>
                </tr>
              </thead>
              <tbody>
                {list.map((t, i) => (
                  <tr key={t.id} class={`clickable ${open?.id === t.id ? 'selected' : ''}`} onClick={() => (tribeFocus.value = t.id)}>
                    <td class="right mono">{i + 1}</td>
                    <td class="ellipsis">
                      <Tag t={t} /> {t.name}
                    </td>
                    <td class="right mono">
                      {t.members.length}/{MAX_MEMBERS}
                    </td>
                    <td class="right mono">{num(t.points)}</td>
                    <td class="right mono">{t.villages}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {open && (
            <div class="tribes-side">
              <section class="panel tribe-card" style={{ '--tc': open.color }}>
                <h3>
                  <span class="tribe-tag" style={{ '--tc': open.color }}>[{open.tag}]</span> {open.name}
                </h3>
                <p class="muted">
                  Opgericht {formatGameTime(open.founded)} · leider {players.get(open.leader)?.name ?? '?'}
                </p>
                <table class="table compact">
                  <thead>
                    <tr>
                      <th>Lid</th>
                      <th class="right">Punten</th>
                      <th class="right">Dorpen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.members
                      .map((id) => players.get(id))
                      .filter((p) => p !== undefined)
                      .sort((a, b) => b.points - a.points)
                      .map((p) => (
                        <tr key={p.id}>
                          <td class="ellipsis">
                            {p.id === open.leader && <span title="Leider">♛ </span>}
                            {p.name}
                            <MapLink owner={p.id} />
                          </td>
                          <td class="right mono">{num(p.points)}</td>
                          <td class="right mono">{p.villages}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </section>
              <section class="panel">
                <h2>Diplomatie</h2>
                {!open.relations.length ? (
                  <p class="muted">Geen verdragen of oorlogen.</p>
                ) : (
                  <ul class="relations">
                    {[...open.relations]
                      .sort((a, b) => ['war', 'ally', 'nap'].indexOf(a.rel) - ['war', 'ally', 'nap'].indexOf(b.rel))
                      .map((r) => {
                        const o = byId.get(r.id);
                        return o ? (
                          <li key={r.id}>
                            <span class={`rel rel-${r.rel}`}>{REL[r.rel]}</span>
                            <Tag t={o} onClick={() => (tribeFocus.value = o.id)} /> {o.name}
                            <span class="muted mono"> sinds {formatGameTime(r.since)}</span>
                          </li>
                        ) : null;
                      })}
                  </ul>
                )}
              </section>
              <section class="panel">
                <h2>Nieuws</h2>
                <ul class="news">
                  {tribeNews.value.slice(0, 15).map((n, i) => (
                    <li key={i}>
                      <span class="mono muted">{formatGameTime(n.time)}</span> {n.text}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
