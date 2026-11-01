import { formatGameTime } from '../../shared/time';
import type { LeaderOrderView } from '../../shared/protocol';
import { duration, num } from '../format';
import { attackVillage, openSupport, screen, send, snapshot } from '../store';
import { Coords } from './Coords';
import { Confirm } from './Confirm';
import { PlayerLink } from './PlayerLink';

/** What your leader wants, in his words: the target, the deadline and what counts. */
function what(o: LeaderOrderView): string {
  if (o.order === 'support') return 'Stuur verdediging naar';
  if (o.order === 'scout') return 'Verken';
  if (o.nobles) return 'Breng de edels naar';
  return o.landAt !== undefined ? 'Gezamenlijke aanval op' : 'Val aan:';
}

/** Your orders from your bot leader: the normal one and the scout orders beside it. */
export function OrderPanel() {
  const s = snapshot.value;
  if (!s) return null;
  const all = [...(s.leaderOrder ? [s.leaderOrder] : []), ...(s.scoutOrders ?? [])];
  return <>{all.map((o) => <OneOrder key={`${o.order}:${o.target.id}`} o={o} />)}</>;
}

/** One order: target, deadline, what counts, and how you stand. */
function OneOrder({ o }: { o: LeaderOrderView }) {
  const s = snapshot.value!;
  const left = o.until - s.time;
  const enough = (a: number) => o.minAttack === undefined || a >= o.minAttack;
  const sent = o.underway.filter((m) => (o.nobles ? m.nobles > 0 : enough(m.attack)) && m.arrives <= o.until);
  const bestOk = o.best && enough(o.best.attack) && o.best.arrives <= o.until;
  return (
    <div class="order-panel" data-order>
      <div class="row wrap" style={{ gap: '8px', alignItems: 'baseline' }}>
        <strong class="order-kicker">{o.status === 'open' ? 'Nieuwe opdracht' : 'Je opdracht'}</strong>
        <span>
          {what(o)} <strong>{o.target.name}</strong> <Coords x={o.target.x} y={o.target.y} />
          {o.target.owner >= 0 && <> van <PlayerLink id={o.target.owner} name={o.target.ownerName} /></>}
        </span>
        <span class="muted">· van {o.from}</span>
      </div>
      <ul class="order-facts">
        {o.nobles && o.landAt !== undefined ? (
          <li>
            Edeltrein laten landen om <strong class="mono">{formatGameTime(o.landAt)}</strong> (over {duration(o.landAt - s.time)}), 30 seconden na de legers. Minstens{' '}
            <strong>{o.nobles.min} edels</strong>; je trein deel je zelf in in de verzamelplaats (sjablonen werken gewoon). Telt zodra er een edel landt. Gaat een leger van de stam niet, dan
            vertrekt je ingeplande trein niet en telt het niet tegen je.
          </li>
        ) : o.landAt !== undefined ? (
          <li>
            Landen om <strong class="mono">{formatGameTime(o.landAt)}</strong> (over {duration(o.landAt - s.time)}), samen met de anderen; de edels komen er direct
            achteraan.
          </li>
        ) : (
          <li>
            Uiterlijk <strong class="mono">{formatGameTime(o.until)}</strong> geland{' '}
            <span class={left < 2 * 3600_000 ? 'warn' : 'muted'}>(nog {duration(left)})</span>
          </li>
        )}
        {o.order === 'scout' && (
          <li>
            Telt zodra je verkenners erdoorheen komen{o.minSpies ? <> — de vorige {num(o.minSpies)} sneuvelden, stuur er dus <strong>meer dan {num(o.minSpies * 2)}</strong></> : ''}. Wat je ziet, weet de stam: daarmee plant je leider de aanval.
          </li>
        )}
        {o.minAttack !== undefined && (
          <li>
            Telt bij minstens <strong>{num(o.minAttack)}</strong> aanvalskracht in één aanval (verkenners tellen niet), en pas als hij landt: terugroepen = niet gedaan.
          </li>
        )}
        {o.order === 'scout' ? (o.underway.length > 0 && <li class="good">Verkenners onderweg, landen {o.underway.map((m) => formatGameTime(m.arrives)).join(' · ')}</li>) : sent.length > 0 ? (
          <li class="good">
            Onderweg: {sent.map((m) => (o.nobles ? `${num(m.nobles)} edel, landt ${formatGameTime(m.arrives)}` : `${num(m.attack)} aanval, landt ${formatGameTime(m.arrives)}`)).join(' · ')} ✓
          </li>
        ) : o.underway.length > 0 ? (
          <li class="warn">
            Onderweg, maar telt niet: {o.underway.map((m) => `${num(m.attack)} aanval${!enough(m.attack) ? ' (te klein)' : ''}${m.arrives > o.until ? ' (te laat)' : ''}`).join(' · ')}
          </li>
        ) : null}
        {o.order === 'scout' && !o.underway.length && o.best?.spies !== undefined && (
          <li>Je meeste verkenners: {o.best.name} met {num(o.best.spies)}, landt bij nu versturen om {formatGameTime(o.best.arrives)}</li>
        )}
        {(o.planned ?? []).length > 0 && (
          <li class={o.planned.some((p) => (o.order === 'scout' ? p.spies > 0 : enough(p.attack)) && p.landAt <= o.until) ? 'good' : 'warn'}>
            Ingepland: {o.planned.map((p) => `${o.order === 'scout' ? `${num(p.spies)} verkenners` : `${num(p.attack)} aanval`}, landt ${formatGameTime(p.landAt)}`).join(' · ')} ⏱
          </li>
        )}
        {o.nobles && !sent.length && !(o.planned ?? []).length && (
          o.best?.nobles ? (
            <li class={o.best.nobles >= o.nobles.min && o.landAt !== undefined && o.best.arrives <= o.landAt ? '' : 'warn'}>
              Je meeste edels: {o.best.name} met {num(o.best.nobles)}, landt bij nu versturen om {formatGameTime(o.best.arrives)}
              {o.best.nobles < o.nobles.min ? ' · te weinig voor een trein' : o.landAt !== undefined && o.best.arrives > o.landAt ? ' · te laat' : ' ✓'}
            </li>
          ) : (
            <li class="warn">Je hebt geen vrije edels binnen bereik.</li>
          )
        )}
        {o.order === 'attack' && !o.nobles && !sent.length && !(o.planned ?? []).length && (
          o.best ? (
            <li class={bestOk ? '' : 'warn'}>
              Je sterkste dorp: {o.best.name} met {num(o.best.attack)} aanval thuis, landt bij nu versturen om {formatGameTime(o.best.arrives)}{' '}
              {bestOk ? '✓' : !enough(o.best.attack) ? '· te weinig' : '· te laat'}
            </li>
          ) : (
            <li class="warn">Je hebt nu geen aanvallende troepen thuis.</li>
          )
        )}
        {o.status === 'accepted' && <li class="muted">Gedaan: +6 aanzien bij je leider. Niet op tijd: {o.order === 'scout' ? '−4' : '−8, meer dan een nee had gekost'}.</li>}
      </ul>
      <div class="row wrap" style={{ gap: '8px' }}>
        {o.status === 'open' && o.message !== undefined && (
          <>
            <button class="small primary" onClick={() => send({ type: 'inboxAnswer', id: o.message!, accept: true })}>Ja, doe ik</button>
            <button class="small" onClick={() => send({ type: 'inboxAnswer', id: o.message!, accept: false })}>Nee</button>
          </>
        )}
        {o.order === 'attack' && !o.nobles && o.landAt !== undefined && o.status === 'accepted' && o.best && enough(o.best.attack) && o.best.arrives <= o.landAt && !sent.length && !(o.planned ?? []).length && (
          <button
            class="small primary"
            title="Je vrije aanvallende troepen in dat dorp vertrekken vanzelf, zodat ze precies om de landingstijd aankomen. Tot dan blijven ze thuis."
            onClick={() => send({ type: 'planOrder', from: o.best!.id, to: o.target.id, landAt: o.landAt! })}
          >
            ⏱ Inplannen vanuit {o.best.name}
          </button>
        )}
        {o.nobles && o.nobles.giveTo.length > 0 && o.status === 'accepted' && !sent.length &&
          o.nobles.giveTo.slice(0, 3).map((g) => (
            <Confirm key={g.id} label={`Geef aan ${g.name} (${g.d} velden)`} sure={`De edels aan ${g.name} geven? Je ingeplande edeltrein naar dit doel vervalt.`} onConfirm={() => send({ type: 'giveNobles', op: o.nobles!.op, to: g.id })} />
          ))}
        {o.order !== 'support' ? (
          <button class="small" onClick={() => attackVillage(o.target.x, o.target.y, o.landAt)}>Naar verzamelplaats</button>
        ) : (
          <button class="small" onClick={() => openSupport(o.target.id, o.until)}>Support plannen</button>
        )}
      </div>
    </div>
  );
}

/** A small chip in the top bar while orders run (the first one counts down); opens the tribe screen. */
export function OrderChip() {
  const s = snapshot.value;
  const all = s ? [...(s.leaderOrder ? [s.leaderOrder] : []), ...(s.scoutOrders ?? [])] : [];
  const o = all[0];
  if (!s || !o) return null;
  const at = o.landAt ?? o.until;
  const more = all.length > 1 ? ` +${all.length - 1}` : '';
  return (
    <button
      class={`order-chip ${all.some((x) => x.status === 'open') ? 'open' : ''}`}
      data-order-chip
      onClick={() => (screen.value = 'tribes')}
      title={`${o.status === 'open' ? 'Nieuwe opdracht' : 'Opdracht'} van ${o.from}: ${o.order === 'attack' ? 'val' : o.order === 'scout' ? 'verken' : 'support naar'} ${o.target.name} (${o.target.x}|${o.target.y})${o.order === 'attack' ? ' aan' : ''}`}
    >
      <span aria-hidden="true">⚑</span> {all.some((x) => x.status === 'open') ? 'Opdracht' : duration(at - s.time)}{more}
    </button>
  );
}
