import { useState } from 'preact/hooks';
import { num } from '../format';
import { groupFilter, groupVillages, send, snapshot } from '../store';
import { keyLabel, keyOf } from '../keys';

const NAME_MAX = 32;

/** Selects the previous/next own village (wraps around). */
export function stepVillage(delta: number): void {
  const s = snapshot.value;
  if (!s?.village) return;
  // A/D walk through the active group only (the current village may be outside it)
  const list = groupVillages(s.villages, s.groups);
  if (!list.length || (list.length < 2 && list[0]?.id === s.village.id)) return;
  const i = list.findIndex((v) => v.id === s.village?.id);
  const next = i < 0 ? list[delta > 0 ? 0 : list.length - 1] : list[(i + delta + list.length) % list.length];
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
      <button class="vstep" title={`Vorig dorp (${keyLabel(keyOf('prevVillage'))})`} aria-label="Vorig dorp" disabled={!many} onClick={() => stepVillage(-1)}>
        ‹
      </button>
      <div class="vname">
        <div class="vname-top">
          <b>{v.name}</b>
          <button class="link rename" title="Dorp hernoemen" aria-label="Dorp hernoemen" onClick={() => setEditing(v.name)}>
            ✎
          </button>
        </div>
        <span>
          {v.x}|{v.y} · {num(v.points)} p{many ? ` · ${s.villages.findIndex((x) => x.id === v.id) + 1}/${s.villages.length}` : ''}
          {(() => {
            const g = s.groups.find((x) => x.id === groupFilter.value);
            return g ? <span class="group-chip filter" style={{ '--gc': g.color }} title="Groepsfilter actief: A/D en de dorpenlijst volgen deze groep">groep: {g.name}</span> : null;
          })()}
        </span>
        {many && (
          <select
            class="vselect"
            value={String(v.id)}
            aria-label="Kies een dorp"
            onChange={(e) => send({ type: 'selectVillage', id: Number(e.currentTarget.value) })}
          >
            {(() => {
              const list = groupVillages(s.villages, s.groups);
              const shown = list.some((x) => x.id === v.id) ? list : [s.villages.find((x) => x.id === v.id)!, ...list];
              return shown.map((x) => (
                <option key={x.id} value={String(x.id)}>
                  {x.name} ({x.x}|{x.y})
                </option>
              ));
            })()}
          </select>
        )}
      </div>
      <button class="vstep" title={`Volgend dorp (${keyLabel(keyOf('nextVillage'))})`} aria-label="Volgend dorp" disabled={!many} onClick={() => stepVillage(1)}>
        ›
      </button>
    </div>
  );
}
