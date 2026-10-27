import { BARB_TYPE_NAMES, BONUS_NAMES } from '../../shared/barbarianTypes';
import { UnitIcon } from '../units/UnitIcon';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { UNIT_IDS, type UnitCounts, type UnitId } from '../../shared/gameData';
import { formatGameTime } from '../../shared/time';
import { duration, num } from '../format';
import { farmAllPlan, mapData, send, snapshot } from '../store';
import { Confirm } from '../components/Confirm';
import type { FarmAllOptions } from '../../sim/farmAll';
import { UNIT_SHORT, distance, travelMs, unitsText } from '../units';

const FARM_UNITS: UnitId[] = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'knight'];

function TemplateEditor({ name, units }: { name: 'A' | 'B'; units: UnitCounts }) {
  const [draft, setDraft] = useState<Partial<Record<UnitId, string>>>({});
  useEffect(() => {
    const d: Partial<Record<UnitId, string>> = {};
    for (const u of UNIT_IDS) if (units[u]) d[u] = String(units[u]);
    setDraft(d);
  }, [JSON.stringify(units)]);

  const save = () => {
    const out: UnitCounts = {};
    for (const u of FARM_UNITS) {
      const n = Math.floor(Number(draft[u] ?? 0));
      if (n > 0) out[u] = n;
    }
    send({ type: 'setFarmTemplate', template: name, units: out });
  };

  return (
    <div class="template">
      <strong>Template {name}</strong>
      <div class="template-units">
        {FARM_UNITS.map((u) => (
          <label key={u} title={UNIT_SHORT[u]}>
            <span class="unit-name">
              <UnitIcon id={u} size={18} /> {UNIT_SHORT[u]}
            </span>
            <input type="number" min={0} value={draft[u] ?? ''} placeholder="0" onInput={(e) => setDraft({ ...draft, [u]: e.currentTarget.value })} />
          </label>
        ))}
      </div>
      <button class="small" onClick={save}>
        Opslaan
      </button>
    </div>
  );
}

