import { useEffect } from 'preact/hooks';
import { formatGameTime } from '../../shared/time';
import type { WorldStatsView } from '../../shared/protocol';
import { num } from '../format';
import { PlayerLink } from '../components/PlayerLink';
import { send, worldStats } from '../store';
import { tr } from '../../shared/i18n';

/** Players red, barbarians blue (validated as a pair on the dark surface). */
const PVP = '#e5533f';
const BARB = '#4f8fd6';
const W = 1100, H = 230, PAD = { l: 64, r: 12, t: 12, b: 26 };

function niceMax(x: number): number {
  if (x <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  return Math.ceil(x / p / (x / p > 5 ? 2 : 1)) * p * (x / p > 5 ? 2 : 1);
}

/** Stacked bars per day: players (bottom) and barbarians (top). */
function StackedDays({ rows, label }: { rows: { day: number; pvp: number; barb: number }[]; label: string }) {
  const max = niceMax(Math.max(1, ...rows.map((r) => r.pvp + r.barb)));
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const bw = Math.max(4, Math.min(40, iw / Math.max(1, rows.length) - 4));
  const x = (i: number) => PAD.l + (iw / Math.max(1, rows.length)) * (i + 0.5) - bw / 2;
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="stats-chart" role="img" aria-label={label}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} class="grid" />
          <text x={PAD.l - 6} y={y(max * f) + 4} class="axis" text-anchor="end">{num(Math.round(max * f))}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const yp = y(r.pvp), yb = y(r.pvp + r.barb);
        return (
          <g key={r.day} class="bar">
            <title>{tr('Dag {day}: {pvp} op spelers, {barb} op barbaren', { day: r.day + 1, pvp: num(r.pvp), barb: num(r.barb) })}</title>
            <rect x={x(i) - 2} y={PAD.t} width={bw + 4} height={ih} fill="transparent" />
            {r.pvp > 0 && <rect x={x(i)} y={yp} width={bw} height={Math.max(1, y(0) - yp)} rx={2} fill={PVP} />}
            {r.barb > 0 && <rect x={x(i)} y={yb} width={bw} height={Math.max(1, yp - yb - (r.pvp > 0 ? 2 : 0))} rx={2} fill={BARB} />}
            {(rows.length <= 14 || i % Math.ceil(rows.length / 14) === 0) && (
              <text x={x(i) + bw / 2} y={H - 6} class="axis" text-anchor="middle">{r.day + 1}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Villages per tribe over the days (tribe colours follow the tribe). */
function TribeLines({ tribes, days }: { tribes: WorldStatsView['tribes']; days: number[] }) {
  const n = Math.max(1, days.length);
  const max = niceMax(Math.max(1, ...tribes.flatMap((t) => t.series.map((v) => v ?? 0))));
  const iw = W - PAD.l - PAD.r - 60, ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (n === 1 ? iw / 2 : (iw / (n - 1)) * i);
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  // end labels: keep them at least 14 apart so they don't overlap
  const labelY = new Map<number, number>();
  const ends = tribes.map((t) => { const v = [...t.series].reverse().find((x) => x !== null); return { id: t.id, y: v == null ? null : y(v) }; })
    .filter((e): e is { id: number; y: number } => e.y !== null).sort((a, b) => a.y - b.y);
  let prev = -Infinity;
  for (const e of ends) { const yy = Math.max(e.y, prev + 14); labelY.set(e.id, yy); prev = yy; }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="stats-chart" role="img" aria-label={tr('Dorpen per stam per dag')}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PAD.l} x2={PAD.l + iw} y1={y(max * f)} y2={y(max * f)} class="grid" />
          <text x={PAD.l - 6} y={y(max * f) + 4} class="axis" text-anchor="end">{num(Math.round(max * f))}</text>
        </g>
      ))}
      {days.map((d, i) => (n <= 14 || i % Math.ceil(n / 14) === 0) && <text key={d} x={x(i)} y={H - 6} class="axis" text-anchor="middle">{d + 1}</text>)}
      {tribes.map((t) => {
        const pts = t.series.map((v, i) => (v === null ? null : [x(i), y(v)] as const)).filter((p): p is readonly [number, number] => p !== null);
        if (!pts.length) return null;
        const last = [pts.at(-1)![0], labelY.get(t.id) ?? pts.at(-1)![1]] as const;
        return (
          <g key={t.id}>
            <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={t.color} stroke-width={t.you ? 3 : 2} stroke-linejoin="round" />
            {pts.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={4} fill={t.color} stroke="var(--panel, #211c17)" stroke-width={2}>
                <title>{`[${t.tag}] ${tr('{n} dorpen', { n: num(t.series.filter((v) => v !== null)[i] ?? 0) })}`}</title>
              </circle>
            ))}
            <text x={last[0] + 8} y={last[1] + 4} class="axis label">[{t.tag}]</text>
          </g>
        );
      })}
    </svg>
  );
}

