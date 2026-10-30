import { useLayoutEffect, useState } from 'preact/hooks';
import { ACTIONS, actionWithKey, capturingKey, keyFromEvent, keyLabel, keyOf, resetKeys, setKey, type KeyGroup } from '../keys';

const GROUPS: KeyGroup[] = ['Algemeen', 'Hoofdmenu', 'Schermen', 'Gebouwen'];

/** Settings: keyboard shortcuts (every screen, tab and building can get a key). */
export function SettingsScreen() {
  const [listening, setListening] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; key: string } | null>(null);

  useLayoutEffect(() => {
    capturingKey.value = listening !== null;
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setListening(null); return; }
      const key = keyFromEvent(e);
      if (!key) return;
      const other = actionWithKey(key, listening);
      if (other) setPending({ id: listening, key });
      else setKey(listening, key);
      setListening(null);
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); capturingKey.value = false; };
  }, [listening]);

  return (
    <div class="screen">
      <div class="row">
        <h2 style={{ margin: 0, flex: 1 }}>Sneltoetsen</h2>
        <button onClick={() => { resetKeys(); setPending(null); }}>Standaard herstellen</button>
      </div>
      <section class="panel">
        <p class="muted" style={{ marginTop: 0 }}>
          Elk scherm, elke tab en elk gebouw kan een toets krijgen. Klik op een toets en druk de nieuwe (Esc = annuleren). Sneltoetsen werken niet terwijl je in een veld typt, behalve met Ctrl. Opgeslagen in deze browser.
        </p>
        <div class="keys-grid">
          {GROUPS.map((g) => (
            <div key={g} class="keys-col">
              <h3>{g}</h3>
              {ACTIONS.filter((a) => a.group === g).map((a) => {
                const k = keyOf(a.id);
                const conflict = pending?.id === a.id ? actionWithKey(pending.key, a.id) : undefined;
                return (
                  <div key={a.id} class="keys-item">
                    <div class="keys-row">
                      <span class="keys-name">{a.label}</span>
                      <button class={`keys-key ${listening === a.id ? 'listening' : ''} ${k ? '' : 'none'}`} onClick={() => { setPending(null); capturingKey.value = listening !== a.id; setListening(listening === a.id ? null : a.id); }}
                        aria-label={`Toets voor ${a.label}: ${keyLabel(k)}. Klik om te wijzigen`}>
                        {listening === a.id ? 'Druk een toets…' : keyLabel(k)}
                      </button>
                      <button class="small link" disabled={!k} onClick={() => setKey(a.id, null)} aria-label={`Toets voor ${a.label} wissen`}>wissen</button>
                    </div>
                    {conflict && pending ? (
                      <div class="keys-conflict">
                        {keyLabel(pending.key)} is al: {conflict.label}.
                        <button class="small" onClick={() => { setKey(a.id, pending.key); setPending(null); }}>Overschrijven</button>
                        <button class="small" onClick={() => setPending(null)}>Laat maar</button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
