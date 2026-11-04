import { showOnMap } from '../store';
import { tr } from '../../shared/i18n';

/** Small "Kijk op de kaart" button: a player's villages, or the village at x|y and its owner. */
export function MapLink({ owner, x, y }: { owner?: number; x?: number; y?: number }) {
  return (
    <button
      class="link map-link"
      title={tr('Kijk op de kaart')}
      aria-label={tr('Kijk op de kaart')}
      onClick={(e) => {
        e.stopPropagation();
        showOnMap({ owner, x, y });
      }}
    >
      {/* a folded map with a pin */}
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
        <path d="M9 4v13.5M15 6.5V20" stroke="currentColor" stroke-width="1.7" opacity="0.6" />
        <path d="M15.5 13.5c0 2.5-3.5 5.5-3.5 5.5s-3.5-3-3.5-5.5a3.5 3.5 0 0 1 7 0z" fill="#e0b04a" stroke="#1c1813" stroke-width="1" />
        <circle cx="12" cy="13.3" r="1.2" fill="#1c1813" />
      </svg>
    </button>
  );
}
