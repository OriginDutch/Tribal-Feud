import { useEffect, useState } from 'preact/hooks';
import { FaceIcon } from '../components/FaceIcon';
import { VillageHistory } from '../components/VillageHistory';
import { Coords } from '../components/Coords';
import { formatGameTime } from '../../shared/time';
import { TripleConfirm } from '../components/TripleConfirm';
import { num } from '../format';
import type { PlayerView } from '../../shared/protocol';
import { MapScreen } from './MapScreen';
import { attackVillage, openTribe, playerFocus, playerView, send, showOnMap } from '../store';

/** A player's profile: where they are, their villages, and what happened between you. */
export function PlayerScreen() {
  const id = playerFocus.value;
  useEffect(() => {
    if (id === null) return;
    send({ type: 'getPlayer', id });
    const t = window.setInterval(() => send({ type: 'getPlayer', id }), 5000);
    return () => window.clearInterval(t);
  }, [id]);
  const p = playerView.value;
  const [historyOf, setHistoryOf] = useState<number | null>(null);
  if (id === null) return <div class="screen narrow"><p class="muted">Kies een speler (klik op een naam).</p></div>;
  if (!p || p.id !== id) return <div class="screen narrow"><p class="muted">Laden…</p></div>;
  const h = p.history;
  const you = !p.isBot;

  return (
    <div class="screen narrow">
      <div class="row player-head">
        <FaceIcon face={p.face} size={72} class="face-big" />
        <h2 style={{ margin: 0, flex: 1 }}>
          {p.name}
          {p.tribe && (
            <>
              {' '}
              <button class="link tribe-tag" style={{ '--tc': p.tribe.color }} onClick={() => openTribe(p.tribe!.id)}>
                [{p.tribe.tag}]
              </button>
            </>
          )}
        </h2>
        <button class="small" disabled={!p.villages.length} onClick={() => showOnMap({ owner: p.id })}>
          Toon op kaart
        </button>
      </div>
      <section class="panel player-stats">
        <div><span class="muted">Plek</span><strong>#{p.rank}</strong></div>
        <div><span class="muted">Punten</span><strong>{num(p.points)}</strong></div>
        <div><span class="muted">Dorpen</span><strong>{p.villages.length}</strong></div>
        <div><span class="muted">Zwaartepunt</span><strong>{p.centre ? <Coords x={p.centre.x} y={p.centre.y} bare /> : '—'}</strong></div>
        {!you && <div><span class="muted">Dichtstbij</span><strong>{p.villages.length ? `${Math.min(...p.villages.map((v) => v.distance))} velden` : '—'}</strong></div>}
        {!you && <div><span class="muted">Wrok</span><strong class={p.grudge > 0 ? 'bad' : ''}>{p.grudge > 0 ? p.grudge.toFixed(2) : 'geen'}</strong></div>}
      </section>

      <section class="panel">
        <h2>Statistiek</h2>
        <div class="player-stats">
          <div><span class="muted">Aanvallen op spelers</span><strong>{num(p.stats.pvp)}</strong></div>
          <div><span class="muted">Op barbaren</span><strong>{num(p.stats.barb)}</strong></div>
          <div><span class="muted">Spelersdorpen genomen</span><strong>{num(p.stats.took)}</strong></div>
          <div><span class="muted">Barbarendorpen genomen</span><strong>{num(p.stats.tookBarb)}</strong></div>
          <div><span class="muted">Dorpen verloren</span><strong>{num(p.stats.lost)}</strong></div>
        </div>
        <p class="hint">Telt sinds de wereldstatistiek bestaat; oudere saves beginnen bij nul.</p>
      </section>

      {p.villages.length > 0 && <MiniMap p={p} />}

      {!you && (p.bond || p.grudge > 0 || p.canAskPermission) && (
        <section class="panel">
          <h2>Band</h2>
          <p>
            {p.bond === 'mate' ? 'Stamgenoot.' : p.bond === 'ally' ? 'Zijn stam is jullie bondgenoot.' : p.bond === 'nap' ? 'Jullie stammen hebben een niet-aanvalsverdrag.' : 'Geen band.'}
            {p.mood !== undefined && <> Tevredenheid over jou: <strong>{p.mood}</strong>/100.</>}
            {p.grudge > 0 && <> Wrok tegen jou: <strong class="bad">{p.grudge.toFixed(2)}</strong>.</>}
            {p.permission && <> Toestemming van je leider: {!p.permission.answer ? 'gevraagd' : p.permission.answer === 'yes' ? <span class="good">ja</span> : <span class="bad">nee</span>}.</>}
          </p>
          <div class="row wrap">
            {p.canAskPermission && !p.permission?.answer && !p.permission && (
              <button class="small" onClick={() => send({ type: 'askPermission', target: p.id })}>Leider om toestemming vragen</button>
            )}
            {p.bond && (
              <TripleConfirm
                label={p.bond === 'mate' ? 'Verraden…' : 'Verdrag breken en verraden…'}
                onConfirm={() => send({ type: 'betray', target: p.id })}
              />
            )}
          </div>
          {p.bond && (
            <p class="hint">
              Verraad: {p.bond === 'mate' ? 'als leider zet je hem uit de stam, als lid word je er zelf uitgezet' : 'als leider verklaar je zijn stam de oorlog, als lid word je uit je stam gezet'}.
              Daarna mag je hem aanvallen. Iedereen die erbij hoort krijgt wrok, en elke stam vertrouwt je minder.
            </p>
          )}
        </section>
      )}

      {!you && (
        <section class="panel">
          <h2>Tussen jullie</h2>
          {p.incoming > 0 && <p class="error">⚔ Valt je nu aan met {p.incoming} {p.incoming === 1 ? 'aanval' : 'aanvallen'}.</p>}
          <table class="table compact">
            <tbody>
              <tr>
                <td>Zijn aanvallen op jou</td>
                <td class="right mono">{h.theirAttacks}{h.theirAttacks > 0 && <span class="muted"> · {h.theirWins} gewonnen</span>}</td>
                <td class="right muted mono">{h.lastTheirs !== undefined ? `laatste ${formatGameTime(h.lastTheirs)}` : ''}</td>
              </tr>
              <tr>
                <td>Jouw aanvallen op hem</td>
                <td class="right mono">{h.yourAttacks}{h.yourAttacks > 0 && <span class="muted"> · {h.yourWins} gewonnen</span>}</td>
                <td class="right muted mono">{h.lastYours !== undefined ? `laatste ${formatGameTime(h.lastYours)}` : ''}</td>
              </tr>
              <tr>
                <td>Dorpen veroverd</td>
                <td class="right mono">
                  {h.villagesYouTook} door jou · {h.villagesTakenFromYou} van jou
                </td>
                <td />
              </tr>
            </tbody>
          </table>
          <p class="hint">Uit je rapporten (de laatste 300).</p>
        </section>
      )}

      <section class="panel">
        <h2>Dorpen</h2>
        {!p.villages.length ? (
          <p class="muted">Geen dorpen (meer).</p>
        ) : (
          <table class="table">
            <thead>
              <tr>
                <th>Dorp</th>
                <th class="right">Punten</th>
                {!you && <th class="right">Afstand</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {p.villages.map((v) => (
                <tr key={v.id}>
                  <td class="ellipsis">
                    {v.name} <Coords x={v.x} y={v.y} />
                  </td>
                  <td class="right mono">{num(v.points)}</td>
                  {!you && <td class="right mono">{v.distance}</td>}
                  <td class="right">
                    <button class="small" onClick={() => setHistoryOf(v.id)}>
                      Geschiedenis
                    </button>{' '}
                    {!you && (
                      <button class="small" onClick={() => attackVillage(v.x, v.y)}>
                        Verzamelplaats
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {historyOf !== null && (
        <div class="modal-backdrop" onClick={() => setHistoryOf(null)}>
          <div class="modal" role="dialog" aria-modal="true" aria-label="Geschiedenis van het dorp" onClick={(e) => e.stopPropagation()}>
            <div class="row">
              <h3 style={{ margin: 0, flex: 1 }}>{p.villages.find((v) => v.id === historyOf)?.name ?? 'Dorp'}</h3>
              <button class="small" onClick={() => setHistoryOf(null)} aria-label="Sluiten">✕</button>
            </div>
            <VillageHistory id={historyOf} {...(you ? {} : { owner: p.id })} />
          </div>
        </div>
      )}
    </div>
  );
}

/** The real map, small, framed on his villages (marked like "Toon op kaart" does). */
function MiniMap({ p }: { p: PlayerView }) {
  return (
    <section class="panel">
      <h2>Kaart</h2>
      <MapScreen embed={{ owner: p.id }} />
    </section>
  );
}
