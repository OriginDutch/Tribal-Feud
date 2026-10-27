import { useEffect, useState } from 'preact/hooks';
import { CATAPULT_TARGETS, DEFAULT_BUILDINGS, UNIT_IDS, type BuildingId, type UnitCounts, type UnitId } from '../../shared/gameData';
import { num } from '../format';
import { send, simPrefill, simResult, snapshot } from '../store';
import { UnitIcon } from '../units/UnitIcon';
import { UNIT_SHORT } from '../units';

const ITEM_OPTIONS: [string, string][] = [
  ['', 'geen'], ['halberd', 'Hellebaard (speer)'], ['longsword', 'Langzwaard (zwaard)'], ['battleaxe', 'Strijdbijl (bijl)'],
  ['longbow', 'Langboog (boog)'], ['lance', 'Lans (LC)'], ['compositebow', 'Composietboog (BB)'], ['banner', 'Banier (ZC)'],
  ['morningstar', 'Morgenster (rammen ×2)'], ['bonfire', 'Vreugdevuur (katapulten)'],
];
type Counts = Partial<Record<UnitId, string>>;
const toCounts = (c: Counts): UnitCounts => {
  const out: UnitCounts = {};
  for (const u of UNIT_IDS) { const n = Math.floor(Number(c[u] ?? 0)); if (n > 0) out[u] = n; }
  return out;
};
const toStrings = (c: UnitCounts): Counts => Object.fromEntries(Object.entries(c).map(([k, n]) => [k, String(n)]));

