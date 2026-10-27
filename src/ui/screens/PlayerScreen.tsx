import { useEffect } from 'preact/hooks';
import { Coords } from '../components/Coords';
import { formatGameTime } from '../../shared/time';
import { TripleConfirm } from '../components/TripleConfirm';
import { num } from '../format';
import type { MapVillage, PlayerView } from '../../shared/protocol';
import { mapData, attackVillage, openTribe, playerFocus, playerView, send, showOnMap } from '../store';

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

/**
 * A small piece of the world map around him and his tribe: every village in the frame as a
 * square (like the big map), his in gold, his tribe mates' in the tribe colour, yours in blue,
 * the rest dim. Grid lines every 5 fields. Click a village for the big map.
 */
function MiniMap({ p }: { p: PlayerView }) {
  useEffect(() => { if (!mapData.value) send({ type: 'getMap' }); }, []);
  const color = p.tribe?.color ?? '#9a8f7e';
  const core = [...p.villages, ...p.mates.flatMap((m) => m.villages)];
  let x0 = Math.min(...core.map((v) => v.x)), x1 = Math.max(...core.map((v) => v.x)) + 1;
  let y0 = Math.min(...core.map((v) => v.y)), y1 = Math.max(...core.map((v) => v.y)) + 1;
  // 4 fields of margin, at least 16 high, and landscape (3.8 : 1, the panel's shape)
  x0 -= 4; x1 += 4; y0 -= 4; y1 += 4;
  const growTo = (a: number, b: number, size: number): [number, number] => (b - a >= size ? [a, b] : [a - (size - (b - a)) / 2, b + (size - (b - a)) / 2]);
  [y0, y1] = growTo(y0, y1, 16);
  [x0, x1] = growTo(x0, x1, (y1 - y0) * 3.8);
  [y0, y1] = growTo(y0, y1, (x1 - x0) / 3.8);
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
  const w = x1 - x0, h = y1 - y0;

  const his = new Set<string>(p.villages.map((v) => `${v.x}|${v.y}`));
  const mates = new Map<string, string>(p.mates.flatMap((m) => m.villages.map((v) => [`${v.x}|${v.y}`, m.name] as [string, string])));
  const all = (mapData.value?.villages ?? []).filter((v) => v.x >= x0 && v.x < x1 && v.y >= y0 && v.y < y1);
  const fill = (v: MapVillage) => {
    const k = `${v.x}|${v.y}`;
    if (his.has(k)) return '#e0b04a';
    if (mates.has(k)) return color;
    if (v.kind === 'own') return '#4f8fd6';
    return v.kind === 'barb' ? '#463f34' : '#8f7f60';
  };
  const order = (v: MapVillage) => (his.has(`${v.x}|${v.y}`) ? 3 : mates.has(`${v.x}|${v.y}`) ? 2 : v.kind === 'own' ? 1 : 0);
  const grid: preact.JSX.Element[] = [];
  for (let x = Math.ceil(x0 / 5) * 5; x < x1; x += 5) grid.push(<line key={`gx${x}`} x1={x} y1={y0} x2={x} y2={y1} />);
  for (let y = Math.ceil(y0 / 5) * 5; y < y1; y += 5) grid.push(<line key={`gy${y}`} x1={x0} y1={y} x2={x1} y2={y} />);

  return (
    <section class="panel">
      <h2>Kaart</h2>
      <svg class="mini-map" viewBox={`${x0} ${y0} ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
        <rect x={x0} y={y0} width={w} height={h} class="mini-map-bg" />
        <g class="mini-map-grid">{grid}</g>
        {[...all].sort((a, b) => order(a) - order(b)).map((v) => {
          const strong = order(v) >= 2;
          const size = strong ? 0.8 : 0.62;
          return (
            <rect
              key={v.id}
              x={v.x + (1 - size) / 2} y={v.y + (1 - size) / 2} width={size} height={size} rx={0.12}
              fill={fill(v)} stroke={his.has(`${v.x}|${v.y}`) ? '#1c1813' : 'none'} stroke-width={0.08}
              onClick={() => showOnMap({ x: v.x, y: v.y })}
            >
              <title>{v.name} ({v.x}|{v.y}) · {v.kind === 'barb' ? 'barbaren' : v.ownerName} · {num(v.points)} p</title>
            </rect>
          );
        })}
      </svg>
      <p class="hint">
        <span style={{ color: '#e0b04a' }}>■</span> {p.name}
        {p.mates.length > 0 && <> · <span style={{ color }}>■</span> stamgenoten ({p.mates.length})</>}
        {' '}· <span style={{ color: '#4f8fd6' }}>■</span> jij · <span style={{ color: '#8f7f60' }}>■</span> anderen · <span style={{ color: '#463f34' }}>■</span> barbaren
        {' '}· {w}×{h} velden ({x0}|{y0} – {x1 - 1}|{y1 - 1}). Klik een dorp voor de grote kaart.
      </p>
    </section>
  );
}
