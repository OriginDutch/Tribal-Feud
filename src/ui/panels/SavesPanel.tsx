import { AUTOSAVE_SLOT } from '../../shared/protocol';
import { formatGameTime } from '../../shared/time';
import { autoPause, saves, send, snapshot } from '../store';

export function SavesPanel() {
  const list = saves.value;
  return (
    <section class="panel">
      <h2>Saves</h2>
      <button disabled={!snapshot.value} onClick={() => send({ type: 'save', slot: 'handmatig' })}>
        Opslaan
      </button>
      <ul class="saves">
        {list.length === 0 && <li class="muted">Nog geen saves.</li>}
        {list.map((save) => (
          <li key={save.slot}>
            <div class="meta">
              <strong>
                {save.slot === AUTOSAVE_SLOT ? 'Autosave' : save.slot} · {save.worldName}
              </strong>
              <span class="muted">
                {formatGameTime(save.gameTime)} · {new Date(save.savedAt).toLocaleString('nl-NL')}
              </span>
            </div>
            <div class="row">
              <button
                onClick={() => {
                  autoPause.value = null;
                  send({ type: 'load', slot: save.slot });
                }}
              >
                Laden
              </button>
              <button class="danger" onClick={() => send({ type: 'deleteSave', slot: save.slot })}>
                Verwijder
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
