import type { BuildingView, VillageView } from '../../sim/view';
import { Cost } from '../components/Cost';
import { duration, num } from '../format';
import { send } from '../store';
import { BUILDING_TEXT } from './buildingText';
import { tr } from '../../shared/i18n';

/** A building's effect as text: "1.234 per uur", "45.000", "+12%". */
export function effectText(b: BuildingView, value: number | undefined): string {
  if (!b.effect || value === undefined) return '—';
  if (b.effect.unit === 'perHour') return tr('{n} per uur', { n: num(Math.round(value)) });
  if (b.effect.unit === 'percent') return `+${value.toFixed(value < 10 ? 1 : 0)}%`;
  return num(Math.round(value));
}

/**
 * The top of a building's screen: what it does, what it gives now and on the next level,
 * and the button to build that level.
 */
export function BuildingHeader({ village, id }: { village: VillageView; id: BuildingView['id'] }) {
  const b = village.buildings.find((x) => x.id === id);
  if (!b) return null;
  const now = b.effect?.byLevel[b.level];
  const next = b.next ? b.effect?.byLevel[b.next.level] : undefined;
  return (
    <section class="panel building-head has-art">
      <img class="building-art" src={`/buildings/${id}.webp`} alt="" width={400} height={400} />
      <div class="building-body">
      <p class="building-text">{tr(BUILDING_TEXT[id])}</p>
      <div class="building-row">
        {b.effect && (
          <div class="building-effect">
            <span class="muted">{tr(b.effect.label)}</span>
            <strong>{effectText(b, now)}</strong>
            {next !== undefined && <span class="muted">{tr('→ {value} op level {level}', { value: effectText(b, next), level: b.next?.level })}</span>}
          </div>
        )}
        {b.next ? (
          <div class="building-upgrade">
            <Cost cost={b.next.cost} have={village.res} />
            <span class="muted mono">{duration(b.next.time)}</span>
            <button class="primary small" disabled={b.blocker !== null} title={b.blocker ?? ''} onClick={() => send({ type: 'build', villageId: village.id, building: id })}>
              {b.blocker ?? (b.planned === 0 ? tr('Bouwen') : tr('Naar level {level}', { level: b.next.level }))}
            </button>
          </div>
        ) : (
          <span class="muted">{tr('Volledig uitgebouwd')}</span>
        )}
      </div>
      {b.planned !== b.level && <p class="muted">{tr('In de bouwqueue: naar level {level}.', { level: b.planned })}</p>}
      </div>
    </section>
  );
}
