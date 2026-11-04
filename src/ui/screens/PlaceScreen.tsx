import { pickable } from '../templatesVisible';
import { useEffect, useState } from 'preact/hooks';
import { useSaved } from '../useSaved';
import { tr } from '../../shared/i18n';
import { trx } from '../i18n';
import { Coords } from '../components/Coords';
import { PlayerLink } from '../components/PlayerLink';

import { UnitIcon } from '../units/UnitIcon';
import { BuildingHeader } from '../buildings/BuildingHeader';
import { CATAPULT_TARGETS, UNIT_IDS, type BuildingId, type UnitCounts, type UnitId } from '../../shared/gameData';
import { formatGameTime } from '../../shared/time';
import { duration, num } from '../format';
import { openSupport, mapData, placeTarget, send, snapshot } from '../store';
import { distance, travelMs, unitsText } from '../units';
import { CancelButton } from '../components/CancelButton';
import { DismissTroops } from '../components/DismissTroops';
import { Confirm } from '../components/Confirm';
import { SupportReturn } from '../components/SupportReturn';
import type { MovementView } from '../../shared/protocol';

/** Units offered as escort for noblemen 2..N, best attack first. */
const ESCORT_UNITS: UnitId[] = ['axe', 'light', 'marcher', 'heavy', 'sword', 'spear'];
/** Attack per suggested escort: enough to break a barbarian wall of 15. */
const TRAIN_ESCORT_ATTACK = 2000;

