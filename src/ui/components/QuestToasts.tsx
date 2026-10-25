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
  if (toasts.length === 0) return null;
  const shown = toasts.slice(-VISIBLE).reverse();
  const hidden = toasts.length - shown.length;

  return (
    <div class="toasts">
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
