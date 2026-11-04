import { PlayerLink } from '../components/PlayerLink';
import { useEffect, useState } from 'preact/hooks';
import type { FrictionRow, RankId, TribeAskView, TribeRelation, TribeView } from '../../shared/protocol';
import { MAX_MEMBERS } from '../../shared/tribes';
import { formatGameTime } from '../../shared/time';
import { Confirm } from '../components/Confirm';
import { TalksPanel } from '../components/TalksPanel';
import { Coords } from '../components/Coords';
import { OrderPanel } from '../components/OrderPanel';
import { FaceIcon } from '../components/FaceIcon';
import { MapLink } from '../components/MapLink';
import { dec1, duration, num, upToDec1 } from '../format';
import { inviteCandidates, mapData, ranking, refusedApplications, send, showOnMap, snapshot, tribeAsks, tribeFocus, tribeNews, tribes, warAsk, friction } from '../store';

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
/** Your player id (the human is always 0). */
const MY_ID = 0;
const RANK_LABEL: Record<RankId, string> = { leider: 'Leider', rechterhand: 'Rechterhand', kapitein: 'Kapitein', veteraan: 'Veteraan', krijger: 'Krijger', rekruut: 'Rekruut' };

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
      <OrderPanel />
      {!leader && !s.leaderOrder && (
        <div class="row">
          <button class="small" onClick={() => send({ type: 'askOrder' })} title="Je leider geeft je er een als hij iets heeft: support voor een aangevallen stamgenoot, of een vijandelijk dorp. Een gevraagde opdracht die je niet haalt kost meer aanzien (−12).">
            Vraag om een opdracht
          </button>
        </div>
      )}
      {!leader && s.coup && (
        <details class="coup">
          <summary>Machtsgreep{s.coup.blocker ? '' : ` · kans ${Math.round(s.coup.chance * 100)}%`}</summary>
          {s.coup.blocker ? (
            <p class="muted">{s.coup.blocker}</p>
          ) : (
            <>
              <ul class="order-facts">
                {s.coup.why.map((w) => <li key={w}>{w}</li>)}
              </ul>
              <p class="hint">Lukt het, dan leid jij de stam; de oude leider vertrekt met een wrok tegen je, en wie hem nog mocht kan met hem meegaan. Mislukt het, dan lig je eruit en ben je een tijd vogelvrij.</p>
              <Confirm label={`Machtsgreep plegen (${Math.round(s.coup.chance * 100)}%)`} cls="warn" sure={`Echt? ${Math.round(s.coup.chance * 100)}% kans; mislukt = eruit en vogelvrij.`} onConfirm={() => send({ type: 'tribeCoup' })} />
            </>
          )}
        </details>
      )}
      {t.next && (
        <p class="muted">
          Je bent {RANK_LABEL[t.ranks.find((r) => r.id === MY_ID)?.rank ?? 'krijger'].toLowerCase()}. Voor {RANK_LABEL[t.next.rank].toLowerCase()} heb je {num(t.next.need)} rangpunten nodig
          (nu {num(t.ranks.find((r) => r.rank !== 'leider' && r.id === MY_ID)?.merit ?? 0)}).
        </p>
      )}
      {leader && t.members.length < MAX_MEMBERS && (
        <details class="invite-list">
          <summary>Spelers uitnodigen ({inviteCandidates.value.length} in de buurt)</summary>
          <table class="table compact">
            <thead>
              <tr>
                <th>Speler</th>
                <th>Stam</th>
                <th class="right">Punten</th>
                <th class="right" title="Afstand van hun centrum tot het centrum van je stam (gewogen naar punten)">
                  Afstand{inviteCandidates.value[0] ? <span class="muted"> (max {inviteCandidates.value[0].reach})</span> : null}
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {inviteCandidates.value.map((c) => {
                const ct = c.tribe !== undefined ? byId.get(c.tribe) : undefined;
                return (
                  <tr key={c.id} class={c.blocked ? 'dim' : ''}>
                    <td class="ellipsis">
                      <PlayerLink id={c.id} name={c.name} />
                      {c.declined ? <span class="refused" title="Zo vaak sloeg hij je uitnodiging af"> · {c.declined}× afgewezen</span> : null}
                      <MapLink owner={c.id} />
                    </td>
                    <td>{ct ? <Tag t={ct} /> : <span class="muted">—</span>}</td>
                    <td class="right mono">{num(c.points)}</td>
                    <td class={`right mono ${c.blocked === 'far' ? 'bad' : ''}`}>{c.distance}</td>
                    <td class="right">
                      {invited.has(c.id) ? (
                        <span class="muted">uitgenodigd</span>
                      ) : c.blocked ? (
                        <span class="muted" title={BLOCKED_HINT[c.blocked]}>{BLOCKED_LABEL[c.blocked]}</span>
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
          <p class="muted">
            Bots antwoorden als ze online zijn. Spelers die al in een stam zitten, stappen zelden over. Je stam neemt spelers tot{' '}
            {inviteCandidates.value[0]?.reach ?? 16} velden van zijn centrum; hoe verder je stam uitgespreid is, hoe groter dat bereik (max 32).
          </p>
        </details>
      )}
      {s.war && <WarFront />}
      {t.members.length > 1 && <TribeOrders />}
    </section>
  );
}

/** At war: the front (leader chooses it) and the joint operations underway. */
function WarFront() {
  const s = snapshot.value!;
  const w = s.war!;
  const leader = s.myTribeLeader;
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const enemy = w.front?.enemy ?? null;
  const setFront = (e: number | null, t?: number) => send({ type: 'tribeFront', enemy: e, ...(t !== undefined ? { target: t } : {}) });
  const pick = () => {
    setError('');
    const map = mapData.value;
    if (!map) { send({ type: 'getMap' }); setError('Kaart laden… probeer het zo nog eens.'); return; }
    const xy = /^(\d{1,4})\s*[|,/ ]\s*(\d{1,4})$/.exec(target.trim());
    const v = xy ? map.villages.find((x) => x.x === Number(xy[1]) && x.y === Number(xy[2])) : undefined;
    if (!v) { setError('Geen dorp op die coördinaten (schrijf bijv. 501|497).'); return; }
    if (enemy === null) { setError('Kies eerst de vijand.'); return; }
    setFront(enemy, v.id);
    setTarget('');
  };
  return (
    <div class="tribe-orders war-front">
      <h3>Front</h3>
      {w.enemies.length === 0 ? (
        <p class="muted">Geen oorlog meer. De laatste operaties lopen nog af.</p>
      ) : leader ? (
        <>
          <p class="hint">
            Kies tegen wie je bots samen vechten, en eventueel welk dorp eerst. Ze verkennen het, plannen legers die tegelijk landen en sturen er een
            edeltrein achteraan als ze het samen echt aankunnen. Zonder keuze pakken ze zelf het dichtstbijzijnde dorp van elke vijand.
          </p>
          <div class="row wrap order-form">
            <select value={String(enemy ?? '')} onChange={(e) => setFront(e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}>
              <option value="">Bots kiezen zelf</option>
              {w.enemies.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  [{e.tag}] {e.name}
                </option>
              ))}
            </select>
            {enemy !== null && (
              <form class="row" onSubmit={(e) => { e.preventDefault(); pick(); }}>
                <input placeholder="doelwit 501|497 (optioneel)" value={target} onInput={(e) => setTarget(e.currentTarget.value)} />
                <button class="small primary" type="submit" disabled={!target.trim()}>
                  Doelwit
                </button>
              </form>
            )}
            {w.front?.target && (
              <span>
                Doelwit: {w.front.target.name} <Coords x={w.front.target.x} y={w.front.target.y} />{' '}
                <button class="link" onClick={() => setFront(enemy)}>wissen</button>
              </span>
            )}
            {error && <span class="error">{error}</span>}
          </div>
        </>
      ) : (
        <p class="hint">
          In oorlog met {w.enemies.map((e) => `[${e.tag}]`).join(', ')}. De leider plant gezamenlijke aanvallen op frontdorpen die de stam kent: van
          verkenningen, en van wat jij ziet als je aanvalt of verkent. Heeft hij jouw leger nodig, dan krijg je een order met de landingstijd; de edels van de
          stam komen er direct achteraan, dus stuur je niet, dan sneuvelen ze.
        </p>
      )}
      {w.ops.length > 0 ? (
        <table class="table compact">
          <thead>
            <tr>
              <th>Doelwit</th>
              <th>Legers</th>
              <th class="right">Landt</th>
              <th class="right">Stand</th>
            </tr>
          </thead>
          <tbody>
            {w.ops.map((o) => (
              <tr key={o.id}>
                <td class="ellipsis">
                  [{o.enemyTag}] {o.target.name} <Coords x={o.target.x} y={o.target.y} /> · <PlayerLink id={o.target.owner} name={o.target.ownerName} />
                  {o.you && <strong> · jij doet mee</strong>}
                </td>
                <td>
                  {o.armies} {o.armies === 1 ? 'leger' : 'legers'}
                  {o.nobles ? ' + edelen' : ''}
                </td>
                <td class="right mono nowrap">{formatGameTime(o.landAt)}</td>
                <td class="right nowrap">
                  <span class={o.sent ? 'good' : 'muted'}>{o.sent}/{o.armies + (o.nobles ? 1 : 0)} vertrokken</span>
                  {o.failed > 0 && <span class="error"> · {o.failed} niet</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        w.enemies.length > 0 && <p class="muted">Nog geen operatie: eerst verkennen, dan pas aanvallen als het samen echt lukt.</p>
      )}
    </div>
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
        <datalist id="order-players">{kind !== 'attack' && players.map((p) => <option key={p.id} value={String(p.name)} />)}</datalist>
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
  const askedWar = tribeAsks.value.find((a) => a.kind === 'war')?.tribe;
  // as right hand you speak for the tribe: a NAP and peace talks yourself, an alliance through your leader
  const rightHand = !leader && !!mine && mine.ranks?.find((r) => r.id === MY_ID)?.rank === 'rechterhand';
  const rhAsk = tribeAsks.value.find((a): a is Extract<TribeAskView, { kind: 'propose' | 'allyAsk' }> => (a.kind === 'propose' && a.by === 'rh') || a.kind === 'allyAsk');
  const relToMine = open && mine && open.id !== mine.id ? (mine.relations.find((r) => r.id === open.id)?.rel ?? null) : null;

  return (
    <div class="screen">
      <div class="row">
        <h2 style={{ margin: 0, flex: 1 }}>Stammen</h2>
        <span class="muted">
          {list.length} stammen · {solo} spelers zonder stam
        </span>
      </div>
      {s && <EndgamePanel list={list} mine={mine?.id} />}
      <TalksPanel />
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
                <col style={{ width: '130px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th class="right">#</th>
                  <th>Stam</th>
                  <th class="right">Leden</th>
                  <th class="right">Punten</th>
                  <th class="right">Dorpen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((t, i) => (
                  <tr key={t.id} class={`clickable ${open?.id === t.id ? 'selected' : ''} ${mine?.id === t.id ? 'me' : ''}`} onClick={() => (tribeFocus.value = t.id)}>
                    <td class="right mono">{i + 1}</td>
                    <td class="ellipsis">
                      <Tag t={t} /> {t.name}
                      {refusedApplications.value[t.id] && mine?.id !== t.id ? (
                        <span class="refused" title="Zo vaak wees deze stam je aanmelding af"> · {refusedApplications.value[t.id]}× afgewezen</span>
                      ) : null}
                    </td>
                    <td class="right mono">
                      {t.members.length}/{MAX_MEMBERS}
                    </td>
                    <td class="right mono">{num(t.points)}</td>
                    <td class="right mono">{t.villages}</td>
                    {mine?.id === t.id ? <td /> : (
                      <td class="right" onClick={(e) => e.stopPropagation()}>
                        {applied.has(t.id) ? (
                          <span class="muted">aangemeld</span>
                        ) : mine && applied.size > 0 ? (
                          <span class="muted" title="Vanuit een stam meld je je bij één stam tegelijk aan">—</span>
                        ) : t.members.length < MAX_MEMBERS ? (
                          mine ? (
                            <Confirm
                              label="Overstappen"
                              sure={`Aanmelden bij [${t.tag}]? Nemen ze je aan, dan verlaat je [${mine.tag}]${leader ? ' en krijgt die een nieuwe leider' : ' en neemt je leider je dat kwalijk'}. Wijzen ze je af, dan merkt [${mine.tag}] niets.`}
                              onConfirm={() => send({ type: 'tribeApply', tribe: t.id })}
                            />
                          ) : (
                            <button class="small" onClick={() => send({ type: 'tribeApply', tribe: t.id })}>
                              Aanmelden
                            </button>
                          )
                        ) : t.bump ? (
                          <Confirm
                            label="Aankloppen"
                            sure={`Vol: nemen ze je, dan moet ${t.bump.name} (${RANK_LABEL[t.bump.rank].toLowerCase()}, ${num(t.bump.merit)} rangpunten) eruit${mine ? `, en verlaat jij [${mine.tag}]${leader ? ' (die krijgt een nieuwe leider)' : ' (je leider neemt je dat kwalijk; een afwijzing merkt hij niet)'}` : ''}. Aankloppen?`}
                            onConfirm={() => send({ type: 'tribeApply', tribe: t.id })}
                          />
                        ) : (
                          <span class="muted" title="Vol, en niemand is zwak genoeg om voor jou plaats te maken (je hebt 2× zijn punten nodig; de leider, rechterhand en rekruten blijven)">vol</span>
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
                      <button class="small" onClick={() => send({ type: 'tribePropose', tribe: open.id, relation: 'peace' })}>Vredesbesprekingen openen</button>
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
                {mine && open.id !== mine.id && (() => {
                  const f = friction.value.find((r) => r.tribe === open.id);
                  return f ? (
                    <p class="muted" data-friction-line>
                      Wrijving met jouw stam: <strong>{fmt(f.friction)}</strong> (oorlog bij {fmt(f.even ? f.need * 2 : f.need)}
                      {f.asked !== undefined && <>, {fmt(f.asked)} op jouw verzoek</>}){!f.contact && ' · grenst nergens aan jullie'}
                    </p>
                  ) : null;
                })()}
                {rightHand && mine && open.id !== mine.id && (
                  <div class="row wrap tribe-actions" data-right-hand>
                    {rhAsk ? (
                      <span class="muted">
                        {rhAsk.tribe !== open.id
                          ? 'Je hebt als rechterhand al een voorstel lopen.'
                          : rhAsk.kind === 'allyAsk'
                            ? 'Je vroeg je leider om een bondgenootschap. Hij antwoordt als hij online is.'
                            : `Je voorstel (${rhAsk.kind === 'propose' ? ASK_REL[rhAsk.relation] : ''}) loopt — hun leider antwoordt als hij online is.`}
                      </span>
                    ) : relToMine === 'war' ? (
                      <button class="small" onClick={() => send({ type: 'rhPropose', tribe: open.id, relation: 'peace' })} title="Als rechterhand mag je zelf vredesbesprekingen openen">Vredesbesprekingen openen</button>
                    ) : relToMine === 'nap' ? (
                      <button class="small" onClick={() => send({ type: 'rhPropose', tribe: open.id, relation: 'ally' })} title="Je leider beslist; als rechterhand weegt je stem zwaar">Leider om bondgenootschap vragen</button>
                    ) : !relToMine ? (
                      <button class="small" onClick={() => send({ type: 'rhPropose', tribe: open.id, relation: 'nap' })} title="Als rechterhand spreek je namens de stam. Heeft je leider een wrok tegen deze stam, dan kost het aanzien en kan hij het opzeggen.">NAP voorstellen</button>
                    ) : null}
                  </div>
                )}
                {!leader && mine && open.id !== mine.id && relToMine !== 'war' && (
                  <div class="row wrap tribe-actions" data-war-ask>
                    {askedWar === open.id ? (
                      <span class="muted">Je vroeg je leider om oorlog. Hij antwoordt als hij online is.</span>
                    ) : relToMine === 'nap' || relToMine === 'ally' ? (
                      <span class="muted">Jullie hebben een verdrag: daar vraag je geen oorlog tegen.</span>
                    ) : !warAsk.value.contact.includes(open.id) ? (
                      <span class="muted">Grenst nergens aan jullie stam: je leider begint hier geen oorlog.</span>
                    ) : askedWar !== undefined ? (
                      <span class="muted">Je hebt je leider al om een andere oorlog gevraagd.</span>
                    ) : warAsk.value.waitUntil !== undefined ? (
                      <span class="muted">Je leider zei net nee. Opnieuw vragen kan vanaf {formatGameTime(warAsk.value.waitUntil)}.</span>
                    ) : (
                      <button class="small warn" onClick={() => send({ type: 'tribeAskWar', tribe: open.id })} title="Je leider beslist: genoeg wrijving, sterk genoeg, en hoe hoger hij je waardeert hoe zwaarder je stem telt.">
                        Leider om oorlog vragen
                      </button>
                    )}
                  </div>
                )}
                <table class="table compact">
                  <thead>
                    <tr>
                      <th>Lid</th>
                      <th>Rang</th>
                      <th class="right" title="Verdiend met opdrachten, rollen in gezamenlijke aanvallen, veroveringen op vijanden en support; zakt langzaam weg">Rangpunten</th>
                      <th class="right">Punten</th>
                      <th class="right">Dorpen</th>
                      {leader && mine?.id === open.id && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {(open.ranks ?? open.members.map((id) => ({ id, rank: 'krijger' as const, merit: 0 })))
                      .map((r) => ({ r, p: players.get(r.id) }))
                      .filter((x) => x.p !== undefined)
                      .map(({ r, p }) => p && (
                        <tr key={p.id} class={p.isBot ? '' : 'me'}>
                          <td class="ellipsis">
                            {p.id === open.leader && <span title="Leider">♛ </span>}
                            <FaceIcon face={p.face} size={24} /> <PlayerLink id={p.id} name={p.name} strong={!p.isBot} />
                            <MapLink owner={p.id} />
                          </td>
                          <td class={`rank rank-${r.rank}`}>{RANK_LABEL[r.rank]}</td>
                          <td class="right mono">{r.id === open.leader ? '—' : num(r.merit)}</td>
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
                            {r.trust !== undefined && (() => {
                              const back = o.relations.find((x) => x.id === open.id)?.trust;
                              const cls = (n: number) => (n < 30 ? 'error' : n < 50 ? 'warn' : 'good');
                              return (
                                <span title="Vertrouwen (0-100): zakt als een bondgenoot niet helpt in een oorlog, stijgt door mee te vechten of support te sturen. Onder 30 wordt een bot-bondgenootschap een NAP.">
                                  {' '}· vertrouwen <span class={cls(r.trust!)}>{r.trust}</span>
                                  {back !== undefined && <> (zij in [{open.tag}]: <span class={cls(back)}>{back}</span>)</>}
                                </span>
                              );
                            })()}
                          </li>
                        ) : null;
                      })}
                  </ul>
                )}
              </section>
              {mine && open.id === mine.id && <FrictionPanel byId={byId} leader={leader} />}
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

const fmt = (n: number) => dec1(n);
const WHY: Record<NonNullable<FrictionRow['why']>, string> = { attack: 'aanvallen', conquest: 'veroveringen', treaty: 'gebroken verdrag', border: 'grens' };
const STARTER: Record<FrictionRow['starter'], string> = { us: 'jullie leider', them: 'zij', you: 'jij' };

/** Your tribe's friction with every other tribe: how close each is to a war, and why. */
function FrictionPanel({ byId, leader }: { byId: Map<number, TribeView>; leader: boolean }) {
  const rows = friction.value;
  return (
    <section class="panel friction" data-friction>
      <h2>Wrijving</h2>
      {!rows.length ? (
        <p class="muted">Geen wrijving met andere stammen.</p>
      ) : (
        <table class="table compact">
          <thead>
            <tr>
              <th>Stam</th>
              <th>Wrijving</th>
              <th class="right">Oorlog bij</th>
              <th>Bron</th>
              <th title="Grenst de stam ergens aan jullie (minstens 3 dorpenparen binnen 16 velden)?">Grens</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const o = byId.get(r.tribe);
              if (!o) return null;
              // a treaty, or two tribes about as strong: it takes twice the friction
              const need = r.even || r.rel === 'nap' || r.rel === 'ally' ? r.need * 2 : r.need;
              const title = r.rel === 'war' ? 'Jullie zijn al in oorlog.'
                : r.rel ? 'Jullie hebben een verdrag: dat breekt pas bij twee keer zoveel wrijving en een duidelijk sterkere kant.'
                : r.starter === 'you' ? 'Jullie zijn sterker: jij beslist zelf over oorlog.'
                : `Begint de oorlog: ${STARTER[r.starter]}.${r.even ? ' Ongeveer even sterk, dus het kost twee keer zoveel wrijving.' : ''}`;
              return (
                <tr key={r.tribe} class={r.contact ? '' : 'muted'}>
                  <td class="ellipsis">
                    <Tag t={o} onClick={() => (tribeFocus.value = o.id)} /> {o.name}
                    {r.rel && <> <span class={`rel rel-${r.rel}`}>{REL[r.rel]}</span></>}
                  </td>
                  <td style={{ minWidth: '120px' }} title={`${fmt(r.friction)} van ${fmt(need)}`}>
                    <div class="row" style={{ gap: '8px', alignItems: 'center' }}>
                      <div class="bar" style={{ flex: 1 }}>
                        <b style={{ width: `${Math.min(100, (r.friction / need) * 100)}%`, ...(r.friction >= need ? { background: 'var(--danger, #c8563f)' } : {}) }} />
                      </div>
                      <span class="mono">{fmt(r.friction)}</span>
                    </div>
                  </td>
                  <td class="right mono nowrap" title={title}>
                    {r.rel === 'war' ? <span class="muted">al oorlog</span> : r.starter === 'you' ? <span class="muted">jij beslist</span> : fmt(need)}
                    {r.asked !== undefined && <span class="muted" title="Wat je leider nodig heeft als jij erom vraagt (hoe meer hij je waardeert, hoe minder)"> · {fmt(r.asked)} op verzoek</span>}
                    {r.starter === 'them' && <span class="muted"> (zij)</span>}
                  </td>
                  <td>{r.why ? WHY[r.why] : '—'}</td>
                  <td>{r.contact ? '✓' : <span title="Grenst nergens: hier komt geen oorlog van, hoe hoog de wrijving ook is.">✗</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p class="hint">
        Wrijving komt van aanvallen (+0,25), veroveringen (+4), gebroken verdragen en dicht bij elkaar wonen, en zakt elke 90 speelminuten met 4%. Een oorlog
        begint bij de sterkste kant zodra de wrijving boven zijn grens zit en jullie aan elkaar grenzen.{leader ? '' : ' Als lid kun je je leider om oorlog vragen: dan is de grens lager.'}
      </p>
    </section>
  );
}

const BLOCKED_LABEL = { far: 'te ver', prey: 'te klein', full: 'stam vol', blocked: 'vijand ertussen' } as const;
const BLOCKED_HINT = {
  far: 'Te ver van het centrum van je stam: hij zegt altijd nee.',
  prey: 'Zit midden in je gebied en is veel kleiner: hij vertrouwt het niet.',
  full: 'Je stam zit vol.',
  blocked: 'Er zit een stam waarmee je in oorlog bent tussen jullie in.',
} as const;

/** Domination race: the biggest tribes on their way to the target share. */
function EndgamePanel({ list, mine }: { list: TribeView[]; mine?: number }) {
  const s = snapshot.value!;
  const eg = s.endgame;
  const top = [...list].sort((a, b) => b.share - a.share).slice(0, 5);
  const mineRow = mine !== undefined && !top.some((t) => t.id === mine) ? list.find((t) => t.id === mine) : undefined;
  const rows = mineRow ? [...top, mineRow] : top;
  const pct = (x: number) => `${upToDec1(x * 100)}%`;
  return (
    <section class="panel endgame">
      <div class="row">
        <h3 style={{ margin: 0, flex: 1 }}>Eindspel</h3>
        <span class="muted">
          {pct(eg.target)} van {eg.countBarbarians ? 'alle dorpen' : 'de spelersdorpen'}, {eg.holdDays} speldagen vasthouden
        </span>
      </div>
      {eg.winner ? (
        <p class={eg.winner.you ? 'good' : 'bad'}>
          <strong>{eg.winner.you ? 'Gewonnen' : 'Verloren'}</strong>: [{eg.winner.tag}] {eg.winner.name} veroverde de wereld op {formatGameTime(eg.winner.time)}.
        </p>
      ) : eg.leader ? (
        <p class={eg.leader.you ? 'good' : 'bad'}>
          [{eg.leader.tag}] zit boven {pct(eg.target)}: {eg.leader.you ? 'jullie winnen' : 'die stam wint'} over {duration(Math.max(0, eg.leader.winsAt - s.time))} ({formatGameTime(eg.leader.winsAt)}), als het zo blijft.
        </p>
      ) : null}
      <div class="endgame-bars">
        {rows.map((t) => (
          <div key={t.id} class={`endgame-row ${t.id === mine ? 'me' : ''}`}>
            <span class="ellipsis"><Tag t={t} /> {t.name}</span>
            <div class="endgame-bar" style={{ '--tc': t.color }}>
              <i style={{ width: `${Math.min(100, (t.share / eg.target) * 100)}%` }} />
              <b style={{ left: `${(eg.warnAt / eg.target) * 100}%` }} title={`Waarschuwing bij ${pct(eg.warnAt)}`} />
            </div>
            <span class="mono right">{pct(t.share)}</span>
          </div>
        ))}
      </div>
      <p class="hint">
        De balk loopt tot {pct(eg.target)}. Boven {pct(eg.warnAt)} (streepje) krijgt iedereen een waarschuwing en keren de andere stammen zich tegen de koploper.
      </p>
    </section>
  );
}
