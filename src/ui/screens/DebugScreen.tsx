import { tr } from '../../shared/i18n';
import { EventsPanel } from '../panels/EventsPanel';
import { LogPanel } from '../panels/LogPanel';
import { NewWorldPanel } from '../panels/NewWorldPanel';
import { SavesPanel } from '../panels/SavesPanel';
import { perfOn, setPerf } from '../perf';

export function DebugScreen() {
  return (
    <div class="grid debug-grid">
      <section class="panel">
        <h3>{tr('Prestaties')}</h3>
        <label class="inline">
          <input type="checkbox" checked={perfOn.value} onChange={(e) => setPerf(e.currentTarget.checked)} /> {tr('Prestatiemeter tonen')}
        </label>
        <p class="hint">
          {tr('Een klein vak rechtsonder: beelden per seconde, blokkades (de pagina reageert even niet: aantal, totaal en langste in de laatste 10 s) en game-updates. Goed is: rond 60 fps en geen blokkade boven 100 ms. Blokkades meet alleen Chrome (ook op Android).')}
        </p>
      </section>
      <SavesPanel />
      <NewWorldPanel />
      <EventsPanel />
      <LogPanel />
    </div>
  );
}
