import { useEffect } from 'preact/hooks';
import { Coords } from '../components/Coords';
import { formatGameTime } from '../../shared/time';
import { TripleConfirm } from '../components/TripleConfirm';
import { num } from '../format';
import type { PlayerView } from '../../shared/protocol';
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
  if (id === null) return <div class="screen narrow"><p class="muted">Kies een speler (klik op een naam).</p></div>;
  if (!p || p.id !== id) return <div class="screen narrow"><p class="muted">Laden…</p></div>;
  const h = p.history;
  const you = !p.isBot;

  return (
    <div class="screen narrow">
      <div class="row player-head">
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
    </div>
  );
}

/** His villages (gold), his tribe mates' (tribe colour) and yours where they fall in the frame (blue). Click a dot for the map. */
function MiniMap({ p }: { p: PlayerView }) {
  const color = p.tribe?.color ?? '#9a8f7e';
  const own = p.villages.map((v) => ({ x: v.x, y: v.y }));
  const mates = p.mates.flatMap((m) => m.villages.map((v) => ({ ...v, name: m.name })));
  const all = [...own, ...mates];
  let x0 = Math.min(...all.map((v) => v.x)), x1 = Math.max(...all.map((v) => v.x));
  let y0 = Math.min(...all.map((v) => v.y)), y1 = Math.max(...all.map((v) => v.y));
  // at least 20 fields across, 3 fields of margin
  const grow = (a: number, b: number) => { const pad = Math.max(3, (20 - (b - a)) / 2); return [a - pad, b + pad] as const; };
  [x0, x1] = grow(x0, x1);
  [y0, y1] = grow(y0, y1);
  const mine = p.mine.filter((v) => v.x >= x0 && v.x <= x1 && v.y >= y0 && v.y <= y1);
  const w = x1 - x0, h = y1 - y0;
  const r = Math.max(0.35, Math.min(w, h) / 60);
  const dot = (v: { x: number; y: number }, fill: string, title: string, big = false) => (
    <circle cx={v.x + 0.5} cy={v.y + 0.5} r={big ? r * 1.3 : r} fill={fill} stroke="#1c1813" stroke-width={r * 0.3} style={{ cursor: 'pointer' }} onClick={() => showOnMap({ x: v.x, y: v.y })}>
      <title>{title} ({v.x}|{v.y})</title>
    </circle>
  );
  return (
    <section class="panel">
      <h2>Kaart</h2>
      <svg class="mini-map" viewBox={`${x0} ${y0} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 300 }}>
        <rect x={x0} y={y0} width={w} height={h} fill="#2a241c" />
        {mates.map((v, i) => <g key={`m${i}`}>{dot(v, color, v.name)}</g>)}
        {mine.map((v, i) => <g key={`y${i}`}>{dot(v, '#4f8fd6', 'Jouw dorp')}</g>)}
        {own.map((v, i) => <g key={`p${i}`}>{dot(v, '#e0b04a', p.name, true)}</g>)}
      </svg>
      <p class="hint">
        <span style={{ color: '#e0b04a' }}>●</span> {p.name}
        {mates.length > 0 && <> · <span style={{ color }}>●</span> stamgenoten ({p.mates.length})</>}
        {mine.length > 0 && <> · <span style={{ color: '#4f8fd6' }}>●</span> jij</>}
        {' '}· {Math.round(w)}×{Math.round(h)} velden. Klik een dorp voor de kaart.
      </p>
    </section>
  );
}
