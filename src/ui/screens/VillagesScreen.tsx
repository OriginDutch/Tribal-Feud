import { UNIT_IDS } from '../../shared/gameData';
import { UnitIcon } from '../units/UnitIcon';
import { formatGameTime } from '../../shared/time';
import { num } from '../format';
import { screen, send, snapshot } from '../store';
import { UNIT_SHORT } from '../units';

/** All own villages in one table (TW "Overzichten"). Clicking a name selects that village. */
export function VillagesScreen() {
  const s = snapshot.value;
  if (!s) return null;
  const used = UNIT_IDS.filter((u) => s.villages.some((v) => (v.units[u] ?? 0) > 0));
  const open = (id: number) => {
    send({ type: 'selectVillage', id });
    screen.value = 'overview';
  };

  return (
    <div class="screen">
      <h2>Dorpen ({s.villages.length})</h2>
      <section class="panel">
        <h3>Productie</h3>
        <table class="table fixed villages-table">
          <colgroup>
            <col />
            <col style={{ width: '65px' }} />
            <col style={{ width: '75px' }} />
            <col style={{ width: '75px' }} />
            <col style={{ width: '75px' }} />
            <col style={{ width: '75px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '55px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '50px' }} />
            <col style={{ width: '185px' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Dorp</th>
              <th class="right">Punten</th>
              <th class="right">Hout</th>
              <th class="right">Leem</th>
              <th class="right">IJzer</th>
              <th class="right">Opslag</th>
              <th class="right">Boerderij</th>
              <th class="right" title="Toestemming">Toest.</th>
              <th>Bouwt</th>
              <th class="right" title="Units in opleiding">Rekr.</th>
              <th>Beheer</th>
            </tr>
          </thead>
          <tbody>
            {s.villages.map((v) => (
              <tr key={v.id} class={v.id === s.village?.id ? 'current' : ''}>
                <td class="clip">
                  <button class="link" onClick={() => open(v.id)}>
                    {v.name} <span class="muted mono">({v.x}|{v.y})</span>
                  </button>
                </td>
                <td class="right mono">{num(v.points)}</td>
                {v.res.map((amount, i) => (
                  <td key={i} class={`right mono ${amount >= v.storage ? 'warn' : ''}`}>
                    {num(amount)}
                  </td>
                ))}
                <td class="right mono muted">{num(v.storage)}</td>
                <td class="right mono">
                  {num(v.pop.used)}/{num(v.pop.max)}
                </td>
                <td class={`right mono ${v.loyalty < 100 ? 'warn' : 'muted'}`}>{v.loyalty}</td>
                <td class="clip" title={v.building ? `${v.building.name} ${v.building.level} · klaar ${formatGameTime(v.building.end)}` : ''}>
                  {v.building ? (
                    <>
                      {v.building.name} {v.building.level}{' '}
                      <span class="muted mono">{formatGameTime(v.building.end)}</span>
                      {v.buildQueue > 1 && <span class="muted"> +{v.buildQueue - 1}</span>}
                    </>
                  ) : (
                    <span class="muted">—</span>
                  )}
                </td>
                <td class="right mono">{v.recruiting > 0 ? num(v.recruiting) : <span class="muted">—</span>}</td>
                <td class="clip">
                  <button
                    class="small"
                    disabled={v.maxMint === 0}
                    title={v.maxMint > 0 ? `Sla ${v.maxMint} munt(en) in dit dorp` : 'Geen adelshoeve of te weinig grondstoffen'}
                    onClick={() => send({ type: 'mintCoins', villageId: v.id, count: v.maxMint })}
                  >
                    +{v.maxMint} munt
                  </button>{' '}
                  <span class={v.manager ? '' : 'muted'} title={v.manager ?? 'Geen accountmanager'}>
                    {v.manager ?? 'handmatig'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section class="panel">
        <h3>Troepen thuis</h3>
        {used.length === 0 ? (
          <p class="muted">Geen troepen.</p>
        ) : (
          <table class="table">
            <thead>
              <tr>
                <th>Dorp</th>
                {used.map((u) => (
                  <th key={u} class="right" title={UNIT_SHORT[u]}>
                    <UnitIcon id={u} size={20} title={UNIT_SHORT[u]} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.villages.map((v) => (
                <tr key={v.id}>
                  <td>
                    {v.name} <span class="muted mono">({v.x}|{v.y})</span>
                  </td>
                  {used.map((u) => (
                    <td key={u} class="right mono">
                      {v.units[u] ? num(v.units[u] ?? 0) : <span class="muted">0</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
