/**
 * Planned attacks: you pick when an attack (or a noble train) should land, the game works out
 * when it must leave and sends it by itself at that moment. Its troops stay home (and defend)
 * until then, but farming, scavenging, other attacks and dismissing leave them alone.
 * When some of them died meanwhile, it goes with what is left; with nothing left it lapses.
 */
import { UNIT_IDS, type BuildingId, type UnitCounts } from '../shared/gameData';
import { formatGameTime } from '../shared/time';
import { push } from './eventQueue';
import { attackBlocker, distance, freeUnits, protectionEndsAt, sendAttack, sendNobleTrain, shortOf, travelTimeMs } from './movement';
import { HUMAN_ID, addLog, nextId, type PlannedAttack, type WorldState } from './state';
import type { PlannedView } from '../shared/protocol';
import { OFFENSE } from './tribeOrders';
import { attackedWithoutPermission } from './tribeOrders';
import { humanOpSent } from './warOps';
import { onPlanFailed } from './alerts';
import { dropNoblesOrder, nobleArmiesMissing } from './nobleRole';

/** How many attacks you can have planned at once (all villages together). */
export const MAX_PLANNED = 50;

export interface PlanInput {
  from: number;
  to: number;
  /** The (first) attack; with escorts, its nobleman is added unless clearFirst. */
  first: UnitCounts;
  /** Noblemen 2..N of a train: their escorts (the train adds one nobleman each). */
  escorts?: UnitCounts[];
  clearFirst?: boolean;
  catapultTarget?: BuildingId;
  landAt: number;
}

function clean(units: UnitCounts): UnitCounts {
  const out: UnitCounts = {};
  for (const u of UNIT_IDS) {
    const n = Math.floor(units[u] ?? 0);
    if (n > 0) out[u] = n;
  }
  return out;
}

/** The waves as they go: a plain attack is one, a train each with its nobleman (like sendNobleTrain). */
function wavesOf(input: PlanInput): UnitCounts[] {
  const escorts = input.escorts ?? [];
  if (!escorts.length) return [clean(input.first)];
  const first = clean(input.first);
  delete first.snob;
  return [input.clearFirst ? first : { ...first, snob: 1 }, ...escorts.map((e) => { const c = clean(e); delete c.snob; return { ...c, snob: 1 }; })];
}

/** How long the slowest wave walks: everything leaves together and lands together. */
function walk(state: WorldState, p: { from: number; to: number; waves: UnitCounts[] }): number {
  const from = state.villages[p.from], to = state.villages[p.to];
  if (!from || !to) return 0;
  const d = distance(from, to);
  return Math.max(...p.waves.map((w) => travelTimeMs(state, w, d)));
}

/** The earliest it can land if planned now (leaves right away). */
export function earliestLanding(state: WorldState, input: Omit<PlanInput, 'landAt'>): number {
  return state.time + walk(state, { from: input.from, to: input.to, waves: wavesOf({ ...input, landAt: 0 }) });
}

/** Plans an attack of yours. Null when it is planned, else why not. */
export function planAttack(state: WorldState, input: PlanInput): string | null {
  const from = state.villages[input.from], to = state.villages[input.to];
  if (!from || !to) return 'Dorp bestaat niet.';
  if (from.owner !== HUMAN_ID) return 'Dat is niet jouw dorp.';
  if ((state.planned?.length ?? 0) >= MAX_PLANNED) return `Je kunt maximaal ${MAX_PLANNED} aanvallen tegelijk inplannen.`;
  const waves = wavesOf(input);
  if (waves.length > 5) return 'Een edeltrein heeft 2 tot 5 aanvallen.';
  if (input.clearFirst && waves.length > 1 && !Object.keys(waves[0]!).length) return 'De eerste aanval (de clear) heeft troepen nodig.';
  const total: UnitCounts = {};
  for (const w of waves) for (const u of UNIT_IDS) if (w[u]) total[u] = (total[u] ?? 0) + w[u]!;
  // the attack as it would go: the target, distance, tribe and talks; protection is checked at the leaving time
  const blocked = attackBlocker(state, from, to, waves.length > 1 ? { ...waves[0]!, ...(total.snob ? { snob: 1 } : {}) } : waves[0]!, input.catapultTarget);
  if (blocked && !blocked.startsWith('Beginnersbescherming')) return blocked;
  const short = shortOf(state, from, total);
  if (short) return short;
  const travel = walk(state, { from: from.id, to: to.id, waves });
  const sendAt = Math.round(input.landAt) - travel;
  if (sendAt < state.time) return `Te laat: dit landt op z'n vroegst om ${formatGameTime(state.time + travel)}.`;
  if (to.owner >= 0 && sendAt < protectionEndsAt(state)) return `Beginnersbescherming: dan kan hij nog niet vertrekken (de bescherming loopt tot ${formatGameTime(protectionEndsAt(state))}).`;
  const plan: PlannedAttack = { id: nextId(state), from: from.id, to: to.id, waves, landAt: sendAt + travel, sendAt };
  if (input.clearFirst && waves.length > 1) plan.clearFirst = true;
  if (input.catapultTarget && (waves[0]!.catapult ?? 0) > 0) plan.catapultTarget = input.catapultTarget;
  (state.planned ??= []).push(plan);
  push(state.queue, sendAt, { kind: 'planned', id: plan.id });
  return null;
}

