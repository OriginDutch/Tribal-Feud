import { num } from '../format';
import { infoBuilding, snapshot } from '../store';
import { BuildingHeader, effectText } from './BuildingHeader';
import { tr } from '../../shared/i18n';

/** Info screen for buildings without a screen of their own (resources, farm, storage, hiding place, wall). */
export function BuildingScreen() {
  const s = snapshot.value;
  const v = s?.village;
  const id = infoBuilding.value;
  const b = v?.buildings.find((x) => x.id === id);
  if (!s || !v || !b) return null;

  // the next few levels, like TW's table
  // a window of levels around the current one: a couple back, the rest ahead
  const count = Math.min(7, b.maxLevel);
  const from = Math.max(1, Math.min(b.level - 2, b.maxLevel - count + 1));
  const rows = b.effect ? Array.from({ length: count }, (_, i) => from + i) : [];

  return (
    <div class="screen">
      <h2>
        {b.name} <span class="muted">{b.level > 0 ? tr('(level {level})', { level: b.level }) : tr('(nog niet gebouwd)')}</span>
      </h2>
      <BuildingHeader village={v} id={b.id} />

      {id === 'farm' && (
        <section class="panel">
          <h3>{tr('Bevolking')}</h3>
          <p>
            {tr('{used} van {max} inwoners aan het werk', { used: num(v.pop.used), max: num(v.pop.max) })} ·{' '}
            <span class={v.pop.max - v.pop.used <= 0 ? 'warn' : 'muted'}>{tr('{n} vrij', { n: num(Math.max(0, v.pop.max - v.pop.used)) })}</span>
          </p>
        </section>
      )}
      {id === 'storage' && (
        <section class="panel">
          <h3>{tr('Voorraad')}</h3>
          <p>
            {['Hout', 'Leem', 'IJzer'].map((name, i) => (
              <span key={name} class={(v.res[i] ?? 0) >= v.storage ? 'warn' : ''}>
                {tr(name)} {num(Math.floor(v.res[i] ?? 0))}
                {i < 2 ? ' · ' : ''}
              </span>
            ))}{' '}
            <span class="muted">{tr('van {n} per grondstof', { n: num(v.storage) })}</span>
          </p>
        </section>
      )}

      {rows.length > 0 && b.effect && (
        <section class="panel">
          <h3>{tr('Per level')}</h3>
          <table class="table">
            <thead>
              <tr>
                <th>{tr('Level')}</th>
                <th class="right">{tr(b.effect.label)}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l} class={l === b.level ? 'current' : ''}>
                  <td>
                    {l}
                    {l === b.level ? <span class="muted"> · {tr('nu')}</span> : ''}
                  </td>
                  <td class="right mono">{effectText(b, b.effect?.byLevel[l])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
