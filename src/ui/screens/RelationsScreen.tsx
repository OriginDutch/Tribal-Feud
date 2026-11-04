import { useEffect, useState } from 'preact/hooks';
import { useSaved } from '../useSaved';
import type { MoodNoteView } from '../../shared/protocol';
import { duration } from '../format';
import { PlayerLink } from '../components/PlayerLink';
import { opinions, send, snapshot } from '../store';
import { tr } from '../../shared/i18n';
import { num } from '../format';

const face = (m: number) => (m >= 70 ? '😀' : m >= 50 ? '🙂' : m >= 35 ? '😐' : m >= 20 ? '😠' : '🤬');
const ARCH: Record<string, string> = { opportunist: 'opportunist', rusher: 'aanvaller', farmer: 'farmer', turtle: 'verdediger', diplomat: 'diplomaat', supporter: 'helper' };

function Mood({ value }: { value: number }) {
  return (
    <span class="mood" title={`${value} / 100`}>
      <span class="mood-face">{face(value)}</span>
      <span class="mood-bar"><i style={{ width: `${value}%`, background: value >= 50 ? '#7fbf5a' : value >= 25 ? '#e2a93b' : '#e5533f' }} /></span>
      <span class="mono">{value}</span>
    </span>
  );
}
function Notes({ notes }: { notes: MoodNoteView[] }) {
  if (!notes.length) return <span class="muted">—</span>;
  return (
    <span class="mood-notes">
      {notes.slice(0, 3).map((n, i) => (
        <span key={i} class={n.delta > 0 ? 'good' : 'bad'}>{n.delta > 0 ? '+' : ''}{Math.round(n.delta)} {n.why}</span>
      ))}
    </span>
  );
}

