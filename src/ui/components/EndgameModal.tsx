import { tr } from '../../shared/i18n';
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
        <h2>{w.you ? tr('Gewonnen!') : tr('Verloren|eindspel')}</h2>
        <p>
          {tr('[{tag}] {name} heeft {pct}% van de wereld {days} speldagen vastgehouden.', { tag: w.tag, name: w.name, pct: Math.round(s.endgame.target * 100), days: s.endgame.holdDays })}
          {' '}{w.you ? tr('Jouw stam heeft de wereld veroverd.') : tr('Het was niet jouw stam.')}
        </p>
        <p class="muted">
          {villages === 1
            ? tr('Einde op {time} · jij: 1 dorp, {points} punten', { time: formatGameTime(w.time), points: num(points) })
            : tr('Einde op {time} · jij: {n} dorpen, {points} punten', { time: formatGameTime(w.time), n: villages, points: num(points) })}
        </p>
        <div class="row" style={{ justifyContent: 'center', gap: '10px' }}>
          <button class="primary" onClick={() => send({ type: 'continueWorld' })}>{tr('Doorspelen')}</button>
          <button onClick={() => { send({ type: 'continueWorld' }); screen.value = 'debug'; }}>{tr('Nieuwe wereld')}</button>
        </div>
      </section>
    </div>
  );
}
