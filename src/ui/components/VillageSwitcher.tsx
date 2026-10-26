import { useState } from 'preact/hooks';
import { num } from '../format';
import { send, snapshot } from '../store';

const NAME_MAX = 32;

/** Selects the previous/next own village (wraps around). */
export function stepVillage(delta: number): void {
  const s = snapshot.value;
  if (!s?.village || s.villages.length < 2) return;
  const i = s.villages.findIndex((v) => v.id === s.village?.id);
  const next = s.villages[(i + delta + s.villages.length) % s.villages.length];
  if (next) send({ type: 'selectVillage', id: next.id });
}

/** The current village in the top bar: name (rename with the pencil), coordinates, and switching. */
export function VillageSwitcher() {
  const s = snapshot.value;
  const v = s?.village;
  const [editing, setEditing] = useState<string | null>(null);
  if (!s || !v) return null;
  const many = s.villages.length > 1;

  if (editing !== null) {
    const save = () => {
      const name = editing.trim();
      if (name && name !== v.name) send({ type: 'renameVillage', villageId: v.id, name });
      setEditing(null);
    };
    return (
      <div class="vswitch">
        <input
          class="vrename"
          autoFocus
          maxLength={NAME_MAX}
          value={editing}
          aria-label="Nieuwe naam"
          onInput={(e) => setEditing(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(null);
          }}
          onBlur={save}
        />
      </div>
    );
  }

  return (
    <div class="vswitch">
      {many && (
        <button class="vstep" title="Vorig dorp (A)" aria-label="Vorig dorp" onClick={() => stepVillage(-1)}>
          ‹
        </button>
      )}
      <div class="vname">
        <div class="vname-top">
          <b>{v.name}</b>
          <button class="link rename" title="Dorp hernoemen" aria-label="Dorp hernoemen" onClick={() => setEditing(v.name)}>
            ✎
          </button>
        </div>
        <span>
          {v.x}|{v.y} · {num(v.points)} p
        </span>
        {many && (
          <select
            class="vselect"
            value={String(v.id)}
            aria-label="Kies een dorp"
            onChange={(e) => send({ type: 'selectVillage', id: Number(e.currentTarget.value) })}
          >
            {s.villages.map((x) => (
              <option key={x.id} value={String(x.id)}>
                {x.name} ({x.x}|{x.y})
              </option>
            ))}
          </select>
        )}
      </div>
      {many && (
        <button class="vstep" title="Volgend dorp (D)" aria-label="Volgend dorp" onClick={() => stepVillage(1)}>
          ›
        </button>
      )}
    </div>
  );
}
