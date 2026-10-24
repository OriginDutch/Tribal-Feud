import type { Res } from '../../shared/gameData';
import { num } from '../format';

const KEYS = ['wood', 'stone', 'iron'] as const;
const LABELS = ['Hout', 'Leem', 'IJzer'] as const;

/** Resource cost, each amount marked red when the village can't pay it right now. */
export function Cost({ cost, have, times = 1 }: { cost: Res; have?: Res; times?: number }) {
  return (
    <span class="cost">
      {cost.map((c, i) => {
        const amount = c * times;
        const short = have !== undefined && (have[i] ?? 0) < amount;
        return (
          <span key={i} class={`res res-${KEYS[i]} ${short ? 'short' : ''}`} title={LABELS[i]}>
            {num(amount)}
          </span>
        );
      })}
    </span>
  );
}