export function PlaceScreen() {
  const s = snapshot.value;
  const v = s?.village;
  const [x, setX] = useState('');
  const [bulk, setBulk] = useState(false);
  const [y, setY] = useState('');
  const [counts, setCounts] = useState<Partial<Record<UnitId, string>>>({});
  const [catTarget, setCatTarget] = useSaved<BuildingId>('place-cat-target', 'main');
  // noble train: escorts for noblemen 2..N (the first one goes with the army above)
  const [trainSize, setTrainSize] = useState(0);
  const [clearFirst, setClearFirst] = useSaved('place-clear-first', false);
  const [escorts, setEscorts] = useState<Partial<Record<UnitId, string>>[]>([]);
  const [saveName, setSaveName] = useState<string | null>(null);
  /** The noble train template in use (to update or delete it). */
  const [trainTpl, setTrainTpl] = useState('');
  /** Planning: land at a chosen time (day and clock), the attack leaves by itself. */
  const [planOn, setPlanOn] = useState(false);
  const [landDay, setLandDay] = useState('');
  const [landClock, setLandClock] = useState('');

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
      if (t.landAt !== undefined) setLanding(t.landAt);
      placeTarget.value = null;
    }
  }, [placeTarget.value]);

  function setLanding(at: number) {
    const sec = Math.floor(at / 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    setLandDay(String(Math.floor(sec / 86400) + 1));
    setLandClock(`${pad(Math.floor((sec % 86400) / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`);
    setPlanOn(true);
  }

  if (!s || !v) return null;
  const place = v.buildings.find((b) => b.id === 'place');
  const target = mapData.value?.villages.find((m) => m.x === Number(x) && m.y === Number(y));
  const units = v.units.filter((u) => u.enabled);
  /** Home and not held for a planned attack. */
  const freeOf = (u: { home: number; reserved?: number }) => Math.max(0, u.home - (u.reserved ?? 0));

  const chosen: UnitCounts = {};
  for (const u of UNIT_IDS) {
    const n = Math.floor(Number(counts[u] ?? 0));
    if (n > 0) chosen[u] = n;
  }
  const dist = target ? distance(v, target) : 0;
  const hasUnits = Object.keys(chosen).length > 0;
  const eta = target && hasUnits ? travelMs(chosen, v.units, dist, s.marchFactor) : 0;

  // --- noble train ---------------------------------------------------------------------
  const homeOf = (u: UnitId) => { const x = v.units.find((y) => y.id === u); return x ? freeOf(x) : 0; };
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
  const toStrings = (u: UnitCounts) => Object.fromEntries(Object.entries(u).map(([k, n]) => [k, String(n)])) as Partial<Record<UnitId, string>>;
  const applyTemplate = (id: string) => {
    setTrainTpl(id);
    const t = s.nobleTemplates.find((x) => x.id === id);
    if (!t) return;
    // the first wave carries a nobleman too (the train adds it), unless it is a pure clear: show it
    setClearFirst(!!t.clearFirst);
    setCounts(t.clearFirst ? toStrings(t.first) : { ...toStrings(t.first), snob: '1' });
    setTrainSize(1 + t.escorts.length);
    setEscorts(t.escorts.map(toStrings));
    if (t.catapultTarget) setCatTarget(t.catapultTarget);
  };
  const startTrain = (size: number) => {
    if (size < 2) setTrainTpl('');
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
    if (!target || target.kind === 'own') return tr('Kies een doel');
    const nobles = trainSize - (clearFirst ? 1 : 0);
    if (homeOf('snob') < nobles) return tr('{n} edels nodig, {home} thuis', { n: nobles, home: homeOf('snob') });
    if (clearFirst && Object.keys(first).length === 0) return tr('De clear heeft troepen nodig');
    if (dist > v.nobles.maxDistance) return tr('Verder dan {n} velden', { n: v.nobles.maxDistance });
    const total: UnitCounts = { ...first };
    for (const e of escortCounts) for (const u of UNIT_IDS) if (e[u]) total[u] = (total[u] ?? 0) + (e[u] ?? 0);
    for (const u of UNIT_IDS) if ((total[u] ?? 0) > homeOf(u)) return tr('Te weinig {unit}', { unit: v.units.find((x) => x.id === u)?.name.toLowerCase() });
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
      ...(clearFirst ? { clearFirst: true } : {}),
    });
    setCounts({});
    setTrainSize(0);
    setEscorts([]);
  };
  const trainEta = target ? travelMs(clearFirst ? first : { ...first, snob: 1 }, v.units, dist, s.marchFactor) : 0;

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
      <h2>{tr('Verzamelplaats')}</h2>
      <BuildingHeader village={v} id="place" />
      {place && place.level === 0 ? (
        <section class="panel">
          <p class="muted">{tr('Je hebt een verzamelplaats nodig om troepen te sturen. Bouw hem in het hoofdgebouw.')}</p>
        </section>
      ) : (
        <section class="panel">
          <h3>{tr('Troepen sturen')}</h3>
          <div class="send-actions">
            <button class="small" onClick={() => setCounts(Object.fromEntries(units.filter((u) => freeOf(u) > 0).map((u) => [u.id, String(freeOf(u))])))}>
              {tr('Alles selecteren')}
            </button>
            <button class="small" onClick={() => setCounts({})}>
              {tr('Leegmaken')}
            </button>
          </div>
          <div class="send-grid">
            {units.map((u) => (
              <label key={u.id} class="send-unit">
                <span class="unit-name">
                  <UnitIcon id={u.id} size={20} /> <span class="nm" title={u.name}>{u.name}</span>
                  <button class="link" onClick={() => setCounts({ ...counts, [u.id]: String(freeOf(u)) })} title={u.reserved ? tr('{n} staan klaar voor een ingeplande aanval', { n: num(u.reserved) }) : undefined}>
                    ({num(freeOf(u))}{u.reserved ? <span class="reserved"> +{num(u.reserved)}⏱</span> : null})
                  </button>
                </span>
                <input
                  type="number"
                  min={0}
                  max={freeOf(u)}
                  value={counts[u.id] ?? ''}
                  placeholder="0"
                  onInput={(e) => setCounts({ ...counts, [u.id]: e.currentTarget.value })}
                />
              </label>
            ))}
          </div>
          <div class="row">
            <label class="coord">
              {tr('Doel x')}
              <input type="number" value={x} onInput={(e) => setX(e.currentTarget.value)} />
            </label>
            <label class="coord">
              y
              <input type="number" value={y} onInput={(e) => setY(e.currentTarget.value)} />
            </label>
            {s.villages.length > 1 && (
              <label>
                {tr('Eigen dorp')}
                <select
                  value={s.villages.find((o) => String(o.x) === x && String(o.y) === y)?.id ?? ''}
                  onChange={(e) => {
                    const o = s.villages.find((w) => w.id === Number(e.currentTarget.value));
                    if (o) { setX(String(o.x)); setY(String(o.y)); }
                  }}
                >
                  <option value="">{tr('kies…')}</option>
                  {s.villages
                    .filter((o) => o.id !== v.id)
                    .map((o) => ({ o, d: distance(v, o) }))
                    .sort((p, q) => p.d - q.d)
                    .map(({ o, d }) => (
                      <option key={o.id} value={String(o.id)}>{o.name} ({o.x}|{o.y}) · {tr('{n} velden', { n: d.toFixed(1) })}</option>
                    ))}
                </select>
              </label>
            )}
            {(chosen.catapult ?? 0) > 0 && (
              <label>
                {tr('Katapulten op')}
                <select value={catTarget} onChange={(e) => setCatTarget(e.currentTarget.value as BuildingId)}>
                  {CATAPULT_TARGETS.map((b) => (
                    <option key={b} value={String(b)}>
                      {v.buildings.find((x) => x.id === b)?.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button class="primary" disabled={!target || !hasUnits || target.id === v.id || ownTarget} onClick={attack}>
              {tr('Aanvallen')}
            </button>
            <button disabled={!target || !hasUnits || target.id === v.id || target.kind === 'barb'} onClick={support}>
              {tr('Ondersteunen')}
            </button>
          </div>
          {target && !ownTarget && target.id !== v.id && (
            <PlanRow
              on={planOn}
              setOn={(on) => {
                if (on && !landDay) {
                  // the leader's landing time for this target, else a little after the soonest
                  const o = [s.leaderOrder].find((x) => x?.landAt !== undefined && x.target.id === target.id);
                  setLanding(o?.landAt ?? Math.ceil((s.time + (trainSize > 1 ? trainEta : eta) + 10 * 60_000) / 60_000) * 60_000);
                } else setPlanOn(on);
              }}
              day={landDay}
              clock={landClock}
              setDay={setLandDay}
              setClock={setLandClock}
              walk={trainSize > 1 ? trainEta : eta}
              ready={trainSize > 1 ? trainBlocker === null : hasUnits}
              train={trainSize > 1}
              onPlan={(landAt) => {
                send(trainSize > 1
                  ? { type: 'planAttack', from: v.id, to: target.id, first, escorts: escortCounts, landAt, ...((first.catapult ?? 0) > 0 ? { catapultTarget: catTarget } : {}), ...(clearFirst ? { clearFirst: true } : {}) }
                  : { type: 'planAttack', from: v.id, to: target.id, first: chosen, landAt, ...((chosen.catapult ?? 0) > 0 ? { catapultTarget: catTarget } : {}) });
                setCounts({});
                setTrainSize(0);
                setEscorts([]);
              }}
            />
          )}
          <div class="row">
            <button class="small" onClick={() => openSupport(v.id)}>
              {tr('Support naar dit dorp plannen')}
            </button>
          </div>
          <div class="row">
            <label class="inline">
              {tr('Edeltrein')}
              <select value={String(trainSize)} onChange={(e) => startTrain(Number(e.currentTarget.value))}>
                <option value="0">{tr('uit')}</option>
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={String(n)}>
                    {tr('{n} edels', { n })}
                  </option>
                ))}
              </select>
            </label>
            {s.nobleTemplates.length > 0 && (
              <label class="inline">
                {tr('Sjabloon')}
                <select value={s.nobleTemplates.some((t) => t.id === trainTpl) ? trainTpl : ''} onChange={(e) => applyTemplate(e.currentTarget.value)}>
                  <option value="">{tr('kies…')}</option>
                  {pickable(s.nobleTemplates, trainTpl).map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name} ({t.clearFirst ? tr('{n} edels + clear', { n: t.escorts.length }) : tr('{n} edels', { n: t.escorts.length + 1 })})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {trainSize > 1 && (
              <>
                <button class="small" onClick={() => setEscorts(suggest(trainSize))}>
                  {tr('Escort opnieuw voorstellen')}
                </button>
                <label class="inline" title={tr('De eerste aanval is een pure clear zonder edelman; de edels zitten in de waves daarna.')}>
                  <input
                    type="checkbox"
                    checked={clearFirst}
                    onChange={(e) => {
                      const on = e.currentTarget.checked;
                      setClearFirst(on);
                      setCounts({ ...counts, snob: on ? '' : '1' });
                    }}
                  />{' '}
                  {tr('Eerste wave zonder edel')}
                </label>
                {saveName === null ? (
                  <>
                    {s.nobleTemplates.some((t) => t.id === trainTpl) && (
                      <>
                        <Confirm
                          label={tr('Bijwerken')}
                          sure={tr('"{name}" overschrijven?', { name: s.nobleTemplates.find((t) => t.id === trainTpl)!.name })}
                          onConfirm={() => {
                            const t = s.nobleTemplates.find((x) => x.id === trainTpl)!;
                            send({ type: 'saveNobleTemplate', template: { id: t.id, name: t.name, first, escorts: escortCounts, ...((first.catapult ?? 0) > 0 ? { catapultTarget: catTarget } : {}), ...(clearFirst ? { clearFirst: true } : {}) } });
                          }}
                        />
                        <Confirm label={tr('Verwijderen')} sure={tr('Sjabloon verwijderen?')} cls="warn" onConfirm={() => { send({ type: 'deleteNobleTemplate', id: trainTpl }); setTrainTpl(''); }} />
                      </>
                    )}
                    <button class="small" onClick={() => setSaveName('')}>
                      {s.nobleTemplates.some((t) => t.id === trainTpl) ? tr('Als nieuw opslaan') : tr('Opslaan als sjabloon')}
                    </button>
                  </>
                ) : (
                  <form
                    class="row inline-save"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const newId = `train:${Date.now()}`;
                      send({
                        type: 'saveNobleTemplate',
                        template: { id: newId, name: saveName, first, escorts: escortCounts, ...((first.catapult ?? 0) > 0 ? { catapultTarget: catTarget } : {}), ...(clearFirst ? { clearFirst: true } : {}) },
                      });
                      setTrainTpl(newId);
                      setSaveName(null);
                    }}
                  >
                    <input autoFocus placeholder={tr('Naam van het sjabloon')} maxLength={40} value={saveName} onInput={(e) => setSaveName(e.currentTarget.value)} />
                    <button class="small primary" type="submit" disabled={!saveName.trim()}>
                      {tr('Opslaan')}
                    </button>
                    <button class="small" type="button" onClick={() => setSaveName(null)}>
                      ✕
                    </button>
                  </form>
                )}
                <button class="primary" disabled={trainBlocker !== null} title={trainBlocker ?? ''} onClick={sendTrain}>
                  {trainBlocker ?? tr('Edeltrein sturen ({n})', { n: trainSize })}
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
                  <td>{tr('Edel {n}', { n: 1 })}</td>
                  <td colSpan={ESCORT_UNITS.length} class="muted">
                    {hasUnits ? tr('met de troepen hierboven: {units}', { units: unitsText(first) }) : tr('met de troepen hierboven (nog niets ingevuld)')}
                  </td>
                </tr>
                {escorts.map((e, i) => (
                  <tr key={i}>
                    <td>{tr('Edel {n}', { n: i + 2 })}</td>
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
              {target
                ? tr('Alles vertrekt tegelijk op edelsnelheid en komt in deze volgorde aan, over {time} ({at}). De voorgestelde escort is genoeg om een muur van een barbarendorp te breken; pas hem aan als je meer of minder wilt sturen.', { time: duration(trainEta), at: formatGameTime(s.time + trainEta) })
                : tr('Alles vertrekt tegelijk op edelsnelheid en komt in deze volgorde aan. De voorgestelde escort is genoeg om een muur van een barbarendorp te breken; pas hem aan als je meer of minder wilt sturen.')}
            </p>
          )}
          <p class="muted">
            {x && y && !target && tr('Geen dorp op deze coördinaten.')}
            {target &&
              `${tr('{name} van {owner} · {points} punten · {dist} velden', { name: target.name, owner: target.ownerName, points: num(target.points), dist: dist.toFixed(1) })}${
                hasUnits ? ` · ${tr('aankomst over {time} ({at})', { time: duration(eta), at: formatGameTime(s.time + eta) })}` : ''
              }`}
          </p>
        </section>
      )}

      <Planned />
      <Movements />

      <section class="panel">
        <div class="row">
          <h3>{tr('Ondersteuning in dit dorp')}</h3>
          <span style={{ flex: 1 }} />
          <button class="small" onClick={() => setBulk(!bulk)}>{bulk ? tr('Verbergen') : tr('Alles terugsturen…')}</button>
        </div>
        {bulk && <SupportReturn village={v.id} onClose={() => setBulk(false)} />}
        {v.supportHere.length === 0 ? (
          <p class="muted">{tr('Geen troepen van andere dorpen.')}</p>
        ) : (
          <table class="table">
            <tbody>
              {v.supportHere.map((x) => (
                <tr key={x.origin.id}>
                  <td>
                    {x.origin.name} <Coords x={x.origin.x} y={x.origin.y} /> <span class="muted">· {x.origin.ownerName}</span>
                  </td>
                  <td class="muted">{unitsText(x.units)}</td>
                  <td class="right">
                    <button class="small" onClick={() => send({ type: 'returnSupport', hostId: v.id, originId: x.origin.id })}>
                      {tr('Terugsturen')}
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
        <h3>{tr('Troepen van dit dorp elders')}</h3>
        {v.supportAway.length === 0 ? (
          <p class="muted">{tr('Dit dorp ondersteunt niemand.')}</p>
        ) : (
          <table class="table">
            <tbody>
              {v.supportAway.map((x) => (
                <tr key={x.host.id}>
                  <td>
                    {tr('In {village}', { village: x.host.name })} <Coords x={x.host.x} y={x.host.y} /> <span class="muted">· {x.host.ownerName}</span>
                  </td>
                  <td class="muted">{unitsText(x.units)}</td>
                  <td class="right">
                    <button class="small" onClick={() => send({ type: 'returnSupport', hostId: x.host.id, originId: v.id })}>
                      {tr('Terugtrekken')}
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

/** Parses day + "HH:MM(:SS)" into game time, or null. */
function parseLanding(day: string, clock: string): number | null {
  const d = Math.floor(Number(day));
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(clock.trim());
  if (!(d >= 1) || !m) return null;
  const [h, mi, se] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || mi > 59 || se > 59) return null;
  return (d - 1) * 86_400_000 + ((h * 60 + mi) * 60 + se) * 1000;
}

/** "Laten landen om…": pick a landing time; the attack (or train) above leaves by itself. */
function PlanRow(p: {
  on: boolean; setOn: (on: boolean) => void; day: string; clock: string; setDay: (d: string) => void; setClock: (c: string) => void;
  walk: number; ready: boolean; train: boolean; onPlan: (landAt: number) => void;
}) {
  const s = snapshot.value!;
  if (!p.on) {
    return (
      <div class="row">
        <button class="small" onClick={() => p.setOn(true)} title={tr('Kies wanneer hij moet landen; het spel stuurt hem zelf op het juiste moment, de troepen blijven tot dan thuis.')}>
          ⏱ {tr('Laten landen om…')}
        </button>
      </div>
    );
  }
  const landAt = parseLanding(p.day, p.clock);
  const leave = landAt !== null && p.walk > 0 ? landAt - p.walk : null;
  const late = leave !== null && leave < s.time;
  const order = s.leaderOrder?.landAt;
  return (
    <div class="plan-row">
      <div class="row wrap">
        <strong>⏱ {tr('Laten landen om')}</strong>
        <label class="inline">{tr('Dag')} <input type="number" min={1} style={{ width: '64px' }} value={p.day} onInput={(e) => p.setDay(e.currentTarget.value)} /></label>
        <input class="mono" style={{ width: '96px' }} placeholder="14:32:00" value={p.clock} onInput={(e) => p.setClock(e.currentTarget.value)} />
        {order !== undefined && (
          <button class="small" onClick={() => { const sec = Math.floor(order / 1000); p.setDay(String(Math.floor(sec / 86400) + 1)); p.setClock(formatGameTime(order).split(' · ')[1]!); }}>
            {tr('Zoals de opdracht')}
          </button>
        )}
        <button class="primary" disabled={!p.ready || landAt === null || leave === null || late} onClick={() => landAt !== null && p.onPlan(landAt)}>
          {p.train ? tr('Edeltrein inplannen') : tr('Inplannen')}
        </button>
        <button class="small" onClick={() => p.setOn(false)}>✕</button>
      </div>
      <p class={late ? 'warn' : 'muted'}>
        {landAt === null
          ? tr('Vul een dag en tijd in (uu:mm of uu:mm:ss).')
          : !p.ready || p.walk <= 0
            ? tr('Kies eerst de troepen hierboven.')
            : late
              ? tr("Te laat: zo landt hij op z'n vroegst om {time}.", { time: formatGameTime(s.time + p.walk) })
              : tr('Vertrekt vanzelf om {time} (over {left}). Tot dan blijven de troepen thuis en verdedigen ze mee, maar farmen, rooftochten en andere aanvallen laten ze met rust. Sneuvelt er iets, dan gaat hij met wat er is.', { time: formatGameTime(leave!), left: duration(leave! - s.time) })}
      </p>
    </div>
  );
}

/** Your planned attacks (all villages): when they leave and land, with a way to call them off. */
function Planned() {
  const s = snapshot.value!;
  const list = s.planned ?? [];
  if (!list.length) return null;
  return (
    <section class="panel">
      <h3>{tr('Ingepland')} <span class="muted">{list.length}</span></h3>
      <table class="table">
        <thead>
          <tr>
            <th>{tr('Aanval')}</th>
            <th>{tr('Troepen')}</th>
            <th>{tr('Vertrekt')}</th>
            <th>{tr('Landt')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id} class={p.from.id === s.village?.id ? '' : 'muted-row'}>
              <td>
                <span class="tag-attack">{p.waves > 1 ? tr('Edeltrein {n}', { n: p.waves }) : tr('Aanval')}</span> {p.from.name} → {p.to.name} <Coords x={p.to.x} y={p.to.y} />
                <Owner o={p.to} />
                {p.short && <span class="warn" title={tr('Niet alles staat nu thuis; hij gaat met wat er op het vertrekmoment is.')}> · {tr('niet alles thuis')}</span>}
              </td>
              <td class="muted">{unitsText(p.units)}</td>
              <td class="mono">{formatGameTime(p.sendAt)} <span class="muted">({duration(p.sendAt - s.time)})</span></td>
              <td class="mono muted">{formatGameTime(p.landAt)}</td>
              <td class="right">
                <Confirm label={tr('Annuleren')} sure={tr('Deze ingeplande aanval annuleren?')} cls="warn" onConfirm={() => send({ type: 'cancelPlanned', id: p.id })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** " · Name" after a village of another player (nothing for yours, id 0, or barbarians). */
function Owner({ o }: { o: { owner?: number; ownerName?: string } }) {
  if (o.owner === undefined || o.owner < 0 || o.owner === 0) return null;
  return <span class="muted"> · <PlayerLink id={o.owner} name={o.ownerName ?? '?'} /></span>;
}

type MoveFilter = 'all' | 'attack' | 'farm' | 'support' | 'return';
const FILTERS: { id: MoveFilter; label: string }[] = [
  { id: 'all', label: 'Alles' },
  { id: 'attack', label: 'Aanvallen|lijst' },
  { id: 'farm', label: 'Farm' },
  { id: 'support', label: 'Steun' },
  { id: 'return', label: 'Terugkerend' },
];
const PAGE = 50;

/** Farm runs: to and from barbarian villages. They come in hundreds, so they fold into one line. */
const isFarm = (m: MovementView) => (m.kind === 'attack' || m.kind === 'return') && (m.farm ?? (m.kind === 'attack' ? m.to.owner === -1 : m.from.owner === -1));
function kindOf(m: MovementView): Exclude<MoveFilter, 'all'> {
  if (isFarm(m)) return 'farm';
  if (m.kind === 'attack') return 'attack';
  if (m.kind === 'support') return 'support';
  return 'return';
}

/** Troops on the move from this village: filters, farm runs folded, at most a page at a time. */
function Movements() {
  const s = snapshot.value!;
  const [filter, setFilter] = useState<MoveFilter>('all');
  const [shown, setShown] = useState(PAGE);
  const all = s.movements;
  const count = (f: MoveFilter) => (f === 'all' ? all.length : all.filter((m) => kindOf(m) === f).length);
  const farm = all.filter(isFarm);
  const list = filter === 'all' ? all.filter((m) => !isFarm(m)) : all.filter((m) => kindOf(m) === filter);
  const pick = (f: MoveFilter) => { setFilter(f); setShown(PAGE); };
  const farmOut = farm.filter((m) => m.kind === 'attack').length;
  const firstBack = farm.filter((m) => m.kind === 'return').reduce((t, m) => Math.min(t, m.arrives), Infinity);
  return (
    <section class="panel">
      <div class="row moves-head">
        <h3>{tr('Onderweg')}</h3>
        <div class="seg moves-filter" role="tablist" aria-label={tr('Soort beweging')}>
          {FILTERS.map((f) => {
            const n = count(f.id);
            return (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} class={filter === f.id ? 'on' : ''} disabled={f.id !== 'all' && n === 0} onClick={() => pick(f.id)}>
                {tr(f.label)} <span class="muted">{n}</span>
              </button>
            );
          })}
        </div>
      </div>
      {all.length === 0 ? (
        <p class="muted">{tr('Geen troepen onderweg.')}</p>
      ) : (
        <>
          {filter === 'all' && farm.length > 0 && (
            <button type="button" class="farm-fold" onClick={() => pick('farm')}>
              <span>
                <strong>{tr('{n} farmruns', { n: num(farm.length) })}</strong> <span class="muted">· {tr('{out} op weg naar barbaren · {back} terug', { out: num(farmOut), back: num(farm.length - farmOut) })}</span>
              </span>
              <span class="muted">{Number.isFinite(firstBack) ? tr('eerste terug over {time}', { time: duration(firstBack - s.time) }) : ''} · {tr('tonen ›')}</span>
            </button>
          )}
          {list.length > 0 && (
            <table class="table">
              <thead>
                <tr>
                  <th>{tr('Opdracht')}</th>
                  <th>{tr('Troepen')}</th>
                  <th>{tr('Aankomst')}</th>
                  <th class="right">{tr('Nog')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.slice(0, shown).map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.kind === 'attack' ? (
                        <>
                          {trx('{tag} op {village}', { tag: <span class="tag-attack">{tr('Aanval')}</span>, village: m.to.name })} <Coords x={m.to.x} y={m.to.y} /><Owner o={m.to} />
                        </>
                      ) : m.kind === 'support' ? (
                        <>
                          {trx('{tag} naar {village}', { tag: <span class="tag-support">{tr('Steun')}</span>, village: m.to.name })} <Coords x={m.to.x} y={m.to.y} /><Owner o={m.to} />
                        </>
                      ) : (
                        <>
                          {trx('{tag} van {village}', { tag: <span class="tag-return">{tr('Terug')}</span>, village: m.from.name })} <Coords x={m.from.x} y={m.from.y} /><Owner o={m.from} />
                          {m.loot && <span class="muted"> · {tr('buit {n}', { n: num(m.loot[0] + m.loot[1] + m.loot[2]) })}</span>}
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
          {list.length > shown && (
            <button type="button" class="small more-moves" onClick={() => setShown(shown + PAGE)}>
              {tr('Meer tonen ({n} van {total})', { n: num(Math.min(PAGE, list.length - shown)), total: num(list.length - shown) })}
            </button>
          )}
        </>
      )}
    </section>
  );
}
