import { formatGameTime } from '../../shared/time';
import type { LeaderOrderView } from '../../shared/protocol';
import { duration, num } from '../format';
import { attackVillage, openSupport, screen, send, snapshot } from '../store';
import { Coords } from './Coords';
import { Confirm } from './Confirm';
import { PlayerLink } from './PlayerLink';
import { tr } from '../../shared/i18n';
import { trx } from '../i18n';

/** What your leader wants, in his words: the target, the deadline and what counts. */
function what(o: LeaderOrderView): string {
  if (o.order === 'support') return tr('Stuur verdediging naar');
  if (o.order === 'scout') return tr('Verken');
  if (o.nobles) return tr('Breng de edels naar');
  return o.landAt !== undefined ? tr('Gezamenlijke aanval op') : tr('Val aan:');
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
        <strong class="order-kicker">{o.status === 'open' ? tr('Nieuwe opdracht') : tr('Je opdracht')}</strong>
        <span>
          {what(o)} <strong>{o.target.name}</strong> <Coords x={o.target.x} y={o.target.y} />
          {o.target.owner >= 0 && <> {trx('van {player}', { player: <PlayerLink id={o.target.owner} name={o.target.ownerName} /> })}</>}
        </span>
        <span class="muted">{tr('· van {name}', { name: o.from })}</span>
      </div>
      <ul class="order-facts">
        {o.nobles && o.landAt !== undefined ? (
          <li>
            {trx('Edeltrein laten landen om {time} (over {left}), 30 seconden na de legers. Minstens {min}; je trein deel je zelf in in de verzamelplaats (sjablonen werken gewoon). Telt zodra er een edel landt. Gaat een leger van de stam niet, dan vertrekt je ingeplande trein niet en telt het niet tegen je.', {
              time: <strong class="mono">{formatGameTime(o.landAt)}</strong>,
              left: duration(o.landAt - s.time),
              min: <strong>{tr('{n} edels', { n: o.nobles.min })}</strong>,
            })}
          </li>
        ) : o.landAt !== undefined ? (
          <li>
            {trx('Landen om {time} (over {left}), samen met de anderen; de edels komen er direct achteraan.', {
              time: <strong class="mono">{formatGameTime(o.landAt)}</strong>,
              left: duration(o.landAt - s.time),
            })}
          </li>
        ) : (
          <li>
            {trx('Uiterlijk {time} geland {left}', {
              time: <strong class="mono">{formatGameTime(o.until)}</strong>,
              left: <span class={left < 2 * 3600_000 ? 'warn' : 'muted'}>{tr('(nog {t})', { t: duration(left) })}</span>,
            })}
          </li>
        )}
        {o.order === 'scout' && (
          <li>
            {o.minSpies
              ? trx('Telt zodra je verkenners erdoorheen komen — de vorige {n} sneuvelden, stuur er dus {more}. Wat je ziet, weet de stam: daarmee plant je leider de aanval.', {
                  n: num(o.minSpies),
                  more: <strong>{tr('meer dan {n}', { n: num(o.minSpies * 2) })}</strong>,
                })
              : tr('Telt zodra je verkenners erdoorheen komen. Wat je ziet, weet de stam: daarmee plant je leider de aanval.')}
          </li>
        )}
        {o.minAttack !== undefined && (
          <li>
            {trx('Telt bij minstens {n} aanvalskracht in één aanval (verkenners tellen niet), en pas als hij landt: terugroepen = niet gedaan.', { n: <strong>{num(o.minAttack)}</strong> })}
          </li>
        )}
        {o.order === 'scout' ? (o.underway.length > 0 && <li class="good">{tr('Verkenners onderweg, landen {times}', { times: o.underway.map((m) => formatGameTime(m.arrives)).join(' · ') })}</li>) : sent.length > 0 ? (
          <li class="good">
            {tr('Onderweg: {list}', { list: sent.map((m) => (o.nobles ? tr('{n} edel, landt {time}', { n: num(m.nobles), time: formatGameTime(m.arrives) }) : tr('{n} aanval, landt {time}', { n: num(m.attack), time: formatGameTime(m.arrives) }))).join(' · ') })} ✓
          </li>
        ) : o.underway.length > 0 ? (
          <li class="warn">
            {tr('Onderweg, maar telt niet: {list}', { list: o.underway.map((m) => `${tr('{n} aanval', { n: num(m.attack) })}${!enough(m.attack) ? ` ${tr('(te klein)')}` : ''}${m.arrives > o.until ? ` ${tr('(te laat)')}` : ''}`).join(' · ') })}
          </li>
        ) : null}
        {o.order === 'scout' && !o.underway.length && o.best?.spies !== undefined && (
          <li>{tr('Je meeste verkenners: {name} met {n}, landt bij nu versturen om {time}', { name: o.best.name, n: num(o.best.spies), time: formatGameTime(o.best.arrives) })}</li>
        )}
        {(o.planned ?? []).length > 0 && (
          <li class={o.planned.some((p) => (o.order === 'scout' ? p.spies > 0 : enough(p.attack)) && p.landAt <= o.until) ? 'good' : 'warn'}>
            {tr('Ingepland: {list}', { list: o.planned.map((p) => (o.order === 'scout' ? tr('{n} verkenners, landt {time}', { n: num(p.spies), time: formatGameTime(p.landAt) }) : tr('{n} aanval, landt {time}', { n: num(p.attack), time: formatGameTime(p.landAt) }))).join(' · ') })} ⏱
          </li>
        )}
        {o.nobles && !sent.length && !(o.planned ?? []).length && (
          o.best?.nobles ? (
            <li class={o.best.nobles >= o.nobles.min && o.landAt !== undefined && o.best.arrives <= o.landAt ? '' : 'warn'}>
              {tr('Je meeste edels: {name} met {n}, landt bij nu versturen om {time}', { name: o.best.name, n: num(o.best.nobles), time: formatGameTime(o.best.arrives) })}
              {o.best.nobles < o.nobles.min ? ` · ${tr('te weinig voor een trein')}` : o.landAt !== undefined && o.best.arrives > o.landAt ? ` · ${tr('te laat')}` : ' ✓'}
            </li>
          ) : (
            <li class="warn">{tr('Je hebt geen vrije edels binnen bereik.')}</li>
          )
        )}
        {o.order === 'attack' && !o.nobles && !sent.length && !(o.planned ?? []).length && (
          o.best ? (
            <li class={bestOk ? '' : 'warn'}>
              {tr('Je sterkste dorp: {name} met {n} aanval thuis, landt bij nu versturen om {time}', { name: o.best.name, n: num(o.best.attack), time: formatGameTime(o.best.arrives) })}{' '}
              {bestOk ? '✓' : !enough(o.best.attack) ? `· ${tr('te weinig')}` : `· ${tr('te laat')}`}
            </li>
          ) : (
            <li class="warn">{tr('Je hebt nu geen aanvallende troepen thuis.')}</li>
          )
        )}
        {o.status === 'accepted' && <li class="muted">{tr('Gedaan: +6 aanzien bij je leider. Niet op tijd: {penalty}.', { penalty: o.order === 'scout' ? '−4' : tr('−8, meer dan een nee had gekost') })}</li>}
      </ul>
      <div class="row wrap" style={{ gap: '8px' }}>
        {o.status === 'open' && o.message !== undefined && (
          <>
            <button class="small primary" onClick={() => send({ type: 'inboxAnswer', id: o.message!, accept: true })}>{tr('Ja, doe ik')}</button>
            <button class="small" onClick={() => send({ type: 'inboxAnswer', id: o.message!, accept: false })}>{tr('Nee')}</button>
          </>
        )}
        {o.order === 'attack' && !o.nobles && o.landAt !== undefined && o.status === 'accepted' && o.best && enough(o.best.attack) && o.best.arrives <= o.landAt && !sent.length && !(o.planned ?? []).length && (
          <button
            class="small primary"
            title={tr('Je vrije aanvallende troepen in dat dorp vertrekken vanzelf, zodat ze precies om de landingstijd aankomen. Tot dan blijven ze thuis.')}
            onClick={() => send({ type: 'planOrder', from: o.best!.id, to: o.target.id, landAt: o.landAt! })}
          >
            ⏱ {tr('Inplannen vanuit {name}', { name: o.best.name })}
          </button>
        )}
        {o.nobles && o.nobles.giveTo.length > 0 && o.status === 'accepted' && !sent.length &&
          o.nobles.giveTo.slice(0, 3).map((g) => (
            <Confirm key={g.id} label={tr('Geef aan {name} ({d} velden)', { name: g.name, d: g.d })} sure={tr('De edels aan {name} geven? Je ingeplande edeltrein naar dit doel vervalt.', { name: g.name })} onConfirm={() => send({ type: 'giveNobles', op: o.nobles!.op, to: g.id })} />
          ))}
        {o.order !== 'support' ? (
          <button class="small" onClick={() => attackVillage(o.target.x, o.target.y, o.landAt)}>{tr('Naar verzamelplaats')}</button>
        ) : (
          <button class="small" onClick={() => openSupport(o.target.id, o.until)}>{tr('Support plannen')}</button>
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
      title={(() => {
        const p = { kind: o.status === 'open' ? tr('Nieuwe opdracht') : tr('Opdracht|bevel'), from: o.from, target: `${o.target.name} (${o.target.x}|${o.target.y})` };
        return o.order === 'attack' ? tr('{kind} van {from}: val {target} aan', p) : o.order === 'scout' ? tr('{kind} van {from}: verken {target}', p) : tr('{kind} van {from}: support naar {target}', p);
      })()}
    >
      <span aria-hidden="true">⚑</span> {all.some((x) => x.status === 'open') ? tr('Opdracht|bevel') : duration(at - s.time)}{more}
    </button>
  );
}
