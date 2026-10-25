import { useMemo } from 'preact/hooks';
import type { VillageView } from '../../sim/view';
import { screen, type Screen } from '../store';
import { LABELS, SCENE_H, SCENE_W, villageSvg } from './villageArt';

/** Where a click on a building takes you. Buildings without a screen of their own open the HQ. */
const TARGET: Record<string, Screen> = {
  main: 'main',
  barracks: 'barracks',
  stable: 'stable',
  garage: 'garage',
  statue: 'statue',
  snob: 'snob',
  smith: 'smith',
  place: 'place',
  market: 'market',
};

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
      {village.buildings.map((b) => {
        const at = LABELS[b.id];
        if (!at) return null;
        const built = b.level > 0;
        const target = TARGET[b.id] ?? 'main';
        return (
          <button
            key={b.id}
            class={`village-label ${built ? '' : 'unbuilt'}`}
            style={{ left: `${(at[0] / SCENE_W) * 100}%`, top: `${(at[1] / SCENE_H) * 100}%` }}
            title={built ? `${b.name} level ${b.level}` : `${b.name}: nog niet gebouwd`}
            onClick={() => (screen.value = target)}
          >
            <span>{b.name}</span>
            {built && <strong>{b.level}</strong>}
          </button>
        );
      })}
    </div>
  );
}
