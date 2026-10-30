import { useEffect, useRef, useState } from 'preact/hooks';
import { mapData, openPlayer, ranking, send, tribes } from '../store';
import { num } from '../format';

const HOVER_DELAY_MS = 600;
let rankingAsked = false;

/**
 * A player's name you can click: opens the player's profile. Resting on it for a moment shows a
 * small card (rank, points, villages, tribe, your mark). Barbarians (id < 0) stay plain text.
 */
export function PlayerLink({ id, name, strong = false }: { id: number; name: string; strong?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | null>(null);
  const [card, setCard] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  if (id < 0) return <span class="muted">{name}</span>;
  const enter = () => {
    if (!ranking.value.length && !rankingAsked) { rankingAsked = true; send({ type: 'getRanking' }); }
    timer.current = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setCard({ x: r.left, y: r.bottom + 6 });
    }, HOVER_DELAY_MS);
  };
  const leave = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setCard(null);
  };
  return (
    <>
      <button
        ref={ref}
        class="link player-link"
        aria-label={`Profiel van ${name}`}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={leave}
        onClick={(e) => {
          e.stopPropagation();
          leave();
          openPlayer(id);
        }}
      >
        {strong ? <strong>{name}</strong> : name}
      </button>
      {card && <PlayerCard id={id} name={name} x={card.x} y={card.y} />}
    </>
  );
}

function PlayerCard({ id, name, x, y }: { id: number; name: string; x: number; y: number }) {
  const list = ranking.value;
  const i = list.findIndex((r) => r.id === id);
  const row = i >= 0 ? list[i] : undefined;
  const tribe = row?.tribe !== undefined ? tribes.value.find((t) => t.id === row.tribe) : undefined;
  const mark = mapData.value?.marks.players[id] ?? (row?.tribe !== undefined ? mapData.value?.marks.tribes[row.tribe] : undefined);
  const left = Math.min(x, window.innerWidth - 270);
  const top = y + 140 > window.innerHeight ? y - 160 : y;
  return (
    <div class="player-card" style={{ left: `${left}px`, top: `${top}px` }} role="tooltip">
      <strong>
        {mark && <i class="hc-dot" style={{ background: mark }} />} {name}
        {tribe && <span class="tribe-tag" style={{ '--tc': tribe.color }}> [{tribe.tag}]</span>}
      </strong>
      {row ? (
        <>
          <span>#{i + 1} · {num(row.points)} punten · {row.villages} {row.villages === 1 ? 'dorp' : 'dorpen'}</span>
          {tribe && <span class="muted">{tribe.name}</span>}
          {!row.isBot && <span class="muted">dat ben jij</span>}
        </>
      ) : (
        <span class="muted">Laden…</span>
      )}
      <span class="muted">klik voor het profiel</span>
    </div>
  );
}
