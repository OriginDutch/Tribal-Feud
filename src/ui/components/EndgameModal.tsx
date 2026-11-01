import { formatGameTime } from '../../shared/time';
import { num } from '../format';
import { screen, send, snapshot } from '../store';

/** The world is over: win or loss, then keep playing or start a new world. */
export function EndgameModal() {
  const s = snapshot.value;
  const w = s?.endgame.winner;
  if (!s || !w || s.endgame.continued) return null;
  const villages = s.villages.length;
  const points = s.villages.reduce((t, v) => t + v.points, 0);
  return (
    <div class="endgame-modal" role="dialog" aria-modal="true">
      <section class="panel">
        <img class="endgame-art" src={w.you ? '/art/endgame-victory.webp' : '/art/endgame-defeat.webp'} alt="" />
        <h2>{w.you ? 'Gewonnen!' : 'Verloren'}</h2>
        <p>
          [{w.tag}] {w.name} heeft {Math.round(s.endgame.target * 100)}% van de wereld {s.endgame.holdDays} speldagen vastgehouden.
          {w.you ? ' Jouw stam heeft de wereld veroverd.' : ' Het was niet jouw stam.'}
        </p>
        <p class="muted">
          Einde op {formatGameTime(w.time)} · jij: {villages} dorp{villages === 1 ? '' : 'en'}, {num(points)} punten
        </p>
        <div class="row" style={{ justifyContent: 'center', gap: '10px' }}>
          <button class="primary" onClick={() => send({ type: 'continueWorld' })}>Doorspelen</button>
          <button onClick={() => { send({ type: 'continueWorld' }); screen.value = 'debug'; }}>Nieuwe wereld</button>
        </div>
      </section>
    </div>
  );
}
