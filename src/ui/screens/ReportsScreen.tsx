import { PlayerLink } from '../components/PlayerLink';
import { BARB_TYPE_NAMES } from '../../shared/barbarianTypes';
import { MapLink } from '../components/MapLink';
import { useEffect, useState } from 'preact/hooks';
import { BUILDING_IDS, UNIT_IDS, type UnitCounts } from '../../shared/gameData';
import { formatGameTime } from '../../shared/time';
import type { Report } from '../../sim/movement';
import { num } from '../format';
import { attackVillage, reports, screen, send, simPrefill, snapshot } from '../store';
import { FLAG_NAMES, type FlagType } from '../../shared/flags';
import { UnitIcon } from '../units/UnitIcon';

const RES = [
  { name: 'Hout', key: 'wood' },
  { name: 'Leem', key: 'stone' },
  { name: 'IJzer', key: 'iron' },
] as const;

type Kind = 'attack' | 'defense' | 'scout';
type Filter = 'all' | Kind;

const scoutOnly = (r: Report) => {
  const sent = Object.entries(r.attackerUnits.sent).filter(([, n]) => (n ?? 0) > 0);
  return sent.length > 0 && sent.every(([u]) => u === 'spy');
};
const kindOf = (r: Report): Kind => (r.defense ? 'defense' : scoutOnly(r) ? 'scout' : 'attack');

/** Colour of a report: from your side, so a held defense is green. */
function tone(r: Report): 'win' | 'mid' | 'loss' | 'scout' {
  if (r.defense) return r.result === 'loss' ? 'win' : 'loss';
  if (scoutOnly(r)) return r.result === 'loss' ? 'loss' : 'scout';
  return r.result === 'win' ? 'win' : r.result === 'winLosses' ? 'mid' : 'loss';
}

function headline(r: Report): string {
  const target = `${r.defender.name} (${r.defender.x}|${r.defender.y})`;
  if (r.defense) return `${r.result === 'loss' ? 'Verdedigd' : 'Doorgebroken'} · ${r.attacker.ownerName} viel ${target} aan`;
  if (r.conquered) return `Veroverd · ${target}`;
  if (scoutOnly(r)) return `${r.result === 'loss' ? 'Verkenners verloren' : 'Verkend'} · ${target}`;
  return `${r.result === 'win' ? 'Gewonnen' : r.result === 'winLosses' ? 'Gewonnen met verliezen' : 'Verloren'} · ${target}`;
}

function listTitle(r: Report): string {
  const target = `${r.defender.name} (${r.defender.x}|${r.defender.y})`;
  if (r.defense) return `Verdediging: ${r.attacker.ownerName} valt ${r.defender.name} aan`;
  if (scoutOnly(r)) return `Verkenning van ${target}`;
  return `${r.attacker.name} valt ${target} aan`;
}

const total = (u: UnitCounts) => UNIT_IDS.reduce((a, id) => a + (u[id] ?? 0), 0);

function TrashIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
  );
}

