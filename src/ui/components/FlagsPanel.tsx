import { useState } from 'preact/hooks';
import { FLAG_DROP, FLAG_NAMES, FLAG_TYPES, FLAG_VALUES, KILLS_PER_FLAG, type FlagType } from '../../shared/flags';
import { send, snapshot } from '../store';
import { fmtNum, tr } from '../../shared/i18n';

const pct = (x: number) => Math.round(x * 100);

/** FLAG_TEXT in the current language. */
function flagText(t: FlagType, p: number): string {
  switch (t) {
    case 'res': return tr('+{p}% productie', { p });
    case 'recruit': return tr('{p}% sneller rekruteren', { p });
    case 'attack': return tr('+{p}% aanval', { p });
    case 'defense': return tr('+{p}% verdediging', { p });
    case 'luck': return tr('geluk {p}% dichter bij 0 (aanval)', { p });
    case 'pop': return tr('+{p}% boerderij', { p });
    case 'coin': return tr('munten {p}% goedkoper', { p });
    case 'haul': return tr('+{p}% buit', { p });
  }
}

/** Your flags: free flags per kind and level, three of a level make one of the next. */
export function FlagsPanel() {
  const f = snapshot.value?.flags;
  const [melt, setMelt] = useState<FlagType | null>(null);
  if (!f) return null;
  const meltTo: FlagType = melt ?? (f.hang && f.hang !== 'keep' ? (f.hang as FlagType) : 'recruit');
  const odds = FLAG_DROP.flatMap((q, i) => (q > 0 ? [`L${i + 1} ${fmtNum(q * 100)}%`] : [])).join(', ');
  return (
    <div class="flags-panel">
      <table class="table compact">
        <thead>
          <tr>
            <th>{tr('Vlag')}</th>
            {Array.from({ length: 9 }, (_, i) => <th key={i} class="right">L{i + 1}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {FLAG_TYPES.map((t) => (
            <tr key={t}>
              <td title={FLAG_VALUES[t].map((v, i) => `L${i + 1}: ${flagText(t, pct(v))}`).join('\n')}>{tr(FLAG_NAMES[t])}</td>
              {(f.free[t] ?? []).map((n, i) => (
                <td key={i} class="right mono">
                  {n > 0 ? n : <span class="muted">·</span>}
                  {n >= 3 && i < 8 && (
                    <button class="small link" title={`3 × L${i + 1} → 1 × L${i + 2}`} onClick={() => send({ type: 'upgradeFlag', flag: t, level: i + 1 })}>▲</button>
                  )}
                </td>
              ))}
              <td class="right">
                {(f.free[t] ?? []).some((n, i) => n >= 3 && i < 8) && (
                  <button class="small" title={tr('Alles van deze soort zo hoog mogelijk samenvoegen (er blijven genoeg vlaggen over voor al je dorpen)')} onClick={() => send({ type: 'mergeFlags', flag: t })}>
                    {tr('Samenvoegen')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="row">
        <button class="small" onClick={() => send({ type: 'mergeFlags' })}>{tr('Alles samenvoegen')}</button>
        <label class="inline">
          <input type="checkbox" checked={f.auto} onChange={(e) => send({ type: 'flagAuto', on: e.currentTarget.checked })} /> {tr('Automatisch samenvoegen')}
        </label>
      </div>
      <div class="row">
        <label class="inline">
          {tr('Ophangen:')}{' '}
          <select value={f.hang ?? ''} onChange={(e) => send({ type: 'flagHang', hang: e.currentTarget.value || null })}>
            <option value="">{tr('zelf kiezen')}</option>
            <option value="keep">{tr('elk dorp zijn eigen soort, steeds de beste')}</option>
            {FLAG_TYPES.map((t) => <option key={t} value={String(t)}>{tr('alle dorpen: {flag}', { flag: tr(FLAG_NAMES[t]) })}</option>)}
          </select>
        </label>
      </div>
      <div class="row">
        <label class="inline">
          {tr('Omsmelten naar')}{' '}
          <select value={meltTo} onChange={(e) => setMelt(e.currentTarget.value as FlagType)}>
            {FLAG_TYPES.map((t) => <option key={t} value={String(t)}>{tr(FLAG_NAMES[t])}</option>)}
          </select>
        </label>
        <button class="small" title={tr('Drie losse vlaggen van hetzelfde level, welke soort ook, worden één vlag van dat level van deze soort. Op elk level, zolang je genoeg vlaggen voor je dorpen houdt.')} onClick={() => send({ type: 'meltFlags', to: meltTo })}>
          {tr('Alles omsmelten')}
        </button>
      </div>
      <p class="hint">
        {tr('Losse vlaggen (niet opgehangen). Drie van hetzelfde soort en level maken er één van het volgende level (▲); samenvoegen brengt eerst al je dorpen naar L5 en duwt dan de top omhoog, en houdt altijd genoeg vlaggen over om in elk dorp één te hangen. Omsmelten maakt van drie losse vlaggen van één level, welke soort ook, één van de soort die je kiest. Eén vlag per dorp: kies hem in de kolom Vlag hieronder, of laat ze vanzelf ophangen. Nieuwe vlaggen krijg je voor elk veroverd dorp en per {per} verslagen vijanden ({kills}/{per}), met een willekeurig level: {odds}. Een verovering op een speler geeft een level hoger.', { kills: f.kills, per: KILLS_PER_FLAG, odds })}
      </p>
    </div>
  );
}

/** Pick the flag for one village. */
export function FlagSelect({ village, flag }: { village: number; flag?: { type: string; level: number } }) {
  const f = snapshot.value?.flags;
  if (!f) return null;
  const key = flag ? `${flag.type}:${flag.level}` : '';
  const options: { type: FlagType; level: number }[] = [];
  for (const t of FLAG_TYPES) for (let l = 9; l >= 1; l--) if ((f.free[t]?.[l - 1] ?? 0) > 0 || key === `${t}:${l}`) options.push({ type: t, level: l });
  return (
    <select
      class="flag-select"
      value={key}
      onChange={(e) => {
        const [type, level] = e.currentTarget.value.split(':');
        send({ type: 'setFlag', village, flag: type ? { type: type!, level: Number(level) } : null });
      }}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={`${o.type}:${o.level}`} value={`${o.type}:${o.level}`}>
          {tr(FLAG_NAMES[o.type])} L{o.level} ({flagText(o.type, pct(FLAG_VALUES[o.type][o.level - 1]!))})
        </option>
      ))}
    </select>
  );
}
