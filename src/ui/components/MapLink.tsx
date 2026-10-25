import { showOnMap } from '../store';

/** Small "Kijk op de kaart" button: a player's villages, or the village at x|y and its owner. */
export function MapLink({ owner, x, y }: { owner?: number; x?: number; y?: number }) {
  return (
    <button
      class="link map-link"
      title="Kijk op de kaart"
      onClick={(e) => {
        e.stopPropagation();
        showOnMap({ owner, x, y });
      }}
    >
      🗺
    </button>
  );
}
