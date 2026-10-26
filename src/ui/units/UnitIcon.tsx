import type { UnitId } from '../../shared/gameData';
import { ICONS } from './unitArt';

/** A unit's icon. Decorative by default: put the unit's name next to it or in `title`. */
export function UnitIcon({ id, size = 20, title }: { id: UnitId; size?: number; title?: string }) {
  return (
    <svg
      class="unit-icon"
      width={size}
      height={size}
      viewBox="1 1 30 30"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': 'true' })}
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${title}</title>` : '') + ICONS[id] }}
    />
  );
}
