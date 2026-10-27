import { Fragment } from 'preact';
import { Coords } from '../components/Coords';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { UnitCounts, UnitId } from '../../shared/gameData';
import type { ScavVillageRow, ScavView } from '../../shared/protocol';
import { DEFAULT_SCAV_TEMPLATE, SCAV_FACTORS, SCAV_LEVELS, SCAV_NAMES, SCAV_SAFE, SCAV_UNITS, planScav, previewScav, type ScavParams, type ScavTemplate } from '../../shared/scavenge';
import { Confirm } from '../components/Confirm';
import { duration, num } from '../format';
import { scavView, send, snapshot } from '../store';
import { UNIT_SHORT } from '../units';
import { UnitIcon } from '../units/UnitIcon';

const LEVELS = [0, 1, 2, 3];
const hasUnits = (u: UnitCounts | undefined) => !!u && Object.values(u).some((n) => n && n > 0);
const unitList = (u: UnitCounts) =>
  SCAV_UNITS.filter((id) => (u[id] ?? 0) > 0).map((id) => `${num(u[id]!)} ${UNIT_SHORT[id]}`).join(' · ');

/**
 * Rooftocht (TW scavenging): send troops out for resources. "Dit dorp" for one village with a
 * card per level; "Massa" for many villages with a template and per-village, per-level overrides.
 */
export function ScavengeScreen() {
  const [tab, setTab] = useState<'one' | 'mass'>('one');
  useEffect(() => {
    send({ type: 'getScav' });
    const t = window.setInterval(() => send({ type: 'getScav' }), 2000);
    return () => window.clearInterval(t);
  }, []);
  const view = scavView.value;
  const s = snapshot.value;
  if (!s) return null;
  return (
    <div class="screen scavenge">
      <h2>Rooftocht</h2>
      {view && !view.enabled ? (
        <section class="panel">
          <p>Rooftochten staan uit in deze wereld.</p>
          <button class="small" onClick={() => send({ type: 'setScavenging', on: true })}>Aanzetten</button>
        </section>
      ) : !view ? (
        <p class="muted">Laden…</p>
      ) : (
        <>
          <div class="row wrap" style={{ marginBottom: 10 }}>
            <button class={`chip ${tab === 'one' ? 'on' : ''}`} onClick={() => setTab('one')}>Dit dorp</button>
            <button class={`chip ${tab === 'mass' ? 'on' : ''}`} onClick={() => setTab('mass')}>Massa</button>
          </div>
          <p class="hint">
            Troepen gaan een tijdje de omgeving af en komen terug met grondstoffen. Elk level heeft een veilige sterkte (aanvalswaarde): stuur je
            minder, dan sneuvelt er een deel en is de buit kleiner. Rond een level één keer veilig af om het volgende te openen. Onderweg kun je ze
            niet terugroepen.
          </p>
          {tab === 'one' ? <OneVillage view={view} villageId={s.village?.id ?? -1} now={s.time} /> : <Mass view={view} now={s.time} />}
        </>
      )}
    </div>
  );
}

function Preview({ params, level, units }: { params: ScavParams; level: number; units: UnitCounts }) {
  if (!hasUnits(units)) return <span class="muted">Geen troepen</span>;
  const p = previewScav(params, level, units);
  return (
    <span class="scav-preview">
      <span class={p.ratio >= 1 ? 'good' : 'warn'} title={`Sterkte ${num(p.strength)} van ${num(p.safe)} veilig`}>
        {p.ratio >= 1 ? 'veilig' : `${Math.round(p.lossShare * 100)}% verlies`}
      </span>
      {' · '}
      <span title="Buit (een derde van elk)">{num(p.loot)} buit</span>
      {' · '}
      <span class="mono">{duration(p.durationMs)}</span>
    </span>
  );
}

function RunStatus({ v, level, now, params }: { v: ScavVillageRow; level: number; now: number; params: ScavParams }) {
  const run = v.runs.find((r) => r.level === level);
  if (run) {
    const p = previewScav(params, level, run.units);
    return (
      <span title={unitList(run.units)}>
        ⏳ <span class="mono">{duration(Math.max(0, run.returns - now))}</span>
        {p.ratio < 1 && <span class="warn"> · {Math.round(p.lossShare * 100)}% verlies</span>}
      </span>
    );
  }
  if (level > v.unlocked) return <span class="muted" title={`Rond eerst ${SCAV_NAMES[level - 1]} veilig af`}>🔒</span>;
  return null;
}

// --- one village ---------------------------------------------------------------