function Legend() {
  return (
    <div class="stats-legend">
      <span><i style={{ background: PVP }} /> {tr('op spelers')}</span>
      <span><i style={{ background: BARB }} /> {tr('op barbaren')}</span>
    </div>
  );
}

/** World statistics: who attacks whom, who takes villages, how the tribes grow. */
export function StatsScreen() {
  useEffect(() => {
    send({ type: 'getWorldStats' });
    const t = window.setInterval(() => send({ type: 'getWorldStats' }), 5000);
    return () => window.clearInterval(t);
  }, []);
  const st = worldStats.value;
  if (!st) return <div class="screen"><p class="muted">{tr('Laden…')}</p></div>;
  const tot = st.totals;
  const today = st.days.at(-1);
  const pvpShare = today && today.attacksPvp + today.attacksBarb > 0 ? Math.round((today.attacksPvp / (today.attacksPvp + today.attacksBarb)) * 100) : 0;
  return (
    <div class="screen">
      <h2>{tr('Wereldstatistiek')}</h2>
      <section class="panel player-stats">
        <div><span class="muted">{tr('Overnames van spelers')}</span><strong>{num(tot.conquestsPvp)}</strong></div>
        <div><span class="muted">{tr('Van barbaren')}</span><strong>{num(tot.conquestsBarb)}</strong></div>
        <div><span class="muted">{tr('Stammen · oorlogen')}</span><strong>{tot.tribes} · {tot.wars}</strong></div>
        <div><span class="muted">{tr('Bots zonder stam')}</span><strong>{tot.solo} / {tot.bots}</strong></div>
        <div><span class="muted">{tr('Vandaag op spelers')}</span><strong>{pvpShare}%</strong></div>
      </section>
      {!st.days.length ? (
        <section class="panel"><p class="muted">{tr('Nog geen gegevens. De statistiek telt vanaf nu mee (oude saves hebben geen geschiedenis).')}</p></section>
      ) : (
        <>
          <section class="panel">
            <div class="row"><h3 style={{ margin: 0, flex: 1 }}>{tr('Aanvallen per speldag')}</h3><Legend /></div>
            <StackedDays label={tr('Aanvallen per speldag')} rows={st.days.map((d) => ({ day: d.day, pvp: d.attacksPvp, barb: d.attacksBarb }))} />
          </section>
          <section class="panel">
            <div class="row"><h3 style={{ margin: 0, flex: 1 }}>{tr('Overnames per speldag')}</h3><Legend /></div>
            <StackedDays label={tr('Overnames per speldag')} rows={st.days.map((d) => ({ day: d.day, pvp: d.conquestsPvp, barb: d.conquestsBarb }))} />
          </section>
          {st.tribes.length > 0 && (
            <section class="panel">
              <h3>{tr('Dorpen per stam')}</h3>
              <TribeLines tribes={st.tribes} days={st.days.map((d) => d.day)} />
            </section>
          )}
        </>
      )}
      <div class="stats-tables">
        <section class="panel">
          <h3>{tr('Meeste aanvallen op spelers')}</h3>
          <PlayersTable rows={st.topAttackers} />
        </section>
        <section class="panel">
          <h3>{tr('Meeste dorpen van spelers veroverd')}</h3>
          <PlayersTable rows={st.topConquerors} />
        </section>
      </div>
      <section class="panel">
        <h3>{tr('Laatste overnames tussen spelers')}</h3>
        {!st.recent.length ? <p class="muted">{tr('Nog geen.')}</p> : (
          <table class="table compact">
            <tbody>
              {st.recent.map((c, i) => (
                <tr key={i}>
                  <td class="mono muted">{formatGameTime(c.time)}</td>
                  <td>{c.name}</td>
                  <td><PlayerLink id={c.to} name={c.toName} /> <span class="muted">{tr('nam het van')}</span> <PlayerLink id={c.from} name={c.fromName} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p class="hint">
          {tr('Jij: {pvp} aanvallen op spelers, {barb} op barbaren, {took} dorpen van spelers en {tookBarb} van barbaren veroverd, {lost} verloren.', { pvp: num(st.you.pvp), barb: num(st.you.barb), took: st.you.took, tookBarb: st.you.tookBarb, lost: st.you.lost })}
        </p>
      </section>
    </div>
  );
}

function PlayersTable({ rows }: { rows: WorldStatsView['topAttackers'] }) {
  if (!rows.length) return <p class="muted">{tr('Nog niemand.')}</p>;
  return (
    <table class="table compact">
      <thead><tr><th>{tr('Speler')}</th><th class="right">{tr('Op spelers')}</th><th class="right">{tr('Op barb')}</th><th class="right">{tr('Veroverd')}</th><th class="right">{tr('Verloren')}</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td class="ellipsis"><PlayerLink id={r.id} name={r.name} />{r.tag && <span class="muted"> [{r.tag}]</span>}</td>
            <td class="right mono">{num(r.pvp)}</td>
            <td class="right mono">{num(r.barb)}</td>
            <td class="right mono">{r.took}</td>
            <td class="right mono">{r.lost}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
