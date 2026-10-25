/**
 * Troops on the road: attacks and returns. Each movement is one event at its arrival time.
 */
import type { BarbType } from '../shared/barbarianTypes';
import { BUILDING_IDS, UNIT_IDS, type BuildingId, type Res, type UnitCounts, type UnitId } from '../shared/gameData';
import { growBarbarian, onBarbarianDamaged, villagePoints } from './barbarians';
import { rememberFarm } from './bots';
import { recordIntel } from './intel';
import { fight, morale } from './combat';
import { push } from './eventQueue';
import { hidingCapacity, storageCapacity } from './formulas';
import { nextFloat, nextInt } from './rng';
import { BARBARIAN, HUMAN_ID, addLog, invalidateOwners, nextId, villagesOf, type WorldState } from './state';
import { onHumanVillageLost, onIncomingAttack } from './alerts';
import { formatGameTime } from '../shared/time';
import { currentResources, isOperational, settle, type Village } from './village';

export interface Movement {
  id: number;
  /** support = troops on their way to stay in another village. */
  kind: 'attack' | 'return' | 'support';
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
  /** Loyalty before and after a nobleman hit it. */
  loyalty?: { before: number; after: number };
  /** The attacker took the village. */
  conquered?: boolean;
  /** Report seen from the defender's side (an attack on your village). */
  defense?: boolean;
  /** Your troops supporting the defender, and what they lost. */
  supportUnits?: { present: UnitCounts; lost: UnitCounts };
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
  if ((units.snob ?? 0) > 0 && distance(from, to) > config.conquest.maxDistance) {
    return `Een edelman loopt maximaal ${config.conquest.maxDistance} velden.`;
  }
  const protectedMsg = protectionBlocker(state, from.owner, to.owner);
  if (protectedMsg) return protectedMsg;
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
  if (to.owner === HUMAN_ID && from.owner !== HUMAN_ID) {
    onIncomingAttack(state, from.id, `Inkomende aanval op ${to.name} (${to.x}|${to.y}) van ${ownerName(state, from.owner)}, aankomst ${formatGameTime(movement.arrives)}.`);
  }
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
  const defenderPresent = defendersOf(target);
  const battle = fight(config, {
    attacker: m.units,
    defender: defenderPresent,
    wall: target.buildings.wall,
    morale: mor,
    luck,
    ...(m.catapultTarget ? { catapultTarget: m.catapultTarget, targetLevel: target.buildings[m.catapultTarget] } : {}),
  });

  // defender losses, shared between the village's own troops and its support
  const supportLost = applyDefenderLosses(state, target, battle.defenderLost);

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
  const pointsBefore = target.owner === BARBARIAN ? villagePoints(config, target) : 0;
  target.buildings.wall = battle.wallAfter;
  if (m.catapultTarget && battle.buildingAfter !== undefined && m.catapultTarget !== 'wall') {
    target.buildings[m.catapultTarget] = battle.buildingAfter;
  }
  if (target.owner === BARBARIAN) onBarbarianDamaged(config, target, state.time, pointsBefore, battle.wallBefore);

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

  // nobleman: lowers loyalty; at 0 or below the village changes hands
  let loyalty: Report['loyalty'];
  let conquered = false;
  const oldOwner = target.owner;
  if (battle.attackerWon && (survivors.snob ?? 0) > 0 && target.owner !== m.owner) {
    const before = Math.floor(loyaltyNow(config, target, state.time));
    const drop = nextInt(state.rng, config.conquest.loyaltyDropMin, config.conquest.loyaltyDropMax);
    if (before - drop <= 0) {
      // one nobleman takes the village and is used up; the rest of the attack stays there
      survivors.snob = (survivors.snob ?? 0) - 1;
      if (survivors.snob <= 0) delete survivors.snob;
      from.outside.snob -= 1;
      if (loot) for (const i of [0, 1, 2] as const) target.res[i] += loot[i];
      loot = undefined;
      conquer(state, target, m.owner);
      if (Object.keys(survivors).length > 0) addSupport(target, from.id, survivors);
      loyalty = { before, after: target.loyalty ?? config.conquest.loyaltyAfterConquest };
      conquered = true;
    } else {
      target.loyalty = before - drop;
      target.loyaltyAt = state.time;
      loyalty = { before, after: before - drop };
    }
  }

