import { tr } from '../../shared/i18n';
import { duration } from '../format';
import { send } from '../store';

/** "Annuleren" for a command that can still be called back, with the time left to do so. */
export function CancelButton({ id, until, now, train }: { id: number; until?: number; now: number; train?: boolean }) {
  if (until === undefined || until <= now) return null;
  return (
    <button
      class="small"
      title={train ? tr('Haalt de hele edeltrein terug') : tr('Troepen keren om en zijn even lang terug onderweg')}
      onClick={() => send({ type: 'cancelMovement', id })}
    >
      {train ? tr('Trein annuleren') : tr('Annuleren')} <span class="muted mono">{duration(until - now)}</span>
    </button>
  );
}
