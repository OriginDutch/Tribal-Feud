import { useState } from 'preact/hooks';
import type { HelpView, TalksView } from '../../shared/protocol';
import { formatGameTime } from '../../shared/time';
import { num } from '../format';
import { send, snapshot } from '../store';

const terms = (v?: number, r?: number, h?: HelpView) => {
  const parts = [];
  if (v) parts.push(`${v} dorp${v === 1 ? '' : 'en'}`);
  if (r) parts.push(`${num(r)} grondstoffen`);
  if (h) parts.push(`hulp: ${num(h.space)} boerderijplekken aanval per lid tegen [${h.tag}]`);
  return parts.join(' + ') || 'niets';
};

/** Peace talks of your tribe: the bids so far, and when it is your side's turn, the vote. */
export function TalksPanel() {
  const s = snapshot.value;
  if (!s) return null;
  const list = s.talks ?? [];
  if (!list.length && s.outlawUntil === null && !s.owed && !s.duty) return null;
  return (
    <section class="panel talks">
      <h3>Vredesbesprekingen</h3>
      {s.outlawUntil !== null && (
        <p class="bad">Je bent vogelvrij tot {formatGameTime(s.outlawUntil)}: beide stammen mogen je dorpen innemen, en geen stam neemt je aan.</p>
      )}
      {s.duty && (
        <p>
          Vredesvoorwaarde: val [{s.duty.tag}] aan met samen minstens {num(s.duty.space)} boerderijplekken aan aanvalstroepen (bijlen, lichte cav, boogruiters, rammen,
          katapulten), uit al je dorpen samen. Verstuurd: <strong class={s.duty.sent >= s.duty.space ? 'good' : ''}>{num(s.duty.sent)}</strong> · tot {formatGameTime(s.duty.due)}.
          Niet helpen terwijl het kon kost je bijna al je aanzien; twee keer binnen 7 dagen en je ligt eruit.
        </p>
      )}
      {s.owed > 0 && <p class="muted">Je betaalt nog {num(s.owed)} grondstoffen aan herstelbetalingen. Je handelaren brengen het weg zodra ze vrij zijn.</p>}
      {list.map((t) => <Talks key={t.id} t={t} />)}
    </section>
  );
}

function Talks({ t }: { t: TalksView }) {
  const [villages, setVillages] = useState(0);
  const [resources, setResources] = useState(0);
  const [helpTarget, setHelpTarget] = useState<number | null>(t.helpTargets.find((x) => x.war)?.id ?? null);
  const [helpSpace, setHelpSpace] = useState(0);
  const now = snapshot.value!.time;
  const total = t.options.reduce((sum, o) => sum + o.votes, 0);
  const label = (o: TalksView['options'][number]) =>
    o.kind === 'accept' ? `Accepteren: ${terms(t.bids.at(-1)?.villages, t.bids.at(-1)?.resources, t.bids.at(-1)?.help)}` : o.kind === 'reject' ? 'Afbreken: de oorlog gaat door' : `${t.bids.length === 0 || !t.youWin ? 'Bod' : 'Tegenbod'}: ${terms(o.villages, o.resources, o.help)}`;
  return (
    <div class="talks-item">
      <p>
        Met <strong>[{t.enemy.tag}] {t.enemy.name}</strong> · jullie {t.youWin ? 'winnen' : 'verliezen'} de oorlog · {t.bidsLeft} bod{t.bidsLeft === 1 ? '' : 'en'} over · NAP zolang het duurt
      </p>
      {t.bids.length > 0 && (
        <ol class="talks-bids">
          {t.bids.map((b, i) => (
            <li key={i}>
              {b.ours ? 'Jullie' : `[${t.enemy.tag}]`}: {terms(b.villages, b.resources, b.help)}
            </li>
          ))}
        </ol>
      )}
      {!t.yourTurn ? (
        <p class="muted">[{t.enemy.tag}] is aan zet, tot {formatGameTime(t.until)} (nog {Math.max(0, Math.round((t.until - now) / 60000))} min).</p>
      ) : (
        <>
          <p>
            Jullie zijn aan zet. Stemmen kan tot {formatGameTime(t.until)}. Wie niet stemt telt niet mee; bij gelijke stand beslist de leider.
          </p>
          <ul class="talks-options">
            {t.options.map((o) => (
              <li key={o.id} class={t.myVote === o.id ? 'on' : ''}>
                <span class="talks-label">
                  {label(o)}
                  {o.author ? <span class="muted"> · {o.leader ? 'voorstel leider' : 'alternatief'} van {o.author}</span> : null}
                </span>
                <span class="mono muted">{o.votes} stem{o.votes === 1 ? '' : 'men'}{total ? ` (${Math.round((o.votes / total) * 100)}%)` : ''}</span>
                <button class="small" disabled={t.myVote === o.id} onClick={() => send({ type: 'talksVote', talks: t.id, option: o.id })}>
                  {t.myVote === o.id ? 'Jouw stem' : 'Stem'}
                </button>
              </li>
            ))}
          </ul>
          {t.bidsLeft > 0 && (
            <div class="talks-bid row">
              <span>{t.leader ? 'Jouw bod als leider' : 'Eigen alternatief'}:</span>
              <label>
                dorpen{' '}
                <input type="number" min={0} max={t.maxVillages} value={villages} disabled={t.maxVillages === 0}
                  onInput={(e) => setVillages(Math.max(0, Math.min(t.maxVillages, Number(e.currentTarget.value) || 0)))} />
              </label>
              <label>
                grondstoffen{' '}
                <input type="number" min={0} step={10000} value={resources} onInput={(e) => setResources(Math.max(0, Number(e.currentTarget.value) || 0))} />
              </label>
              <label>
                hulp tegen{' '}
                <select value={String(helpTarget ?? '')} onChange={(e) => setHelpTarget(e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}>
                  <option value="">geen</option>
                  {t.helpTargets.map((x) => (
                    <option key={x.id} value={String(x.id)}>[{x.tag}]{x.war ? ' (oorlog)' : ''}</option>
                  ))}
                </select>
              </label>
              <label title="Per lid van de verliezer, opgeteld over al zijn dorpen: bijlen 1, lichte cav 4, boogruiters 5, rammen 5, katapulten 8">
                boerderijplekken per lid{' '}
                <input type="number" min={0} step={100} value={helpSpace} disabled={helpTarget === null} onInput={(e) => setHelpSpace(Math.max(0, Number(e.currentTarget.value) || 0))} />
              </label>
              <button class="small primary" onClick={() => send({ type: 'talksPropose', talks: t.id, villages, resources, ...(helpTarget !== null && helpSpace > 0 ? { help: { target: helpTarget, space: helpSpace } } : {}) })}>
                Voorstellen en erop stemmen
              </button>
              <span class="muted">
                {t.maxVillages === 0 ? 'Er zijn geen dorpen af te staan: alleen grondstoffen.' : `Max ${t.maxVillages} dorpen: de laagst scorende, nooit iemands hoofddorp of laatste dorp.`} Grondstoffen betaalt elk lid naar zijn aandeel in de stampunten.
              </span>
            </div>
          )}
        </>
      )}
      <p class="muted small">Aanvallen op [{t.enemy.tag}] tijdens de besprekingen = uit je stam gezet en vogelvrij.</p>
    </div>
  );
}
