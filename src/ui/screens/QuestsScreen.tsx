import { Cost } from '../components/Cost';
import { num } from '../format';
import { send, snapshot } from '../store';
import { unitsText } from '../units';

export function QuestsScreen() {
  const s = snapshot.value;
  const q = s?.quests;
  if (!s || !q) return null;

  return (
    <div class="screen narrow">
      <h2>Opdrachten</h2>

      <section class="panel">
        <div class="row">
          <h3 style={{ margin: 0, flex: 1 }}>Beloningen ({q.rewards.length})</h3>
          {q.rewards.length > 1 && (
            <button class="small primary" onClick={() => send({ type: 'claimAllRewards' })}>
              Alles ophalen
            </button>
          )}
        </div>
        {q.rewards.length === 0 ? (
          <p class="muted">
            Niets op te halen. Elk afgerond gebouw tot level {q.buildingReward.maxLevel} geeft {Math.round(q.buildingReward.share * 100)}% van de
            bouwkosten terug, en opdrachten kunnen ook iets opleveren.
          </p>
        ) : (
          <ul class="rewards">
            {[...q.rewards].reverse().map((r) => (
              <li key={r.id}>
                <span>{r.text}</span>
                {r.res.some((x) => x > 0) && <Cost cost={r.res} />}
                {r.units && <span class="muted">{unitsText(r.units)}</span>}
                <button class="small" onClick={() => send({ type: 'claimReward', id: r.id })}>
                  Ophalen
                </button>
              </li>
            ))}
          </ul>
        )}
        <p class="hint">Past een beloning niet in je opslag, dan krijg je wat past en blijft de rest staan.</p>
      </section>

      <div class="grid">
        {q.chains.map((chain) => (
          <section key={chain.id} class="panel quest-chain">
            <h3>
              {chain.name}{' '}
              <span class="muted">
                {chain.done}/{chain.total}
              </span>
            </h3>
            <div class="progress">
              <div style={{ width: `${(chain.done / chain.total) * 100}%` }} />
            </div>
            {chain.current ? (
              <>
                <strong>{chain.current.title}</strong>
                <p class="muted">{chain.current.text}</p>
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
                    Beloning: {chain.current.reward.res && <Cost cost={chain.current.reward.res} />}
                    {chain.current.reward.units && <span> {unitsText(chain.current.reward.units)}</span>}
                  </p>
                )}
              </>
            ) : (
              <p class="good">Alles voltooid!</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
