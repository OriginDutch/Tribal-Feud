import { useEffect, useState } from 'preact/hooks';
import { CATAPULT_TARGETS, UNIT_IDS, type BuildingId, type UnitCounts, type UnitId } from '../../shared/gameData';
import { formatGameTime } from '../../shared/time';
import { duration, num } from '../format';
import { mapData, placeTarget, send, snapshot } from '../store';
import { distance, travelMs, unitsText } from '../units';

export function PlaceScreen() {
  const s = snapshot.value;
  const v = s?.village;
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [counts, setCounts] = useState<Partial<Record<UnitId, string>>>({});
  const [catTarget, setCatTarget] = useState<BuildingId>('main');

  // villages by coordinate, to resolve the target
  useEffect(() => {
    if (!mapData.value) send({ type: 'getMap' });
  }, []);

  // a target picked on the map
  useEffect(() => {
    const t = placeTarget.value;
    if (t) {
      setX(String(t.x));
      setY(String(t.y));
      placeTarget.value = null;
    }
  }, [placeTarget.value]);

  if (!s || !v) return null;
  const place = v.buildings.find((b) => b.id === 'place');
  const target = mapData.value?.villages.find((m) => m.x === Number(x) && m.y === Number(y));
  const units = v.units.filter((u) => u.enabled && u.id !== 'snob');

  const chosen: UnitCounts = {};
  for (const u of UNIT_IDS) {
    const n = Math.floor(Number(counts[u] ?? 0));
    if (n > 0) chosen[u] = n;
  }
  const dist = target ? distance(v, target) : 0;
  const hasUnits = Object.keys(chosen).length > 0;
  const eta = target && hasUnits ? travelMs(chosen, v.units, dist, s.marchFactor) : 0;

  const attack = () => {
    if (!target) return;
    send({
      type: 'sendAttack',
      from: v.id,
      to: target.id,
      units: chosen,
      ...((chosen.catapult ?? 0) > 0 ? { catapultTarget: catTarget } : {}),
    });
    setCounts({});
  };

  return (
    <div class="screen">
      <h2>Verzamelplaats</h2>
      {place && place.level === 0 ? (
        <section class="panel">
          <p class="muted">Je hebt een verzamelplaats nodig om troepen te sturen. Bouw hem in het hoofdgebouw.</p>
        </section>
      ) : (
        <section class="panel">
          <h3>Troepen sturen</h3>
          <div class="send-grid">
            {units.map((u) => (
              <label key={u.id} class="send-unit">
                <span>
                  {u.name}{' '}
                  <button class="link" onClick={() => setCounts({ ...counts, [u.id]: String(u.home) })}>
                    ({num(u.home)})
                  </button>
                </span>
                <input
                  type="number"
                  min={0}
                  max={u.home}
                  value={counts[u.id] ?? ''}
                  placeholder="0"
                  onInput={(e) => setCounts({ ...counts, [u.id]: e.currentTarget.value })}
                />
              </label>
            ))}
          </div>
          <div class="row">
            <label class="coord">
              Doel x
              <input type="number" value={x} onInput={(e) => setX(e.currentTarget.value)} />
            </label>
            <label class="coord">
              y
              <input type="number" value={y} onInput={(e) => setY(e.currentTarget.value)} />
            </label>
            {(chosen.catapult ?? 0) > 0 && (
              <label>
                Katapulten op
                <select value={catTarget} onChange={(e) => setCatTarget(e.currentTarget.value as BuildingId)}>
                  {CATAPULT_TARGETS.map((b) => (
                    <option key={b} value={b}>
                      {v.buildings.find((x) => x.id === b)?.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button class="primary" disabled={!target || !hasUnits || target.id === v.id} onClick={attack}>
              Aanvallen
            </button>
          </div>
          <p class="muted">
            {x && y && !target && 'Geen dorp op deze coördinaten.'}
            {target &&
              `${target.name} van ${target.ownerName} · ${num(target.points)} punten · ${dist.toFixed(1)} velden${
                hasUnits ? ` · aankomst over ${duration(eta)} (${formatGameTime(s.time + eta)})` : ''
              }`}
          </p>
        </section>
      )}

      <section class="panel">
        <h3>Onderweg</h3>
        {s.movements.length === 0 ? (
          <p class="muted">Geen troepen onderweg.</p>
        ) : (
          <table class="table">
            <thead>
              <tr>
                <th>Opdracht</th>
                <th>Troepen</th>
                <th>Aankomst</th>
                <th class="right">Nog</th>
              </tr>
            </thead>
            <tbody>
              {s.movements.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.kind === 'attack' ? (
                      <>
                        <span class="tag-attack">Aanval</span> op {m.to.name} ({m.to.x}|{m.to.y})
                      </>
                    ) : (
                      <>
                        <span class="tag-return">Terug</span> van {m.from.name} ({m.from.x}|{m.from.y})
                        {m.loot && <span class="muted"> · buit {num(m.loot[0] + m.loot[1] + m.loot[2])}</span>}
                      </>
                    )}
                  </td>
                  <td class="muted">{unitsText(m.units)}</td>
                  <td class="mono muted">{formatGameTime(m.arrives)}</td>
                  <td class="right mono">{duration(m.arrives - s.time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