  // send the survivors home
  if (!conquered && Object.keys(survivors).length > 0) {
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

  if (m.owner !== HUMAN_ID) rememberFarm(state, m.owner, target.id, battle.attackerWon);

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
    if (loyalty) report.loyalty = loyalty;
    if (conquered) report.conquered = true;
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

  // the human player sees attacks on his villages and on villages his troops support
  const humanSupport = supportLost.get(HUMAN_ID);
  if (oldOwner === HUMAN_ID || humanSupport) {
    const anyLost = UNIT_IDS.some((u) => (battle.attackerLost[u] ?? 0) > 0);
    const report: Report = {
      id: nextId(state),
      time: state.time,
      read: false,
      defense: true,
      attacker: reportVillage(state, from),
      defender: { ...reportVillage(state, target), ownerName: ownerName(state, oldOwner) },
      result: !battle.attackerWon ? 'loss' : anyLost ? 'winLosses' : 'win',
      luck,
      morale: mor,
      attackerUnits: { sent: m.units, lost: cleanCounts(battle.attackerLost) },
      defenderUnits: { present: defenderPresent, lost: cleanCounts(battle.defenderLost) },
      wall: { before: battle.wallBefore, after: battle.wallAfter },
    };
    if (humanSupport) report.supportUnits = humanSupport;
    if (m.catapultTarget && battle.buildingBefore !== undefined && battle.buildingAfter !== undefined) {
      report.building = { id: m.catapultTarget, before: battle.buildingBefore, after: battle.buildingAfter };
    }
    if (loot) report.loot = loot;
    if (loyalty) report.loyalty = loyalty;
    if (conquered) report.conquered = true;
    state.reports.push(report);
    if (state.reports.length > MAX_REPORTS) state.reports.splice(0, state.reports.length - MAX_REPORTS);
    if (oldOwner === HUMAN_ID) {
      const text = conquered
        ? `${target.name} (${target.x}|${target.y}) is veroverd door ${ownerName(state, m.owner)}!`
        : `${target.name} (${target.x}|${target.y}) is aangevallen door ${ownerName(state, m.owner)}.`;
      addLog(state, { time: state.time, text });
      if (conquered) onHumanVillageLost(state, text);
    }
  }
  // bots taking barbarian villages happens all the time: only conquests of players are news
  if (conquered && oldOwner !== HUMAN_ID && (oldOwner !== BARBARIAN || m.owner === HUMAN_ID)) {
    addLog(state, {
      time: state.time,
      text: `${ownerName(state, m.owner)} heeft ${target.name} (${target.x}|${target.y}) veroverd.`,
    });
  }
}

// --- loyalty and conquest ---------------------------------------------------

export function loyaltyNow(config: WorldState['config'], v: Village, time: number): number {
  if (v.loyalty === undefined) return 100;
  const hours = Math.max(0, time - (v.loyaltyAt ?? time)) / 3_600_000;
  return Math.min(100, v.loyalty + hours * config.conquest.loyaltyPerHour * config.worldSpeed);
}

/** Hands a village over to `newOwner`. Its own troops are gone (they lost the battle). */
export function conquer(state: WorldState, v: Village, newOwner: number): void {
  const { config } = state;
  const old = v.owner;
  settle(config, v, state.time);
  for (const u of UNIT_IDS) {
    v.units[u] = 0;
    v.outside[u] = 0;
  }
  v.buildQueue = [];
  for (const b of Object.keys(v.recruitQueues) as (keyof Village['recruitQueues'])[]) v.recruitQueues[b] = [];
  v.research = null;
  // troops that belonged to this village are lost: on the road, coming home, or supporting elsewhere
  for (const m of Object.values(state.movements)) {
    if (m.owner !== old) continue;
    if (m.from === v.id || (m.kind === 'return' && m.to === v.id)) delete state.movements[m.id];
  }
  for (const w of Object.values(state.villages)) if (w.support?.[v.id]) delete w.support[v.id];
  v.owner = newOwner;
  delete v.growth;
  delete v.barbType;
  v.loyalty = config.conquest.loyaltyAfterConquest;
  v.loyaltyAt = state.time;
  invalidateOwners(state);
}

// --- support ------------------------------------------------------------------

/** Everyone defending a village: its own troops plus all support. */
export function defendersOf(v: Village): UnitCounts {
  const out = cleanCounts(v.units);
  for (const units of Object.values(v.support ?? {})) {
    for (const u of UNIT_IDS) {
      const n = units[u] ?? 0;
      if (n > 0) out[u] = (out[u] ?? 0) + n;
    }
  }
  return out;
}

export function addSupport(v: Village, originId: number, units: UnitCounts): void {
  v.support ??= {};
  const here = (v.support[originId] ??= {});
  for (const u of UNIT_IDS) {
    const n = units[u] ?? 0;
    if (n > 0) here[u] = (here[u] ?? 0) + n;
  }
}

/**
 * Spreads the defender's losses over the village's own troops and each supporting village,
 * in proportion to what each had there. Returns, per owner of support, what they had and lost.
 */
function applyDefenderLosses(
  state: WorldState,
  v: Village,
  lost: UnitCounts,
): Map<number, { present: UnitCounts; lost: UnitCounts }> {
  const perOwner = new Map<number, { present: UnitCounts; lost: UnitCounts }>();
  const groups: { origin: number | null; units: UnitCounts }[] = [{ origin: null, units: cleanCounts(v.units) }];
  for (const [origin, units] of Object.entries(v.support ?? {})) groups.push({ origin: Number(origin), units: { ...units } });

  for (const u of UNIT_IDS) {
    const total = groups.reduce((sum, g) => sum + (g.units[u] ?? 0), 0);
    const toLose = Math.min(total, lost[u] ?? 0);
    if (total === 0 || toLose === 0) continue;
    // floor shares, then hand out the rest to the biggest groups
    const shares = groups.map((g) => Math.floor(((g.units[u] ?? 0) * toLose) / total));
    let rest = toLose - shares.reduce((a, b) => a + b, 0);
    const order = groups.map((_, i) => i).sort((a, b) => (groups[b]?.units[u] ?? 0) - (groups[a]?.units[u] ?? 0));
    for (const i of order) {
      if (rest <= 0) break;
      const g = groups[i];
      if (g && (g.units[u] ?? 0) > (shares[i] ?? 0)) {
        shares[i] = (shares[i] ?? 0) + 1;
        rest--;
      }
    }
    groups.forEach((g, i) => {
      const n = shares[i] ?? 0;
      if (n === 0) return;
      if (g.origin === null) {
        v.units[u] -= n;
        return;
      }
      const origin = state.villages[g.origin];
      if (origin) {
        origin.outside[u] -= n;
        const entry = perOwner.get(origin.owner) ?? { present: {}, lost: {} };
        entry.lost[u] = (entry.lost[u] ?? 0) + n;
        perOwner.set(origin.owner, entry);
      }
      const here = v.support?.[g.origin];
      if (here) {
        here[u] = (here[u] ?? 0) - n;
        if ((here[u] ?? 0) <= 0) delete here[u];
      }
    });
  }
  // what each owner had there before the battle
  for (const g of groups) {
    if (g.origin === null) continue;
    const origin = state.villages[g.origin];
    if (!origin) continue;
    const entry = perOwner.get(origin.owner) ?? { present: {}, lost: {} };
    for (const u of UNIT_IDS) {
      const n = g.units[u] ?? 0;
      if (n > 0) entry.present[u] = (entry.present[u] ?? 0) + n;
    }
    perOwner.set(origin.owner, entry);
  }
  for (const [origin, units] of Object.entries(v.support ?? {})) {
    if (Object.keys(units).length === 0) delete v.support?.[Number(origin)];
  }
  return perOwner;
}

/** Sends troops to stay in another village (own or someone else's). */
export function sendSupport(state: WorldState, fromId: number, toId: number, requested: UnitCounts): string | null {
  const { config } = state;
  const from = state.villages[fromId];
  const to = state.villages[toId];
  if (!from || !to) return 'Dorp bestaat niet.';
  if (from.id === to.id) return 'Dat is hetzelfde dorp.';
  if (to.owner === BARBARIAN) return 'Je kunt geen barbarendorp ondersteunen.';
  if (!isOperational(config, from, 'place')) return 'Je hebt een werkende verzamelplaats nodig.';
  const units = cleanCounts(requested);
  if (Object.keys(units).length === 0) return 'Kies minstens één eenheid.';
  for (const u of UNIT_IDS) {
    if ((units[u] ?? 0) > from.units[u]) return `Niet genoeg ${config.units[u].name.toLowerCase()} in het dorp.`;
  }
  for (const u of UNIT_IDS) {
    const n = units[u] ?? 0;
    from.units[u] -= n;
    from.outside[u] += n;
  }
  const duration = travelTimeMs(state, units, distance(from, to));
  const movement: Movement = {
    id: nextId(state),
    kind: 'support',
    owner: from.owner,
    from: from.id,
    to: to.id,
    units,
    sent: state.time,
    arrives: state.time + duration,
  };
  state.movements[movement.id] = movement;
  push(state.queue, movement.arrives, { kind: 'arrive', movementId: movement.id });
  return null;
}

/**
 * Sends support from `originId` that stands in `hostId` back home. Allowed for the owner of
 * the troops (withdraw) and for the owner of the host village (send back).
 */
export function returnSupport(state: WorldState, by: number, hostId: number, originId: number): string | null {
  const host = state.villages[hostId];
  const origin = state.villages[originId];
  const units = host?.support?.[originId];
  if (!host || !origin || !units || Object.keys(units).length === 0) return 'Geen ondersteuning gevonden.';
  if (by !== origin.owner && by !== host.owner) return 'Dat zijn niet jouw troepen.';
  delete host.support?.[originId];
  const duration = travelTimeMs(state, units, distance(host, origin));
  const back: Movement = {
    id: nextId(state),
    kind: 'return',
    owner: origin.owner,
    from: host.id,
    to: origin.id,
    units: { ...units },
    sent: state.time,
    arrives: state.time + duration,
  };
  state.movements[back.id] = back;
  push(state.queue, back.arrives, { kind: 'arrive', movementId: back.id });
  return null;
}

function arriveSupport(state: WorldState, m: Movement): void {
  delete state.movements[m.id];
  const host = state.villages[m.to];
  const origin = state.villages[m.from];
  // if the home village was lost meanwhile, conquer() already removed this movement
  if (!host || !origin || origin.owner !== m.owner) return;
  addSupport(host, origin.id, m.units);
  if (m.owner === HUMAN_ID && host.owner === HUMAN_ID) return;
  if (m.owner === HUMAN_ID) {
    addLog(state, { time: state.time, text: `Ondersteuning aangekomen in ${host.name} (${host.x}|${host.y}).` });
  }
}

// --- beginner protection --------------------------------------------------------

export function protectionEndsAt(state: WorldState): number {
  return (state.config.conquest.protectionDays * 86_400_000) / state.config.worldSpeed;
}

/** Players can't attack each other while the world is young. Barbarians are always fair game. */
export function protectionBlocker(state: WorldState, attacker: number, defender: number): string | null {
  if (attacker < 0 || defender < 0 || attacker === defender) return null;
  if (state.time >= protectionEndsAt(state)) return null;
  return 'Beginnersbescherming: spelers kunnen elkaar nog niet aanvallen.';
}

function arriveReturn(state: WorldState, m: Movement): void {
  const { config } = state;
  const home = state.villages[m.to];
  delete state.movements[m.id];
  // home lost meanwhile: the troops are gone
  if (!home || home.owner !== m.owner) return;
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
  else if (m.kind === 'support') arriveSupport(state, m);
  else arriveReturn(state, m);
}

export function unitCountsOf(units: Record<UnitId, number>): UnitCounts {
  return cleanCounts(units);
}