function OneVillage({ view, villageId, now }: { view: ScavView; villageId: number; now: number }) {
  const v = view.villages.find((x) => x.id === villageId);
  const [inputs, setInputs] = useState<UnitCounts[]>([{}, {}, {}, {}]);
  const [tplId, setTplId] = useState(DEFAULT_SCAV_TEMPLATE.id);
  useEffect(() => setInputs([{}, {}, {}, {}]), [villageId]);
  if (!v) return <p class="muted">Kies een eigen dorp.</p>;
  if (!v.hasPlace) return <p class="muted">Dit dorp heeft een verzamelplaats nodig.</p>;
  const tpl = view.templates.find((t) => t.id === tplId) ?? DEFAULT_SCAV_TEMPLATE;
  const free = (l: number) => l <= v.unlocked && !v.runs.some((r) => r.level === l);
  const set = (l: number, u: UnitId, n: number) => setInputs(inputs.map((x, i) => (i === l ? { ...x, [u]: Math.max(0, Math.min(v.home[u] ?? 0, n)) } : x)));
  const fill = () => setInputs(planScav(view.params, v.home, v.unlocked, v.runs.map((r) => r.level), tpl));
  const sendable = inputs.some((u, l) => free(l) && hasUnits(u));
  const go = (levels: number[]) => {
    const plan = LEVELS.map((l) => (levels.includes(l) && free(l) ? inputs[l]! : {}));
    send({ type: 'sendScav', plans: [{ villageId: v.id, plan }] });
    setInputs(inputs.map((x, l) => (levels.includes(l) ? {} : x)));
  };
  const units = SCAV_UNITS.filter((u) => (v.home[u] ?? 0) > 0 || v.runs.some((r) => (r.units[u] ?? 0) > 0));

  return (
    <section class="panel">
      <div class="row wrap">
        <strong>{v.name}</strong>
        <Coords x={v.x} y={v.y} />
        <span style={{ flex: 1 }} />
        <label class="row" title="Komen ze terug, dan gaan de overlevenden meteen opnieuw. Ook als je ze net nodig hebt.">
          <input type="checkbox" checked={v.repeat} onChange={(e) => send({ type: 'setScavRepeat', villages: [v.id], repeat: e.currentTarget.checked })} /> Automatisch herhalen
        </label>
        <select value={tplId} onChange={(e) => setTplId(e.currentTarget.value)}>
          {view.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button class="small" onClick={fill}>Verdelen</button>
        <Confirm label="Alles versturen" disabled={!sendable} onConfirm={() => go(LEVELS)} />
      </div>
      <p class="muted">
        Thuis: {unitList(v.home) || 'niets dat mee kan'}
      </p>
      <div class="scav-cards">
        {LEVELS.map((l) => {
          const last = v.last.find((x) => x.level === l);
          return (
            <div key={l} class={`scav-card panel ${l > v.unlocked ? 'locked' : ''}`}>
              <div class="row">
                <strong>{SCAV_NAMES[l]}</strong>
                <span style={{ flex: 1 }} />
                <RunStatus v={v} level={l} now={now} params={view.params} />
              </div>
              <div class="muted small-text">
                Veilig vanaf {num(SCAV_SAFE[l]!)} aanval · {Math.round(SCAV_FACTORS[l]! * 100)}% van de draagkracht
              </div>
              {free(l) ? (
                <>
                  <div class="scav-inputs">
                    {units.map((u) => (
                      <label key={u} title={`${UNIT_SHORT[u]}: ${num(v.home[u] ?? 0)} thuis`}>
                        <UnitIcon id={u} size={16} />
                        <input
                          type="number" min={0} max={v.home[u] ?? 0} value={inputs[l]![u] ?? ''} placeholder="0"
                          onInput={(e) => set(l, u, Number(e.currentTarget.value) || 0)}
                        />
                      </label>
                    ))}
                  </div>
                  <div class="row">
                    <Preview params={view.params} level={l} units={inputs[l]!} />
                    <span style={{ flex: 1 }} />
                    <button class="small" disabled={!hasUnits(inputs[l])} onClick={() => go([l])}>Stuur</button>
                  </div>
                </>
              ) : (
                v.runs.find((r) => r.level === l) && <div class="small-text">{unitList(v.runs.find((r) => r.level === l)!.units)}</div>
              )}
              {last && (
                <div class="muted small-text">
                  Vorige: {num(last.loot[0] + last.loot[1] + last.loot[2])} buit
                  {hasUnits(last.lost) && <span class="warn"> · verloren {unitList(last.lost)}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// --- mass ----------------------------------------------------------------------

function Mass({ view, now }: { view: ScavView; now: number }) {
  const s = snapshot.value!;
  const [tplId, setTplId] = useState(DEFAULT_SCAV_TEMPLATE.id);
  const [draft, setDraft] = useState<ScavTemplate | null>(null);
  const [group, setGroup] = useState('');
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [overrides, setOverrides] = useState<Record<string, UnitCounts>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const tpl = draft ?? view.templates.find((t) => t.id === tplId) ?? DEFAULT_SCAV_TEMPLATE;
  const rows = view.villages.filter((v) => v.hasPlace && (!group || v.groups.includes(group)));
  const isPicked = (id: number) => (picked ? picked.has(id) : true);
  const toggle = (id: number) => {
    const next = new Set(picked ?? rows.map((r) => r.id));
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  };

  const plans = useMemo(() => {
    const out = new Map<number, UnitCounts[]>();
    for (const v of rows) {
      if (!isPicked(v.id)) continue;
      const base = planScav(view.params, v.home, v.unlocked, v.runs.map((r) => r.level), tpl);
      out.set(v.id, base.map((u, l) => overrides[`${v.id}:${l}`] ?? u));
    }
    return out;
  }, [view, tpl, group, picked, overrides]);

  let runs = 0;
  let loot = 0;
  let unsafe = 0;
  for (const [, plan] of plans) plan.forEach((u, l) => {
    if (!hasUnits(u)) return;
    runs++;
    const p = previewScav(view.params, l, u);
    loot += p.loot;
    if (p.ratio < 1) unsafe++;
  });

  const editTpl = (patch: Partial<ScavTemplate>) => setDraft({ ...tpl, ...patch });
  const setRule = (u: UnitId, rule: { use?: boolean; keep?: number }) =>
    editTpl({ units: { ...tpl.units, [u]: { use: tpl.units[u]?.use ?? false, keep: tpl.units[u]?.keep ?? 0, ...rule } } });
  const saveTpl = (asNew: boolean) => {
    const name = asNew ? newName.trim() : tpl.name;
    if (!name) return;
    send({ type: 'saveScavTemplate', template: { ...tpl, id: asNew ? '' : tpl.id, name } });
    setDraft(null);
    setNewName('');
  };

  const sendAll = () => {
    send({ type: 'sendScav', plans: [...plans].map(([villageId, plan]) => ({ villageId, plan })) });
    setOverrides({});
    setEditing(null);
  };

  return (
    <>
      <section class="panel">
        <div class="row wrap">
          <h3 style={{ margin: 0 }}>Sjabloon</h3>
          <select value={tpl.id} onChange={(e) => { setTplId(e.currentTarget.value); setDraft(null); }}>
            {view.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {draft && <span class="muted">(aangepast)</span>}
          <span style={{ flex: 1 }} />
          {draft && tpl.id !== DEFAULT_SCAV_TEMPLATE.id && <button class="small" onClick={() => saveTpl(false)}>Opslaan</button>}
          <input type="text" placeholder="Naam nieuw sjabloon" value={newName} maxLength={30} onInput={(e) => setNewName(e.currentTarget.value)} style={{ width: 160 }} />
          <button class="small" disabled={!newName.trim()} onClick={() => saveTpl(true)}>Opslaan als nieuw</button>
          {tpl.id !== DEFAULT_SCAV_TEMPLATE.id && <Confirm label="Verwijderen" onConfirm={() => { send({ type: 'deleteScavTemplate', id: tpl.id }); setTplId(DEFAULT_SCAV_TEMPLATE.id); setDraft(null); }} />}
        </div>
        <div class="scav-rules">
          {SCAV_UNITS.map((u) => (
            <label key={u} class={`unit-toggle ${tpl.units[u]?.use ? 'on' : ''}`} title="Aanvinken om mee te sturen; het getal blijft thuis.">
              <input type="checkbox" checked={!!tpl.units[u]?.use} onChange={(e) => setRule(u, { use: e.currentTarget.checked })} />
              <UnitIcon id={u} size={16} /> {UNIT_SHORT[u]}
              <span class="muted small-text">houd</span>
              <input type="number" min={0} value={tpl.units[u]?.keep ?? 0} disabled={!tpl.units[u]?.use} onInput={(e) => setRule(u, { keep: Number(e.currentTarget.value) || 0 })} />
            </label>
          ))}
        </div>
        <div class="row wrap">
          {LEVELS.map((l) => (
            <label key={l} class="row">
              <input type="checkbox" checked={tpl.levels[l]} onChange={(e) => editTpl({ levels: LEVELS.map((x) => (x === l ? e.currentTarget.checked : tpl.levels[x]!)) })} /> {SCAV_NAMES[l]}
            </label>
          ))}
          <label class="row" title="Levels waar je troepen zouden verliezen vallen af; de rest krijgt hun deel.">
            <input type="checkbox" checked={tpl.safeOnly} onChange={(e) => editTpl({ safeOnly: e.currentTarget.checked })} /> Alleen veilig
          </label>
        </div>
      </section>

      <section class="panel">
        <div class="row wrap">
          <select value={group} onChange={(e) => { setGroup(e.currentTarget.value); setPicked(null); }}>
            <option value="">Alle dorpen</option>
            {s.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button class="small" onClick={() => setPicked(null)}>Alles</button>
          <button class="small" onClick={() => setPicked(new Set())}>Niets</button>
          <button class="small" onClick={() => send({ type: 'setScavRepeat', villages: rows.filter((r) => isPicked(r.id)).map((r) => r.id), repeat: true })}>Herhalen aan</button>
          <button class="small" onClick={() => send({ type: 'setScavRepeat', villages: rows.filter((r) => isPicked(r.id)).map((r) => r.id), repeat: false })}>Herhalen uit</button>
          {Object.keys(overrides).length > 0 && <button class="small" onClick={() => setOverrides({})}>Aanpassingen wissen</button>}
          <span style={{ flex: 1 }} />
          <span class="muted">
            {runs} rooftochten · {num(loot)} buit{unsafe > 0 && <span class="warn"> · {unsafe} met verlies</span>}
          </span>
          <Confirm label="Versturen" sure={`Zeker? ${runs} rooftochten`} disabled={!runs} onConfirm={sendAll} />
        </div>
        <table class="table compact scav-table">
          <thead>
            <tr>
              <th />
              <th>Dorp</th>
              <th title="Automatisch herhalen">↻</th>
              {LEVELS.map((l) => <th key={l}>{SCAV_NAMES[l]}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => {
              const plan = plans.get(v.id);
              return (
                <Fragment key={v.id}>
                  <tr class={isPicked(v.id) ? '' : 'muted'}>
                    <td><input type="checkbox" checked={isPicked(v.id)} onChange={() => toggle(v.id)} /></td>
                    <td class="ellipsis">{v.name} <Coords x={v.x} y={v.y} /></td>
                    <td>{v.repeat ? '↻' : ''}</td>
                    {LEVELS.map((l) => {
                      const key = `${v.id}:${l}`;
                      const u = plan?.[l];
                      const status = <RunStatus v={v} level={l} now={now} params={view.params} />;
                      const busy = l > v.unlocked || v.runs.some((r) => r.level === l);
                      if (busy || !plan) return <td key={l}>{status}</td>;
                      const p = hasUnits(u) ? previewScav(view.params, l, u!) : null;
                      return (
                        <td key={l}>
                          <button class={`chip ${editing === key ? 'on' : ''} ${overrides[key] ? 'edited' : ''}`} onClick={() => setEditing(editing === key ? null : key)} title={u ? unitList(u) : ''}>
                            {p ? (
                              <>
                                <span class={p.ratio >= 1 ? 'good' : 'warn'}>●</span> {num(p.loot)} · {duration(p.durationMs)}
                              </>
                            ) : '—'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                  {editing?.startsWith(`${v.id}:`) && plan && (
                    <tr>
                      <td />
                      <td colSpan={2 + SCAV_LEVELS}>
                        <CellEditor
                          v={v}
                          level={Number(editing.split(':')[1])}
                          units={plan[Number(editing.split(':')[1])]!}
                          params={view.params}
                          onChange={(units) => setOverrides({ ...overrides, [editing]: units })}
                          onReset={() => { const next = { ...overrides }; delete next[editing]; setOverrides(next); }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p class="muted">Geen dorpen met een verzamelplaats{group ? ' in deze groep' : ''}.</p>}
      </section>
    </>
  );
}

function CellEditor({ v, level, units, params, onChange, onReset }: {
  v: ScavVillageRow; level: number; units: UnitCounts; params: ScavParams;
  onChange: (u: UnitCounts) => void; onReset: () => void;
}) {
  const ids = SCAV_UNITS.filter((u) => (v.home[u] ?? 0) > 0);
  return (
    <div class="row wrap">
      <strong>{SCAV_NAMES[level]}</strong>
      {ids.map((u) => (
        <label key={u} class="row" title={`${num(v.home[u] ?? 0)} thuis`}>
          <UnitIcon id={u} size={16} />
          <input
            type="number" min={0} max={v.home[u] ?? 0} value={units[u] ?? 0} style={{ width: 70 }}
            onInput={(e) => onChange({ ...units, [u]: Math.max(0, Math.min(v.home[u] ?? 0, Number(e.currentTarget.value) || 0)) })}
          />
        </label>
      ))}
      <Preview params={params} level={level} units={units} />
      <button class="small" onClick={onReset}>Terug naar sjabloon</button>
    </div>
  );
}
