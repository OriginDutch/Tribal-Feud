/**
 * Alerts for the human player: they auto-pause the game at the moment they happen.
 * Raised during an event; advance() picks them up, logs them and pauses.
 * The player chooses when (state.alertMode); a lost village pauses unless alerts are off.
 */
import { createVillage } from './village';
import { tr } from '../shared/i18n';
import { restartSpot } from './map';
import { forgetNeighbourhoods } from './bots';
import { HUMAN_ID, addLog, invalidateOwners, nextId, villagesOf, type WorldState } from './state';

const DAY = 86_400_000;

function raise(state: WorldState, text: string): void {
  if (state.alert) {
    state.alert.text = `${state.alert.text} · ${text}`;
    return;
  }
  state.alert = { time: state.time, text, autoPause: true };
}

/** An attack on one of the human's villages was just sent. */
export function onIncomingAttack(state: WorldState, fromVillage: number, text: string): void {
  const mode = state.alertMode ?? 'perVillage';
  if (mode === 'lostOnly' || mode === 'off') return;
  if (mode === 'perVillage') {
    state.alertSeen ??= {};
    const last = state.alertSeen[fromVillage];
    const cooldown = DAY / state.config.worldSpeed;
    if (last !== undefined && state.time - last < cooldown) return;
    // forget old entries
    for (const [id, at] of Object.entries(state.alertSeen)) if (state.time - at >= cooldown) delete state.alertSeen[Number(id)];
    state.alertSeen[fromVillage] = state.time;
  }
  raise(state, text);
}

/** One of your planned attacks could not leave (or lapsed): it pauses unless alerts are off. */
export function onPlanFailed(state: WorldState, text: string): void {
  // a raised alert is logged when the game pauses for it
  if ((state.alertMode ?? 'perVillage') !== 'off') raise(state, text);
  else addLog(state, { time: state.time, text });
}

/** The human lost a village. With no villages left he starts over at the outer ring, like a bot. */
export function onHumanVillageLost(state: WorldState, text: string): void {
  if ((state.alertMode ?? 'perVillage') !== 'off') raise(state, text);
  if (villagesOf(state, HUMAN_ID).length > 0) return;
  const [x, y] = restartSpot(state);
  const v = createVillage(state.config, nextId(state), HUMAN_ID, 'Jouw dorp', x, y, state.time);
  state.villages[v.id] = v;
  state.players[HUMAN_ID]!.joinedAt = state.time;
  state.players[HUMAN_ID]!.home = v.id;
  state.current = v.id;
  invalidateOwners(state);
  forgetNeighbourhoods(state);
  addLog(state, { time: state.time, text: tr('Je hebt geen dorpen meer. Je begint opnieuw op {x}|{y}, met een paar barbarendorpen in de buurt.', { x: String(x), y: String(y) }) });
}
