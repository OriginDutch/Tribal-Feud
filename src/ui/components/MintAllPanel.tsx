import { useEffect, useState } from 'preact/hooks';
import { Coords } from './Coords';
import { num } from '../format';
import { mintPlan, send, snapshot } from '../store';
import { Confirm } from './Confirm';

/** Mints coins in every village whose build template is done, keeping a share of its storage. */
export function MintAllPanel() {
  const s = snapshot.value;
  const [keep, setKeep] = useState(() => Number(localStorage.getItem('tf-mint-keep') ?? 0.25) || 0);
  useEffect(() => {
    try { localStorage.setItem('tf-mint-keep', String(keep)); } catch { /* fine */ }
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
      <h3>Munten slaan in afgebouwde dorpen</h3>
      <div class="row wrap">
        <label class="row" title="Elk dorp houdt dit deel van zijn opslag over, bijvoorbeeld voor troepen.">
          Houd {pct}% van de opslag
          <input type="range" min={0} max={0.9} step={0.05} value={keep} onInput={(e) => setKeep(Number(e.currentTarget.value))} />
        </label>
        <span style={{ flex: 1 }} />
        <Confirm label={`Slaan (${num(total)})`} sure={`Zeker? ${num(total)} munten in ${plan?.length ?? 0} dorpen`} disabled={!total} onConfirm={() => send({ type: 'mintAll', keep })} />
      </div>
      <p class="hint">
        Alleen dorpen waarvan het bouwsjabloon helemaal af is en die zelf een adelshoeve hebben. Elk dorp houdt {pct}% van zijn opslag
        over; van de rest worden zoveel mogelijk munten geslagen.
      </p>
      {plan === null ? (
        <p class="muted">Berekenen…</p>
      ) : plan.length === 0 ? (
        <p class="muted">Nu niets te slaan: geen afgebouwd dorp met adelshoeve en genoeg grondstoffen boven {pct}%.</p>
      ) : (
        <table class="table compact">
          <tbody>
            {plan.map((r) => (
              <tr key={r.id}>
                <td>{r.name} <Coords x={r.x} y={r.y} /></td>
                <td class="right mono">{num(r.coins)} munt{r.coins === 1 ? '' : 'en'}</td>
              </tr>
            ))}
            <tr class="total-row">
              <td><strong>Totaal</strong> <span class="muted">({plan.length} dorpen)</span></td>
              <td class="right mono"><strong>{num(total)}</strong></td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
