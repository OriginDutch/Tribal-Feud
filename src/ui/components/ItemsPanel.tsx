import { send, snapshot } from '../store';
import { tr } from '../../shared/i18n';

/** Paladin items: the weapon chamber (found items, the equipped one, progress to the next). */
export function ItemsPanel() {
  const it = snapshot.value?.items;
  if (!it) return null;
  const pct = Math.min(100, Math.round(it.progress * 100));
  return (
    <section class="panel">
      <h3>{tr('Wapenkamer')}</h3>
      <div class="row">
        <span>{tr('Volgend item')}</span>
        <span class="mood-bar" style={{ width: '200px' }}><i style={{ width: `${pct}%`, background: '#e2a93b' }} /></span>
        <span class="mono">{pct}%</span>
        <span class="muted">· {tr('{n}/{all} gevonden', { n: it.found.length, all: it.all })}</span>
      </div>
      {!it.found.length ? (
        <p class="muted">{tr('Nog geen items. Elke speldag vult de balk wat verder, en sneller voor elke vijand die je verslaat.')}</p>
      ) : (
        <table class="table compact">
          <tbody>
            {it.found.map((x) => (
              <tr key={x.id} class={it.equipped === x.id ? 'current' : ''}>
                <td><strong>{tr(x.name)}</strong></td>
                <td class="muted">{tr(x.text)}</td>
                <td class="right">
                  {it.equipped === x.id ? (
                    <button class="small" onClick={() => send({ type: 'equipItem', item: null })}>{tr('Afleggen')}</button>
                  ) : (
                    <button class="small action" onClick={() => send({ type: 'equipItem', item: x.id })}>{tr('Uitrusten')}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p class="hint">{tr('Een item werkt waar je paladijn is: bij een aanval waar hij meeloopt, of in het dorp waar hij staat (verdediging, voor alle eenheden van dat type daar). Items blijven bewaard als de paladijn sneuvelt.')}</p>
    </section>
  );
}
