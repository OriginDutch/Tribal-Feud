import { useEffect, useState } from 'preact/hooks';
import { Coords } from './Coords';
import { num } from '../format';
import { mintPlan, send, snapshot } from '../store';
import { Confirm } from './Confirm';
import { tr } from '../../shared/i18n';

/** Mints coins in every village whose build template is done, keeping a share of its storage. */
export function MintAllPanel() {
  const s = snapshot.value;
  const saved = s?.mint ?? { keep: 0.25, auto: false };
  // the slider moves locally while dragging; the save gets it on release
  const [keep, setKeep] = useState(saved.keep);
  useEffect(() => setKeep(saved.keep), [saved.keep]);
  const save = (k: number, auto: boolean) => send({ type: 'setMint', keep: k, auto });
  useEffect(() => {
    // the share used to live in this browser only: carry it over into the save once
    try {
      const old = localStorage.getItem('tf-mint-keep');
      if (old !== null) { localStorage.removeItem('tf-mint-keep'); if (Number(old) !== saved.keep) save(Number(old) || 0, saved.auto); }
    } catch { /* fine */ }
  }, []);
  useEffect(() => {
    send({ type: 'getMintPlan', keep });
    const t = window.setInterval(() => send({ type: 'getMintPlan', keep }), 3000);
    return () => window.clearInterval(t);
  }, [keep]);
  if (!s || s.villages.length < 2) return null;
  const plan = mintPlan.value?.keep === keep ? mintPlan.value.rows : null;
  const total = plan?.reduce((t, r) => t + r.coins, 0) ?? 0;
  const pct = Math.round(keep * 100);
  return (
    <section class="panel mint-all">
      <h3>{tr('Munten slaan in afgebouwde dorpen')}</h3>
      <div class="row wrap">
        <label class="row" title={tr('Elk dorp houdt dit deel van zijn opslag over, bijvoorbeeld voor troepen.')}>
          {tr('Houd {pct}% van de opslag', { pct })}
          <input type="range" min={0} max={0.9} step={0.05} value={keep} onInput={(e) => setKeep(Number(e.currentTarget.value))} onChange={(e) => save(Number(e.currentTarget.value), saved.auto)} />
        </label>
        <label class="inline-check" title={tr('Slaat zelf net genoeg munten als een troepensjabloon een edel wil en er geen slot vrij is. Troepen gaan voor.')}>
          <input type="checkbox" checked={saved.auto} onChange={(e) => save(keep, e.currentTarget.checked)} /> {tr('Automatisch munten slaan wanneer nodig')}
        </label>
        <span style={{ flex: 1 }} />
        <Confirm label={tr('Slaan ({n})', { n: num(total) })} sure={tr('Zeker? {n} munten in {v} dorpen', { n: num(total), v: plan?.length ?? 0 })} disabled={!total} onConfirm={() => send({ type: 'mintAll', keep })} />
      </div>
      <p class="hint">
        {tr('Alleen dorpen waarvan het bouwsjabloon helemaal af is en die zelf een adelshoeve hebben. Elk dorp houdt {pct}% van zijn opslag over; van de rest worden zoveel mogelijk munten geslagen.', { pct })}
        {saved.auto && <> {tr('Automatisch: zodra een dorp volgens zijn troepensjabloon een edel wil en er geen slot vrij is, wordt net genoeg geslagen voor het volgende slot, nadat de troepen hun deel hadden.')}</>}
      </p>
      {plan === null ? (
        <p class="muted">{tr('Berekenen…')}</p>
      ) : plan.length === 0 ? (
        <p class="muted">{tr('Nu niets te slaan: geen afgebouwd dorp met adelshoeve en genoeg grondstoffen boven {pct}%.', { pct })}</p>
      ) : (
        <table class="table compact">
          <tbody>
            {plan.map((r) => (
              <tr key={r.id}>
                <td>{r.name} <Coords x={r.x} y={r.y} /></td>
                <td class="right mono">{r.coins === 1 ? tr('1 munt') : tr('{n} munten', { n: num(r.coins) })}</td>
              </tr>
            ))}
            <tr class="total-row">
              <td><strong>{tr('Totaal')}</strong> <span class="muted">{tr('({n} dorpen)', { n: plan.length })}</span></td>
              <td class="right mono"><strong>{num(total)}</strong></td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
