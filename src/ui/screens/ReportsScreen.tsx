import { BARB_TYPE_NAMES } from '../../shared/barbarianTypes';
import { useEffect, useState } from 'preact/hooks';
import { BUILDING_IDS, UNIT_IDS, type UnitCounts } from '../../shared/gameData';
import { formatGameTime } from '../../shared/time';
import type { Report } from '../../sim/movement';
import { Cost } from '../components/Cost';
import { num } from '../format';
import { reports, send, snapshot } from '../store';
import { UNIT_SHORT } from '../units';

function UnitTable({ rows }: { rows: { label: string; units: UnitCounts }[] }) {
  const cols = UNIT_IDS.filter((u) => rows.some((r) => (r.units[u] ?? 0) > 0));
  if (cols.length === 0) return <p class="muted">Geen troepen.</p>;
  return (
    <table class="table compact units-table">
      <thead>
        <tr>
          <th />
          {cols.map((u) => (
            <th key={u} class="right">
              {UNIT_SHORT[u]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td class="muted">{r.label}</td>
            {cols.map((u) => (
              <td key={u} class={`right mono ${r.label === 'Verliezen' && (r.units[u] ?? 0) > 0 ? 'warn' : ''}`}>
                {num(r.units[u] ?? 0)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportDetail({ r }: { r: Report }) {
  const names = snapshot.value?.village?.buildings ?? [];
  const bname = (id: string) => names.find((b) => b.id === id)?.name ?? id;
  return (
    <div class="report-detail">
      <p class="muted">
        Geluk {r.luck >= 0 ? '+' : ''}
        {(r.luck * 100).toFixed(1)}% · moraal {Math.round(r.morale * 100)}%
      </p>
      <h4>
        Aanvaller: {r.attacker.name} ({r.attacker.x}|{r.attacker.y})
      </h4>
      <UnitTable
        rows={[
          { label: 'Aantal', units: r.attackerUnits.sent },
          { label: 'Verliezen', units: r.attackerUnits.lost },
        ]}
      />
      <h4>
        Verdediger: {r.defender.name} ({r.defender.x}|{r.defender.y}) · {r.defender.ownerName}
      </h4>
      {r.defenderUnits ? (
        <UnitTable
          rows={[
            { label: 'Aantal', units: r.defenderUnits.present },
            { label: 'Verliezen', units: r.defenderUnits.lost },
          ]}
        />
      ) : (
        <p class="muted">Geen van je troepen is teruggekomen om te vertellen wat er stond.</p>
      )}
      {r.loot && (
        <p>
          Buit: <Cost cost={r.loot} />{' '}
          <span class="muted">
            ({num(r.loot[0] + r.loot[1] + r.loot[2])} / {num(r.carry ?? 0)})
          </span>
        </p>
      )}
      {r.wall && (
        <p>
          {r.wall.before !== r.wall.after ? (
            <>
              Muur beschadigd: level {r.wall.before} → {r.wall.after}
            </>
          ) : (
            <>Muur: level {r.wall.after}</>
          )}
        </p>
      )}
      {r.building && (
        <p>
          {bname(r.building.id)} beschadigd: level {r.building.before} → {r.building.after}
        </p>
      )}
      {r.scouted && (
        <div>
          <h4>Verkend</h4>
          {r.scouted.barbType && <p>Type: {BARB_TYPE_NAMES[r.scouted.barbType]}</p>}
          <p>
            Grondstoffen: <Cost cost={r.scouted.res} />
          </p>
          <p class="muted">
            {BUILDING_IDS.filter((b) => r.scouted?.buildings[b])
              .map((b) => `${bname(b)} ${r.scouted?.buildings[b]}`)
              .join(' · ')}
          </p>
          <UnitTable rows={[{ label: 'In het dorp', units: r.scouted.units }]} />
        </div>
      )}
    </div>
  );
}

export function ReportsScreen() {
  const list = reports.value;
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    send({ type: 'getReports' });
  }, [snapshot.value?.unreadReports]);

  const toggle = (r: Report) => {
    setOpen(open === r.id ? null : r.id);
    if (!r.read) send({ type: 'markReportsRead', ids: [r.id] });
  };

  return (
    <div class="screen">
      <div class="row">
        <h2>Rapporten</h2>
        <button class="small" onClick={() => send({ type: 'markReportsRead', ids: 'all' })}>
          Alles gelezen
        </button>
      </div>
      <section class="panel">
        {list.length === 0 ? (
          <p class="muted">Nog geen rapporten.</p>
        ) : (
          <ul class="reports">
            {[...list].reverse().map((r) => (
              <li key={r.id} class={r.read ? '' : 'unread'}>
                <button class="report-head" onClick={() => toggle(r)}>
                  <span class={`dot ${r.result}`} />
                  <span>
                    {r.attacker.name} valt {r.defender.name} ({r.defender.x}|{r.defender.y}) aan
                  </span>
                  {r.loot && <span class="muted">buit {num(r.loot[0] + r.loot[1] + r.loot[2])}</span>}
                  <span class="mono muted">{formatGameTime(r.time)}</span>
                </button>
                {open === r.id && <ReportDetail r={r} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
