import { useEffect, useState } from 'preact/hooks';
import { BUILDING_IDS, UNIT_IDS, type BuildingId, type UnitCounts, type UnitId } from '../../shared/gameData';
import type { BuildTemplate } from '../../sim/manager';
import { num } from '../format';
import { send, snapshot } from '../store';
import { UNIT_SHORT } from '../units';

const TROOP_UNITS: UnitId[] = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult'];

/** Account manager: a village builds along a template and keeps a troop target by itself. */
export function ManagerScreen() {
  const s = snapshot.value;
  const v = s?.village;
  const [template, setTemplate] = useState('');
  const [troops, setTroops] = useState<Partial<Record<UnitId, string>>>({});
  const [share, setShare] = useState('50');

  // load the village's settings whenever another village is selected (or they change)
  const key = JSON.stringify(v?.manager ?? null) + (v?.id ?? '');
  useEffect(() => {
    const m = v?.manager;
    setTemplate(m?.template ?? '');
    const t: Partial<Record<UnitId, string>> = {};
    for (const u of UNIT_IDS) if (m?.troops?.[u]) t[u] = String(m.troops[u]);
    setTroops(t);
    setShare(String(Math.round((m?.troopShare ?? 0.5) * 100)));
  }, [key]);

  if (!s || !v) return null;
  const units = v.units.filter((u) => u.enabled && TROOP_UNITS.includes(u.id));

  const manager = () => {
    const t: UnitCounts = {};
    for (const u of TROOP_UNITS) {
      const n = Math.floor(Number(troops[u] ?? 0));
      if (n > 0) t[u] = n;
    }
    return {
      troopShare: Math.min(100, Math.max(0, Number(share) || 0)) / 100,
      ...(template ? { template } : {}),
      ...(Object.keys(t).length > 0 ? { troops: t } : {}),
    };
  };

  return (
    <div class="screen">
      <h2>Accountmanager</h2>
      <section class="panel">
        <h3>
          {v.name} <span class="muted">({v.x}|{v.y})</span> {v.manager ? <span class="tag-on">aan</span> : <span class="muted">uit</span>}
        </h3>
        <label>
          Bouwsjabloon
          <select value={template} onChange={(e) => setTemplate(e.currentTarget.value)}>
            <option value="">Geen (zelf bouwen)</option>
            {s.templates.map((t) => (
              <option key={t.id} value={t.id}>
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
        <div class="template-units">
          {units.map((u) => (
            <label key={u.id} title={u.name}>
              {UNIT_SHORT[u.id]}
              <input
                type="number"
                min={0}
                placeholder="0"
                value={troops[u.id] ?? ''}
                onInput={(e) => setTroops({ ...troops, [u.id]: e.currentTarget.value })}
              />
            </label>
          ))}
        </div>
        <label>
          Max deel van de vrije grondstoffen voor troepen: {share}%
          <input type="range" min={0} max={100} step={5} value={share} onInput={(e) => setShare(e.currentTarget.value)} />
        </label>
        <p class="hint">
          Telt troepen thuis, onderweg en in opleiding. Wat nog onderzocht moet worden, onderzoekt het dorp eerst. Bouwen gaat voor:
          het geld voor het volgende gebouw blijft liggen.
        </p>
        <div class="row">
          <button class="primary" onClick={() => send({ type: 'setManager', villageId: v.id, manager: manager() })}>
            Opslaan voor dit dorp
          </button>
          <button disabled={s.villages.length < 2} onClick={() => send({ type: 'setManagerAll', manager: manager() })}>
            Op alle dorpen ({s.villages.length})
          </button>
          <button disabled={!v.manager} onClick={() => send({ type: 'setManager', villageId: v.id, manager: null })}>
            Uitzetten
          </button>
        </div>
      </section>
      <TemplateEditor templates={s.templates} />
    </div>
  );
}

function TemplateEditor({ templates }: { templates: BuildTemplate[] }) {
  const s = snapshot.value;
  const [editing, setEditing] = useState<BuildTemplate | null>(null);
  const names = Object.fromEntries((s?.village?.buildings ?? []).map((b) => [b.id, b.name])) as Record<BuildingId, string>;

  const copy = (t: BuildTemplate) =>
    setEditing({ id: `own:${Date.now()}`, name: `${t.name} (kopie)`.slice(0, 40), steps: t.steps.map(([b, l]) => [b, l]) });

  return (
    <section class="panel">
      <h3>Sjablonen</h3>
      {!editing ? (
        <table class="table">
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td class="muted">{t.steps.length} stappen</td>
                <td class="right nowrap">
                  <button class="small" onClick={() => copy(t)}>
                    Kopie maken
                  </button>{' '}
                  {!t.id.startsWith('preset:') && (
                    <>
                      <button class="small" onClick={() => setEditing({ ...t, steps: t.steps.map(([b, l]) => [b, l]) })}>
                        Bewerken
                      </button>{' '}
                      <button class="small danger" onClick={() => send({ type: 'deleteTemplate', id: t.id })}>
                        Verwijderen
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
                        <option key={id} value={id}>
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
            <button onClick={() => setEditing(null)}>Annuleren</button>
          </div>
          <p class="hint">{num(editing.steps.length)} stappen. Een stap is klaar zodra het gebouw dat level heeft (of in de queue staat).</p>
        </div>
      )}
    </section>
  );
}
