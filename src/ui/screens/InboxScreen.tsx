import { PlayerLink } from '../components/PlayerLink';
import { FaceIcon } from '../components/FaceIcon';
import { Confirm } from '../components/Confirm';
import { useEffect } from 'preact/hooks';
import type { InboxView } from '../../shared/protocol';
import { formatGameTime } from '../../shared/time';
import { tr, txt } from '../../shared/i18n';
import { attackVillage, inbox, openSupport, openTribe, send, snapshot } from '../store';

const KIND: Record<InboxView['kind'], string> = {
  invite: 'Uitnodiging',
  application: 'Aanmelding',
  proposal: 'Voorstel',
  rhTreaty: 'Rechterhand',
  rhAsk: 'Rechterhand',
  answer: 'Antwoord',
  war: 'Oorlog',
  info: 'Bericht',
  request: 'Verzoek',
  merge: 'Fusie',
  treaty: 'Vredesverdrag',
  talks: 'Vredesbesprekingen',
  lead: 'Leiderschap',
};
const ACCEPT: Record<string, string> = { none: 'Accepteren', support: 'Support plannen', resources: 'Versturen', permission: 'Toestaan', order: 'Akkoord', appeal: 'In beroep (−5 aanzien)', verdict: 'Akkoord' };
const STATUS = { accepted: 'Geaccepteerd', declined: 'Afgewezen', expired: 'Verlopen' } as const;

/** Messages from other players, Football Manager style: some ask for an answer. */
export function InboxScreen() {
  useEffect(() => {
    send({ type: 'getInbox' });
    // opening the inbox reads it (open questions stay open)
    const t = window.setTimeout(() => send({ type: 'inboxRead' }), 1500);
    const poll = window.setInterval(() => send({ type: 'getInbox' }), 5000);
    return () => { window.clearTimeout(t); window.clearInterval(poll); };
  }, []);
  const s = snapshot.value;
  const pause = s?.tribePause ?? { war: true, requests: true };
  const list = inbox.value;
  const open = list.filter((m) => m.status === 'open');
  const rest = list.filter((m) => m.status !== 'open');

  const row = (m: InboxView) => (
    <li key={m.id} class={`inbox-item kind-${m.kind} ${m.read ? '' : 'unread'} ${m.status ?? ''}`}>
      <div class="inbox-head">
        <FaceIcon face={m.fromFace} size={36} />
        <span class={`inbox-kind kind-${m.kind}`}>{tr(KIND[m.kind])}</span>
        <strong class="inbox-title">{txt(m.title)}</strong>
        {m.from >= 0 && <PlayerLink id={m.from} name={m.fromName} />}
        <span class="mono muted">{formatGameTime(m.time)}</span>
      </div>
      <p class="inbox-text">{txt(m.text)}</p>
      <div class="row inbox-actions">
        {m.status === 'open' ? (
          <>
            <button
              class="small primary"
              onClick={() => {
                send({ type: 'inboxAnswer', id: m.id, accept: true });
                // agreeing to support: plan it right away
                if (m.request?.type === 'support') openSupport(m.request.village, m.request.arrives);
                if (m.request?.type === 'order' && m.request.order === 'support') openSupport(m.request.village, m.request.arrives ?? null);
                if (m.request?.type === 'order' && (m.request.order === 'attack' || m.request.order === 'scout')) attackVillage(m.request.x, m.request.y, m.request.nobles ? m.request.arrives : undefined);
              }}
            >
              {m.kind === 'treaty' ? tr('Tekenen') : m.kind === 'lead' ? tr('Ik leid de stam') : m.kind === 'rhTreaty' ? tr('Opzeggen') : m.kind === 'rhAsk' ? (m.rhAsk === 'war' ? tr('Oorlog verklaren') : tr('Voorstellen')) : tr(ACCEPT[m.request?.type ?? 'none'] ?? '')}
            </button>
            {m.request?.type === 'verdict' ? (
              <Confirm label={tr('Oneens: stam verlaten')} cls="warn" sure={tr('Je verlaat de stam en bent een tijd vogelvrij. Zeker?')} onConfirm={() => send({ type: 'inboxAnswer', id: m.id, accept: false })} />
            ) : (
              <button class="small" onClick={() => send({ type: 'inboxAnswer', id: m.id, accept: false })}>
                {m.kind === 'rhTreaty' ? tr('Laten staan') : m.kind === 'rhAsk' ? tr('Nee') : m.kind === 'treaty' || m.kind === 'lead' ? tr('Weigeren') : m.request?.type === 'permission' ? tr('Weigeren') : m.request?.type === 'appeal' ? tr('Laat maar') : tr('Afwijzen')}
              </button>
            )}
            {m.expires !== undefined && <span class="muted">{tr('verloopt {at}', { at: formatGameTime(m.expires) })}</span>}
          </>
        ) : m.status ? (
          <span class="muted">{tr(STATUS[m.status])}</span>
        ) : null}
        {m.tribe !== undefined && (
          <button class="link small" onClick={() => openTribe(m.tribe!)}>
            {tr('Bekijk stam')}
          </button>
        )}
      </div>
    </li>
  );

  return (
    <div class="screen narrow">
      <div class="row">
        <h2 style={{ margin: 0, flex: 1 }}>{tr('Inbox')}</h2>
        <label class="inline-check">
          <input type="checkbox" checked={pause.war} onChange={(e) => send({ type: 'setTribePause', war: e.currentTarget.checked, requests: pause.requests })} /> {tr('pauzeer bij oorlog tegen jouw stam')}
        </label>
        <label class="inline-check">
          <input type="checkbox" checked={pause.requests} onChange={(e) => send({ type: 'setTribePause', war: pause.war, requests: e.currentTarget.checked })} /> {tr('pauzeer bij verzoeken')}
        </label>
      </div>
      {!list.length && (
        <section class="panel">
          <p class="muted">{tr('Nog geen berichten. Uitnodigingen, aanmeldingen, voorstellen en oorlogsverklaringen komen hier binnen.')}</p>
        </section>
      )}
      {open.length > 0 && (
        <section class="panel">
          <h2>{tr('Wacht op jouw antwoord')}</h2>
          <ul class="inbox">{open.map(row)}</ul>
        </section>
      )}
      {rest.length > 0 && (
        <section class="panel">
          <h2>{tr('Berichten')}</h2>
          <ul class="inbox">{rest.slice(0, 60).map(row)}</ul>
        </section>
      )}
    </div>
  );
}
