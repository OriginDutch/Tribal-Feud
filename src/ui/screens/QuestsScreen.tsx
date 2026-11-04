import { txt } from '../../shared/i18n';
import { Cost } from '../components/Cost';
import { num } from '../format';
import { send, snapshot } from '../store';
import { unitsText } from '../units';
import { tr } from '../../shared/i18n';

export function QuestsScreen() {
  const s = snapshot.value;
  const q = s?.quests;
  if (!s || !q) return null;

  return (
    <div class="screen narrow">
      <h2>{tr('Opdrachten')}</h2>

      <section class="panel">
        <div class="row">
          <h3 style={{ margin: 0, flex: 1 }}>{tr('Beloningen ({n})', { n: q.rewards.length })}</h3>
          <label class="row" title={tr('Een beloning gaat vanzelf naar het dorp waar hij helemaal in de opslag past (het dorp met de meeste ruimte over). Wat nergens past, blijft hier staan.')}>
            <input type="checkbox" checked={s.autoRewards} onChange={(e) => send({ type: 'setAutoRewards', on: e.currentTarget.checked })} /> {tr('Automatisch ophalen als het past')}
          </label>
          {q.rewards.length > 1 && (
            <button class="small primary" onClick={() => send({ type: 'claimAllRewards' })}>
              {tr('Alles ophalen')}
            </button>
          )}
        </div>
        {q.rewards.length === 0 ? (
          <p class="muted">
            {tr('Niets op te halen. Elk afgerond gebouw tot level {level} geeft {pct}% van de bouwkosten terug, en opdrachten kunnen ook iets opleveren.', { level: q.buildingReward.maxLevel, pct: Math.round(q.buildingReward.share * 100) })}
          </p>
        ) : (
          <ul class="rewards">
            {[...q.rewards].reverse().map((r) => (
              <li key={r.id}>
                <span>{txt(r.text)}</span>
                {r.res.some((x) => x > 0) && <Cost cost={r.res} />}
                {r.units && <span class="muted">{unitsText(r.units)}</span>}
                <button class="small" onClick={() => send({ type: 'claimReward', id: r.id })}>
                  {tr('Ophalen')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p class="hint">{tr('Past een beloning niet in je opslag, dan krijg je wat past en blijft de rest staan.')}</p>
      </section>

      <div class="grid">
        {q.chains.map((chain) => (
          <section key={chain.id} class="panel quest-chain">
            <h3>
              {tr(chain.name)}{' '}
              <span class="muted">
                {chain.done}/{chain.total}
              </span>
            </h3>
            <div class="progress">
              <div style={{ width: `${(chain.done / chain.total) * 100}%` }} />
            </div>
            {chain.current ? (
              <>
                <strong>{tr(chain.current.title)}</strong>
                <p class="muted">{tr(chain.current.text)}</p>
                <ul class="demands">
                  {chain.current.demands.map((d, i) => (
                    <li key={i} class={d.done ? 'done' : ''}>
                      {d.done ? '✓' : '○'} {d.text}{' '}
                      {!d.done && d.target > 1 && (
                        <span class="muted">
                          ({num(Math.min(d.current, d.target))}/{num(d.target)})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {(chain.current.reward.res || chain.current.reward.units) && (
                  <p>
                    {tr('Beloning:')} {chain.current.reward.res && <Cost cost={chain.current.reward.res} />}
                    {chain.current.reward.units && <span> {unitsText(chain.current.reward.units)}</span>}
                  </p>
                )}
              </>
            ) : (
              <p class="good">{tr('Alles voltooid!')}</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
