import { useEffect, useState } from 'preact/hooks';
import { useSaved } from '../useSaved';
import { Coords } from '../components/Coords';
import { BuildingHeader } from '../buildings/BuildingHeader';
import { CancelButton } from '../components/CancelButton';
import { SurplusPanel } from '../components/SurplusPanel';
import type { OfferView, TradeSide } from '../../shared/protocol';
import { formatGameTime } from '../../shared/time';
import { duration, num } from '../format';
import { mapData, send, snapshot } from '../store';
import { distance } from '../units';
import { tr } from '../../shared/i18n';
import { trx } from '../i18n';

const RES_LABELS = ['Hout', 'Leem', 'IJzer'] as const;
const RES_KEYS = ['wood', 'stone', 'iron'] as const;

function Amount({ side }: { side: TradeSide }) {
  return (
    <span class={`res res-${RES_KEYS[side.res]}`} title={tr(RES_LABELS[side.res])}>
      {num(side.amount)}
    </span>
  );
}

/** "1 : 1.25" from the buyer's point of view: what you pay per unit you get. */
function ratio(o: { give: TradeSide; want: TradeSide }): string {
  return `1 : ${(o.want.amount / o.give.amount).toFixed(2)}`;
}

function ResSelect({ value, onChange }: { value: 0 | 1 | 2; onChange: (r: 0 | 1 | 2) => void }) {
  return (
    <select value={String(value)} onChange={(e) => onChange(Number(e.currentTarget.value) as 0 | 1 | 2)}>
      {RES_LABELS.map((l, i) => (
        <option key={i} value={String(i)}>
          {tr(l)}
        </option>
      ))}
    </select>
  );
}

