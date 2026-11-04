import { useEffect, useState } from 'preact/hooks';
import { tr } from '../../shared/i18n';
import { Coords } from './Coords';
import { duration, num } from '../format';
import { send, snapshot, surplusPlan } from '../store';
import { Confirm } from './Confirm';

/**
 * "Overschot naar bouwende dorpen": everything above a share of storage goes, with free
 * merchants, to your villages whose account manager is building and runs short. Preview,
 * a confirm button, and an automatic switch (runs at every account-manager check).
 */
export function SurplusPanel() {
  const s = snapshot.value;
  const [keep, setKeep] = useState(s?.surplus.keep ?? 0.5);
  useEffect(() => {
    send({ type: 'getSurplusPlan', keep });
    const t = window.setInterval(() => send({ type: 'getSurplusPlan', keep }), 3000);
    return () => window.clearInterval(t);
  }, [keep]);
  if (!s) return null;
  const plan = surplusPlan.value?.keep === keep ? surplusPlan.value.rows : null;
  const save = (k: number, auto: boolean) => send({ type: 'setSurplus', keep: k, auto });
  const total: [number, number, number] = [0, 0, 0];
  for (const r of plan ?? []) for (const i of [0, 1, 2] as const) total[i] += r.res[i];
  const pct = Math.round(keep * 100);
  return (
    <section class="panel surplus">
      <h3>{tr('Overschot naar bouwende dorpen')}</h3>
      <div class="row wrap">
        <label class="row" title={tr('Elk dorp houdt dit deel van zijn opslag; alleen wat daarboven zit mag weg.')}>
          {tr('Houd {pct}% van de opslag', { pct })}
          <input
            type="range" min={0} max={0.95} step={0.05} value={keep}
            onInput={(e) => setKeep(Number(e.currentTarget.value))}
            onChange={(e) => save(Number(e.currentTarget.value), s.surplus.auto)}
          />
        </label>
        <label class="row" title={tr('Doet dit vanzelf bij elke controle van de accountmanager.')}>
          <input type="checkbox" checked={s.surplus.auto} onChange={(e) => save(keep, e.currentTarget.checked)} /> {tr('Automatisch')}
        </label>
        <span style={{ flex: 1 }} />
        <Confirm
          label={plan ? tr('Versturen ({n})', { n: plan.length }) : tr('Versturen')}
          sure={tr('Zeker? {n} zendingen', { n: plan?.length ?? 0 })}
          disabled={!plan?.length}
          onConfirm={() => send({ type: 'sendSurplus', keep })}
        />
      </div>
      <p class="hint">
        {tr('Alles boven {pct}% van de opslag gaat met vrije handelaren naar je dorpen die met de accountmanager aan het bouwen zijn en grondstoffen tekortkomen (genoeg voor hun volgende twee gebouwen, min wat al onderweg is). Dichtstbijzijnde dorp eerst. Wat een dorp zelf tekortkomt om te bouwen, geeft het niet weg.', { pct })}
      </p>
      {plan === null ? (
        <p class="muted">{tr('Berekenen…')}</p>
      ) : plan.length === 0 ? (
        <p class="muted">{tr('Nu niets te versturen: geen overschot boven {pct}%, geen vrije handelaren, of geen dorp dat bouwt en tekortkomt.', { pct })}</p>
      ) : (
        <table class="table compact">
          <thead>
            <tr>
              <th>{tr('Van')}</th>
              <th>{tr('Naar')}</th>
              <th class="right">{tr('Hout')}</th>
              <th class="right">{tr('Leem')}</th>
              <th class="right">{tr('IJzer')}</th>
              <th class="right">{tr('Handelaren')}</th>
              <th class="right">{tr('Onderweg')}</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((r, i) => (
              <tr key={i}>
                <td class="ellipsis">{r.from.name} <Coords x={r.from.x} y={r.from.y} /></td>
                <td class="ellipsis">{r.to.name} <Coords x={r.to.x} y={r.to.y} /></td>
                <td class="right mono">{num(r.res[0])}</td>
                <td class="right mono">{num(r.res[1])}</td>
                <td class="right mono">{num(r.res[2])}</td>
                <td class="right mono">{r.merchants}</td>
                <td class="right mono">{duration(r.travel)}</td>
              </tr>
            ))}
            <tr class="total-row">
              <td colSpan={2}><strong>{tr('Totaal')}</strong></td>
              <td class="right mono"><strong>{num(total[0])}</strong></td>
              <td class="right mono"><strong>{num(total[1])}</strong></td>
              <td class="right mono"><strong>{num(total[2])}</strong></td>
              <td class="right mono"><strong>{plan.reduce((t, r) => t + r.merchants, 0)}</strong></td>
              <td />
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
