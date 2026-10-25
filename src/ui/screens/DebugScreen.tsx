import { EventsPanel } from '../panels/EventsPanel';
import { LogPanel } from '../panels/LogPanel';
import { NewWorldPanel } from '../panels/NewWorldPanel';
import { SavesPanel } from '../panels/SavesPanel';

export function DebugScreen() {
  return (
    <div class="grid debug-grid">
      <SavesPanel />
      <NewWorldPanel />
      <EventsPanel />
      <LogPanel />
    </div>
  );
}
