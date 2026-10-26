import { PlayerLink } from '../components/PlayerLink';
import { useEffect, useState } from 'preact/hooks';
import type { TribeRelation, TribeView } from '../../shared/protocol';
import { MAX_MEMBERS } from '../../shared/tribes';
import { formatGameTime } from '../../shared/time';
import { Confirm } from '../components/Confirm';
import { MapLink } from '../components/MapLink';
import { num } from '../format';
import { inviteCandidates, mapData, ranking, refusedApplications, send, showOnMap, snapshot, tribeAsks, tribeFocus, tribeNews, tribes } from '../store';

const REL: Record<TribeRelation, string> = { ally: 'Bondgenoot', nap: 'Niet-aanvalsverdrag', war: 'Oorlog' };
const ASK_REL = { nap: 'NAP', ally: 'bondgenootschap', peace: 'vrede' } as const;

function Tag({ t, onClick }: { t: TribeView; onClick?: () => void }) {
  return (
    <button class="link tribe-tag" style={{ '--tc': t.color }} onClick={onClick}>
      [{t.tag}]
    </button>
  );
}

/** No tribe yet: found one (applying happens in the list). */
function FoundTribe() {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const asks = tribeAsks.value.filter((a) => a.kind === 'apply');
  const byId = new Map(tribes.value.map((t) => [t.id, t]));
  return (
    <section class="panel my-tribe">
      <h2>Jouw stam</h2>
      <p class="muted">
        Je zit nog niet in een stam. Meld je aan bij een stam hieronder, of richt er zelf een op. Een stam neemt je alleen aan als je niet te ver weg
        zit en niet in de weg ligt.
      </p>
      <form
        class="found-form"
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: 'tribeFound', name, tag });
        }}
      >
        <input placeholder="Naam (3–32 tekens)" value={name} maxLength={32} onInput={(e) => setName(e.currentTarget.value)} />
        <input class="tag-input" placeholder="TAG" value={tag} maxLength={6} onInput={(e) => setTag(e.currentTarget.value.toUpperCase())} />
        <button class="primary" type="submit" disabled={name.trim().length < 3 || tag.trim().length < 2}>
          Stam oprichten
        </button>
      </form>
      {asks.length > 0 && (
        <p class="muted">
          Aangemeld bij:{' '}
          {asks.map((a) => {
            const t = byId.get(a.tribe);
            return t ? <span key={a.tribe}><Tag t={t} /> </span> : null;
          })}
          — de leider antwoordt als hij online is.
        </p>
      )}
    </section>
  );
}

