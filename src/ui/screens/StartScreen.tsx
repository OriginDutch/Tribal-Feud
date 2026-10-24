import { NewWorldPanel } from '../panels/NewWorldPanel';
import { SavesPanel } from '../panels/SavesPanel';

export function StartScreen() {
  return (
    <main class="grid start">
      <NewWorldPanel />
      <SavesPanel />
    </main>
  );
}
