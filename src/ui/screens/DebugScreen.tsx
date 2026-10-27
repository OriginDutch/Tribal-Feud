import { EventsPanel } from '../panels/EventsPanel';
import { LogPanel } from '../panels/LogPanel';
import { NewWorldPanel } from '../panels/NewWorldPanel';
import { SavesPanel } from '../panels/SavesPanel';
import { WorldPanel } from '../panels/WorldPanel';

export function DebugScreen() {
  return (
    <div class="grid debug-grid">
      <WorldPanel />
      <SavesPanel />
      <NewWorldPanel />
      <EventsPanel />
      <LogPanel />
    </div>
  );
}
