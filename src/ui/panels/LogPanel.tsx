import { tr } from '../../shared/i18n';
import { formatGameTime } from '../../shared/time';
import { snapshot } from '../store';

export function LogPanel() {
  const log = snapshot.value?.log ?? [];
  return (
    <section class="panel wide">
      <h2>{tr('Log')}</h2>
      <ol class="log">
        {[...log].reverse().map((entry, i) => (
          <li key={`${entry.time}-${log.length - i}`} class={entry.autoPause ? 'pause' : ''}>
            <span class="t">{formatGameTime(entry.time)}</span>
            {entry.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
