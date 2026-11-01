import { FACE_COUNTS, FACES_PER_ROW, type Face } from '../../shared/faces';

/** A bot's painted portrait, cut from its archetype's atlas (one image per kind, cached). */
export function FaceIcon({ face, size = 40, class: cls = '' }: { face: Face | undefined; size?: number; class?: string }) {
  if (!face) return null;
  const rows = Math.ceil(FACE_COUNTS[face.pool] / FACES_PER_ROW);
  const col = face.index % FACES_PER_ROW, row = Math.floor(face.index / FACES_PER_ROW);
  return (
    <span
      class={`face ${cls}`}
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: `url(/faces/${face.pool}.webp)`,
        backgroundSize: `${FACES_PER_ROW * size}px ${rows * size}px`,
        backgroundPosition: `-${col * size}px -${row * size}px`,
      }}
    />
  );
}
