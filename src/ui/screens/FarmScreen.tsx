import { BARB_TYPE_NAMES, BONUS_NAMES } from '../../shared/barbarianTypes';
import { useSaved } from '../useSaved';
import { tr } from '../../shared/i18n';
import { trx } from '../i18n';
import { Coords } from '../components/Coords';
import { UnitIcon } from '../units/UnitIcon';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { UNIT_IDS, type UnitCounts, type UnitId } from '../../shared/gameData';
import { formatGameTime } from '../../shared/time';
import { duration, num } from '../format';
import { farmAllPlan, mapData, send, snapshot } from '../store';
import { Confirm } from '../components/Confirm';
import type { FarmAllOptions } from '../../sim/farmAll';
import { UNIT_SHORT, distance, travelMs, unitsText } from '../units';
import { FARM_LETTERS, definedLetters, type FarmKey, type FarmLetter } from '../../shared/farmTemplates';

const FARM_UNITS: UnitId[] = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'knight'];

/** "Meldingen tonen": this template's runs count as normal attacks for you (unread reports, sounds). */
function NotifyBox({ name }: { name: FarmKey }) {
  const on = snapshot.value?.farmNotify?.includes(name) ?? false;
  return (
    <label class="inline" title={tr('Aan: deze farmruns tellen voor jou als gewone aanvallen: ongelezen rapporten, meldingen en geluiden, en ze staan onder Aanvallen. Uit: stille farmruns.')}>
      <input type="checkbox" checked={on} onChange={(e) => send({ type: 'setFarmNotify', template: name, on: e.currentTarget.checked })} /> {tr('Meldingen tonen')}
    </label>
  );
}

function TemplateEditor({ name, units, onRemove }: { name: FarmLetter; units: UnitCounts; onRemove: () => void }) {
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
      <strong>{tr('Sjabloon {name}', { name })}</strong>
      <div class="template-units">
        {FARM_UNITS.map((u) => (
          <label key={u} title={tr(UNIT_SHORT[u])}>
            <span class="unit-name">
              <UnitIcon id={u} size={18} /> {tr(UNIT_SHORT[u])}
            </span>
            <input type="number" min={0} value={draft[u] ?? ''} placeholder="0" onInput={(e) => setDraft({ ...draft, [u]: e.currentTarget.value })} />
          </label>
        ))}
      </div>
      <div class="row">
        <button class="small" onClick={save}>
          {tr('Opslaan')}
        </button>
        <Confirm label={tr('Verwijderen')} sure={tr('Sjabloon {name} weg?', { name })} onConfirm={onRemove} />
        <NotifyBox name={name} />
      </div>
    </div>
  );
}

