import { useMemo } from 'preact/hooks';
import type { VillageView } from '../../sim/view';
import { openBuilding } from '../store';
import { LABELS, SCENE_H, SCENE_W, hitbox, villageSvg } from './villageArt';

/** The drawn village with a clickable label per building, like TW's village overview. */
export function VillageScene({ village }: { village: VillageView }) {
  const levels = useMemo(() => Object.fromEntries(village.buildings.map((b) => [b.id, b.level])), [village.buildings]);
  const key = Object.entries(levels)
    .map(([id, l]) => `${id}${l}`)
    .join(',');
  const main = levels.main ?? 0;
  // the village fills up with villagers' houses as the HQ grows
  const homes = Math.max(0, Math.min(5, Math.floor(main / 4)));
  // only redraw the (big) svg when a level changes
  const svg = useMemo(() => villageSvg(levels, homes), [key, homes]);

  return (
    <div class="village-scene">
      <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} role="img" aria-label={`Dorpsoverzicht van ${village.name}`} dangerouslySetInnerHTML={{ __html: svg }} />
      {/* click areas over the drawing, back to front so the building in front wins */}
      {village.buildings
        .map((b) => ({ b, box: hitbox(b.id, b.level) }))
        .filter((x): x is { b: (typeof village.buildings)[number]; box: [number, number, number, number] } => x.box !== null)
        .sort((p, q) => p.box[1] + p.box[3] - (q.box[1] + q.box[3]))
        .map(({ b, box }) => (
          <button
            key={`hit-${b.id}`}
            class="village-hit"
            aria-label={b.level > 0 ? `${b.name} level ${b.level}` : `${b.name}: nog niet gebouwd`}
            title={b.level > 0 ? `${b.name} level ${b.level}` : `${b.name}: nog niet gebouwd`}
            style={{
              left: `${(box[0] / SCENE_W) * 100}%`,
              top: `${(box[1] / SCENE_H) * 100}%`,
              width: `${(box[2] / SCENE_W) * 100}%`,
              height: `${(box[3] / SCENE_H) * 100}%`,
            }}
            onClick={() => openBuilding(b.id)}
          />
        ))}
      {village.buildings.map((b) => {
        const at = LABELS[b.id];
        if (!at) return null;
        const built = b.level > 0;
        return (
          <button
            key={b.id}
            class={`village-label ${built ? '' : 'unbuilt'}`}
            style={{ left: `${(at[0] / SCENE_W) * 100}%`, top: `${(at[1] / SCENE_H) * 100}%` }}
            title={built ? `${b.name} level ${b.level}` : `${b.name}: nog niet gebouwd`}
            onClick={() => openBuilding(b.id)}
          >
            <span>{b.name}</span>
            {built && <strong>{b.level}</strong>}
          </button>
        );
      })}
    </div>
  );
}