export function FarmScreen() {
  const s = snapshot.value;
  const v = s?.village;
  const data = mapData.value;
  const [limit, setLimit] = useState(50);
  const [all, setAll] = useState(false);

  useEffect(() => {
    send({ type: 'getMap' });
    const t = window.setInterval(() => send({ type: 'getMap' }), 3000);
    return () => window.clearInterval(t);
  }, []);

  const own = s?.villages ?? [];
  const multi = all && own.length > 1;
  const rows = useMemo(() => {
    if (!v || !data) return [];
    // all villages: every barbarian village is farmed from the nearest of your villages
    const froms = multi ? own : own.filter((x) => x.id === v.id);
    return data.villages
      .filter((m) => m.kind === 'barb')
      .map((m) => {
        let from = froms[0];
        let dist = from ? distance(from, m) : Infinity;
        for (const f of froms) {
          const d = distance(f, m);
          if (d < dist) {
            dist = d;
            from = f;
          }
        }
        return { ...m, dist, from };
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit);
  }, [data, v?.id, limit, multi, own.length]);

  if (!s || !v) return null;
  const { A, B } = s.farmTemplates;
  // units at home per village (the snapshot's village rows), for every row's "from" village
  const homeIn = (villageId: number | undefined, u: UnitId) => own.find((x) => x.id === villageId)?.units[u] ?? 0;
  const canSend = (t: UnitCounts, villageId: number | undefined) =>
    Object.keys(t).length > 0 && UNIT_IDS.every((u) => (t[u] ?? 0) <= homeIn(villageId, u));
  const lightCarry = 80;

  return (
    <div class="screen narrow">
      <h2>Farm-assistent</h2>
      <section class="panel">
        <div class="templates">
          <TemplateEditor name="A" units={A} />
          <TemplateEditor name="B" units={B} />
        </div>
        <p class="muted">
          A: {unitsText(A) || 'leeg'} · B: {unitsText(B) || 'leeg'}. Een template is pas te sturen als alle troepen ervan thuis zijn.
          C stuurt genoeg lichte cavalerie voor de geschatte buit (na verkenning).
        </p>
      </section>
      <FarmAllPanel />
      <section class="panel">
        <div class="row">
          <h3 style={{ margin: 0, flex: 1 }}>Barbarendorpen in de buurt</h3>
          {own.length > 1 && (
            <label class="inline">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.currentTarget.checked)} /> vanaf al je dorpen
            </label>
          )}
        </div>
        {!data ? (
          <p class="muted">Laden…</p>
        ) : (
          <table class="table fixed">
            <colgroup>
              <col style={{ width: '90px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '60px' }} />
              <col />
              <col style={{ width: '100px' }} />
              {multi && <col style={{ width: '90px' }} />}
              <col style={{ width: '130px' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Dorp</th>
                <th class="right">Afstand</th>
                <th class="right">Punten</th>
                <th>Type</th>
                <th class="right">Muur</th>
                <th>Laatste aanval</th>
                <th class="right">Looptijd A</th>
                {multi && <th>Vanaf</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const fromId = m.from?.id;
                const okA = canSend(A, fromId);
                const okB = canSend(B, fromId);
                const lightHome = homeIn(fromId, 'light');
                return (
                <tr key={m.id}>
                  <td class="mono">
                    {m.x}|{m.y}
                  </td>
                  <td class="right mono">{m.dist.toFixed(1)}</td>
                  <td class="right mono">{num(m.points)}</td>
                  <td class="nowrap">
                    {m.barbType ? BARB_TYPE_NAMES[m.barbType] : <span class="muted">?</span>}
                    {m.bonus && <span class="bonus-tag" title={BONUS_NAMES[m.bonus]}> ★</span>}
                  </td>
                  <td class="right mono">{m.wall ?? <span class="muted">?</span>}</td>
                  <td>
                    {m.last ? (
                      <>
                        <span class={`dot ${m.last.result}`} /> <span class="mono muted">{formatGameTime(m.last.time)}</span>
                        {m.last.loot > 0 && <span class="muted"> · {num(m.last.loot)} buit</span>}
                      </>
                    ) : (
                      <span class="muted">—</span>
                    )}
                  </td>
                  <td class="right mono muted">{okA ? duration(travelMs(A, v.units, m.dist, s.marchFactor)) : '—'}</td>
                  {multi && (
                    <td class="mono muted">
                      {m.from?.x}|{m.from?.y}
                    </td>
                  )}
                  <td class="right nowrap">
                    <button class="small" disabled={!okA} onClick={() => send({ type: 'sendFarm', from: fromId ?? v.id, to: m.id, template: 'A' })}>
                      A
                    </button>{' '}
                    <button class="small" disabled={!okB} onClick={() => send({ type: 'sendFarm', from: fromId ?? v.id, to: m.id, template: 'B' })}>
                      B
                    </button>{' '}
                    <button
                      class="small"
                      disabled={m.estimate === undefined || lightHome === 0}
                      title={m.estimate === undefined ? 'Eerst verkennen' : `${Math.min(lightHome, Math.max(1, Math.ceil(m.estimate / lightCarry)))} LC voor ~${num(m.estimate)} buit`}
                      onClick={() => send({ type: 'sendFarm', from: fromId ?? v.id, to: m.id, template: 'C' })}
                    >
                      C
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {rows.length >= limit && (
          <button class="small" onClick={() => setLimit(limit + 50)}>
            Meer tonen
          </button>
        )}
      </section>
    </div>
  );
}

/**
 * "Farm alles": every barbarian village gets one attack with the chosen template, from the
 * nearest of your villages that can still pay it. Closest pairs first, until troops run out.
 */
function FarmAllPanel() {
  const [template, setTemplate] = useState<'A' | 'B' | 'C'>('A');
  const [skipLost, setSkipLost] = useState(true);
  const [wallOn, setWallOn] = useState(false);
  const [maxWall, setMaxWall] = useState(0);
  const [distOn, setDistOn] = useState(false);
  const [maxDistance, setMaxDistance] = useState(15);
  const options: FarmAllOptions = { template, skipLost, maxWall: wallOn ? maxWall : null, maxDistance: distOn ? maxDistance : null };
  const key = JSON.stringify(options);
  useEffect(() => {
    send({ type: 'getFarmAllPlan', options });
    const t = window.setInterval(() => send({ type: 'getFarmAllPlan', options }), 3000);
    return () => window.clearInterval(t);
  }, [key]);
  const plan = farmAllPlan.value && JSON.stringify(farmAllPlan.value.options) === key ? farmAllPlan.value : null;
  const skippedText = plan
    ? [
        plan.skipped.busy && `${plan.skipped.busy} al onderweg`,
        plan.skipped.lost && `${plan.skipped.lost} verloren`,
        plan.skipped.wall && `${plan.skipped.wall} te hoge muur`,
        plan.skipped.noScout && `${plan.skipped.noScout} niet verkend`,
      ].filter(Boolean).join(' · ')
    : '';
  return (
    <section class="panel farm-all">
      <div class="row wrap">
        <h3 style={{ margin: 0 }}>Farm alles</h3>
        {(['A', 'B', 'C'] as const).map((t) => (
          <button key={t} class={`chip ${template === t ? 'on' : ''}`} onClick={() => setTemplate(t)}>Template {t}</button>
        ))}
        <span style={{ flex: 1 }} />
        <Confirm
          label={`Farm alles${plan ? ` (${plan.attacks})` : ''}`}
          sure={`Zeker? ${plan?.attacks ?? 0} aanvallen`}
          disabled={!plan?.attacks}
          onConfirm={() => send({ type: 'farmAll', options })}
        />
      </div>
      <div class="row wrap" style={{ marginTop: 8 }}>
        <label class="row"><input type="checkbox" checked={skipLost} onChange={(e) => setSkipLost(e.currentTarget.checked)} /> Overslaan na verloren aanval</label>
        <label class="row">
          <input type="checkbox" checked={wallOn} onChange={(e) => setWallOn(e.currentTarget.checked)} /> Muur hoger dan
          <input type="number" min={0} max={20} value={maxWall} disabled={!wallOn} onInput={(e) => setMaxWall(Math.max(0, Number(e.currentTarget.value) || 0))} /> overslaan
        </label>
        <label class="row">
          <input type="checkbox" checked={distOn} onChange={(e) => setDistOn(e.currentTarget.checked)} /> Maximaal
          <input type="number" min={1} value={maxDistance} disabled={!distOn} onInput={(e) => setMaxDistance(Math.max(1, Number(e.currentTarget.value) || 1))} /> velden
        </label>
      </div>
      {!plan ? (
        <p class="muted">Berekenen…</p>
      ) : (
        <>
          {plan.able < plan.villages && (
            <p class="warn">
              {plan.able} van je {plan.villages} dorpen {plan.able === 1 ? 'kan' : 'kunnen'} template {template} sturen
              {template === 'C' ? ' (geen lichte cavalerie thuis)' : ' (niet alle troepen thuis)'}.
            </p>
          )}
          <p class="muted">
            {plan.attacks} aanvallen vanuit {plan.from.length} dorpen{plan.attacks > 0 && `, verste doel op ${plan.furthest.toFixed(1)} velden`}.
            {skippedText && ` Overgeslagen: ${skippedText}.`}
            {plan.left > 0 && ` ${plan.left} doelen blijven over: geen troepen meer.`}
            {' '}Muren die je nog niet kent tellen als geen muur.
          </p>
          {plan.from.length > 0 && (
            <p class="muted small-text">{plan.from.map((f) => `${f.name}: ${f.attacks}`).join(' · ')}</p>
          )}
        </>
      )}
    </section>
  );
}
