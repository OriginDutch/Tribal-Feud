/**
 * Alerts for the human player: they auto-pause the game at the moment they happen.
 * Raised during an event; advance() picks them up, logs them and pauses.
 */
import { createVillage } from './village';
import { edgeSpot } from './map';
import { HUMAN_ID, addLog, invalidateOwners, nextId, villagesOf, type WorldState } from './state';

export function raiseAlert(state: WorldState, text: string): void {
  if (state.alert) {
    state.alert.text = `${state.alert.text} · ${text}`;
    return;
  }
  state.alert = { time: state.time, text, autoPause: true };
}

/** The human lost a village. With no villages left he starts over at the edge, like a bot. */
export function onHumanVillageLost(state: WorldState, text: string): void {
  raiseAlert(state, text);
  if (villagesOf(state, HUMAN_ID).length > 0) return;
  const [x, y] = edgeSpot(state);
  const v = createVillage(state.config, nextId(state), HUMAN_ID, 'Jouw dorp', x, y, state.time);
  state.villages[v.id] = v;
  state.current = v.id;
  invalidateOwners(state);
  addLog(state, { time: state.time, text: `Je hebt geen dorpen meer. Je begint opnieuw aan de rand op ${x}|${y}.` });
}
