import { showOnMap } from '../store';

/** Coordinates you can click: shows that village on the map. */
export function Coords({ x, y, bare = false }: { x: number; y: number; bare?: boolean }) {
  return (
    <button
      class="link coords"
      title="Op de kaart"
      onClick={(e) => {
        e.stopPropagation();
        showOnMap({ x, y });
      }}
    >
      {bare ? `${x}|${y}` : `(${x}|${y})`}
    </button>
  );
}