/** You are in a tribe: what it is, leave, and (leader) invite players nearby. */
function MyTribe({ t }: { t: TribeView }) {
  const s = snapshot.value!;
  const leader = s.myTribeLeader;
  const players = new Map(ranking.value.map((r) => [r.id, r]));
  const byId = new Map(tribes.value.map((x) => [x.id, x]));
  const invited = new Set(tribeAsks.value.flatMap((a) => (a.kind === 'invite' ? [a.player] : [])));
  return (
    <section class="panel my-tribe" style={{ '--tc': t.color }}>
      <div class="row">
        <h2 style={{ flex: 1 }}>Jouw stam</h2>
        <Confirm label="Stam verlaten" sure="Echt verlaten?" onConfirm={() => send({ type: 'tribeLeave' })} />
      </div>
      <p>
        <Tag t={t} onClick={() => (tribeFocus.value = t.id)} /> {t.name} · {leader ? 'jij bent de leider' : `leider: ${players.get(t.leader)?.name ?? '?'}`} ·{' '}
        {t.members.length}/{MAX_MEMBERS} leden
      </p>
      {leader && t.members.length < MAX_MEMBERS && (
        <details class="invite-list">
          <summary>Spelers uitnodigen ({inviteCandidates.value.length} in de buurt)</summary>
          <table class="table compact">
            <thead>
              <tr>
                <th>Speler</th>
                <th>Stam</th>
                <th class="right">Punten</th>
                <th class="right">Afstand</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {inviteCandidates.value.map((c) => {
                const ct = c.tribe !== undefined ? byId.get(c.tribe) : undefined;
                return (
                  <tr key={c.id}>
                    <td class="ellipsis">
                      <PlayerLink id={c.id} name={c.name} />
                      {c.declined ? <span class="refused" title="Zo vaak sloeg hij je uitnodiging af"> · {c.declined}× afgewezen</span> : null}
                      <MapLink owner={c.id} />
                    </td>
                    <td>{ct ? <Tag t={ct} /> : <span class="muted">—</span>}</td>
                    <td class="right mono">{num(c.points)}</td>
                    <td class="right mono">{c.distance}</td>
                    <td class="right">
                      {invited.has(c.id) ? (
                        <span class="muted">uitgenodigd</span>
                      ) : (
                        <button class="small" onClick={() => send({ type: 'tribeInvite', player: c.id })}>
                          Uitnodigen
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p class="muted">Bots antwoorden als ze online zijn. Spelers die al in een stam zitten, stappen zelden over.</p>
        </details>
      )}
      {t.members.length > 1 && <TribeOrders />}
    </section>
  );
}

const ORDER_KIND = { attack: 'Aanvallen', spare: 'Met rust laten', focus: 'Focus op' } as const;

/** Orders (leader) or suggestions (member) to your tribe, and how the mates answered. */
function TribeOrders() {
  const s = snapshot.value!;
  const leader = s.myTribeLeader;
  const [kind, setKind] = useState<'attack' | 'spare' | 'focus'>('attack');
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const players = ranking.value.filter((r) => r.villages > 0 && r.isBot);
  const give = () => {
    setError('');
    const map = mapData.value;
    if (kind === 'attack') {
      const xy = /^(\d{1,4})\s*[|,/ ]\s*(\d{1,4})$/.exec(target.trim());
      const v = xy && map ? map.villages.find((x) => x.x === Number(xy[1]) && x.y === Number(xy[2])) : undefined;
      if (!map) { send({ type: 'getMap' }); setError('Kaart laden… probeer het zo nog eens.'); return; }
      if (!v) { setError('Geen dorp op die coördinaten (schrijf bijv. 501|497).'); return; }
      send({ type: 'giveOrder', kind, target: v.id });
    } else {
      const p = players.find((x) => x.name.toLowerCase() === target.trim().toLowerCase());
      if (!p) { setError('Die speler ken ik niet.'); return; }
      send({ type: 'giveOrder', kind, target: p.id });
    }
    setTarget('');
  };
  return (
    <div class="tribe-orders">
      <h3>{leader ? 'Orders' : 'Suggesties'}</h3>
      <p class="hint">
        {leader
          ? 'Als leider geef je orders. Stamgenoten volgen ze vaak, maar niet blind: hun type en wat jullie voor elkaar doen telt mee.'
          : 'Als lid doe je suggesties. Die worden minder vaak opgevolgd dan orders van de leider.'}{' '}
        Ze antwoorden als ze online zijn; een order loopt een speldag.
      </p>
      <form class="row wrap order-form" onSubmit={(e) => { e.preventDefault(); give(); }}>
        <select value={kind} onChange={(e) => setKind(e.currentTarget.value as typeof kind)}>
          <option value="attack">Aanvallen: dorp</option>
          <option value="spare">Met rust laten: speler</option>
          <option value="focus">Focus op: speler</option>
        </select>
        <input list="order-players" placeholder={kind === 'attack' ? '501|497' : 'naam van de speler'} value={target} onInput={(e) => setTarget(e.currentTarget.value)} />
        <datalist id="order-players">{kind !== 'attack' && players.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <button class="small primary" type="submit" disabled={!target.trim()}>
          {leader ? 'Order geven' : 'Voorstellen'}
        </button>
        {error && <span class="error">{error}</span>}
      </form>
      {s.orders.length > 0 && (
        <table class="table compact">
          <tbody>
            {s.orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <strong>{ORDER_KIND[o.kind]}</strong> {o.targetName} {!o.binding && <span class="muted">(suggestie)</span>}
                </td>
                <td class="right nowrap">
                  <span class="good">{o.yes} ja</span> · <span class="muted">{o.half} deels</span> · <span class="error">{o.no} nee</span>
                  {o.waiting > 0 && <span class="muted"> · {o.waiting} wacht</span>}
                </td>
                <td class="right">
                  <Confirm label="Intrekken" sure="Order intrekken?" onConfirm={() => send({ type: 'cancelOrder', id: o.id })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Tribes: yours on top, then who belongs where, how strong they are and who fights whom. */
export function TribesScreen() {
  useEffect(() => {
    send({ type: 'getRanking' });
    const t = window.setInterval(() => send({ type: 'getRanking' }), 5000);
    return () => window.clearInterval(t);
  }, []);

  const s = snapshot.value;
  const list = tribes.value;
  const players = new Map(ranking.value.map((r) => [r.id, r]));
  const byId = new Map(list.map((t) => [t.id, t]));
  const mine = s?.myTribe != null ? byId.get(s.myTribe) : undefined;
  const leader = !!s?.myTribeLeader;
  const open = (tribeFocus.value !== null ? byId.get(tribeFocus.value) : undefined) ?? mine ?? list[0];
  const solo = ranking.value.filter((r) => r.villages > 0 && r.tribe === undefined).length;
  const applied = new Set(tribeAsks.value.flatMap((a) => (a.kind === 'apply' ? [a.tribe] : [])));
  const proposed = new Map(tribeAsks.value.flatMap((a) => (a.kind === 'propose' ? [[a.tribe, a.relation] as const] : [])));
  const relToMine = open && mine && open.id !== mine.id ? (mine.relations.find((r) => r.id === open.id)?.rel ?? null) : null;

  return (
    <div class="screen">
      <div class="row">
        <h2 style={{ margin: 0, flex: 1 }}>Stammen</h2>
        <span class="muted">
          {list.length} stammen · {solo} spelers zonder stam
        </span>
      </div>
      {s && (mine ? <MyTribe t={mine} /> : <FoundTribe />)}
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
                {!mine && <col style={{ width: '120px' }} />}
              </colgroup>
              <thead>
                <tr>
                  <th class="right">#</th>
                  <th>Stam</th>
                  <th class="right">Leden</th>
                  <th class="right">Punten</th>
                  <th class="right">Dorpen</th>
                  {!mine && <th />}
                </tr>
              </thead>
              <tbody>
                {list.map((t, i) => (
                  <tr key={t.id} class={`clickable ${open?.id === t.id ? 'selected' : ''} ${mine?.id === t.id ? 'me' : ''}`} onClick={() => (tribeFocus.value = t.id)}>
                    <td class="right mono">{i + 1}</td>
                    <td class="ellipsis">
                      <Tag t={t} /> {t.name}
                      {!mine && refusedApplications.value[t.id] ? (
                        <span class="refused" title="Zo vaak wees deze stam je aanmelding af"> · {refusedApplications.value[t.id]}× afgewezen</span>
                      ) : null}
                    </td>
                    <td class="right mono">
                      {t.members.length}/{MAX_MEMBERS}
                    </td>
                    <td class="right mono">{num(t.points)}</td>
                    <td class="right mono">{t.villages}</td>
                    {!mine && (
                      <td class="right" onClick={(e) => e.stopPropagation()}>
                        {applied.has(t.id) ? (
                          <span class="muted">aangemeld</span>
                        ) : t.members.length < MAX_MEMBERS ? (
                          <button class="small" onClick={() => send({ type: 'tribeApply', tribe: t.id })}>
                            Aanmelden
                          </button>
                        ) : (
                          <span class="muted">vol</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {open && (
            <div class="tribes-side">
              <section class="panel tribe-card" style={{ '--tc': open.color }}>
                <div class="row">
                  <h3 style={{ flex: 1 }}>
                    <span class="tribe-tag" style={{ '--tc': open.color }}>[{open.tag}]</span> {open.name}
                  </h3>
                  <button class="small" onClick={() => showOnMap({ tribe: open.id })}>
                    Toon op kaart
                  </button>
                </div>
                <p class="muted">
                  Opgericht {formatGameTime(open.founded)} · leider {players.get(open.leader)?.name ?? '?'}
                  {relToMine && <> · <span class={`rel rel-${relToMine}`}>{REL[relToMine]}</span> met jouw stam</>}
                </p>
                {leader && mine && open.id !== mine.id && (
                  <div class="row wrap tribe-actions">
                    {proposed.has(open.id) ? (
                      <span class="muted">Voorstel ({ASK_REL[proposed.get(open.id)!]}) loopt — de leider antwoordt als hij online is.</span>
                    ) : relToMine === 'war' ? (
                      <button class="small" onClick={() => send({ type: 'tribePropose', tribe: open.id, relation: 'peace' })}>Vrede voorstellen</button>
                    ) : (
                      <>
                        {relToMine !== 'nap' && relToMine !== 'ally' && (
                          <button class="small" onClick={() => send({ type: 'tribePropose', tribe: open.id, relation: 'nap' })}>NAP voorstellen</button>
                        )}
                        {relToMine === 'nap' && (
                          <button class="small" onClick={() => send({ type: 'tribePropose', tribe: open.id, relation: 'ally' })}>Bondgenootschap voorstellen</button>
                        )}
                        {relToMine && <Confirm label="Verdrag beëindigen" onConfirm={() => send({ type: 'tribeRelation', tribe: open.id, action: 'end' })} />}
                        <Confirm label="Oorlog verklaren" sure="Echt oorlog?" cls="warn" onConfirm={() => send({ type: 'tribeRelation', tribe: open.id, action: 'war' })} />
                      </>
                    )}
                  </div>
                )}
                <table class="table compact">
                  <thead>
                    <tr>
                      <th>Lid</th>
                      <th class="right">Punten</th>
                      <th class="right">Dorpen</th>
                      {leader && mine?.id === open.id && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {open.members
                      .map((id) => players.get(id))
                      .filter((p) => p !== undefined)
                      .sort((a, b) => b.points - a.points)
                      .map((p) => (
                        <tr key={p.id} class={p.isBot ? '' : 'me'}>
                          <td class="ellipsis">
                            {p.id === open.leader && <span title="Leider">♛ </span>}
                            <PlayerLink id={p.id} name={p.name} strong={!p.isBot} />
                            <MapLink owner={p.id} />
                          </td>
                          <td class="right mono">{num(p.points)}</td>
                          <td class="right mono">{p.villages}</td>
                          {leader && mine?.id === open.id && (
                            <td class="right">{p.isBot && <Confirm label="Eruit" sure="Eruit zetten?" onConfirm={() => send({ type: 'tribeKick', player: p.id })} />}</td>
                          )}
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
