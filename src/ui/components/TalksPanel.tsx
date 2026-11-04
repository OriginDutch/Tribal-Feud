import { useState } from 'preact/hooks';
import type { HelpView, TalksView } from '../../shared/protocol';
import { formatGameTime } from '../../shared/time';
import { num } from '../format';
import { send, snapshot } from '../store';
import { tr } from '../../shared/i18n';
import { trx } from '../i18n';

const terms = (v?: number, r?: number, h?: HelpView) => {
  const parts = [];
  if (v) parts.push(v === 1 ? tr('1 dorp') : tr('{n} dorpen', { n: v }));
  if (r) parts.push(tr('{n} grondstoffen', { n: num(r) }));
  if (h) parts.push(tr('hulp: {space} boerderijplekken aanval per lid tegen [{tag}]', { space: num(h.space), tag: h.tag }));
  return parts.join(' + ') || tr('niets');
};

/** Peace talks of your tribe: the bids so far, and when it is your side's turn, the vote. */
export function TalksPanel() {
  const s = snapshot.value;
  if (!s) return null;
  const list = s.talks ?? [];
  if (!list.length && s.outlawUntil === null && !s.owed && !s.duty) return null;
  return (
    <section class="panel talks">
      <h3>{tr('Vredesbesprekingen')}</h3>
      {s.outlawUntil !== null && (
        <p class="bad">{tr('Je bent vogelvrij tot {time}: beide stammen mogen je dorpen innemen, en geen stam neemt je aan.', { time: formatGameTime(s.outlawUntil) })}</p>
      )}
      {s.duty && (
        <p>
          {trx('Vredesvoorwaarde: val [{tag}] aan met samen minstens {space} boerderijplekken aan aanvalstroepen (bijlen, lichte cav, boogruiters, rammen, katapulten), uit al je dorpen samen. Verstuurd: {sent} · tot {due}.', {
            tag: s.duty.tag, space: num(s.duty.space), sent: <strong class={s.duty.sent >= s.duty.space ? 'good' : ''}>{num(s.duty.sent)}</strong>, due: formatGameTime(s.duty.due),
          })}{' '}
          {tr('Niet helpen terwijl het kon kost je bijna al je aanzien; twee keer binnen 7 dagen en je ligt eruit.')}
        </p>
      )}
      {s.owed > 0 && <p class="muted">{tr('Je betaalt nog {n} grondstoffen aan herstelbetalingen. Je handelaren brengen het weg zodra ze vrij zijn.', { n: num(s.owed) })}</p>}
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
    o.kind === 'accept' ? tr('Accepteren: {terms}', { terms: terms(t.bids.at(-1)?.villages, t.bids.at(-1)?.resources, t.bids.at(-1)?.help) }) : o.kind === 'reject' ? tr('Afbreken: de oorlog gaat door') : (t.bids.length === 0 || !t.youWin ? tr('Bod: {terms}', { terms: terms(o.villages, o.resources, o.help) }) : tr('Tegenbod: {terms}', { terms: terms(o.villages, o.resources, o.help) }));
  return (
    <div class="talks-item">
      <p>
        {trx('Met {enemy}', { enemy: <strong>[{t.enemy.tag}] {t.enemy.name}</strong> })} · {t.youWin ? tr('jullie winnen de oorlog') : tr('jullie verliezen de oorlog')} · {t.bidsLeft === 1 ? tr('1 bod over') : tr('{n} biedingen over', { n: t.bidsLeft })} · {tr('NAP zolang het duurt')}
      </p>
      {t.bids.length > 0 && (
        <ol class="talks-bids">
          {t.bids.map((b, i) => (
            <li key={i}>
              {b.ours ? tr('Jullie') : `[${t.enemy.tag}]`}: {terms(b.villages, b.resources, b.help)}
            </li>
          ))}
        </ol>
      )}
      {!t.yourTurn ? (
        <p class="muted">{tr('[{tag}] is aan zet, tot {time} (nog {n} min).', { tag: t.enemy.tag, time: formatGameTime(t.until), n: Math.max(0, Math.round((t.until - now) / 60000)) })}</p>
      ) : (
        <>
          <p>
            {tr('Jullie zijn aan zet. Stemmen kan tot {time}. Wie niet stemt telt niet mee; bij gelijke stand beslist de leider.', { time: formatGameTime(t.until) })}
          </p>
          <ul class="talks-options">
            {t.options.map((o) => (
              <li key={o.id} class={t.myVote === o.id ? 'on' : ''}>
                <span class="talks-label">
                  {label(o)}
                  {o.author ? <span class="muted"> · {o.leader ? tr('voorstel leider van {name}', { name: o.author }) : tr('alternatief van {name}', { name: o.author })}</span> : null}
                </span>
                <span class="mono muted">{o.votes === 1 ? tr('1 stem') : tr('{n} stemmen', { n: o.votes })}{total ? ` (${Math.round((o.votes / total) * 100)}%)` : ''}</span>
                <button class="small" disabled={t.myVote === o.id} onClick={() => send({ type: 'talksVote', talks: t.id, option: o.id })}>
                  {t.myVote === o.id ? tr('Jouw stem') : tr('Stem')}
                </button>
              </li>
            ))}
          </ul>
          {t.bidsLeft > 0 && (
            <div class="talks-bid row">
              <span>{t.leader ? tr('Jouw bod als leider:') : tr('Eigen alternatief:')}</span>
              <label>
                {tr('dorpen')}{' '}
                <input type="number" min={0} max={t.maxVillages} value={villages} disabled={t.maxVillages === 0}
                  onInput={(e) => setVillages(Math.max(0, Math.min(t.maxVillages, Number(e.currentTarget.value) || 0)))} />
              </label>
              <label>
                {tr('grondstoffen')}{' '}
                <input type="number" min={0} step={10000} value={resources} onInput={(e) => setResources(Math.max(0, Number(e.currentTarget.value) || 0))} />
              </label>
              <label>
                {tr('hulp tegen')}{' '}
                <select value={String(helpTarget ?? '')} onChange={(e) => setHelpTarget(e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}>
                  <option value="">{tr('geen')}</option>
                  {t.helpTargets.map((x) => (
                    <option key={x.id} value={String(x.id)}>[{x.tag}]{x.war ? ` (${tr('oorlog')})` : ''}</option>
                  ))}
                </select>
              </label>
              <label title={tr('Per lid van de verliezer, opgeteld over al zijn dorpen: bijlen 1, lichte cav 4, boogruiters 5, rammen 5, katapulten 8')}>
                {tr('boerderijplekken per lid')}{' '}
                <input type="number" min={0} step={100} value={helpSpace} disabled={helpTarget === null} onInput={(e) => setHelpSpace(Math.max(0, Number(e.currentTarget.value) || 0))} />
              </label>
              <button class="small primary" onClick={() => send({ type: 'talksPropose', talks: t.id, villages, resources, ...(helpTarget !== null && helpSpace > 0 ? { help: { target: helpTarget, space: helpSpace } } : {}) })}>
                {tr('Voorstellen en erop stemmen')}
              </button>
              <span class="muted">
                {t.maxVillages === 0 ? tr('Er zijn geen dorpen af te staan: alleen grondstoffen.') : tr('Max {n} dorpen: de laagst scorende, nooit iemands hoofddorp of laatste dorp.', { n: t.maxVillages })}{' '}{tr('Grondstoffen betaalt elk lid naar zijn aandeel in de stampunten.')}
              </span>
            </div>
          )}
        </>
      )}
      <p class="muted small">{tr('Aanvallen op [{tag}] tijdens de besprekingen = uit je stam gezet en vogelvrij.', { tag: t.enemy.tag })}</p>
    </div>
  );
}
