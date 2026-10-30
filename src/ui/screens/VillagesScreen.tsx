import { pickable } from '../templatesVisible';
import { UNIT_IDS } from '../../shared/gameData';
import { useSaved } from '../useSaved';
import { Coords } from '../components/Coords';
import { UnitIcon } from '../units/UnitIcon';
import { formatGameTime } from '../../shared/time';
import { num } from '../format';
import { useState } from 'preact/hooks';
import type { OwnVillageRow } from '../../shared/protocol';
import type { UnitId } from '../../shared/gameData';
import type { VillageGroup } from '../../sim/groups';
import { Confirm } from '../components/Confirm';
import { SupportReturn } from '../components/SupportReturn';
import { FlagSelect, FlagsPanel } from '../components/FlagsPanel';
import { groupFilter, groupVillages, screen, send, setGroupFilter, snapshot } from '../store';
import { UNIT_SHORT } from '../units';

/** All own villages in one table (TW "Overzichten"). Clicking a name selects that village. */
export function VillagesScreen() {
  const s = snapshot.value;
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [manage, setManage] = useSaved('villages-manage', false);
  const [suggest, setSuggest] = useSaved('villages-suggest', false);
  const [supports, setSupports] = useSaved('villages-supports', false);
  const [flagsOpen, setFlagsOpen] = useSaved('villages-flags', false);
  if (!s) return null;
  const list = groupVillages(s.villages, s.groups);
  const used = UNIT_IDS.filter((u) => list.some((v) => (v.units[u] ?? 0) > 0));
  const groupsOf = (v: OwnVillageRow) => s.groups.filter((g) => v.groups.includes(g.id));
  const toggle = (id: number) => { const n = new Set(picked); if (n.has(id)) n.delete(id); else n.add(id); setPicked(n); };
  const allPicked = list.length > 0 && list.every((v) => picked.has(v.id));
  const pickAll = () => setPicked(allPicked ? new Set() : new Set(list.map((v) => v.id)));
  const chips = (v: OwnVillageRow) => groupsOf(v).map((g) => <span key={g.id} class="group-chip" style={{ '--gc': g.color }}>{g.name}</span>);
  const nameCell = (v: OwnVillageRow) => (
    <>
      <input type="checkbox" class="pick" checked={picked.has(v.id)} onChange={() => toggle(v.id)} />
      <button class="link" onClick={() => open(v.id)}>
        {v.name}
      </button>{' '}
      <Coords x={v.x} y={v.y} />{' '}
      {v.faith === false && <span class="group-chip" style={{ '--gc': '#e5533f' }} title="Geen kerk in de buurt: troepen uit dit dorp vechten op halve kracht">geen geloof</span>}{' '}
      {chips(v)}
    </>
  );
  const open = (id: number) => {
    send({ type: 'selectVillage', id });
    screen.value = 'overview';
  };

  return (
    <div class="screen">
      <h2>Dorpen ({list.length}{list.length !== s.villages.length ? ` van ${s.villages.length}` : ''})</h2>
      <section class="panel group-bar">
        <div class="row wrap">
          <button class={`small ${!groupFilter.value ? 'active' : ''}`} onClick={() => { setGroupFilter(null); setPicked(new Set()); }}>
            Alle ({s.villages.length})
          </button>
          {s.groups.map((g) => (
            <button key={g.id} class={`small group-btn ${groupFilter.value === g.id ? 'active' : ''}`} style={{ '--gc': g.color }} onClick={() => { setGroupFilter(g.id); setPicked(new Set()); }}>
              <i /> {g.name} ({s.villages.filter((v) => v.groups.includes(g.id)).length})
            </button>
          ))}
          <span style={{ flex: 1 }} />
          {s.flags && <button class="small" onClick={() => setFlagsOpen(!flagsOpen)}>Vlaggen</button>}
          <button class="small" onClick={() => { setSupports(!supports); setSuggest(false); setManage(false); }}>Ondersteuning terugsturen</button>
          <button class="small" onClick={() => { setSuggest(!suggest); setManage(false); setSupports(false); }}>Voorstellen</button>
          <button class="small" onClick={() => { setManage(!manage); setSuggest(false); setSupports(false); }}>Groepen beheren</button>
        </div>
        {picked.size > 0 && (
          <div class="row wrap group-actions">
            <span><strong>{picked.size}</strong> geselecteerd:</span>
            {s.groups.map((g) => (
              <span key={g.id} class="group-act">
                <span class="group-chip" style={{ '--gc': g.color }}>{g.name}</span>
                <button class="small" onClick={() => send({ type: 'setGroup', group: g.id, villages: [...picked], member: true })}>+ erin</button>
                <button class="small" onClick={() => send({ type: 'setGroup', group: g.id, villages: [...picked], member: false })}>− eruit</button>
              </span>
            ))}
            {!s.groups.length && <span class="muted">Maak eerst een groep (Groepen beheren).</span>}
            <button class="small" onClick={() => setPicked(new Set())}>Selectie wissen</button>
          </div>
        )}
        {manage && <GroupManager groups={s.groups} />}
        {flagsOpen && <FlagsPanel />}
        {supports && <SupportReturn onClose={() => setSupports(false)} />}
        {suggest && <GroupSuggestions villages={s.villages} groups={s.groups} onDone={() => setSuggest(false)} />}
      </section>
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
              <th>
                <input type="checkbox" class="pick" checked={allPicked} onChange={pickAll} title="Alles selecteren" /> Dorp
              </th>
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
              {s.flags && <th>Vlag</th>}
            </tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id} class={v.id === s.village?.id ? 'current' : ''}>
                <td class="clip">{nameCell(v)}</td>
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
                {s.flags && (
                  <td><FlagSelect village={v.id} {...(v.flag ? { flag: v.flag } : {})} /></td>
                )}
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
              {list.map((v) => (
                <tr key={v.id}>
                  <td>{nameCell(v)}</td>
                  {used.map((u) => (
                    <td key={u} class="right mono">
                      {v.units[u] ? num(v.units[u] ?? 0) : <span class="muted">0</span>}
                    </td>
                  ))}
                </tr>
              ))}
              <tr class="total-row">
                <td><strong>Totaal</strong> <span class="muted">({list.length} dorpen)</span></td>
                {used.map((u) => (
                  <td key={u} class="right mono">
                    <strong>{num(list.reduce((t, v) => t + (v.units[u] ?? 0), 0))}</strong>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const GROUP_COLORS = ['#e5533f', '#4f8fd6', '#7fbf5a', '#e2a93b', '#b06ad6', '#3fb5b0', '#d65a9a', '#9a9ad6'];

/** Create, rename, recolour and delete groups; give them templates. */
function GroupManager({ groups }: { groups: VillageGroup[] }) {
  const s = snapshot.value!;
  const [drafts, setDrafts] = useState<Record<string, VillageGroup>>({});
  const draft = (g: VillageGroup) => drafts[g.id] ?? g;
  const change = (g: VillageGroup, patch: Partial<VillageGroup>) => setDrafts({ ...drafts, [g.id]: { ...draft(g), ...patch } });
  const add = () => {
    const color = GROUP_COLORS.find((c) => !groups.some((g) => g.color === c)) ?? '#9a9ad6';
    send({ type: 'saveGroup', group: { id: `group:${Date.now()}`, name: `Groep ${groups.length + 1}`, color } });
  };
  return (
    <div class="group-manager">
      <table class="table compact">
        <thead>
          <tr>
            <th>Naam</th>
            <th>Kleur</th>
            <th>Bouwsjabloon</th>
            <th>Troepensjabloon</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const d = draft(g);
            const dirty = JSON.stringify(d) !== JSON.stringify(g);
            const n = s.villages.filter((v) => v.groups.includes(g.id)).length;
            return (
              <tr key={g.id}>
                <td><input type="text" maxLength={20} value={d.name} onInput={(e) => change(g, { name: e.currentTarget.value })} /></td>
                <td><input type="color" value={d.color} onInput={(e) => change(g, { color: e.currentTarget.value })} /></td>
                <td>
                  <select value={d.template ?? ''} onChange={(e) => { const val = e.currentTarget.value; const { template: _t, ...rest } = d; void _t; setDrafts((x) => ({ ...x, [g.id]: val ? { ...rest, template: val } : rest })); }}>
                    <option value="">—</option>
                    {pickable(s.templates, d.template).map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                  </select>
                </td>
                <td>
                  <select value={d.troopTemplate ?? ''} onChange={(e) => { const val = e.currentTarget.value; const { troopTemplate: _t, ...rest } = d; void _t; setDrafts((x) => ({ ...x, [g.id]: val ? { ...rest, troopTemplate: val } : rest })); }}>
                    <option value="">—</option>
                    {pickable(s.troopTemplates, d.troopTemplate).map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                  </select>
                </td>
                <td class="right nowrap">
                  <button class="small primary" disabled={!dirty} onClick={() => { send({ type: 'saveGroup', group: d }); const x = { ...drafts }; delete x[g.id]; setDrafts(x); }}>
                    Opslaan
                  </button>{' '}
                  <Confirm label="Verwijderen" sure={n ? `Zeker? (${n} dorpen)` : 'Zeker?'} onConfirm={() => send({ type: 'deleteGroup', id: g.id })} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div class="row">
        <button class="small" onClick={add}>Nieuwe groep</button>
      </div>
      <p class="hint">
        Een dorp kan in meerdere groepen. Heeft een groep sjablonen, dan krijgt een dorp dat je eraan toevoegt die sjablonen in de accountmanager
        (bestaande dorpen in de groep veranderen niet als je de sjablonen later wijzigt).
      </p>
    </div>
  );
}

type Role = 'OFF' | 'DEF' | 'SUPP';
/** What the troops at home say a village is: offense, defense, or support (heavy cavalry). */
function roleOf(v: OwnVillageRow): Role | null {
  const u = (id: UnitId) => v.units[id] ?? 0;
  const off = u('axe') + 4 * u('light') + 5 * u('marcher') + 5 * u('ram') + 8 * u('catapult');
  const def = u('spear') + u('sword') + u('archer');
  const sup = 6 * u('heavy');
  const best = Math.max(off, def, sup);
  if (best < 200) return null;
  return best === off ? 'OFF' : best === sup ? 'SUPP' : 'DEF';
}
const ROLE_MATCH: Record<Role, RegExp> = { OFF: /off|aanv|nuke/i, DEF: /def|verd/i, SUPP: /sup|steun|zc/i };
const ROLE_COLOR: Record<Role, string> = { OFF: '#e5533f', DEF: '#4f8fd6', SUPP: '#7fbf5a' };

/** Suggests a group per village from its troops; you tick what to apply. Missing groups are made. */
function GroupSuggestions({ villages, groups, onDone }: { villages: OwnVillageRow[]; groups: VillageGroup[]; onDone: () => void }) {
  const groupFor = (r: Role) => groups.find((g) => ROLE_MATCH[r].test(g.name));
  const rows = villages
    .map((v) => ({ v, role: roleOf(v) }))
    .filter((x): x is { v: OwnVillageRow; role: Role } => x.role !== null)
    .filter((x) => { const g = groupFor(x.role); return !g || !x.v.groups.includes(g.id); });
  const [on, setOn] = useState<Set<number>>(() => new Set(rows.map((r) => r.v.id)));
  const apply = () => {
    const byRole = new Map<Role, number[]>();
    for (const r of rows) if (on.has(r.v.id)) byRole.set(r.role, [...(byRole.get(r.role) ?? []), r.v.id]);
    for (const [role, ids] of byRole) {
      let g = groupFor(role);
      if (!g) {
        g = { id: `group:${role.toLowerCase()}:${Date.now()}`, name: role, color: ROLE_COLOR[role] };
        send({ type: 'saveGroup', group: g });
      }
      send({ type: 'setGroup', group: g.id, villages: ids, member: true });
    }
    onDone();
  };
  if (!rows.length) return <p class="muted group-suggest">Geen voorstellen: elk dorp met genoeg troepen zit al in de passende groep.</p>;
  return (
    <div class="group-suggest">
      <p class="hint">Op basis van de troepen thuis: veel bijl, LC en rammen = OFF; speer, zwaard en boog = DEF; zware cavalerie = SUPP. Groepen die nog niet bestaan worden aangemaakt. Vink uit wat je niet wilt.</p>
      <table class="table compact">
        <tbody>
          {rows.map(({ v, role }) => (
            <tr key={v.id}>
              <td>
                <input type="checkbox" checked={on.has(v.id)} onChange={() => { const n = new Set(on); if (n.has(v.id)) n.delete(v.id); else n.add(v.id); setOn(n); }} />{' '}
                {v.name} <Coords x={v.x} y={v.y} />
              </td>
              <td>
                → <span class="group-chip" style={{ '--gc': groupFor(role)?.color ?? ROLE_COLOR[role] }}>{groupFor(role)?.name ?? role}</span>
                {!groupFor(role) && <span class="muted"> (nieuw)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="row">
        <button class="small primary" disabled={!on.size} onClick={apply}>Toepassen ({on.size})</button>
        <button class="small" onClick={onDone}>Annuleren</button>
      </div>
    </div>
  );
}
