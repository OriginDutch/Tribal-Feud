import { useState } from 'preact/hooks';
import type { UnitCounts, UnitId } from '../../shared/gameData';
import { num } from '../format';
import { send } from '../store';
import { UNIT_SHORT } from '../units';
import { UnitIcon } from '../units/UnitIcon';
import { Confirm } from './Confirm';
import { tr } from '../../shared/i18n';

/** Send troops home for good (wrong ones built): only troops at home, nothing back. */
export function DismissTroops({ villageId, units }: { villageId: number; units: { id: UnitId; home: number }[] }) {
  const [counts, setCounts] = useState<Partial<Record<UnitId, string>>>({});
  const here = units.filter((u) => u.home > 0);
  const chosen: UnitCounts = {};
  let total = 0;
  for (const u of here) {
    const n = Math.min(u.home, Math.max(0, Math.floor(Number(counts[u.id] ?? 0))));
    if (n > 0) { chosen[u.id] = n; total += n; }
  }
  return (
    <details class="panel dismiss">
      <summary>{tr('Troepen weggooien')}</summary>
      {!here.length ? (
        <p class="muted">{tr('Er staan geen troepen thuis.')}</p>
      ) : (
        <>
          <p class="hint">{tr('Voor als je de verkeerde troepen hebt gebouwd. Ze verdwijnen voorgoed: je krijgt geen grondstoffen terug. Alleen troepen die thuis staan.')}</p>
          <div class="template-units">
            {here.map((u) => (
              <label key={u.id}>
                <span class="unit-name">
                  <UnitIcon id={u.id} size={18} /> {tr(UNIT_SHORT[u.id])}
                </span>
                <input type="number" min={0} max={u.home} placeholder="0" value={counts[u.id] ?? ''} onInput={(e) => setCounts({ ...counts, [u.id]: e.currentTarget.value })} />
                <button class="link avail" onClick={() => setCounts({ ...counts, [u.id]: String(u.home) })}>
                  {num(u.home)}
                </button>
              </label>
            ))}
          </div>
          <div class="row">
            <Confirm
              label={total ? tr('{n} weggooien', { n: num(total) }) : tr('Weggooien')}
              sure={tr('{n} troepen weg, zonder terugbetaling?', { n: num(total) })}
              cls="warn"
              disabled={!total}
              onConfirm={() => { send({ type: 'dismissUnits', villageId, units: chosen }); setCounts({}); }}
            />
          </div>
        </>
      )}
    </details>
  );
}