function UnitTable({ rows }: { rows: { label: string; units: UnitCounts; losses?: boolean }[] }) {
  const cols = UNIT_IDS.filter((u) => rows.some((r) => (r.units[u] ?? 0) > 0));
  if (cols.length === 0) return <p class="muted">Geen troepen.</p>;
  return (
    <div class="table-scroll">
      <table class="table compact report-units">
        <thead>
          <tr>
            <th />
            {cols.map((u) => (
              <th key={u} class="center">
                <UnitIcon id={u} size={26} title={snapshot.value?.village?.units.find((x) => x.id === u)?.name ?? u} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td class="muted">{r.label}</td>
              {cols.map((u) => {
                const n = r.units[u] ?? 0;
                return (
                  <td key={u} class={`center mono ${n === 0 ? 'muted' : r.losses ? 'lost' : ''}`}>
                    {num(n)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResPills({ res }: { res: [number, number, number] }) {
  return (
    <>
      {RES.map((r, i) => (
        <span key={r.key} class="pill" title={r.name}>
          <span class={`res res-${r.key}`} />
          {num(res[i] ?? 0)}
        </span>
      ))}
    </>
  );
}

function ReportDetail({ r }: { r: Report }) {
  const s = snapshot.value;
  const names = s?.village?.buildings ?? [];
  const bname = (id: string) => names.find((b) => b.id === id)?.name ?? id;
  const t = tone(r);
  const sent = total(r.attackerUnits.sent);
  const lostPct = sent > 0 ? (total(r.attackerUnits.lost) / sent) * 100 : 0;
  const ownAttacker = !r.defense && (s?.villages ?? []).some((v) => v.id === r.attacker.id);
  const barbTarget = r.defender.ownerName === 'Barbaren';
  const lootSum = r.loot ? r.loot[0] + r.loot[1] + r.loot[2] : 0;
  const luck = r.luck * 100;

  return (
    <div class="report-card">
      <div class={`report-banner ${t}`}>
        <div>
          <div class="report-big">{headline(r)}</div>
          <div class="report-sub">
            {formatGameTime(r.time)}
            {sent > 0 && !r.defense && ` · aanvaller verliest ${lostPct.toFixed(lostPct < 10 ? 1 : 0).replace('.', ',')}%`}
          </div>
        </div>
      </div>

      {r.loot && (
        <div class="report-row">
          <ResPills res={r.loot} />
          <span class="muted">
            buit {num(lootSum)} / {num(r.carry ?? 0)} draagvermogen
          </span>
        </div>
      )}

      <div class="report-side">
        <h4>
          Aanvaller · {r.attacker.owner !== undefined ? <PlayerLink id={r.attacker.owner} name={r.attacker.ownerName} /> : r.attacker.ownerName} <span class="muted">· {r.attacker.name} ({r.attacker.x}|{r.attacker.y})</span>
          <MapLink x={r.attacker.x} y={r.attacker.y} />
        </h4>
        <UnitTable
          rows={[
            { label: 'Aantal', units: r.attackerUnits.sent },
            { label: 'Verlies', units: r.attackerUnits.lost, losses: true },
          ]}
        />
      </div>

      <div class="report-side">
        <h4>
          Verdediger · {r.defender.owner !== undefined ? <PlayerLink id={r.defender.owner} name={r.defender.ownerName} /> : r.defender.ownerName} <span class="muted">· {r.defender.name} ({r.defender.x}|{r.defender.y})</span>
          <MapLink x={r.defender.x} y={r.defender.y} />
        </h4>
        {r.defenderUnits ? (
          <UnitTable
            rows={[
              { label: 'Aantal', units: r.defenderUnits.present },
              { label: 'Verlies', units: r.defenderUnits.lost, losses: true },
            ]}
          />
        ) : (
          <p class="muted">Geen van je troepen is teruggekomen om te vertellen wat er stond.</p>
        )}
        {r.supportUnits && (
          <>
            <p class="muted">Jouw ondersteuning in dit dorp:</p>
            <UnitTable
              rows={[
                { label: 'Aantal', units: r.supportUnits.present },
                { label: 'Verlies', units: r.supportUnits.lost, losses: true },
              ]}
            />
          </>
        )}
      </div>

      {r.scouted && (
        <div class="report-side">
          <h4>Verkend</h4>
          <div class="report-row inner">
            {r.scouted.barbType && <span class="pill">Type: {BARB_TYPE_NAMES[r.scouted.barbType]}</span>}
            {r.scouted.flag && <span class="pill">Vlag: {FLAG_NAMES[r.scouted.flag.type as FlagType]} L{r.scouted.flag.level}</span>}
            {r.scouted.item && <span class="pill">Paladijn met {r.scouted.item}</span>}
            <ResPills res={r.scouted.res} />
          </div>
          <p class="muted">
            {BUILDING_IDS.filter((b) => r.scouted?.buildings[b])
              .map((b) => `${bname(b)} ${r.scouted?.buildings[b]}`)
              .join(' · ')}
          </p>
          <UnitTable rows={[{ label: 'In het dorp', units: r.scouted.units }, ...(r.scouted.away ? [{ label: 'Niet thuis (telescoop)', units: r.scouted.away }] : [])]} />
        </div>
      )}

      <div class="report-row">
        {r.wall && (
          <span class="pill">
            Muur {r.wall.before !== r.wall.after ? `${r.wall.before} → ${r.wall.after}` : r.wall.after}
          </span>
        )}
        {r.building && (
          <span class="pill">
            {bname(r.building.id)} {r.building.before} → {r.building.after}
          </span>
        )}
        {r.loyalty && (
          <span class="pill">
            Toestemming {r.loyalty.before} → {r.conquered ? <strong>veroverd!</strong> : r.loyalty.after}
          </span>
        )}
        <span class="pill" title="Geluk: tussen -25% en +25%">
          Geluk
          <span class="luck-bar">
            <b style={{ left: luck >= 0 ? '50%' : `${50 + luck * 2}%`, width: `${Math.abs(luck) * 2}%`, background: luck >= 0 ? 'var(--good, #7fa35a)' : 'var(--danger)' }} />
            <i />
          </span>
          {luck >= 0 ? '+' : ''}
          {luck.toFixed(1).replace('.', ',')}%
        </span>
        <span class="pill">Moraal {Math.round(r.morale * 100)}%</span>
      </div>
      {r.modifiers && (r.modifiers.attacker.length > 0 || r.modifiers.defender.length > 0) && (
        <div class="report-mods">
          {r.modifiers.attacker.length > 0 && (
            <div><span class="muted">Aanvaller:</span> {r.modifiers.attacker.map((t, i) => <span key={i} class="pill">{t}</span>)}</div>
          )}
          {r.modifiers.defender.length > 0 && (
            <div><span class="muted">Verdediger:</span> {r.modifiers.defender.map((t, i) => <span key={i} class="pill">{t}</span>)}</div>
          )}
        </div>
      )}

      <div class="report-foot">
        <span class="row">
          {r.defenderUnits && (
            <button
              class="small"
              title="Open dit gevecht in de simulator"
              onClick={() => {
                simPrefill.value = { attacker: r.attackerUnits.sent, defender: r.defenderUnits!.present, wall: r.wall?.before ?? 0, morale: r.morale, luck: r.luck };
                screen.value = 'simulator';
              }}
            >
              Simuleren
            </button>
          )}
          {ownAttacker && barbTarget && (
            <>
              <button class="small" onClick={() => send({ type: 'sendFarm', from: r.attacker.id, to: r.defender.id, template: 'A' })}>
                Farm A
              </button>
              <button class="small" onClick={() => send({ type: 'sendFarm', from: r.attacker.id, to: r.defender.id, template: 'B' })}>
                Farm B
              </button>
            </>
          )}
          {!r.defense && (
            <button class="small" onClick={() => attackVillage(r.defender.x, r.defender.y)}>
              Naar verzamelplaats
            </button>
          )}
        </span>
        <button class="small danger" onClick={() => send({ type: 'deleteReports', ids: [r.id] })}>
          <TrashIcon size={13} /> Verwijderen
        </button>
      </div>
    </div>
  );
}

export function ReportsScreen() {
  const list = reports.value;
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [picked, setPicked] = useState<Set<number>>(new Set());

  useEffect(() => {
    send({ type: 'getReports' });
  }, [snapshot.value?.unreadReports]);

  const shown = [...list].reverse().filter((r) => filter === 'all' || kindOf(r) === filter);
  const pickedShown = shown.filter((r) => picked.has(r.id));
  const allPicked = shown.length > 0 && pickedShown.length === shown.length;

  const toggle = (r: Report) => {
    setOpen(open === r.id ? null : r.id);
    if (!r.read) send({ type: 'markReportsRead', ids: [r.id] });
  };
  const pick = (id: number, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };
  const remove = (ids: number[] | 'read') => {
    send({ type: 'deleteReports', ids });
    setPicked(new Set());
    if (ids !== 'read' && open !== null && ids.includes(open)) setOpen(null);
  };
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Alles' },
    { id: 'attack', label: 'Aanvallen' },
    { id: 'defense', label: 'Verdediging' },
    { id: 'scout', label: 'Verkenning' },
  ];

  return (
    <div class="screen">
      <div class="row">
        <h2 style={{ margin: 0, flex: 1 }}>Rapporten</h2>
        <button class="small" onClick={() => send({ type: 'markReportsRead', ids: 'all' })}>
          Alles gelezen
        </button>
      </div>
      <section class="panel">
        <div class="row report-tools">
          {filters.map((f) => (
            <button key={f.id} class={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <div class="row report-tools">
          <label class="inline-check">
            <input type="checkbox" checked={allPicked} onChange={(e) => setPicked(e.currentTarget.checked ? new Set(shown.map((r) => r.id)) : new Set())} /> alles
          </label>
          <button class="small danger" disabled={pickedShown.length === 0} onClick={() => remove(pickedShown.map((r) => r.id))}>
            <TrashIcon size={13} /> Verwijder geselecteerde{pickedShown.length > 0 ? ` (${pickedShown.length})` : ''}
          </button>
          <button class="small" disabled={!list.some((r) => r.read)} onClick={() => remove('read')}>
            Verwijder gelezen
          </button>
        </div>
        {shown.length === 0 ? (
          <p class="muted">{list.length === 0 ? 'Nog geen rapporten.' : 'Geen rapporten in deze categorie.'}</p>
        ) : (
          <ul class="reports">
            {shown.map((r) => (
              <li key={r.id} class={r.read ? '' : 'unread'}>
                <div class="report-line">
                  <input type="checkbox" aria-label="Selecteren" checked={picked.has(r.id)} onChange={(e) => pick(r.id, e.currentTarget.checked)} />
                  <button class="report-head" onClick={() => toggle(r)}>
                    <span class={`dot ${tone(r)}`} />
                    <span class="report-title">
                      {listTitle(r)}
                      {r.conquered && <strong class="warn"> · veroverd</strong>}
                    </span>
                    {r.loot && <span class="muted mono">buit {num(r.loot[0] + r.loot[1] + r.loot[2])}</span>}
                    <span class="mono muted">{formatGameTime(r.time)}</span>
                  </button>
                  <button class="link trash" title="Verwijderen" aria-label="Rapport verwijderen" onClick={() => remove([r.id])}>
                    <TrashIcon />
                  </button>
                </div>
                {open === r.id && <ReportDetail r={r} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
