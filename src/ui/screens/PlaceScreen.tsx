import { useEffect, useState } from 'preact/hooks';
import { UnitIcon } from '../units/UnitIcon';
import { BuildingHeader } from '../buildings/BuildingHeader';
import { CATAPULT_TARGETS, UNIT_IDS, type BuildingId, type UnitCounts, type UnitId } from '../../shared/gameData';
import { formatGameTime } from '../../shared/time';
import { duration, num } from '../format';
import { openSupport, mapData, placeTarget, send, snapshot } from '../store';
import { distance, travelMs, unitsText } from '../units';
import { CancelButton } from '../components/CancelButton';
import { DismissTroops } from '../components/DismissTroops';

/** Units offered as escort for noblemen 2..N, best attack first. */
const ESCORT_UNITS: UnitId[] = ['axe', 'light', 'marcher', 'heavy', 'sword', 'spear'];
/** Attack per suggested escort: enough to break a barbarian wall of 15. */
const TRAIN_ESCORT_ATTACK = 2000;

export function PlaceScreen() {
  const s = snapshot.value;
  const v = s?.village;
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [counts, setCounts] = useState<Partial<Record<UnitId, string>>>({});
  const [catTarget, setCatTarget] = useState<BuildingId>('main');
  // noble train: escorts for noblemen 2..N (the first one goes with the army above)
  const [trainSize, setTrainSize] = useState(0);
  const [escorts, setEscorts] = useState<Partial<Record<UnitId, string>>[]>([]);

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
  const units = v.units.filter((u) => u.enabled);

  const chosen: UnitCounts = {};
  for (const u of UNIT_IDS) {
    const n = Math.floor(Number(counts[u] ?? 0));
    if (n > 0) chosen[u] = n;
  }
  const dist = target ? distance(v, target) : 0;
  const hasUnits = Object.keys(chosen).length > 0;
  const eta = target && hasUnits ? travelMs(chosen, v.units, dist, s.marchFactor) : 0;

  // --- noble train ---------------------------------------------------------------------
  const homeOf = (u: UnitId) => v.units.find((x) => x.id === u)?.home ?? 0;
  const attackOf = (u: UnitId) => v.units.find((x) => x.id === u)?.stats.attack ?? 0;
  /** Suggested escort per extra nobleman: enough attack to break a wall (like the bots), from what is left. */
  const suggest = (size: number): Partial<Record<UnitId, string>>[] => {
    const left: Partial<Record<UnitId, number>> = {};
    for (const u of ESCORT_UNITS) left[u] = Math.max(0, homeOf(u) - (chosen[u] ?? 0));
    const out: Partial<Record<UnitId, string>>[] = [];
    for (let i = 1; i < size; i++) {
      const e: Partial<Record<UnitId, string>> = {};
      let need = TRAIN_ESCORT_ATTACK;
      for (const u of ESCORT_UNITS) {
        const a = attackOf(u);
        if (need <= 0 || a <= 0) continue;
        const n = Math.min(left[u] ?? 0, Math.ceil(need / a));
        if (n > 0) {
          e[u] = String(n);
          left[u] = (left[u] ?? 0) - n;
          need -= n * a;
        }
      }
      out.push(e);
    }
    return out;
  };
  const startTrain = (size: number) => {
    setTrainSize(size);
    setEscorts(size > 1 ? suggest(size) : []);
  };
  const escortCounts: UnitCounts[] = escorts.map((e) => {
    const c: UnitCounts = {};
    for (const u of UNIT_IDS) {
      const n = Math.floor(Number(e[u] ?? 0));
      if (n > 0 && u !== 'snob') c[u] = n;
    }
    return c;
  });
  const first: UnitCounts = { ...chosen };
  delete first.snob;
  const trainBlocker = (() => {
    if (trainSize < 2) return null;
    if (!target || target.kind === 'own') return 'Kies een doel';
    if (homeOf('snob') < trainSize) return `${trainSize} edels nodig, ${homeOf('snob')} thuis`;
    if (dist > v.nobles.maxDistance) return `Verder dan ${v.nobles.maxDistance} velden`;
    const total: UnitCounts = { ...first };
    for (const e of escortCounts) for (const u of UNIT_IDS) if (e[u]) total[u] = (total[u] ?? 0) + (e[u] ?? 0);
    for (const u of UNIT_IDS) if ((total[u] ?? 0) > homeOf(u)) return `Te weinig ${v.units.find((x) => x.id === u)?.name.toLowerCase()}`;
    return null;
  })();
  const sendTrain = () => {
    if (!target || trainBlocker) return;
    send({
      type: 'sendNobleTrain',
      from: v.id,
      to: target.id,
      first,
      escorts: escortCounts,
      ...((first.catapult ?? 0) > 0 ? { catapultTarget: catTarget } : {}),
    });
    setCounts({});
    setTrainSize(0);
    setEscorts([]);
  };
  const trainEta = target ? travelMs({ ...first, snob: 1 }, v.units, dist, s.marchFactor) : 0;

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

  const support = () => {
    if (!target) return;
    send({ type: 'sendSupport', from: v.id, to: target.id, units: chosen });
    setCounts({});
  };
  const ownTarget = target?.kind === 'own';

  return (
    <div class="screen narrow">
      <h2>Verzamelplaats</h2>
      <BuildingHeader village={v} id="place" />
      {place && place.level === 0 ? (
        <section class="panel">
          <p class="muted">Je hebt een verzamelplaats nodig om troepen te sturen. Bouw hem in het hoofdgebouw.</p>
        </section>
      ) : (
        <section class="panel">
          <h3>Troepen sturen</h3>
          <div class="send-actions">
            <button class="small" onClick={() => setCounts(Object.fromEntries(units.filter((u) => u.home > 0).map((u) => [u.id, String(u.home)])))}>
              Alles selecteren
            </button>
            <button class="small" onClick={() => setCounts({})}>
              Leegmaken
            </button>
          </div>
          <div class="send-grid">
            {units.map((u) => (
              <label key={u.id} class="send-unit">
                <span class="unit-name">
                  <UnitIcon id={u.id} size={20} /> <span class="nm" title={u.name}>{u.name}</span>
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
            <button class="primary" disabled={!target || !hasUnits || target.id === v.id || ownTarget} onClick={attack}>
              Aanvallen
            </button>
            <button disabled={!target || !hasUnits || target.id === v.id || target.kind === 'barb'} onClick={support}>
              Ondersteunen
            </button>
          </div>
          <div class="row">
            <button class="small" onClick={() => openSupport(v.id)}>
              Support naar dit dorp plannen
            </button>
          </div>
          <div class="row">
            <label class="inline">
              Edeltrein
              <select value={String(trainSize)} onChange={(e) => startTrain(Number(e.currentTarget.value))}>
                <option value="0">uit</option>
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={String(n)}>
                    {n} edels
                  </option>
                ))}
              </select>
            </label>
            {trainSize > 1 && (
              <>
                <button class="small" onClick={() => setEscorts(suggest(trainSize))}>
                  Escort opnieuw voorstellen
                </button>
                <button class="primary" disabled={trainBlocker !== null} title={trainBlocker ?? ''} onClick={sendTrain}>
                  {trainBlocker ?? `Edeltrein sturen (${trainSize})`}
                </button>
              </>
            )}
          </div>
          {trainSize > 1 && (
            <table class="table compact">
              <thead>
                <tr>
                  <th />
                  {ESCORT_UNITS.map((u) => (
                    <th key={u} class="right">
                      {v.units.find((x) => x.id === u)?.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Edel 1</td>
                  <td colSpan={ESCORT_UNITS.length} class="muted">
                    met de troepen hierboven{hasUnits ? `: ${unitsText(first)}` : ' (nog niets ingevuld)'}
                  </td>
                </tr>
                {escorts.map((e, i) => (
                  <tr key={i}>
                    <td>Edel {i + 2}</td>
                    {ESCORT_UNITS.map((u) => (
                      <td key={u} class="right">
                        <input
                          type="number"
                          min={0}
                          style={{ width: '80px' }}
                          placeholder="0"
                          value={e[u] ?? ''}
                          onInput={(ev) => {
                            const next = [...escorts];
                            next[i] = { ...e, [u]: ev.currentTarget.value };
                            setEscorts(next);
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {trainSize > 1 && (
            <p class="hint">
              Alles vertrekt tegelijk op edelsnelheid en komt in deze volgorde aan
              {target ? `, over ${duration(trainEta)} (${formatGameTime(s.time + trainEta)})` : ''}. De voorgestelde escort is genoeg om
              een muur van een barbarendorp te breken; pas hem aan als je meer of minder wilt sturen.
            </p>
          )}
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
                <th />
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
                    ) : m.kind === 'support' ? (
                      <>
                        <span class="tag-support">Steun</span> naar {m.to.name} ({m.to.x}|{m.to.y})
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
                  <td class="right">
                    <CancelButton until={m.cancelUntil} now={s.time} id={m.id} train={m.train} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section class="panel">
        <h3>Ondersteuning in dit dorp</h3>
        {v.supportHere.length === 0 ? (
          <p class="muted">Geen troepen van andere dorpen.</p>
        ) : (
          <table class="table">
            <tbody>
              {v.supportHere.map((x) => (
                <tr key={x.origin.id}>
                  <td>
                    {x.origin.name} ({x.origin.x}|{x.origin.y}) <span class="muted">· {x.origin.ownerName}</span>
                  </td>
                  <td class="muted">{unitsText(x.units)}</td>
                  <td class="right">
                    <button class="small" onClick={() => send({ type: 'returnSupport', hostId: v.id, originId: x.origin.id })}>
                      Terugsturen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <DismissTroops villageId={v.id} units={v.units} />

      <section class="panel">
        <h3>Troepen van dit dorp elders</h3>
        {v.supportAway.length === 0 ? (
          <p class="muted">Dit dorp ondersteunt niemand.</p>
        ) : (
          <table class="table">
            <tbody>
              {v.supportAway.map((x) => (
                <tr key={x.host.id}>
                  <td>
                    In {x.host.name} ({x.host.x}|{x.host.y}) <span class="muted">· {x.host.ownerName}</span>
                  </td>
                  <td class="muted">{unitsText(x.units)}</td>
                  <td class="right">
                    <button class="small" onClick={() => send({ type: 'returnSupport', hostId: x.host.id, originId: v.id })}>
                      Terugtrekken
                    </button>
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
