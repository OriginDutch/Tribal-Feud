/**
 * Troops on the road: attacks and returns. Each movement is one event at its arrival time.
 */
import type { BarbType } from '../shared/barbarianTypes';
import { BUILDING_IDS, UNIT_IDS, type BuildingId, type Res, type UnitCounts, type UnitId } from '../shared/gameData';
import { growBarbarian, villagePoints } from './barbarians';
import { rememberFarm } from './bots';
import { recordIntel } from './intel';
import { fight, morale } from './combat';
import { push } from './eventQueue';
import { hidingCapacity, storageCapacity } from './formulas';
import { nextFloat } from './rng';
import { BARBARIAN, HUMAN_ID, addLog, nextId, villagesOf, type WorldState } from './state';
import { currentResources, isOperational, settle, type Village } from './village';

export interface Movement {
  id: number;
  kind: 'attack' | 'return';
  owner: number;
  from: number;
  to: number;
  units: UnitCounts;
  sent: number;
  arrives: number;
  catapultTarget?: BuildingId;
  loot?: Res;
}

export interface ReportVillage {
  id: number;
  name: string;
  x: number;
  y: number;
  ownerName: string;
}

export interface Report {
  id: number;
  time: number;
  read: boolean;
  attacker: ReportVillage;
  defender: ReportVillage;
  /** win = no losses, winLosses = won with losses, loss = attacker lost everything (or only spies died). */
  result: 'win' | 'winLosses' | 'loss';
  luck: number;
  morale: number;
  attackerUnits: { sent: UnitCounts; lost: UnitCounts };
  /** null if nobody came back to tell. */
  defenderUnits: { present: UnitCounts; lost: UnitCounts } | null;
  wall?: { before: number; after: number };
  building?: { id: BuildingId; before: number; after: number };
  loot?: Res;
  carry?: number;
  scouted?: { res: Res; buildings: Partial<Record<BuildingId, number>>; units: UnitCounts; barbType?: BarbType };
}

export const MAX_REPORTS = 300;

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Travel time for a group: the slowest unit sets the pace. */
export function travelTimeMs(state: WorldState, units: UnitCounts, dist: number): number {
  const { config } = state;
  let slowest = 0;
  for (const u of UNIT_IDS) if ((units[u] ?? 0) > 0) slowest = Math.max(slowest, config.units[u].speed);
  const minutes = (dist * slowest) / (config.worldSpeed * config.unitSpeed * config.marchSpeed);
  return Math.round(minutes * 60_000);
}

export function playerPoints(state: WorldState, owner: number): number {
  let points = 0;
  for (const v of villagesOf(state, owner)) points += villagePoints(state.config, v);
  return points;
}

function ownerName(state: WorldState, owner: number): string {
  if (owner === BARBARIAN) return 'Barbaren';
  return state.players[owner]?.name ?? '?';
}

function reportVillage(state: WorldState, v: Village): ReportVillage {
  return { id: v.id, name: v.name, x: v.x, y: v.y, ownerName: ownerName(state, v.owner) };
}

function cleanCounts(units: UnitCounts): UnitCounts {
  const out: UnitCounts = {};
  for (const u of UNIT_IDS) {
    const n = Math.floor(units[u] ?? 0);
    if (n > 0) out[u] = n;
  }
  return out;
}

export function sendAttack(
  state: WorldState,
  fromId: number,
  toId: number,
  requested: UnitCounts,
  catapultTarget?: BuildingId,
): string | null {
  const { config } = state;
  const from = state.villages[fromId];
  const to = state.villages[toId];
  if (!from || !to) return 'Dorp bestaat niet.';
  if (from.id === to.id) return 'Je kunt je eigen dorp niet aanvallen.';
  if (to.owner === from.owner) return 'Je kunt je eigen dorpen niet aanvallen.';
  if (!isOperational(config, from, 'place')) return 'Je hebt een werkende verzamelplaats nodig.';
  const units = cleanCounts(requested);
  if (Object.keys(units).length === 0) return 'Kies minstens één eenheid.';
  if ((units.snob ?? 0) > 0) return 'Edelmannen komen in fase 4.';
  for (const u of UNIT_IDS) {
    if ((units[u] ?? 0) > from.units[u]) return `Niet genoeg ${config.units[u].name.toLowerCase()} in het dorp.`;
  }
  if (catapultTarget && !BUILDING_IDS.includes(catapultTarget)) return 'Ongeldig doelwit voor katapulten.';
  if (catapultTarget === 'hide') return 'De schuilplaats kan niet beschoten worden.';

  for (const u of UNIT_IDS) {
    const n = units[u] ?? 0;
    from.units[u] -= n;
    from.outside[u] += n;
  }
  const duration = travelTimeMs(state, units, distance(from, to));
  const movement: Movement = {
    id: nextId(state),
    kind: 'attack',
    owner: from.owner,
    from: from.id,
    to: to.id,
    units,
    sent: state.time,
    arrives: state.time + duration,
  };
  if (catapultTarget && (units.catapult ?? 0) > 0) movement.catapultTarget = catapultTarget;
  state.movements[movement.id] = movement;
  push(state.queue, movement.arrives, { kind: 'arrive', movementId: movement.id });
  return null;
}

