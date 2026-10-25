import { send, snapshot } from '../store';
import { unitsText } from '../units';
import { Cost } from './Cost';

const VISIBLE = 2;

/**
 * Finished quests, at the bottom of the menu: in normal flow below the menu items, so they
 * never cover a button. They never block anything: no pause, no focus,
 * only the toasts themselves catch clicks. They stay until claimed or closed.
 */
export function QuestToasts() {
  const toasts = snapshot.value?.quests.toasts ?? [];
  const rewards = snapshot.value?.quests.rewards ?? [];
  if (toasts.length === 0 && rewards.length === 0) return null;
  const total = rewards.reduce((sum, r) => [sum[0] + r.res[0], sum[1] + r.res[1], sum[2] + r.res[2]] as [number, number, number], [0, 0, 0] as [number, number, number]);
  const shown = toasts.slice(-VISIBLE).reverse();
  const hidden = toasts.length - shown.length;

  return (
    <div class="toasts">
      {rewards.length > 0 && (
        <div class="toast reward-bar">
          <div class="toast-head">
            <strong>🎁 {rewards.length} {rewards.length === 1 ? 'beloning' : 'beloningen'} klaar</strong>
          </div>
          <div class="toast-body">
            <Cost cost={total} />
            <button
              class="small primary"
              tabIndex={-1}
              title="Haalt alles op in het dorp waar je nu bent, zolang het in de opslag past"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => send({ type: 'claimAllRewards' })}
            >
              Alles ophalen
            </button>
          </div>
        </div>
      )}
      {shown.map((t) => (
        <div key={t.id} class="toast">
          <div class="toast-head">
            <strong>✓ {t.title}</strong>
            <button
              class="toast-close"
              tabIndex={-1}
              title="Sluiten"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => send({ type: 'dismissToast', id: t.id })}
            >
              ✕
            </button>
          </div>
          {t.reward ? (
            <div class="toast-body">
              {t.reward.res.some((x) => x > 0) && <Cost cost={t.reward.res} />}
              {t.reward.units && <span class="muted">{unitsText(t.reward.units)}</span>}
              <button
                class="small primary"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => t.reward && send({ type: 'claimReward', id: t.reward.id })}
              >
                Ophalen
              </button>
            </div>
          ) : (
            <div class="toast-body muted">Opdracht voltooid</div>
          )}
        </div>
      ))}
      {hidden > 0 && (
        <div class="toast toast-more">
          +{hidden} meer
          <button class="small" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => send({ type: 'dismissToast', id: 'all' })}>
            Alles sluiten
          </button>
        </div>
      )}
    </div>
  );
}
