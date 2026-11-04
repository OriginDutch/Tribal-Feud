import { useEffect, useState } from 'preact/hooks';
import { FaceIcon } from '../components/FaceIcon';
import { VillageHistory } from '../components/VillageHistory';
import { Coords } from '../components/Coords';
import { formatGameTime } from '../../shared/time';
import { TripleConfirm } from '../components/TripleConfirm';
import { num } from '../format';
import type { PlayerView } from '../../shared/protocol';
import { MapScreen } from './MapScreen';
import { tr } from '../../shared/i18n';
import { trx } from '../i18n';
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
  if (id === null) return <div class="screen narrow"><p class="muted">{tr('Kies een speler (klik op een naam).')}</p></div>;
  if (!p || p.id !== id) return <div class="screen narrow"><p class="muted">{tr('Laden…')}</p></div>;
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
          {tr('Toon op kaart')}
        </button>
      </div>
      <section class="panel player-stats">
        <div><span class="muted">{tr('Plek')}</span><strong>#{p.rank}</strong></div>
        <div><span class="muted">{tr('Punten')}</span><strong>{num(p.points)}</strong></div>
        <div><span class="muted">{tr('Dorpen')}</span><strong>{p.villages.length}</strong></div>
        <div><span class="muted">{tr('Zwaartepunt')}</span><strong>{p.centre ? <Coords x={p.centre.x} y={p.centre.y} bare /> : '—'}</strong></div>
        {!you && <div><span class="muted">{tr('Dichtstbij')}</span><strong>{p.villages.length ? tr('{n} velden', { n: Math.min(...p.villages.map((v) => v.distance)) }) : '—'}</strong></div>}
        {!you && <div><span class="muted">{tr('Wrok')}</span><strong class={p.grudge > 0 ? 'bad' : ''}>{p.grudge > 0 ? p.grudge.toFixed(2) : tr('geen')}</strong></div>}
      </section>

      <section class="panel">
        <h2>{tr('Statistiek')}</h2>
        <div class="player-stats">
          <div><span class="muted">{tr('Aanvallen op spelers')}</span><strong>{num(p.stats.pvp)}</strong></div>
          <div><span class="muted">{tr('Op barbaren')}</span><strong>{num(p.stats.barb)}</strong></div>
          <div><span class="muted">{tr('Spelersdorpen genomen')}</span><strong>{num(p.stats.took)}</strong></div>
          <div><span class="muted">{tr('Barbarendorpen genomen')}</span><strong>{num(p.stats.tookBarb)}</strong></div>
          <div><span class="muted">{tr('Dorpen verloren')}</span><strong>{num(p.stats.lost)}</strong></div>
        </div>
        <p class="hint">{tr('Telt sinds de wereldstatistiek bestaat; oudere saves beginnen bij nul.')}</p>
      </section>

      {p.villages.length > 0 && <MiniMap p={p} />}

      {!you && (p.bond || p.grudge > 0 || p.canAskPermission) && (
        <section class="panel">
          <h2>{tr('Band')}</h2>
          <p>
            {p.bond === 'mate' ? tr('Stamgenoot.') : p.bond === 'ally' ? tr('Zijn stam is jullie bondgenoot.') : p.bond === 'nap' ? tr('Jullie stammen hebben een niet-aanvalsverdrag.') : tr('Geen band.')}
            {p.mood !== undefined && <> {trx('Tevredenheid over jou: {mood}/100.', { mood: <strong>{p.mood}</strong> })}</>}
            {p.grudge > 0 && <> {trx('Wrok tegen jou: {grudge}.', { grudge: <strong class="bad">{p.grudge.toFixed(2)}</strong> })}</>}
            {p.permission && <> {trx('Toestemming van je leider: {answer}.', { answer: !p.permission.answer ? tr('gevraagd') : p.permission.answer === 'yes' ? <span class="good">{tr('ja')}</span> : <span class="bad">{tr('nee')}</span> })}</>}
          </p>
          <div class="row wrap">
            {p.canAskPermission && !p.permission?.answer && !p.permission && (
              <button class="small" onClick={() => send({ type: 'askPermission', target: p.id })}>{tr('Leider om toestemming vragen')}</button>
            )}
            {p.bond && (
              <TripleConfirm
                label={p.bond === 'mate' ? tr('Verraden…') : tr('Verdrag breken en verraden…')}
                onConfirm={() => send({ type: 'betray', target: p.id })}
              />
            )}
          </div>
          {p.bond && (
            <p class="hint">
              {p.bond === 'mate'
                ? tr('Verraad: als leider zet je hem uit de stam, als lid word je er zelf uitgezet.')
                : tr('Verraad: als leider verklaar je zijn stam de oorlog, als lid word je uit je stam gezet.')}{' '}
              {tr('Daarna mag je hem aanvallen. Iedereen die erbij hoort krijgt wrok, en elke stam vertrouwt je minder.')}
            </p>
          )}
        </section>
      )}

      {!you && (
        <section class="panel">
          <h2>{tr('Tussen jullie')}</h2>
          {p.incoming > 0 && <p class="error">⚔ {p.incoming === 1 ? tr('Valt je nu aan met 1 aanval.') : tr('Valt je nu aan met {n} aanvallen.', { n: p.incoming })}</p>}
          <table class="table compact">
            <tbody>
              <tr>
                <td>{tr('Zijn aanvallen op jou')}</td>
                <td class="right mono">{h.theirAttacks}{h.theirAttacks > 0 && <span class="muted"> · {tr('{n} gewonnen', { n: h.theirWins })}</span>}</td>
                <td class="right muted mono">{h.lastTheirs !== undefined ? tr('laatste {time}', { time: formatGameTime(h.lastTheirs) }) : ''}</td>
              </tr>
              <tr>
                <td>{tr('Jouw aanvallen op hem')}</td>
                <td class="right mono">{h.yourAttacks}{h.yourAttacks > 0 && <span class="muted"> · {tr('{n} gewonnen', { n: h.yourWins })}</span>}</td>
                <td class="right muted mono">{h.lastYours !== undefined ? tr('laatste {time}', { time: formatGameTime(h.lastYours) }) : ''}</td>
              </tr>
              <tr>
                <td>{tr('Dorpen veroverd')}</td>
                <td class="right mono">
                  {tr('{a} door jou · {b} van jou', { a: h.villagesYouTook, b: h.villagesTakenFromYou })}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
          <p class="hint">{tr('Uit je rapporten (de laatste 300).')}</p>
        </section>
      )}

      <section class="panel">
        <h2>{tr('Dorpen')}</h2>
        {!p.villages.length ? (
          <p class="muted">{tr('Geen dorpen (meer).')}</p>
        ) : (
          <table class="table">
            <thead>
              <tr>
                <th>{tr('Dorp')}</th>
                <th class="right">{tr('Punten')}</th>
                {!you && <th class="right">{tr('Afstand')}</th>}
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
                      {tr('Geschiedenis')}
                    </button>{' '}
                    {!you && (
                      <button class="small" onClick={() => attackVillage(v.x, v.y)}>
                        {tr('Verzamelplaats')}
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
          <div class="modal" role="dialog" aria-modal="true" aria-label={tr('Geschiedenis van het dorp')} onClick={(e) => e.stopPropagation()}>
            <div class="row">
              <h3 style={{ margin: 0, flex: 1 }}>{p.villages.find((v) => v.id === historyOf)?.name ?? tr('Dorp')}</h3>
              <button class="small" onClick={() => setHistoryOf(null)} aria-label={tr('Sluiten')}>✕</button>
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
      <h2>{tr('Kaart')}</h2>
      <MapScreen embed={{ owner: p.id }} />
    </section>
  );
}