/** Takes a planned attack off; its troops are free again. */
export function cancelPlanned(state: WorldState, id: number): string | null {
  const i = (state.planned ?? []).findIndex((p) => p.id === id);
  if (i < 0) return 'Die aanval staat niet (meer) ingepland.';
  state.planned!.splice(i, 1);
  return null;
}

/** The 'planned' event: it leaves now, with what is there. */
export function onPlanned(state: WorldState, id: number): void {
  const i = (state.planned ?? []).findIndex((p) => p.id === id);
  if (i < 0) return; // cancelled
  const p = state.planned!.splice(i, 1)[0]!;
  const from = state.villages[p.from], to = state.villages[p.to];
  const where = `${from?.name ?? '?'} → ${to?.name ?? '?'}${to ? ` (${to.x}|${to.y})` : ''}`;
  if (!from || !to || from.owner !== HUMAN_ID) return onPlanFailed(state, `Ingeplande aanval ${where} vervalt: het dorp is niet meer van jou.`);
  // your nobles in a joint attack: not when an army that should have gone didn't (dead noblemen)
  const op = p.waves.some((w) => w.snob) ? nobleArmiesMissing(state, p.to) : undefined;
  if (op) {
    const role = op.roles.find((r) => r.kind === 'nobles' && r.member === HUMAN_ID);
    if (role) role.state = 'failed';
    dropNoblesOrder(state, op.id);
    return onPlanFailed(state, `Ingeplande edeltrein ${where} is niet vertrokken: een van de legers van de stam ging niet. Dat telt niet tegen je.`);
  }

  // hand out what is home (and not held for another plan), wave by wave; a wave without its nobleman drops
  const left = freeUnits(state, from);
  const waves: UnitCounts[] = [];
  let short = false;
  for (const w of p.waves) {
    if (w.snob && left.snob < 1) { short = true; continue; }
    const got: UnitCounts = {};
    for (const u of UNIT_IDS) {
      const n = Math.min(w[u] ?? 0, left[u]);
      if (n < (w[u] ?? 0)) short = true;
      if (n > 0) { got[u] = n; left[u] -= n; }
    }
    if (Object.keys(got).length) waves.push(got);
  }
  if (!waves.length) return onPlanFailed(state, `Ingeplande aanval ${where} vervalt: er staan geen troepen meer voor klaar.`);

  const stay = Math.max(0, p.landAt - state.time);
  // the clear may be gone: then the nobles go as a normal train
  const clear = !!p.clearFirst && !waves[0]!.snob;
  const train = waves.length > 1 && waves.slice(clear ? 1 : 0).every((w) => w.snob);
  let error: string | null;
  if (train) {
    const first = { ...waves[0]! };
    delete first.snob;
    const escorts = waves.slice(1).map((w) => { const e = { ...w }; delete e.snob; return e; });
    error = sendNobleTrain(state, from.id, to.id, first, escorts, p.catapultTarget, clear, undefined, stay);
  } else {
    // a train that lost all but one wave goes as one attack
    error = sendAttack(state, from.id, to.id, waves[0]!, p.catapultTarget, undefined, stay);
  }
  if (error) return onPlanFailed(state, `Ingeplande aanval ${where} kon niet weg: ${error}`);
  if (to.owner >= 0) attackedWithoutPermission(state, to.owner);
  humanOpSent(state, to.id);
  const what = train ? `Ingeplande edeltrein (${waves.length})` : 'Ingeplande aanval';
  addLog(state, { time: state.time, text: `${what} ${where} is vertrokken, landt om ${formatGameTime(p.landAt)}${short ? ' — met minder troepen dan gepland' : ''}.` });
}

/** Your strongest free army of a village (or all its free spies) for an order, planned to land at landAt. */
export function planOrder(state: WorldState, from: number, to: number, landAt: number, spies = false): string | null {
  const v = state.villages[from];
  if (!v || v.owner !== HUMAN_ID) return 'Dat is niet jouw dorp.';
  const free = freeUnits(state, v);
  const first: UnitCounts = {};
  if (spies) { if (free.spy > 0) first.spy = free.spy; }
  else for (const u of OFFENSE) if (free[u] > 0) first[u] = free[u];
  if (!Object.keys(first).length) return spies ? 'Geen vrije verkenners in dat dorp.' : 'Geen vrije aanvallende troepen in dat dorp.';
  return planAttack(state, { from, to, first, landAt, ...(first.catapult ? { catapultTarget: 'wall' as BuildingId } : {}) });
}

export function plannedViews(state: WorldState): PlannedView[] {
  const owner = (o: number) => (o < 0 ? 'barbaren' : state.players[o]?.name ?? '?');
  return [...(state.planned ?? [])].sort((a, b) => a.sendAt - b.sendAt).flatMap((p) => {
    const f = state.villages[p.from], t = state.villages[p.to];
    if (!f || !t) return [];
    const units: UnitCounts = {};
    for (const w of p.waves) for (const u of UNIT_IDS) if (w[u]) units[u] = (units[u] ?? 0) + w[u]!;
    return [{
      id: p.id,
      from: { id: f.id, name: f.name, x: f.x, y: f.y },
      to: { id: t.id, name: t.name, x: t.x, y: t.y, owner: t.owner, ownerName: owner(t.owner) },
      units, waves: p.waves.length, clearFirst: !!p.clearFirst, sendAt: p.sendAt, landAt: p.landAt,
      short: f.owner !== HUMAN_ID || UNIT_IDS.some((u) => (units[u] ?? 0) > f.units[u]),
    }];
  });
}