/** Battle simulator: the same battle code as the game, with every modifier as a knob. */
export function SimulatorScreen() {
  const s = snapshot.value;
  const [att, setAtt] = useState<Counts>({});
  const [def, setDef] = useState<Counts>({});
  const [wall, setWall] = useState('0');
  const [morale, setMorale] = useState('100');
  const [luck, setLuck] = useState('0');
  const [attPct, setAttPct] = useState('100');
  const [defPct, setDefPct] = useState('100');
  const [attItem, setAttItem] = useState('');
  const [defItem, setDefItem] = useState('');
  const [cat, setCat] = useState<BuildingId>('main');
  const [catLevel, setCatLevel] = useState('20');
  const [tech, setTech] = useState(false);

  // a report asked for a re-run
  useEffect(() => {
    const p = simPrefill.value;
    if (!p) return;
    setAtt(toStrings(p.attacker));
    setDef(toStrings(p.defender));
    setWall(String(p.wall));
    setMorale(String(Math.round(p.morale * 100)));
    setLuck(String(Math.round(p.luck * 1000) / 10));
    simPrefill.value = null;
  }, [simPrefill.value]);

  const input = {
    attacker: toCounts(att), defender: toCounts(def), wall: Number(wall) || 0,
    morale: (Number(morale) || 100) / 100, luck: (Number(luck) || 0) / 100,
    attackerPercent: Number(attPct) || 100, defenderPercent: Number(defPct) || 100,
    ...(attItem ? { attackerItem: attItem } : {}), ...(defItem ? { defenderItem: defItem } : {}),
    ...((toCounts(att).catapult ?? 0) > 0 ? { catapultTarget: cat, targetLevel: Number(catLevel) || 0 } : {}),
    ...(tech && s?.village ? { techVillage: s.village.id } : {}),
  };
  const key = JSON.stringify(input);
  useEffect(() => { send({ type: 'simulate', input }); }, [key]);
  if (!s) return null;
  const r = simResult.value;
  const enabled = UNIT_IDS.filter((u) => u === 'archer' || u === 'marcher' ? s.village?.units.some((x) => x.id === u && x.enabled) ?? true : true);
  const left = (c: UnitCounts, lost: UnitCounts | undefined, u: UnitId) => (c[u] ?? 0) - (lost?.[u] ?? 0);
  const levelsWorld = s.village?.units.some((u) => u.tech);

  return (
    <div class="screen">
      <h2>Gevechtssimulator</h2>
      <div class="sim-layout">
        <section class="panel">
          <div class="row wrap">
            <button class="small" onClick={() => setAtt(toStrings(Object.fromEntries((s.village?.units ?? []).filter((u) => u.home > 0).map((u) => [u.id, u.home])) as UnitCounts))}>Troepen van dit dorp als aanvaller</button>
            <button class="small" onClick={() => { setAtt({}); setDef({}); }}>Leegmaken</button>
          </div>
          <table class="table compact">
            <thead><tr><th>Eenheid</th><th class="right">Aanvaller</th><th class="right">Verdediger</th><th class="right">Verlies aanv.</th><th class="right">Verlies verd.</th><th class="right">Over aanv.</th><th class="right">Over verd.</th></tr></thead>
            <tbody>
              {enabled.map((u) => (
                <tr key={u}>
                  <td class="nowrap"><UnitIcon id={u} size={18} /> {UNIT_SHORT[u]}</td>
                  <td class="right"><input type="number" min={0} value={att[u] ?? ''} placeholder="0" onInput={(e) => setAtt({ ...att, [u]: e.currentTarget.value })} /></td>
                  <td class="right"><input type="number" min={0} value={def[u] ?? ''} placeholder="0" onInput={(e) => setDef({ ...def, [u]: e.currentTarget.value })} /></td>
                  <td class="right mono bad">{r?.attackerLost[u] ? num(r.attackerLost[u]!) : ''}</td>
                  <td class="right mono bad">{r?.defenderLost[u] ? num(r.defenderLost[u]!) : ''}</td>
                  <td class="right mono">{input.attacker[u] ? num(left(input.attacker, r?.attackerLost, u)) : ''}</td>
                  <td class="right mono">{input.defender[u] ? num(left(input.defender, r?.defenderLost, u)) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section class="panel sim-knobs">
          <h3>Omstandigheden</h3>
          <label>Muur <input type="number" min={0} max={20} value={wall} onInput={(e) => setWall(e.currentTarget.value)} /></label>
          <label>Moraal % <input type="number" min={30} max={100} value={morale} onInput={(e) => setMorale(e.currentTarget.value)} /></label>
          <label>Geluk % <input type="number" min={-25} max={25} value={luck} onInput={(e) => setLuck(e.currentTarget.value)} /></label>
          {(input.attacker.catapult ?? 0) > 0 && (
            <label>
              Katapulten op
              <select value={cat} onChange={(e) => setCat(e.currentTarget.value as BuildingId)}>
                {CATAPULT_TARGETS.map((b) => <option key={b} value={b}>{DEFAULT_BUILDINGS[b].name}</option>)}
              </select>
              level <input type="number" min={0} max={30} value={catLevel} onInput={(e) => setCatLevel(e.currentTarget.value)} />
            </label>
          )}
          <h3>Bonussen</h3>
          <label title="Geloof (50 = zonder kerk), vlag aanvalskracht (bv. 104)">Aanvaller kracht % <input type="number" min={1} value={attPct} onInput={(e) => setAttPct(e.currentTarget.value)} /></label>
          <label title="Geloof, vlag verdedigingskracht, nachtbonus (200)">Verdediger kracht % <input type="number" min={1} value={defPct} onInput={(e) => setDefPct(e.currentTarget.value)} /></label>
          <label>Item aanvaller <select value={attItem} onChange={(e) => setAttItem(e.currentTarget.value)}>{ITEM_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Item verdediger <select value={defItem} onChange={(e) => setDefItem(e.currentTarget.value)}>{ITEM_OPTIONS.filter(([v]) => v !== 'morningstar').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          {levelsWorld && <label class="row"><input type="checkbox" checked={tech} onChange={(e) => setTech(e.currentTarget.checked)} /> Researchlevels van dit dorp voor de aanvaller</label>}
          {r && (
            <div class={`sim-result ${r.attackerWon ? 'good' : 'bad'}`}>
              <strong>{r.attackerWon ? 'Aanvaller wint' : 'Verdediger houdt stand'}</strong>
              <div class="muted">Aanval {num(Math.round(r.attackStrength))} · verdediging {num(Math.round(r.defenseStrength))}</div>
              <div>Muur {wall} → {r.wallAfter}{r.buildingAfter !== undefined ? ` · ${DEFAULT_BUILDINGS[cat].name} ${catLevel} → ${r.buildingAfter}` : ''}</div>
            </div>
          )}
          <p class="hint">Dezelfde rekenregels als in het spel. Kracht %: zonder geloof 50, met een vlag bijvoorbeeld 104, nachtbonus 200 (verdediger).</p>
        </section>
      </div>
    </div>
  );
}
