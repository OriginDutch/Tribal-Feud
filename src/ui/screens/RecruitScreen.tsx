import { MintAllPanel } from '../components/MintAllPanel';
import { ItemsPanel } from '../components/ItemsPanel';
import { useState } from 'preact/hooks';
import { tr } from '../../shared/i18n';
import { UnitIcon } from '../units/UnitIcon';
import { BuildingHeader } from '../buildings/BuildingHeader';
import type { RecruitBuilding, UnitId } from '../../shared/gameData';
import { formatGameTime } from '../../shared/time';
import type { UnitView } from '../../sim/view';
import { Cost } from '../components/Cost';
import { duration, num } from '../format';
import { send, snapshot } from '../store';
import { trx } from '../i18n';

function StatIcon({ d }: { d: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/** Where the eye goes in each portrait (vertical %, for the crop): riders sit higher than men on foot. */
const PORTRAIT_FOCUS: Partial<Record<string, number>> = { spear: 0, sword: 0, archer: 4, axe: 6, spy: 8, light: 8, marcher: 4, heavy: 4, knight: 10, snob: 4, ram: 50, catapult: 12 };

function UnitCard({ villageId, u, have }: { villageId: number; u: UnitView; have: [number, number, number] }) {
  const [count, setCount] = useState('');
  const n = Number(count);
  const go = () => {
    if (Number.isInteger(n) && n > 0) {
      send({ type: 'recruit', villageId, unit: u.id as UnitId, count: n });
      setCount('');
    }
  };
  return (
    <div class={`unit-card${u.recruit.blocker ? (u.recruit.locked ? ' blocked' : ' limit') : ''}`}>
      <div class="uc-portrait">
        <img src={`/units/${u.id}.webp`} alt="" loading="lazy" width={480} height={480} style={{ objectPosition: `50% ${PORTRAIT_FOCUS[u.id] ?? 5}%` }} />
      </div>
      <div class="uc-head">
        <div class="uc-icon">
          <UnitIcon id={u.id} size={44} />
        </div>
        <div>
          <h3>{u.name}</h3>
          <div class="uc-sub">{tr('{n} in dorp', { n: num(u.home) })}</div>
        </div>
      </div>
      <div class="uc-stats">
        <span class="stat" title={tr('Aanval')}>
          <StatIcon d="M5 19 19 5M15 5h4v4" />
          <b>{num(u.stats.attack)}</b>
        </span>
        <span class="stat" title={tr('Verdediging')}>
          <StatIcon d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
          <b>{num(u.stats.defense)}</b>
        </span>
        <span class="stat" title={tr('Verdediging tegen cavalerie')}>
          <StatIcon d="M4 18c0-5 3-8 6-9l3-3 2 2-1 3c2 2 3 4 3 7" />
          <b>{num(u.stats.defenseCavalry)}</b>
        </span>
        <span class="stat" title={tr('Boerderijplaatsen')}>
          <StatIcon d="M3 11 12 4l9 7v9H3z" />
          <b>{u.pop}</b>
        </span>
      </div>
      <div class="uc-meta">
        <Cost cost={u.cost} have={have} />
        <span class="mono muted">{duration(u.recruit.perUnit)}</span>
      </div>
      {u.recruit.blocker ? (
        <div class="uc-blocker">{u.recruit.blocker}</div>
      ) : (
        <div class="uc-train">
          <div class="num-input">
            <input
              type="number"
              min={1}
              max={u.recruit.max}
              value={count}
              placeholder="0"
              onInput={(e) => setCount(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
            />
            <button type="button" onClick={() => setCount(String(u.recruit.max))} title={tr('Maximaal')}>
              {tr('max {n}', { n: num(u.recruit.max) })}
            </button>
          </div>
          <button class="primary" disabled={!(n > 0)} onClick={go}>
            {tr('Train')}
          </button>
        </div>
      )}
    </div>
  );
}

const TITLES: Record<RecruitBuilding, string> = {
  barracks: 'Kazerne',
  stable: 'Stal',
  garage: 'Werkplaats',
  statue: 'Standbeeld',
  snob: 'Adelshoeve',
};

function CoinPanel() {
  const v = snapshot.value?.village;
  const [count, setCount] = useState('1');
  if (!v) return null;
  const n = v.nobles;
  const coins = n.mode === 'coins';
  const amount = Math.max(1, Math.floor(Number(count) || 1));
  return (
    <section class="panel">
      <h3>{coins ? tr('Munten slaan') : tr('Pakketten opslaan')}</h3>
      <table class="table compact">
        <tbody>
          <tr>
            <td>{coins ? tr('Munten (voor al je dorpen)') : tr('Pakketten in dit dorp')}</td>
            <td class="right mono">{num(n.have)}</td>
          </tr>
          <tr>
            <td>{tr('Edel-plekken in gebruik (extra dorpen + edels)')}</td>
            <td class="right mono">{n.slotsUsed}</td>
          </tr>
          <tr>
            <td>{coins ? tr('Volgende plek (nr. {n})', { n: n.nextSlot }) : tr('Volgende edel vereist')}</td>
            <td class="right mono">
              {coins
                ? `${tr('{n} munten', { n: n.slotPrice })} · ${n.missing > 0 ? tr('nog {n} slaan', { n: num(n.missing) }) : tr('betaald')}`
                : tr('{n} pakketten', { n: n.need })}
            </td>
          </tr>
          <tr>
            <td>{tr('Edels die je nu nog mag trainen')}</td>
            <td class="right mono">{n.allowed}</td>
          </tr>
          <tr>
            <td>{tr('Max afstand edelman')}</td>
            <td class="right mono">{tr('{n} velden', { n: n.maxDistance })}</td>
          </tr>
        </tbody>
      </table>
      <div class="row">
        <span>
          {coins ? tr('1 munt:') : tr('1 pakket:')} <Cost cost={n.coinCost} have={v.res} />
        </span>
        <input type="number" min={1} max={Math.max(1, n.maxMint)} value={count} onInput={(e) => setCount(e.currentTarget.value)} style={{ width: '80px' }} />
        <span class="muted">({n.maxMint})</span>
        <button
          class="action"
          disabled={n.mintBlocker !== null}
          title={n.mintBlocker ?? ''}
          onClick={() => send({ type: 'mintCoins', villageId: v.id, count: amount })}
        >
          {n.mintBlocker ?? (coins ? tr('Slaan') : tr('Opslaan'))}
        </button>
      </div>
      <p class="hint">
        {coins
          ? `${tr('Elke edel en elk extra dorp neemt een plek in. Plek 1 kost 1 munt, plek 2 nog 2, plek 3 nog 3, enz.')}${
              n.curve === 'tiered' ? ' ' + tr('Maximaal 25 per plek tot plek 200, daarna 50, vanaf 300 75, enzovoort.') : ''
            } ${tr('Munten raak je niet kwijt als een edel sneuvelt.')}`
          : tr('Pakketten blijven in dit dorp en worden opgebruikt bij het trainen van een edel.')}{' '}
        {coins
          ? n.allowed === 1 ? tr('Je hebt nu munten genoeg voor 1 edel.') : tr('Je hebt nu munten genoeg voor {n} edels.', { n: n.allowed })
          : n.allowed === 1 ? tr('Je hebt nu pakketten genoeg voor 1 edel.') : tr('Je hebt nu pakketten genoeg voor {n} edels.', { n: n.allowed })}
      </p>
    </section>
  );
}

export function RecruitScreen({ building }: { building: RecruitBuilding }) {
  const s = snapshot.value;
  const v = s?.village;
  if (!s || !v) return null;
  const b = v.buildings.find((x) => x.id === building);
  const units = v.units.filter((u) => u.building === building && u.enabled);
  const queue = v.recruitQueues[building];

  return (
    <div class="screen">
      <div class="screen-head">
        <h2>{tr(TITLES[building])}</h2>
        {b && b.level > 0 && <span class="chip gold">{tr('Level {n}', { n: b.level })}</span>}
      </div>
      <BuildingHeader village={v} id={building} />
      {b && b.level === 0 ? (
        <section class="panel">
          <p class="muted">{tr('Dit gebouw bestaat nog niet. Bouw het hierboven of in het hoofdgebouw.')}</p>
        </section>
      ) : (
        <>
          {building === 'snob' && <CoinPanel />}
          {building === 'snob' && <MintAllPanel />}
          {building === 'statue' && <ItemsPanel />}
          <div class="unit-grid">
            {units.map((u) => (
              <UnitCard key={u.id} villageId={v.id} u={u} have={v.res} />
            ))}
          </div>
          {queue.length > 0 && (
            <section class="panel">
              <h3>{tr('Rekruteren')}</h3>
              <p class="queue-total">
                {trx('Totaal {n} units · nog {left} · klaar op {end}', {
                  n: num(queue.reduce((n, j) => n + j.total - j.done, 0)),
                  left: <span class="mono">{duration((queue.at(-1)?.end ?? s.time) - s.time)}</span>,
                  end: <span class="mono">{formatGameTime(queue.at(-1)?.end ?? s.time)}</span>,
                })}
              </p>
              <div class="jobs">
                {queue.map((job, i) => {
                  const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
                  return (
                    <div class="job" key={job.id}>
                      <UnitIcon id={job.unit} size={34} />
                      <div class="job-text">
                        <b>
                          {num(job.total - job.done)} {job.name}
                        </b>
                        <div class="muted small-text">
                          {i === 0
                            ? `${job.done > 0 ? `${tr('{n} klaar', { n: num(job.done) })} · ` : ''}${tr('volgende over {time}', { time: duration(job.nextAt - s.time) })}`
                            : tr('wacht in de rij')}
                        </div>
                      </div>
                      <div class="bar">
                        <b style={{ width: `${pct}%` }} />
                      </div>
                      <div class="mono muted small-text">{tr('klaar {time}', { time: formatGameTime(job.end) })}</div>
                      <button class="small ghost" onClick={() => send({ type: 'cancelRecruit', villageId: v.id, jobId: job.id })}>
                        {tr('Annuleer')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
