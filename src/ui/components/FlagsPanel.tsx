import { FLAG_NAMES, FLAG_TEXT, FLAG_TYPES, FLAG_VALUES, type FlagType } from '../../shared/flags';
import { send, snapshot } from '../store';

const pct = (x: number) => Math.round(x * 100);

/** Your flags: free flags per kind and level, three of a level make one of the next. */
export function FlagsPanel() {
  const f = snapshot.value?.flags;
  if (!f) return null;
  return (
    <div class="flags-panel">
      <table class="table compact">
        <thead>
          <tr>
            <th>Vlag</th>
            {Array.from({ length: 9 }, (_, i) => <th key={i} class="right">L{i + 1}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {FLAG_TYPES.map((t) => (
            <tr key={t}>
              <td title={FLAG_VALUES[t].map((v, i) => `L${i + 1}: ${FLAG_TEXT[t](pct(v))}`).join('\n')}>{FLAG_NAMES[t]}</td>
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
                  <button class="small" title="Alles van deze soort zo hoog mogelijk samenvoegen (er blijven genoeg vlaggen over voor al je dorpen)" onClick={() => send({ type: 'mergeFlags', flag: t })}>
                    Samenvoegen
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="row">
        <button class="small" onClick={() => send({ type: 'mergeFlags' })}>Alles samenvoegen</button>
        <label class="inline">
          <input type="checkbox" checked={f.auto} onChange={(e) => send({ type: 'flagAuto', on: e.currentTarget.checked })} /> Automatisch samenvoegen
        </label>
      </div>
      <p class="hint">
        Losse vlaggen (niet opgehangen). Drie van hetzelfde soort en level maken er één van het volgende level (▲). Samenvoegen houdt altijd genoeg
        vlaggen over om in al je dorpen één te hangen. Eén vlag per dorp: kies hem in de kolom Vlag hieronder. Nieuwe vlaggen krijg je voor elk
        veroverd dorp en per 1.500 verslagen vijanden ({f.kills}/1.500), met een willekeurig level: L1 60%, L2 25%, L3 10%, L4 3,5%, L5 1,1%, L6 0,3%,
        L7 0,08%, L8 0,02%. Een verovering op een speler geeft een level hoger.
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
          {FLAG_NAMES[o.type]} L{o.level} ({FLAG_TEXT[o.type](pct(FLAG_VALUES[o.type][o.level - 1]!))})
        </option>
      ))}
    </select>
  );
}