export function MarketScreen() {
  const s = snapshot.value;
  const v = s?.village;
  const m = s?.market;
  // sending
  const [amounts, setAmounts] = useState<[string, string, string]>(['', '', '']);
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  // own offer
  const [giveRes, setGiveRes] = useSaved<0 | 1 | 2>('market-give-res', 0);
  const [giveAmount, setGiveAmount] = useSaved('market-give', '1000');
  const [wantRes, setWantRes] = useSaved<0 | 1 | 2>('market-want-res', 1);
  const [wantAmount, setWantAmount] = useSaved('market-want', '1000');
  const [count, setCount] = useSaved('market-count', '1');
  // browsing
  const [filter, setFilter] = useSaved<'all' | 0 | 1 | 2>('market-filter', 'all');

  useEffect(() => {
    if (!mapData.value) send({ type: 'getMap' });
  }, []);

  if (!s || !v) return null;
  const level = v.buildings.find((b) => b.id === 'market')?.level ?? 0;
  if (!m || level === 0) {
    return (
      <div class="screen narrow">
        <h2>{tr('Marktplaats')}</h2>
        <BuildingHeader village={v} id="market" />
        <section class="panel">
          <p class="muted">{tr('Je hebt een marktplaats nodig om te handelen. Bouw hem in het hoofdgebouw (hoofdgebouw 3, opslag 2).')}</p>
        </section>
      </div>
    );
  }

  // --- sending -----------------------------------------------------------------------
  const res = amounts.map((a) => Math.max(0, Math.floor(Number(a) || 0))) as [number, number, number];
  const total = res[0] + res[1] + res[2];
  const merchantsNeeded = Math.ceil(total / m.carry);
  const target = mapData.value?.villages.find((t) => t.x === Number(x) && t.y === Number(y));
  const dist = target ? distance(v, target) : 0;
  const eta = Math.round(dist * m.minutesPerField * 60_000);
  const sendBlocker = !target
    ? tr('Kies een doel')
    : target.id === v.id
      ? tr('Dat is dit dorp')
      : target.kind === 'barb'
        ? tr('Niet naar barbaren')
        : total === 0
          ? tr('Vul grondstoffen in')
          : res.some((r, i) => r > (v.res[i] ?? 0))
            ? tr('Niet genoeg grondstoffen')
            : merchantsNeeded > m.merchantsFree
              ? tr('{n} handelaren nodig', { n: merchantsNeeded })
              : null;
  const maxFor = (i: number) => {
    const others = res.reduce((a, r, j) => (j === i ? a : a + r), 0);
    return Math.max(0, Math.min(Math.floor(v.res[i] ?? 0), m.merchantsFree * m.carry - others));
  };
  const doSend = () => {
    if (!target || sendBlocker) return;
    send({ type: 'sendResources', from: v.id, to: target.id, res });
    setAmounts(['', '', '']);
  };
  const ownOthers = s.villages.filter((o) => o.id !== v.id);

  // --- own offer ---------------------------------------------------------------------
  const g = Math.floor(Number(giveAmount) || 0);
  const w = Math.floor(Number(wantAmount) || 0);
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const offerBlocker =
    g <= 0 || w <= 0
      ? tr('Vul beide hoeveelheden in')
      : giveRes === wantRes
        ? tr('Kies twee verschillende grondstoffen')
        : g * n > (v.res[giveRes] ?? 0)
          ? tr('Niet genoeg grondstoffen')
          : Math.ceil(g / m.carry) * n > m.merchantsFree
            ? tr('{n} handelaren nodig', { n: Math.ceil(g / m.carry) * n })
            : null;
  const doOffer = () => {
    if (offerBlocker) return;
    send({ type: 'createOffer', villageId: v.id, give: { res: giveRes, amount: g }, want: { res: wantRes, amount: w }, count: n });
  };

  // --- others' offers ----------------------------------------------------------------
  const offers = m.offers.filter((o) => filter === 'all' || o.give.res === filter);
  const acceptBlocker = (o: OfferView): string | null =>
    (v.res[o.want.res] ?? 0) < o.want.amount
      ? tr('Niet genoeg {res}', { res: tr(RES_LABELS[o.want.res].toLowerCase()) })
      : Math.ceil(o.want.amount / m.carry) > m.merchantsFree
        ? tr('{n} handelaren nodig', { n: Math.ceil(o.want.amount / m.carry) })
        : null;

  return (
    <div class="screen narrow">
      <div class="screen-head">
        <h2>{tr('Marktplaats')}</h2>
        <span class="chip gold">{tr('Level {n}', { n: level })}</span>
      </div>
      <BuildingHeader village={v} id="market" />
      <p class="muted">
        {trx('Handelaren: {free} / {total} vrij · elk draagt {carry} · {time} per veld', { free: <strong>{m.merchantsFree}</strong>, total: m.merchantsTotal, carry: num(m.carry), time: duration(m.minutesPerField * 60_000) })}
      </p>

      <section class="panel">
        <h3>{tr('Grondstoffen sturen')}</h3>
        <div class="send-grid">
          {RES_LABELS.map((label, i) => (
            <label key={i} class="send-unit">
              <span>
                {tr(label)}{' '}
                <button
                  class="link"
                  onClick={() => {
                    const next = [...amounts] as [string, string, string];
                    next[i] = String(maxFor(i));
                    setAmounts(next);
                  }}
                >
                  ({num(maxFor(i))})
                </button>
              </span>
              <input
                type="number"
                min={0}
                value={amounts[i]}
                placeholder="0"
                onInput={(e) => {
                  const next = [...amounts] as [string, string, string];
                  next[i] = e.currentTarget.value;
                  setAmounts(next);
                }}
              />
            </label>
          ))}
        </div>
        <div class="row">
          <label class="coord">
            {tr('Doel x')}
            <input type="number" value={x} onInput={(e) => setX(e.currentTarget.value)} />
          </label>
          <label class="coord">
            y
            <input type="number" value={y} onInput={(e) => setY(e.currentTarget.value)} />
          </label>
          {ownOthers.length > 0 && (
            <label>
              {tr('of eigen dorp')}
              <select
                value=""
                onChange={(e) => {
                  const o = ownOthers.find((t) => t.id === Number(e.currentTarget.value));
                  if (o) {
                    setX(String(o.x));
                    setY(String(o.y));
                  }
                }}
              >
                <option value="">—</option>
                {ownOthers.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.name} ({o.x}|{o.y})
                  </option>
                ))}
              </select>
            </label>
          )}
          <button class="primary" disabled={sendBlocker !== null} title={sendBlocker ?? ''} onClick={doSend}>
            {tr('Versturen')}
          </button>
          {ownOthers.length > 0 && (
            <button
              title={tr('Verdeelt hout, leem en ijzer over al je dorpen naar rato van hun opslag, met de vrije handelaren')}
              onClick={() => send({ type: 'balanceVillages' })}
            >
              {tr('Balanceer al mijn dorpen')}
            </button>
          )}
        </div>
        <p class="muted">
          {x && y && !target && tr('Geen dorp op deze coördinaten. ')}
          {target &&
            tr('{village} van {owner} · {dist} velden · {n} handelaren · aankomst over {eta} ({at})', { village: target.name, owner: target.ownerName, dist: dist.toFixed(1), n: merchantsNeeded, eta: duration(eta), at: formatGameTime(s.time + eta) })}
          {sendBlocker && target && ` · ${sendBlocker}`}
        </p>
      </section>

      {ownOthers.length > 0 && <SurplusPanel />}

      <section class="panel">
        <h3>{tr('Eigen aanbod')}</h3>
        <div class="row">
          <label>
            {tr('Ik bied')}
            <input type="number" min={1} value={giveAmount} onInput={(e) => setGiveAmount(e.currentTarget.value)} />
          </label>
          <ResSelect value={giveRes} onChange={setGiveRes} />
          <label>
            {tr('voor')}
            <input type="number" min={1} value={wantAmount} onInput={(e) => setWantAmount(e.currentTarget.value)} />
          </label>
          <ResSelect value={wantRes} onChange={setWantRes} />
          <label class="coord">
            ×
            <input type="number" min={1} max={50} value={count} onInput={(e) => setCount(e.currentTarget.value)} />
          </label>
          <button class="primary" disabled={offerBlocker !== null} title={offerBlocker ?? ''} onClick={doOffer}>
            {tr('Aanbieden')}
          </button>
        </div>
        <p class="muted">
          {tr('De grondstoffen en handelaren gaan opzij tot iemand het aanbod aanneemt of je het intrekt. Bots nemen alleen deals die ze de moeite waard vinden.')}
          {offerBlocker && g > 0 && w > 0 ? ` · ${offerBlocker}` : ''}
        </p>
        {m.myOffers.length > 0 && (
          <table class="table">
            <thead>
              <tr>
                <th>{tr('Biedt')}</th>
                <th>{tr('Vraagt')}</th>
                <th>{tr('Verhouding')}</th>
                <th>{tr('Geplaatst')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {m.myOffers.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Amount side={o.give} />
                  </td>
                  <td>
                    <Amount side={o.want} />
                  </td>
                  <td class="mono muted">{ratio(o)}</td>
                  <td class="mono muted">{formatGameTime(o.created)}</td>
                  <td class="right">
                    <button class="small" onClick={() => send({ type: 'cancelOffer', id: o.id })}>
                      {tr('Intrekken')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section class="panel">
        <h3>{tr('Aanbiedingen in de buurt')}</h3>
        <div class="row">
          <label>
            {tr('Ik zoek')}
            <select
              value={String(filter)}
              onChange={(e) => setFilter(e.currentTarget.value === 'all' ? 'all' : (Number(e.currentTarget.value) as 0 | 1 | 2))}
            >
              <option value="all">{tr('alles')}</option>
              {RES_LABELS.map((l, i) => (
                <option key={i} value={String(i)}>
                  {tr(l.toLowerCase())}
                </option>
              ))}
            </select>
          </label>
        </div>
        {offers.length === 0 ? (
          <p class="muted">{tr('Geen aanbiedingen binnen 40 velden.')}</p>
        ) : (
          <table class="table">
            <thead>
              <tr>
                <th>{tr('Dorp')}</th>
                <th>{tr('Biedt')}</th>
                <th>{tr('Vraagt')}</th>
                <th>{tr('Verhouding')}</th>
                <th class="right">{tr('Afstand')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => {
                const blocker = acceptBlocker(o);
                return (
                  <tr key={o.id}>
                    <td>
                      {o.village.name} <Coords x={o.village.x} y={o.village.y} /> <span class="muted">· {o.village.ownerName}</span>
                    </td>
                    <td>
                      <Amount side={o.give} />
                    </td>
                    <td>
                      <Amount side={o.want} />
                    </td>
                    <td class="mono muted">{ratio(o)}</td>
                    <td class="right mono">{o.distance.toFixed(1)}</td>
                    <td class="right">
                      <button
                        class="small"
                        disabled={blocker !== null}
                        title={blocker ?? tr('Aankomst over {eta}', { eta: duration(Math.round(o.distance * m.minutesPerField * 60_000)) })}
                        onClick={() => send({ type: 'acceptOffer', id: o.id, villageId: v.id })}
                      >
                        {tr('Aannemen')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section class="panel">
        <h3>{tr('Handelaren onderweg')}</h3>
        {m.trades.length === 0 ? (
          <p class="muted">{tr('Geen handelaren onderweg.')}</p>
        ) : (
          <table class="table">
            <thead>
              <tr>
                <th>{tr('Opdracht')}</th>
                <th>{tr('Lading')}</th>
                <th>{tr('Aankomst')}</th>
                <th class="right">{tr('Nog')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {m.trades.map((t) => (
                <tr key={t.id}>
                  <td>
                    {t.kind === 'tradeReturn' ? (
                      <>
                        {trx('{tag} van {name} {coords}', { tag: <span class="tag-return">{tr('Terug')}</span>, name: t.from.name, coords: <Coords x={t.from.x} y={t.from.y} /> })}
                      </>
                    ) : t.to.id === v.id ? (
                      <>
                        {trx('{tag} van {name} {coords}', { tag: <span class="tag-support">{tr('Binnenkomend')}</span>, name: t.from.name, coords: <Coords x={t.from.x} y={t.from.y} /> })}
                      </>
                    ) : (
                      <>
                        {trx('{tag} naar {name} {coords}', { tag: <span class="tag-support">{tr('Levering')}</span>, name: t.to.name, coords: <Coords x={t.to.x} y={t.to.y} /> })}
                      </>
                    )}
                  </td>
                  <td>
                    {t.res && t.kind === 'trade'
                      ? t.res.map((r, i) =>
                          r > 0 ? (
                            <span key={i} class={`res res-${RES_KEYS[i]}`}>
                              {num(r)}{' '}
                            </span>
                          ) : null,
                        )
                      : <span class="muted">{tr('leeg')}</span>}
                  </td>
                  <td class="mono muted">{formatGameTime(t.arrives)}</td>
                  <td class="right mono">{duration(t.arrives - s.time)}</td>
                  <td class="right">
                    <CancelButton until={t.cancelUntil} now={s.time} id={t.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
