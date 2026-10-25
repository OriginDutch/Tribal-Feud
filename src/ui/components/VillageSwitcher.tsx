import { useState } from 'preact/hooks';
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

/** Village name in the menu; with more than one village it becomes a switcher. */
export function VillageSwitcher() {
  const s = snapshot.value;
  const v = s?.village;
  const [editing, setEditing] = useState<string | null>(null);
  if (!s || !v) return null;

  if (editing !== null) {
    const save = () => {
      const name = editing.trim();
      if (name && name !== v.name) send({ type: 'renameVillage', villageId: v.id, name });
      setEditing(null);
    };
    return (
      <div class="village-rename">
        <input
          autoFocus
          maxLength={NAME_MAX}
          value={editing}
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
  const pencil = (
    <button class="link rename" title="Dorp hernoemen" onClick={() => setEditing(v.name)}>
      ✎
    </button>
  );

  if (s.villages.length < 2) {
    return (
      <div class="village-name">
        {v.name} <span class="muted">({v.x}|{v.y})</span> {pencil}
      </div>
    );
  }
  return (
    <div class="village-switch">
      <button class="small" title="Vorig dorp (A)" onClick={() => stepVillage(-1)}>
        ◀
      </button>
      <select value={String(v.id)} onChange={(e) => send({ type: 'selectVillage', id: Number(e.currentTarget.value) })}>
        {s.villages.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name} ({x.x}|{x.y})
          </option>
        ))}
      </select>
      <button class="small" title="Volgend dorp (D)" onClick={() => stepVillage(1)}>
        ▶
      </button>
      {pencil}
    </div>
  );
}