/** What others think of you: your mates (or your leader), grudges, and asking your tribe. */
export function RelationsScreen() {
  useEffect(() => {
    send({ type: 'getOpinions' });
    const t = window.setInterval(() => send({ type: 'getOpinions' }), 3000);
    return () => window.clearInterval(t);
  }, []);
  const s = snapshot.value;
  const o = opinions.value;
  if (!s || !o) return <div class="screen"><p class="muted">{tr('Laden…')}</p></div>;
  const inTribe = s.myTribe !== null && s.myTribe !== undefined;
  return (
    <div class="screen">
      <h2>{tr('Relaties')}</h2>
      {!inTribe ? (
        <section class="panel"><p class="muted">{tr('Je zit niet in een stam. Stamgenoten en leiders hebben hier straks een mening over je.')}</p></section>
      ) : s.myTribeLeader ? (
        <section class="panel">
          <h3>{tr('Mening van je stamgenoten over jou')}</h3>
          {!o.mates.length ? <p class="muted">{tr('Je stam heeft nog geen andere leden.')}</p> : (
            <table class="table compact">
              <thead><tr><th>{tr('Speler')}</th><th>{tr('Type')}</th><th>{tr('Tevredenheid')}</th><th>{tr('Waarom')}</th></tr></thead>
              <tbody>
                {o.mates.map((m) => (
                  <tr key={m.id}>
                    <td><PlayerLink id={m.id} name={m.name} /></td>
                    <td class="muted">{ARCH[m.archetype] ? tr(ARCH[m.archetype]!) : m.archetype}</td>
                    <td><Mood value={m.mood} /></td>
                    <td><Notes notes={m.notes} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p class="hint">
            {tr('Helpen (support, grondstoffen, toestemming) maakt ze blij; verzoeken weigeren of negeren, te veel orders, en dorpen die ze verliezen zonder jouw hulp niet. Onder 35 klagen ze, onder 25 vertrekken ze misschien, onder 12 kunnen ze je verraden. Opportunisten het snelst.')}
          </p>
        </section>
      ) : o.standing ? (
        <section class="panel">
          <h3>{tr('Wat {leader} (je leider) van je vindt', { leader: o.standing.leaderName })}</h3>
          <p><Mood value={o.standing.value} /></p>
          <p><Notes notes={o.standing.notes} /></p>
          <p class="hint">{tr('Help je stamgenoten en vraag toestemming voor je iemand aanvalt. Onder 20 zet je leider je eruit.')}</p>
        </section>
      ) : null}

      {inTribe && <AskResources />}

      {o.permissions.length > 0 && (
        <section class="panel">
          <h3>{tr('Toestemming om aan te vallen')}</h3>
          <table class="table compact">
            <tbody>
              {o.permissions.map((p) => (
                <tr key={p.target}>
                  <td><PlayerLink id={p.target} name={p.name} /></td>
                  <td>{!p.answer ? <span class="muted">{tr('wacht op antwoord')}</span> : p.answer === 'yes' ? <span class="good">{tr('ja')}</span> : <span class="bad">{tr('nee')}</span>}</td>
                  <td class="muted">{p.until ? tr('geldt nog {time}', { time: duration(Math.max(0, p.until - s.time)) }) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="hint">{tr('Vragen doe je op het profiel van een speler. Aanvallen terwijl je leider nee zei, kost je zijn vertrouwen.')}</p>
        </section>
      )}

      <section class="panel">
        <h3>{tr('Wrok tegen jou')}</h3>
        {!o.grudges.length ? <p class="muted">{tr('Niemand heeft wrok tegen je. Nog niet.')}</p> : (
          <table class="table compact">
            <thead><tr><th>{tr('Speler')}</th><th>{tr('Stam')}</th><th>{tr('Wrok')}</th><th>{tr('Waarom')}</th><th class="right">{tr('Halveert in')}</th></tr></thead>
            <tbody>
              {o.grudges.map((g) => (
                <tr key={g.id}>
                  <td><PlayerLink id={g.id} name={g.name} /></td>
                  <td class="muted">{g.tribeTag ? `[${g.tribeTag}]` : '—'}</td>
                  <td>
                    <span class="mood-bar"><i style={{ width: `${Math.min(100, (g.score / 2) * 100)}%`, background: '#e5533f' }} /></span>{' '}
                    <span class="mono">{g.score.toFixed(2)}</span>
                  </td>
                  <td class="muted">{g.why ?? '—'}</td>
                  <td class="right mono">{duration(g.halfLife)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p class="hint">
          {tr('Wrok ontstaat als je iemand aanvalt, uit je stam zet of verraadt, en zakt vanzelf weg. Wie wrok heeft, slaat terug, helpt je niet en neemt je niet aan.')}
          {o.betrayals > 0 && ` ${tr('Je hebt {n}× verraad gepleegd: stammen nemen je minder snel aan.', { n: o.betrayals })}`}
        </p>
      </section>
    </div>
  );
}

function AskResources() {
  const s = snapshot.value!;
  const o = opinions.value!;
  const [village, setVillage] = useState<number>(s.village?.id ?? s.villages[0]?.id ?? 0);
  const [res, setRes] = useSaved('relations-ask-res', ['5000', '5000', '5000']);
  const ask = o.resourceAsk;
  const amounts = res.map((x) => Math.max(0, Math.floor(Number(x) || 0))) as [number, number, number];
  return (
    <section class="panel">
      <h3>{tr('Grondstoffen vragen aan je stam')}</h3>
      {ask ? (
        <p>
          {tr('Gevraagd voor {village}: {asked}. Onderweg of geleverd: {sent}. Eén verzoek per speldag.', {
            village: s.villages.find((v) => v.id === ask.village)?.name ?? '?',
            asked: ask.res.map((n) => num(n)).join(' / '),
            sent: ask.sent.map((n) => num(n)).join(' / '),
          })}
        </p>
      ) : (
        <div class="row wrap">
          <select value={String(village)} onChange={(e) => setVillage(Number(e.currentTarget.value))}>
            {s.villages.map((v) => <option key={v.id} value={String(v.id)}>{v.name} ({v.x}|{v.y})</option>)}
          </select>
          {['Hout', 'Leem', 'IJzer'].map((label, i) => (
            <label key={label} class="row">
              {tr(label)}
              <input type="number" min={0} step={1000} style={{ width: '90px' }} value={res[i]} onInput={(e) => { const n = [...res]; n[i] = e.currentTarget.value; setRes(n); }} />
            </label>
          ))}
          <button class="small primary" disabled={amounts[0] + amounts[1] + amounts[2] < 1000} onClick={() => send({ type: 'askTribeResources', village, res: amounts })}>
            {tr('Vraag de stam')}
          </button>
        </div>
      )}
      <p class="hint">{tr('Stamgenoten sturen wat ze kunnen missen (boven 40% van hun opslag), als ze online zijn en zin hebben. Helpers eerder dan opportunisten.')}</p>
    </section>
  );
}
