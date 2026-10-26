import { useState } from 'preact/hooks';
import type { IncomingView } from '../../shared/protocol';
import { formatGameTime } from '../../shared/time';
import { duration } from '../format';
import { openSupport, snapshot } from '../store';
import { UnitIcon } from '../units/UnitIcon';
import { MapLink } from './MapLink';
import { PlayerLink } from './PlayerLink';

/** What the walking time says, in the words TW players use. */
const PACE: Record<IncomingView['pace'], { unit: 'snob' | 'ram' | 'sword' | 'axe' | 'heavy' | 'light' | 'spy'; label: string; danger: number }> = {
  noble: { unit: 'snob', label: 'Edel-tempo', danger: 3 },
  siege: { unit: 'ram', label: 'Ram-tempo', danger: 3 },
  sword: { unit: 'sword', label: 'Zwaard-tempo', danger: 2 },
  infantry: { unit: 'axe', label: 'Bijl-tempo', danger: 2 },
  heavy: { unit: 'heavy', label: 'ZC-tempo', danger: 1 },
  cav: { unit: 'light', label: 'LC-tempo', danger: 1 },
  scout: { unit: 'spy', label: 'Verkenner', danger: 0 },
};

function Pace({ m }: { m: IncomingView }) {
  const p = PACE[m.pace];
  return (
    <span class={`pace pace-${p.danger}`} title="De langzaamste eenheid die bij deze looptijd past. Sneller kan, langzamer niet.">
      <UnitIcon id={p.unit} size={16} /> {p.label}
    </span>
  );
}

/** Attacks coming at your villages: who, from where, how far, what pace; per attacker if you like. */
export function IncomingPanel() {
  const s = snapshot.value;
  const [grouped, setGrouped] = useState(true);
  if (!s || s.incoming.length === 0) return null;

  const groups = new Map<number, IncomingView[]>();
  for (const m of s.incoming) groups.set(m.from.id, [...(groups.get(m.from.id) ?? []), m]);
  const order = [...groups.values()].sort((a, b) => a[0]!.arrives - b[0]!.arrives);

  const row = (m: IncomingView, withFrom: boolean) => (
    <tr key={m.id}>
      <td>
        {m.to.name} <span class="muted">({m.to.x}|{m.to.y})</span>
      </td>
      {withFrom && (
        <td>
          {m.from.name} <span class="muted">({m.from.x}|{m.from.y})</span>
          <MapLink x={m.from.x} y={m.from.y} />
        </td>
      )}
      {withFrom && (
        <td>
          <PlayerLink id={m.from.owner} name={m.from.ownerName} />
        </td>
      )}
      <td class="right mono">{m.distance}</td>
      <td>
        <Pace m={m} />
      </td>
      <td class="mono muted">{formatGameTime(m.arrives)}</td>
      <td class="right mono">{duration(m.arrives - s.time)}</td>
      <td class="right">
        <button class="small" onClick={() => openSupport(m.to.id, m.arrives)}>
          Verdediging
        </button>
      </td>
    </tr>
  );

  return (
    <section class="panel incoming">
      <div class="row">
        <h3 style={{ flex: 1 }}>⚔ Inkomende aanvallen ({s.incoming.length})</h3>
        <label class="inline-check">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.currentTarget.checked)} /> per aanvallend dorp
        </label>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Doel</th>
            {!grouped && <th>Van</th>}
            {!grouped && <th>Speler</th>}
            <th class="right">Afstand</th>
            <th>Tempo</th>
            <th>Aankomst</th>
            <th class="right">Nog</th>
            <th />
          </tr>
        </thead>
        {grouped ? (
          order.map((list) => {
            const f = list[0]!.from;
            return (
              <tbody key={f.id} class="incoming-group">
                <tr class="group-head">
                  <td colSpan={6}>
                    <strong>{f.name}</strong> <span class="muted">({f.x}|{f.y})</span>
                    <MapLink x={f.x} y={f.y} /> · <PlayerLink id={f.owner} name={f.ownerName} /> ·{' '}
                    <span class="muted">
                      {list.length} {list.length === 1 ? 'aanval' : 'aanvallen'}
                    </span>
                  </td>
                </tr>
                {list.map((m) => row(m, false))}
              </tbody>
            );
          })
        ) : (
          <tbody>{s.incoming.map((m) => row(m, true))}</tbody>
        )}
      </table>
    </section>
  );
}
