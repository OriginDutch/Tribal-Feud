import { pickable } from '../templatesVisible';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useSaved } from '../useSaved';
import { Coords } from '../components/Coords';
import { BUILDING_IDS, CATAPULT_TARGETS, UNIT_IDS, type BuildingId, type UnitCounts, type UnitId } from '../../shared/gameData';
import { templateToText, textToTemplate, textToTrain, textToTroops, trainToText, troopsToText } from '../../shared/templateText';
import type { BuildTemplate, NobleTemplate, TroopTemplate } from '../../sim/manager';
import { Confirm } from '../components/Confirm';
import { num } from '../format';
import { send, snapshot } from '../store';
import { UNIT_SHORT } from '../units';
import { UnitIcon } from '../units/UnitIcon';
import { FLAG_NAMES, FLAG_TYPES, type FlagType } from '../../shared/flags';

const TROOP_UNITS: UnitId[] = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult'];

/** Account manager: a village builds along a template and keeps a troop target by itself. */
export function ManagerScreen() {
  const s = snapshot.value;
  const v = s?.village;
  const [template, setTemplate] = useSaved('manager-template', '');
  const [troopTemplate, setTroopTemplate] = useSaved('manager-troop-template', '');
  const [troops, setTroops] = useState<Partial<Record<UnitId, string>>>({});
  const [share, setShare] = useSaved('manager-share', '50');
  const [church, setChurch] = useSaved('manager-church', false);
  const [research, setResearch] = useSaved('manager-research', false);
  const [flag, setFlag] = useSaved('manager-flag', '');

  // load the village's settings whenever another village is selected (or they change)
  const key = JSON.stringify(v?.manager ?? null) + (v?.id ?? '');
  useEffect(() => {
    const m = v?.manager;
    setTemplate(m?.template ?? '');
    setTroopTemplate(m?.troopTemplate ?? '');
    const t: Partial<Record<UnitId, string>> = {};
    for (const u of UNIT_IDS) if (m?.troops?.[u]) t[u] = String(m.troops[u]);
    setTroops(t);
    setShare(String(Math.round((m?.troopShare ?? 0.5) * 100)));
    setChurch(!!m?.church);
    setResearch(!!m?.research);
    setFlag(m?.flag ?? '');
  }, [key]);

  if (!s || !v) return null;
  const units = v.units.filter((u) => u.enabled && TROOP_UNITS.includes(u.id));
  const churchesOn = v.buildings.some((b) => b.id === 'church');
  const levelsOn = v.units.some((u) => u.tech);
  const flagsOn = !!s.flags;
  const chosen = s.troopTemplates.find((t) => t.id === troopTemplate);

  const manager = () => {
    const t: UnitCounts = {};
    for (const u of TROOP_UNITS) {
      const n = Math.floor(Number(troops[u] ?? 0));
      if (n > 0) t[u] = n;
    }
    return {
      troopShare: Math.min(100, Math.max(0, Number(share) || 0)) / 100,
      ...(template ? { template } : {}),
      ...(chosen ? { troopTemplate: chosen.id } : Object.keys(t).length > 0 ? { troops: t } : {}),
      ...(church ? { church: true } : {}),
      ...(research ? { research: true } : {}),
      ...(flag ? { flag: flag as FlagType } : {}),
    };
  };

  return (
    <div class="screen narrow">
      <h2>Accountmanager</h2>
      <section class="panel">
        <h3>
          {v.name} <Coords x={v.x} y={v.y} /> {v.manager ? <span class="tag-on">aan</span> : <span class="muted">uit</span>}
        </h3>
        <label>
          Bouwsjabloon
          <select value={template} onChange={(e) => setTemplate(e.currentTarget.value)}>
            <option value="">Geen (zelf bouwen)</option>
            {pickable(s.templates, template).map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <p class="hint">
          Het dorp zet zelf de volgende stap in de bouwqueue (max 2 tegelijk) zodra er grondstoffen zijn. Voorbeeldsjablonen
          houden de grondstoffen in balans zoals de bots; eigen sjablonen volgen precies jouw stappen. Een volle boerderij of
          opslag wordt altijd eerst opgelost.
        </p>
        <h4>Troepen aanhouden</h4>
        <label>
          Troepensjabloon
          <select value={troopTemplate} onChange={(e) => setTroopTemplate(e.currentTarget.value)}>
            <option value="">Eigen aantallen voor dit dorp</option>
            {pickable(s.troopTemplates, troopTemplate).map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div class="template-units">
          {units.map((u) => (
            <label key={u.id} title={u.name}>
              <span class="unit-name">
                <UnitIcon id={u.id} size={18} /> {UNIT_SHORT[u.id]}
              </span>
              <input
                type="number"
                min={0}
                placeholder="0"
                disabled={!!chosen}
                value={chosen ? (chosen.troops[u.id] ?? '') : (troops[u.id] ?? '')}
                onInput={(e) => setTroops({ ...troops, [u.id]: e.currentTarget.value })}
              />
            </label>
          ))}
        </div>
        {chosen && <p class="hint">Aantallen komen uit "{chosen.name}". Pas je dat sjabloon aan, dan volgen alle dorpen die het gebruiken.</p>}
        <label>
          Max deel van de vrije grondstoffen voor troepen: {share}%
          <input type="range" min={0} max={100} step={5} value={share} onInput={(e) => setShare(e.currentTarget.value)} />
        </label>
        <p class="hint">
          Telt troepen thuis, onderweg en in opleiding. Wat nog onderzocht moet worden, onderzoekt het dorp eerst. Bouwen gaat voor:
          het geld voor het volgende gebouw blijft liggen.
        </p>
        {(churchesOn || levelsOn || flagsOn) && <h4>Extra</h4>}
        {churchesOn && (
          <label class="row" title="Heeft het dorp geen geloof, dan bouwt de manager een kerk (of de eerste kerk opnieuw).">
            <input type="checkbox" checked={church} onChange={(e) => setChurch(e.currentTarget.checked)} /> Kerk bouwen als het dorp geen geloof heeft
          </label>
        )}
        {levelsOn && (
          <label class="row" title="De eenheden uit het troependoel gaan een level omhoog als er geld genoeg over is (na het bouwen).">
            <input type="checkbox" checked={research} onChange={(e) => setResearch(e.currentTarget.checked)} /> Researchlevels van de troepen verhogen
          </label>
        )}
        {flagsOn && (
          <label>
            Vlag
            <select value={flag} onChange={(e) => setFlag(e.currentTarget.value)}>
              <option value="">Zelf kiezen</option>
              {FLAG_TYPES.map((f) => <option key={f} value={String(f)}>{FLAG_NAMES[f]} (beste losse)</option>)}
            </select>
          </label>
        )}
        <div class="row">
          <button class="primary" onClick={() => send({ type: 'setManager', villageId: v.id, manager: manager() })}>
            Opslaan voor dit dorp
          </button>
          <Confirm
            label={`Op alle dorpen (${s.villages.length})`}
            sure={`Alle ${s.villages.length} dorpen overschrijven?`}
            cls="wide-confirm"
            disabled={s.villages.length < 2}
            onConfirm={() => send({ type: 'setManagerAll', manager: manager() })}
          />
          <Confirm label="Uitzetten" sure="Manager uitzetten?" disabled={!v.manager} onConfirm={() => send({ type: 'setManager', villageId: v.id, manager: null })} />
        </div>
      </section>
      <BuildTemplates templates={s.templates} use={s.templateUse} />
      <TroopTemplates templates={s.troopTemplates} use={s.templateUse} />
      <NobleTemplates templates={s.nobleTemplates} />
    </div>
  );
}

/** Paste box: check first, then add (shows what it found before it adds anything). */
function ImportBox<T extends { name: string }>({ parse, summary, onAdd, onClose, placeholder }: {
  parse: (text: string) => T | { error: string };
  summary: (t: T) => string;
  onAdd: (t: T) => void;
  onClose: () => void;
  placeholder: string;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<T | { error: string } | null>(null);
  const ok = result && !('error' in result) ? result : null;
  return (
    <div class="template-io">
      <textarea rows={8} value={text} placeholder={placeholder} onInput={(e) => { setText(e.currentTarget.value); setResult(null); }} />
      {result && 'error' in result && <p class="error">{result.error}</p>}
      {ok && <p class="hint">Gevonden: "{ok.name}" — {summary(ok)}.</p>}
      <div class="row">
        {ok ? (
          <button class="primary small" onClick={() => { onAdd(ok); onClose(); }}>
            Toevoegen
          </button>
        ) : (
          <button class="small" disabled={!text.trim()} onClick={() => setResult(parse(text))}>
            Controleren
          </button>
        )}
        <button class="small" onClick={onClose}>
          Annuleren
        </button>
      </div>
    </div>
  );
}

/** Read-only text of a template, ready to copy. */
function ExportBox({ text, onClose }: { text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div class="template-io">
      <textarea rows={8} value={text} readOnly onFocus={(e) => e.currentTarget.select()} />
      <div class="row">
        <button class="small" onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => undefined)}>
          {copied ? 'Gekopieerd' : 'Kopiëren'}
        </button>
        <button class="small" onClick={onClose}>
          Sluiten
        </button>
      </div>
    </div>
  );
}

const usedBy = (use: Record<string, number>, id: string) => use[id] ?? 0;

const isHidden = (id: string) => (snapshot.value?.hiddenTemplates ?? []).includes(id);

/** Hidden templates keep working where they are used; they only leave the lists and pickers. */
function HideButton({ id }: { id: string }) {
  const hidden = isHidden(id);
  return (
    <button class="small" title={hidden ? 'Weer in de lijst en de keuzemenu\'s' : 'Uit de lijst en de keuzemenu\'s; blijft werken waar het al gebruikt wordt'} onClick={() => send({ type: 'setTemplateHidden', id, hidden: !hidden })}>
      {hidden ? 'Tonen' : 'Verbergen'}
    </button>
  );
}

/** The templates, with the hidden ones folded away under "Verborgen sjablonen". */
function SplitTable<T extends { id: string }>({ items, row }: { items: T[]; row: (t: T) => ComponentChildren }) {
  const shown = items.filter((t) => !isHidden(t.id));
  const hidden = items.filter((t) => isHidden(t.id));
  return (
    <>
      {shown.length > 0 ? (
        <table class="table">
          <tbody>{shown.map(row)}</tbody>
        </table>
      ) : (
        <p class="muted">Alles is verborgen.</p>
      )}
      {hidden.length > 0 && (
        <details class="hidden-templates">
          <summary>Verborgen sjablonen ({hidden.length})</summary>
          <table class="table">
            <tbody>{hidden.map(row)}</tbody>
          </table>
        </details>
      )}
    </>
  );
}
const deleteSure = (n: number) => (n > 0 ? `Zeker? (${n} ${n === 1 ? 'dorp' : 'dorpen'})` : 'Zeker?');

function BuildTemplates({ templates, use }: { templates: BuildTemplate[]; use: Record<string, number> }) {
  const s = snapshot.value;
  const [editing, setEditing] = useState<BuildTemplate | null>(null);
  const [io, setIo] = useState<{ mode: 'import' } | { mode: 'export'; text: string } | null>(null);
  const names = Object.fromEntries((s?.village?.buildings ?? []).map((b) => [b.id, b.name])) as Record<BuildingId, string>;
  const copy = (t: BuildTemplate) =>
    setEditing({ id: `own:${Date.now()}`, name: `${t.name} (kopie)`.slice(0, 40), steps: t.steps.map(([b, l]) => [b, l]) });

  return (
    <section class="panel">
      <div class="row">
        <h3 style={{ flex: 1 }}>Bouwsjablonen</h3>
        {!editing && (
          <>
            <button class="small" onClick={() => { setIo(null); setEditing({ id: `own:${Date.now()}`, name: 'Nieuw sjabloon', steps: [['wood', 1]] }); }}>
              Nieuw
            </button>
            <button class="small" onClick={() => setIo(io?.mode === 'import' ? null : { mode: 'import' })}>
              Importeren
            </button>
          </>
        )}
      </div>
      {io?.mode === 'import' && !editing && (
        <ImportBox
          parse={textToTemplate}
          summary={(t) => `${t.steps.length} stappen`}
          placeholder={'# Naam van het sjabloon\nHouthakker 2\nLeemgroeve 2\nHoofdgebouw 3\n...'}
          onAdd={(t) => send({ type: 'saveTemplate', template: { id: `own:${Date.now()}`, name: t.name, steps: t.steps } })}
          onClose={() => setIo(null)}
        />
      )}
      {io?.mode === 'export' && !editing && <ExportBox text={io.text} onClose={() => setIo(null)} />}
      {!editing ? (
        <SplitTable items={templates} row={(t) => {
              const own = !t.id.startsWith('preset:');
              const n = usedBy(use, t.id);
              return (
                <tr key={t.id}>
                  <td>
                    {t.name} {!own && <span class="muted">(voorbeeld)</span>}
                  </td>
                  <td class="muted">
                    {t.steps.length} stappen{t.demolish ? ' · breekt af' : ''}{n > 0 ? ` · ${n} ${n === 1 ? 'dorp' : 'dorpen'}` : ''}
                  </td>
                  <td class="right nowrap">
                    {own && (
                      <button class="small" onClick={() => setEditing({ ...t, steps: t.steps.map(([b, l]) => [b, l]) })}>
                        Bewerken
                      </button>
                    )}{' '}
                    <button class="small" onClick={() => copy(t)}>
                      Kopie maken
                    </button>{' '}
                    <button class="small" onClick={() => setIo({ mode: 'export', text: templateToText(t.name, t.steps) })}>
                      Exporteren
                    </button>{' '}
                    <HideButton id={t.id} />{' '}
                    {own && <Confirm label="Verwijderen" sure={deleteSure(n)} onConfirm={() => send({ type: 'deleteTemplate', id: t.id })} />}
                  </td>
                </tr>
              );
            }} />
      ) : (
        <div>
          <label>
            Naam
            <input type="text" maxLength={40} value={editing.name} onInput={(e) => setEditing({ ...editing, name: e.currentTarget.value })} />
          </label>
          <table class="table compact">
            <tbody>
              {editing.steps.map(([b, l], i) => (
                <tr key={i}>
                  <td class="muted mono">{i + 1}</td>
                  <td>
                    <select
                      value={b}
                      onChange={(e) => {
                        const steps = [...editing.steps];
                        steps[i] = [e.currentTarget.value as BuildingId, l];
                        setEditing({ ...editing, steps });
                      }}
                    >
                      {BUILDING_IDS.map((id) => (
                        <option key={id} value={String(id)}>
                          {names[id] ?? id}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    tot level{' '}
                    <input
                      type="number"
                      min={1}
                      style={{ width: '70px' }}
                      value={l}
                      onInput={(e) => {
                        const steps = [...editing.steps];
                        steps[i] = [b, Math.floor(Number(e.currentTarget.value) || 1)];
                        setEditing({ ...editing, steps });
                      }}
                    />
                  </td>
                  <td class="right nowrap">
                    <button
                      class="small"
                      disabled={i === 0}
                      onClick={() => {
                        const steps = [...editing.steps];
                        [steps[i - 1], steps[i]] = [steps[i] as [BuildingId, number], steps[i - 1] as [BuildingId, number]];
                        setEditing({ ...editing, steps });
                      }}
                    >
                      ↑
                    </button>{' '}
                    <button
                      class="small"
                      disabled={i === editing.steps.length - 1}
                      onClick={() => {
                        const steps = [...editing.steps];
                        [steps[i + 1], steps[i]] = [steps[i] as [BuildingId, number], steps[i + 1] as [BuildingId, number]];
                        setEditing({ ...editing, steps });
                      }}
                    >
                      ↓
                    </button>{' '}
                    <button class="small danger" onClick={() => setEditing({ ...editing, steps: editing.steps.filter((_, j) => j !== i) })}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div class="row">
            <button onClick={() => setEditing({ ...editing, steps: [...editing.steps, ['wood', 1]] })}>Stap toevoegen</button>
            <button
              class="primary"
              onClick={() => {
                send({ type: 'saveTemplate', template: editing });
                setEditing(null);
              }}
            >
              Opslaan
            </button>
            <Confirm label="Annuleren" sure="Wijzigingen weggooien?" onConfirm={() => setEditing(null)} />
          </div>
          <label class="inline" title="Als alle stappen er staan, breekt de manager gebouwen die hoger staan dan in dit sjabloon één level per keer af. De boerderij nooit; gebouwen die niet in het sjabloon staan blijven staan.">
            <input type="checkbox" checked={!!editing.demolish} onChange={(e) => setEditing({ ...editing, ...(e.currentTarget.checked ? { demolish: true } : { demolish: undefined }) })} /> Afbreken wat hoger staat dan dit sjabloon
          </label>
          <p class="hint">{num(editing.steps.length)} stappen. Een stap is klaar zodra het gebouw dat level heeft (of in de queue staat).</p>
        </div>
      )}
    </section>
  );
}

function TroopTemplates({ templates, use }: { templates: TroopTemplate[]; use: Record<string, number> }) {
  const [editing, setEditing] = useState<{ id: string; name: string; troops: Partial<Record<UnitId, string>> } | null>(null);
  const [io, setIo] = useState<{ mode: 'import' } | { mode: 'export'; text: string } | null>(null);
  const summary = (t: UnitCounts) =>
    TROOP_UNITS.filter((u) => (t[u] ?? 0) > 0)
      .map((u) => `${num(t[u]!)} ${UNIT_SHORT[u]}`)
      .join(' · ');
  const edit = (t: TroopTemplate) => setEditing({ id: t.id, name: t.name, troops: Object.fromEntries(Object.entries(t.troops).map(([u, n]) => [u, String(n)])) });

  return (
    <section class="panel">
      <div class="row">
        <h3 style={{ flex: 1 }}>Troepensjablonen</h3>
        {!editing && (
          <>
            <button class="small" onClick={() => { setIo(null); setEditing({ id: `troops:${Date.now()}`, name: 'Nieuw troepensjabloon', troops: {} }); }}>
              Nieuw
            </button>
            <button class="small" onClick={() => setIo(io?.mode === 'import' ? null : { mode: 'import' })}>
              Importeren
            </button>
          </>
        )}
      </div>
      {io?.mode === 'import' && !editing && (
        <ImportBox
          parse={textToTroops}
          summary={(t) => summary(t.troops)}
          placeholder={'# Offensief\nBijl 8000\nLC 2000\nRam 250\nVerkenner 50'}
          onAdd={(t) => send({ type: 'saveTroopTemplate', template: { id: `troops:${Date.now()}`, name: t.name, troops: t.troops } })}
          onClose={() => setIo(null)}
        />
      )}
      {io?.mode === 'export' && !editing && <ExportBox text={io.text} onClose={() => setIo(null)} />}
      {!editing ? (
        templates.length === 0 ? (
          <p class="muted">Nog geen troepensjablonen. Maak er een voor bijvoorbeeld offensieve, defensieve of support-dorpen.</p>
        ) : (
          <SplitTable items={templates} row={(t) => {
                const n = usedBy(use, t.id);
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td class="muted">
                      {summary(t.troops)}
                      {n > 0 ? ` · ${n} ${n === 1 ? 'dorp' : 'dorpen'}` : ''}
                    </td>
                    <td class="right nowrap">
                      <button class="small" onClick={() => edit(t)}>
                        Bewerken
                      </button>{' '}
                      <button class="small" onClick={() => setIo({ mode: 'export', text: troopsToText(t.name, t.troops) })}>
                        Exporteren
                      </button>{' '}
                      <HideButton id={t.id} />{' '}
                      <Confirm label="Verwijderen" sure={deleteSure(n)} onConfirm={() => send({ type: 'deleteTroopTemplate', id: t.id })} />
                    </td>
                  </tr>
                );
              }} />
        )
      ) : (
        <div>
          <label>
            Naam
            <input type="text" maxLength={40} value={editing.name} onInput={(e) => setEditing({ ...editing, name: e.currentTarget.value })} />
          </label>
          <div class="template-units">
            {TROOP_UNITS.map((u) => (
              <label key={u}>
                <span class="unit-name">
                  <UnitIcon id={u} size={18} /> {UNIT_SHORT[u]}
                </span>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={editing.troops[u] ?? ''}
                  onInput={(e) => setEditing({ ...editing, troops: { ...editing.troops, [u]: e.currentTarget.value } })}
                />
              </label>
            ))}
          </div>
          <div class="row">
            <button
              class="primary"
              onClick={() => {
                const troops: UnitCounts = {};
                for (const u of TROOP_UNITS) {
                  const n = Math.floor(Number(editing.troops[u] ?? 0));
                  if (n > 0) troops[u] = n;
                }
                send({ type: 'saveTroopTemplate', template: { id: editing.id, name: editing.name, troops } });
                setEditing(null);
              }}
            >
              Opslaan
            </button>
            <Confirm label="Annuleren" sure="Wijzigingen weggooien?" onConfirm={() => setEditing(null)} />
          </div>
          <p class="hint">Telt troepen thuis, onderweg en in opleiding, zoals de eigen aantallen per dorp.</p>
        </div>
      )}
    </section>
  );
}

type Wave = Partial<Record<UnitId, string>>;
const waveCounts = (w: Wave): UnitCounts => {
  const out: UnitCounts = {};
  for (const u of TROOP_UNITS) {
    const n = Math.floor(Number(w[u] ?? 0));
    if (n > 0) out[u] = n;
  }
  return out;
};
const waveStrings = (u: UnitCounts): Wave => Object.fromEntries(Object.entries(u).map(([k, n]) => [k, String(n)]));

/** Noble trains you use often: the first attack, an escort per extra nobleman, and the catapult target. */
function NobleTemplates({ templates }: { templates: NobleTemplate[] }) {
  const s = snapshot.value;
  const [editing, setEditing] = useState<{ id: string; name: string; waves: Wave[]; catapultTarget: BuildingId | ''; clearFirst: boolean } | null>(null);
  const [io, setIo] = useState<{ mode: 'import' } | { mode: 'export'; text: string } | null>(null);
  const names = Object.fromEntries((s?.village?.buildings ?? []).map((b) => [b.id, b.name])) as Record<BuildingId, string>;
  const summary = (t: NobleTemplate) => {
    const total: UnitCounts = { ...t.first };
    for (const e of t.escorts) for (const [u, n] of Object.entries(e) as [UnitId, number][]) total[u] = (total[u] ?? 0) + n;
    return `${1 + t.escorts.length} edels · ` + TROOP_UNITS.filter((u) => (total[u] ?? 0) > 0).map((u) => `${num(total[u]!)} ${UNIT_SHORT[u]}`).join(' · ');
  };
  const setWave = (i: number, u: UnitId, value: string) => {
    if (!editing) return;
    const waves = [...editing.waves];
    waves[i] = { ...waves[i], [u]: value };
    setEditing({ ...editing, waves });
  };

  return (
    <section class="panel">
      <div class="row">
        <h3 style={{ flex: 1 }}>Edeltrein-sjablonen</h3>
        {!editing && (
          <>
            <button class="small" onClick={() => { setIo(null); setEditing({ id: `train:${Date.now()}`, name: 'Nieuwe edeltrein', waves: [{}, {}, {}, {}], catapultTarget: '', clearFirst: false }); }}>
              Nieuw
            </button>
            <button class="small" onClick={() => setIo(io?.mode === 'import' ? null : { mode: 'import' })}>
              Importeren
            </button>
          </>
        )}
      </div>
      {io?.mode === 'import' && !editing && (
        <ImportBox
          parse={textToTrain}
          summary={(t) => `${t.escorts.length + (t.clearFirst ? 0 : 1)} edels${t.clearFirst ? ' + clear' : ''}${t.catapultTarget ? `, katapulten op ${names[t.catapultTarget] ?? t.catapultTarget}` : ''}`}
          placeholder={'# Clear + 3 edels\nKatapultdoel: Smederij\nEdel 1: Bijl 6000, LC 2000, Ram 250, Katapult 50\nEdel 2: Bijl 200, LC 50\nEdel 3: Bijl 200, LC 50\nEdel 4: LC 100'}
          onAdd={(t) => send({ type: 'saveNobleTemplate', template: { id: `train:${Date.now()}`, name: t.name, first: t.first, escorts: t.escorts, ...(t.catapultTarget ? { catapultTarget: t.catapultTarget } : {}), ...(t.clearFirst ? { clearFirst: true } : {}) } })}
          onClose={() => setIo(null)}
        />
      )}
      {io?.mode === 'export' && !editing && <ExportBox text={io.text} onClose={() => setIo(null)} />}
      {!editing ? (
        templates.length === 0 ? (
          <p class="muted">Nog geen edeltrein-sjablonen. Maak er hier een, of stel een trein samen in de verzamelplaats en kies "Opslaan als sjabloon".</p>
        ) : (
          <SplitTable items={templates} row={(t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td class="muted">
                    {summary(t)}
                    {t.catapultTarget ? ` · kata op ${names[t.catapultTarget] ?? t.catapultTarget}` : ''}
                  </td>
                  <td class="right nowrap">
                    <button class="small" onClick={() => setEditing({ id: t.id, name: t.name, waves: [waveStrings(t.first), ...t.escorts.map(waveStrings)], catapultTarget: t.catapultTarget ?? '', clearFirst: !!t.clearFirst })}>
                      Bewerken
                    </button>{' '}
                    <button class="small" onClick={() => setIo({ mode: 'export', text: trainToText(t.name, t.first, t.escorts, t.catapultTarget, t.clearFirst) })}>
                      Exporteren
                    </button>{' '}
                    <HideButton id={t.id} />{' '}
                    <Confirm label="Verwijderen" onConfirm={() => send({ type: 'deleteNobleTemplate', id: t.id })} />
                  </td>
                </tr>
              )} />
        )
      ) : (
        <div>
          <div class="row wrap">
            <label style={{ flex: 1 }}>
              Naam
              <input type="text" maxLength={40} value={editing.name} onInput={(e) => setEditing({ ...editing, name: e.currentTarget.value })} />
            </label>
            <label>
              Katapultdoel
              <select value={editing.catapultTarget} onChange={(e) => setEditing({ ...editing, catapultTarget: e.currentTarget.value as BuildingId | '' })}>
                <option value="">geen</option>
                {CATAPULT_TARGETS.map((b) => (
                  <option key={b} value={String(b)}>
                    {names[b] ?? b}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div class="table-scroll">
            <table class="table compact train-editor">
              <thead>
                <tr>
                  <th />
                  {TROOP_UNITS.map((u) => (
                    <th key={u} class="right" title={UNIT_SHORT[u]}>
                      <UnitIcon id={u} size={16} />
                    </th>
                  ))}
                  <th class="right" title="Elke wave heeft één edelman">
                    <UnitIcon id="snob" size={16} />
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {editing.waves.map((w, i) => (
                  <tr key={i}>
                    <td class="nowrap">Edel {i + 1}</td>
                    {TROOP_UNITS.map((u) => (
                      <td key={u} class="right">
                        <input type="number" min={0} placeholder="0" value={w[u] ?? ''} onInput={(e) => setWave(i, u, e.currentTarget.value)} />
                      </td>
                    ))}
                    <td class="right mono" title={i === 0 && editing.clearFirst ? 'Pure clear: geen edelman' : 'Elke wave heeft één edelman'}>{i === 0 && editing.clearFirst ? 0 : 1}</td>
                    <td class="right">
                      {i > 1 && (
                        <button class="small danger" title="Edel weghalen" onClick={() => setEditing({ ...editing, waves: editing.waves.filter((_, j) => j !== i) })}>
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div class="row">
            <button disabled={editing.waves.length >= 5} onClick={() => setEditing({ ...editing, waves: [...editing.waves, {}] })}>
              Edel toevoegen
            </button>
            <label class="row" title="De eerste aanval is een pure clear zonder edelman; de edels volgen in de waves daarna.">
              <input type="checkbox" checked={editing.clearFirst} onChange={(e) => setEditing({ ...editing, clearFirst: e.currentTarget.checked })} /> Eerste wave zonder edel (pure clear)
            </label>
            <button
              class="primary"
              onClick={() => {
                const [first, ...escorts] = editing.waves.map(waveCounts);
                send({ type: 'saveNobleTemplate', template: { id: editing.id, name: editing.name, first: first ?? {}, escorts, ...(editing.catapultTarget ? { catapultTarget: editing.catapultTarget } : {}), ...(editing.clearFirst ? { clearFirst: true } : {}) } });
                setEditing(null);
              }}
            >
              Opslaan
            </button>
            <Confirm label="Annuleren" sure="Wijzigingen weggooien?" onConfirm={() => setEditing(null)} />
          </div>
          <p class="hint">Edel 1 is de eerste aanval (de clear), standaard mét edelman; vink "zonder edel" aan voor een pure clear. Elke volgende wave heeft één edelman en zijn eigen escort. 2 tot 5 aanvallen.</p>
        </div>
      )}
    </section>
  );
}
