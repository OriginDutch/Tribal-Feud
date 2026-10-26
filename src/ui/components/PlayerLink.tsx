import { openPlayer } from '../store';

/** A player's name you can click: opens the player's profile. Barbarians (id < 0) stay plain text. */
export function PlayerLink({ id, name, strong = false }: { id: number; name: string; strong?: boolean }) {
  if (id < 0) return <span class="muted">{name}</span>;
  return (
    <button
      class="link player-link"
      title={`Profiel van ${name}`}
      onClick={(e) => {
        e.stopPropagation();
        openPlayer(id);
      }}
    >
      {strong ? <strong>{name}</strong> : name}
    </button>
  );
}