/** Plunders up to `carry` from what is not hidden, spread evenly over the three resources. */
export function plunder(available: Res, carry: number): Res {
  const loot: Res = [0, 0, 0];
  let left = Math.floor(carry);
  for (let round = 0; round < 3 && left > 0; round++) {
    const open = [0, 1, 2].filter((i) => available[i as 0 | 1 | 2] - loot[i as 0 | 1 | 2] > 0);
    if (open.length === 0) break;
    const share = Math.max(1, Math.floor(left / open.length));
    for (const i of open as (0 | 1 | 2)[]) {
      const take = Math.min(share, available[i] - loot[i], left);
      loot[i] += take;
      left -= take;
    }
  }
  // the last few units of carry capacity (rounding leftovers)
  for (const i of [0, 1, 2] as const) {
    const take = Math.min(left, available[i] - loot[i]);
    loot[i] += take;
    left -= take;
  }
  return loot;
}

function arriveAttack(state: WorldState, m: Movement): void {
  const { config } = state;
  const from = state.villages[m.from];
  const target = state.villages[m.to];
  if (!from || !target) {
    delete state.movements[m.id];
    return;
  }

  growBarbarian(state, target, state.time);
  settle(config, target, state.time);

  const luck = config.luck ? (nextFloat(state.rng) * 2 - 1) * config.combat.luckRange : 0;
  // points only matter against players: skip the (expensive) count for barbarians
  const mor =
    target.owner === BARBARIAN ? 1 : morale(config, playerPoints(state, m.owner), playerPoints(state, target.owner), false);
  const defenderPresent = cleanCounts(target.units);
  const battle = fight(config, {
    attacker: m.units,
    defender: defenderPresent,
    wall: target.buildings.wall,
    morale: mor,
    luck,
    ...(m.catapultTarget ? { catapultTarget: m.catapultTarget, targetLevel: target.buildings[m.catapultTarget] } : {}),
  });

  // defender losses
  for (const u of UNIT_IDS) target.units[u] -= battle.defenderLost[u] ?? 0;

  // attacker losses and survivors
  const survivors: UnitCounts = {};
  for (const u of UNIT_IDS) {
    const sent = m.units[u] ?? 0;
    if (sent === 0) continue;
    const lost = battle.attackerLost[u] ?? 0;
    from.outside[u] -= lost;
    if (sent - lost > 0) survivors[u] = sent - lost;
  }

  // buildings
  target.buildings.wall = battle.wallAfter;
  if (m.catapultTarget && battle.buildingAfter !== undefined && m.catapultTarget !== 'wall') {
    target.buildings[m.catapultTarget] = battle.buildingAfter;
  }

  // loot: only if the main battle was won (spy-only attacks carry nothing)
  let loot: Res | undefined;
  let carry = 0;
  const fighters = UNIT_IDS.some((u) => u !== 'spy' && (m.units[u] ?? 0) > 0);
  if (battle.attackerWon && fighters) {
    for (const u of UNIT_IDS) carry += (survivors[u] ?? 0) * config.units[u].carry;
    const hide = hidingCapacity(target.buildings.hide);
    const have = currentResources(config, target, state.time);
    const available = have.map((r) => Math.max(0, Math.floor(r - hide))) as Res;
    loot = plunder(available, carry);
    for (const i of [0, 1, 2] as const) target.res[i] -= loot[i];
  }

  // send the survivors home
  if (Object.keys(survivors).length > 0) {
    const back: Movement = {
      id: nextId(state),
      kind: 'return',
      owner: m.owner,
      from: target.id,
      to: from.id,
      units: survivors,
      sent: state.time,
      arrives: state.time + (m.arrives - m.sent),
    };
    if (loot) back.loot = loot;
    state.movements[back.id] = back;
    push(state.queue, back.arrives, { kind: 'arrive', movementId: back.id });
  }
  delete state.movements[m.id];

  if (target.owner === BARBARIAN && m.owner !== HUMAN_ID) rememberFarm(state, m.owner, target.id, battle.attackerWon);

  if (m.owner === HUMAN_ID) {
    const anyLost = UNIT_IDS.some((u) => (battle.attackerLost[u] ?? 0) > 0);
    const result: Report['result'] = !battle.attackerWon ? 'loss' : anyLost ? 'winLosses' : 'win';
    const seesDefender = Object.keys(survivors).length > 0 || battle.spiesSurvived > 0;
    const report: Report = {
      id: nextId(state),
      time: state.time,
      read: false,
      attacker: reportVillage(state, from),
      defender: reportVillage(state, target),
      result,
      luck,
      morale: mor,
      attackerUnits: { sent: m.units, lost: cleanCounts(battle.attackerLost) },
      defenderUnits: seesDefender ? { present: defenderPresent, lost: cleanCounts(battle.defenderLost) } : null,
    };
    // the wall is always reported when the attacker saw the village
    if (seesDefender) report.wall = { before: battle.wallBefore, after: battle.wallAfter };
    if (m.catapultTarget && battle.buildingBefore !== undefined && battle.buildingAfter !== undefined && seesDefender) {
      report.building = { id: m.catapultTarget, before: battle.buildingBefore, after: battle.buildingAfter };
    }
    if (loot) {
      report.loot = loot;
      report.carry = carry;
    }
    if (battle.spiesSurvived > 0) {
      const buildings: Partial<Record<BuildingId, number>> = {};
      for (const b of BUILDING_IDS) if (target.buildings[b] > 0) buildings[b] = target.buildings[b];
      report.scouted = {
        res: currentResources(config, target, state.time).map(Math.floor) as Res,
        buildings,
        units: cleanCounts(target.units),
      };
      if (target.barbType) report.scouted.barbType = target.barbType;
    }
    recordIntel(state, target, {
      ...(seesDefender ? { wall: battle.wallAfter } : {}),
      ...(report.scouted ? { scouted: report.scouted } : {}),
    });
    state.reports.push(report);
    if (state.reports.length > MAX_REPORTS) state.reports.splice(0, state.reports.length - MAX_REPORTS);
    state.lastReportByTarget[target.id] = report.id;
    if (battle.attackerWon && fighters && target.owner === BARBARIAN) state.stats.plunders++;
    if (loot) state.stats.loot += loot[0] + loot[1] + loot[2];
    const verdict = result === 'loss' ? 'verloren' : 'gewonnen';
    addLog(state, { time: state.time, text: `Aanval op ${target.name} (${target.x}|${target.y}) ${verdict}.` });
  }
}

function arriveReturn(state: WorldState, m: Movement): void {
  const { config } = state;
  const home = state.villages[m.to];
  delete state.movements[m.id];
  if (!home) return;
  for (const u of UNIT_IDS) {
    const n = m.units[u] ?? 0;
    home.units[u] += n;
    home.outside[u] -= n;
  }
  if (m.loot) {
    settle(config, home, state.time);
    const cap = storageCapacity(home.buildings.storage);
    for (const i of [0, 1, 2] as const) {
      // loot fills up to the storage cap; the rest is lost, like in TW
      home.res[i] = Math.max(home.res[i], Math.min(cap, home.res[i] + m.loot[i]));
    }
  }
}

export function onArrive(state: WorldState, movementId: number): void {
  const m = state.movements[movementId];
  if (!m || m.arrives !== state.time) return; // stale event
  if (m.kind === 'attack') arriveAttack(state, m);
  else arriveReturn(state, m);
}

export function unitCountsOf(units: Record<UnitId, number>): UnitCounts {
  return cleanCounts(units);
}