export function FarmScreen() {
  const s = snapshot.value;
  const v = s?.village;
  const data = mapData.value;
  const [limit, setLimit] = useSaved('farm-limit', 50);
  const [all, setAll] = useSaved('farm-all-villages', false);
  // a new letter shows an empty editor until it is saved
  const [adding, setAdding] = useState<FarmLetter | null>(null);

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
  const letters = definedLetters(s.farmTemplates);
  const tpl = (l: FarmLetter): UnitCounts => s.farmTemplates[l] ?? {};
  const editors = adding && !letters.includes(adding) ? [...letters, adding].sort() : letters;
  const free = FARM_LETTERS.find((l) => !editors.includes(l));
  const first = letters[0];
  // units at home per village (the snapshot's village rows), for every row's "from" village
  const homeIn = (villageId: number | undefined, u: UnitId) => own.find((x) => x.id === villageId)?.units[u] ?? 0;
  const canSend = (t: UnitCounts, villageId: number | undefined) =>
    Object.keys(t).length > 0 && UNIT_IDS.every((u) => (t[u] ?? 0) <= homeIn(villageId, u));
  const lightCarry = 80;

  return (
    <div class="screen narrow">
      <h2>{tr('Farm-assistent')}</h2>
      <section class="panel">
        <div class="row">
          <h3 style={{ margin: 0, flex: 1 }}>{tr('Sjablonen')}</h3>
          {free && (
            <button class="small" onClick={() => setAdding(free)}>
              {tr('Nieuw sjabloon ({l})', { l: free })}
            </button>
          )}
        </div>
        <div class="templates">
          {editors.map((l) => (
            <TemplateEditor key={l} name={l} units={tpl(l)} onRemove={() => { send({ type: 'setFarmTemplate', template: l, units: {} }); if (adding === l) setAdding(null); }} />
          ))}
        </div>
        <p class="muted">
          {letters.map((l) => `${l}: ${unitsText(tpl(l))}`).join(' · ') || tr('Nog geen sjablonen.')} {tr('Een sjabloon is pas te sturen als alle troepen ervan thuis zijn.')}{' '}
          {tr('* stuurt genoeg lichte cavalerie voor de geschatte buit (na verkenning).')}
        </p>
        <div class="row">
          <span class="muted">{tr('Sjabloon {name}:', { name: '*' })}</span> <NotifyBox name="*" />
        </div>
      </section>
      <FarmAllPanel />
      <section class="panel">
        <div class="row">
          <h3 style={{ margin: 0, flex: 1 }}>{tr('Barbarendorpen in de buurt')}</h3>
          {own.length > 1 && (
            <label class="inline">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.currentTarget.checked)} /> {tr('vanaf al je dorpen')}
            </label>
          )}
        </div>
        {!data ? (
          <p class="muted">{tr('Laden…')}</p>
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
                <th>{tr('Dorp')}</th>
                <th class="right">{tr('Afstand')}</th>
                <th class="right">{tr('Punten')}</th>
                <th>{tr('Type')}</th>
                <th class="right">{tr('Muur')}</th>
                <th>{tr('Laatste aanval')}</th>
                <th class="right">{tr('Looptijd {t}', { t: first ?? '' })}</th>
                {multi && <th>{tr('Vanaf')}</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const fromId = m.from?.id;
                const ok = (l: FarmLetter) => canSend(tpl(l), fromId);
                const lightHome = homeIn(fromId, 'light');
                return (
                <tr key={m.id}>
                  <td class="mono">
                    <Coords x={m.x} y={m.y} bare />
                  </td>
                  <td class="right mono">{m.dist.toFixed(1)}</td>
                  <td class="right mono">{num(m.points)}</td>
                  <td class="nowrap">
                    {m.barbType ? tr(BARB_TYPE_NAMES[m.barbType]) : <span class="muted">?</span>}
                    {m.bonus && <span class="bonus-tag" title={tr(BONUS_NAMES[m.bonus])}> ★</span>}
                  </td>
                  <td class="right mono">{m.wall ?? <span class="muted">?</span>}</td>
                  <td>
                    {m.last ? (
                      <>
                        <span class={`dot ${m.last.result}`} /> <span class="mono muted">{formatGameTime(m.last.time)}</span>
                        {m.last.loot > 0 && <span class="muted"> · {tr('{n} buit', { n: num(m.last.loot) })}</span>}
                      </>
                    ) : (
                      <span class="muted">—</span>
                    )}
                  </td>
                  <td class="right mono muted">{first && ok(first) ? duration(travelMs(tpl(first), v.units, m.dist, s.marchFactor)) : '—'}</td>
                  {multi && (
                    <td class="mono muted">
                      {m.from && <Coords x={m.from.x} y={m.from.y} bare />}
                    </td>
                  )}
                  <td class="right nowrap">
                    {letters.map((l) => (
                      <span key={l}>
                        <button class="small" disabled={!ok(l)} onClick={() => send({ type: 'sendFarm', from: fromId ?? v.id, to: m.id, template: l })}>
                          {l}
                        </button>{' '}
                      </span>
                    ))}
                    <button
                      class="small"
                      disabled={m.estimate === undefined || lightHome === 0}
                      title={m.estimate === undefined ? tr('Eerst verkennen') : tr('{n} LC voor ~{loot} buit', { n: Math.min(lightHome, Math.max(1, Math.ceil(m.estimate / lightCarry))), loot: num(m.estimate) })}
                      onClick={() => send({ type: 'sendFarm', from: fromId ?? v.id, to: m.id, template: '*' })}
                    >
                      *
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
            {tr('Meer tonen')}
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
  const s = snapshot.value;
  const letters = definedLetters(s?.farmTemplates);
  const keys: FarmKey[] = [...letters, '*'];
  const [saved, setTemplate] = useSaved<FarmKey | 'C'>('farmall-template', 'A');
  // an old choice ("C" was the light cavalry template) or a letter that is gone
  const template: FarmKey = saved === 'C' && !letters.includes('C') ? '*' : keys.includes(saved as FarmKey) ? (saved as FarmKey) : (keys[0] ?? '*');
  const [skipLost, setSkipLost] = useSaved('farmall-skip-lost', true);
  const [wallOn, setWallOn] = useSaved('farmall-wall-on', false);
  const [maxWall, setMaxWall] = useSaved('farmall-wall', 0);
  const [distOn, setDistOn] = useSaved('farmall-dist-on', false);
  const [maxDistance, setMaxDistance] = useSaved('farmall-dist', 15);
  const options: FarmAllOptions = { template, skipLost, maxWall: wallOn ? maxWall : null, maxDistance: distOn ? maxDistance : null };
  const key = JSON.stringify(options);
  const auto = s?.autoFarm ?? null;
  // auto-farm follows the settings shown here
  useEffect(() => {
    if (auto && JSON.stringify(auto.options) !== key) send({ type: 'setAutoFarm', options });
  }, [key, !!auto]);
  useEffect(() => {
    send({ type: 'getFarmAllPlan', options });
    const t = window.setInterval(() => send({ type: 'getFarmAllPlan', options }), 3000);
    return () => window.clearInterval(t);
  }, [key]);
  const plan = farmAllPlan.value && JSON.stringify(farmAllPlan.value.options) === key ? farmAllPlan.value : null;
  const skippedText = plan
    ? [
        plan.skipped.busy && tr('{n} al onderweg', { n: plan.skipped.busy }),
        plan.skipped.lost && tr('{n} verloren', { n: plan.skipped.lost }),
        plan.skipped.wall && tr('{n} te hoge muur', { n: plan.skipped.wall }),
        plan.skipped.noScout && tr('{n} niet verkend', { n: plan.skipped.noScout }),
      ].filter(Boolean).join(' · ')
    : '';
  return (
    <section class="panel farm-all">
      <div class="row wrap">
        <h3 style={{ margin: 0 }}>{tr('Farm alles')}</h3>
        {keys.map((t) => (
          <button key={t} class={`chip ${template === t ? 'on' : ''}`} title={t === '*' ? tr('Lichte cavalerie naar de verkende buit') : undefined} onClick={() => setTemplate(t)}>{tr('Alle {t}', { t })}</button>
        ))}
        <span style={{ flex: 1 }} />
        <label class="row" title={tr('Elke 30 speelminuten (op snelheid 1; sneller op een snelle wereld) automatisch Farm alles met deze instellingen')}>
          <input type="checkbox" checked={!!auto} onChange={(e) => send({ type: 'setAutoFarm', options: e.currentTarget.checked ? options : null })} /> {tr('Automatisch')}
        </label>
        <Confirm
          label={plan ? tr('Farm alles ({n})', { n: plan.attacks }) : tr('Farm alles')}
          sure={tr('Zeker? {n} aanvallen', { n: plan?.attacks ?? 0 })}
          disabled={!plan?.attacks}
          onConfirm={() => send({ type: 'farmAll', options })}
        />
      </div>
      <div class="row wrap" style={{ marginTop: 8 }}>
        <label class="row"><input type="checkbox" checked={skipLost} onChange={(e) => setSkipLost(e.currentTarget.checked)} /> {tr('Overslaan na verloren aanval')}</label>
        <label class="row">
          <input type="checkbox" checked={wallOn} onChange={(e) => setWallOn(e.currentTarget.checked)} />{' '}
          {trx('Muur hoger dan {n} overslaan', { n: <input type="number" min={0} max={20} value={maxWall} disabled={!wallOn} onInput={(e) => setMaxWall(Math.max(0, Number(e.currentTarget.value) || 0))} /> })}
        </label>
        <label class="row">
          <input type="checkbox" checked={distOn} onChange={(e) => setDistOn(e.currentTarget.checked)} />{' '}
          {trx('Maximaal {n} velden', { n: <input type="number" min={1} value={maxDistance} disabled={!distOn} onInput={(e) => setMaxDistance(Math.max(1, Number(e.currentTarget.value) || 1))} /> })}
        </label>
      </div>
      {auto && (
        <p class="good">
          {tr('Automatisch farmen staat aan met Alle {t}.', { t: auto.options.template })}
          {auto.last ? ' ' + (auto.last.sent === 1
            ? tr('Laatste ronde {time}: 1 aanval.', { time: formatGameTime(auto.last.time) })
            : tr('Laatste ronde {time}: {n} aanvallen.', { time: formatGameTime(auto.last.time), n: auto.last.sent })) : ''}
          {auto.next !== undefined ? ' ' + tr('Volgende ronde {time}.', { time: formatGameTime(auto.next) }) : ''}
        </p>
      )}
      {!plan ? (
        <p class="muted">{tr('Berekenen…')}</p>
      ) : (
        <>
          {plan.able < plan.villages && (
            <p class="warn">
              {plan.able === 1
                ? tr('{able} van je {n} dorpen kan sjabloon {t} sturen', { able: plan.able, n: plan.villages, t: template })
                : tr('{able} van je {n} dorpen kunnen sjabloon {t} sturen', { able: plan.able, n: plan.villages, t: template })}{' '}
              {template === '*' ? tr('(geen lichte cavalerie thuis)') : tr('(niet alle troepen thuis)')}.
            </p>
          )}
          <p class="muted">
            {plan.attacks > 0
              ? tr('{n} aanvallen vanuit {v} dorpen, verste doel op {d} velden.', { n: plan.attacks, v: plan.from.length, d: plan.furthest.toFixed(1) })
              : tr('{n} aanvallen vanuit {v} dorpen.', { n: plan.attacks, v: plan.from.length })}
            {skippedText && ' ' + tr('Overgeslagen: {list}.', { list: skippedText })}
            {plan.left > 0 && ' ' + tr('{n} doelen blijven over: geen troepen meer.', { n: plan.left })}
            {' '}{tr('Muren die je nog niet kent tellen als geen muur.')}
          </p>
          {plan.from.length > 0 && (
            <p class="muted small-text">{plan.from.map((f) => `${f.name}: ${f.attacks}`).join(' · ')}</p>
          )}
        </>
      )}
    </section>
  );
}
