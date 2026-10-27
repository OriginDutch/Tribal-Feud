/**
 * Troops on the road: attacks and returns. Each movement is one event at its arrival time.
 */
import { mayAttack } from './tribes';
import type { BarbType } from '../shared/barbarianTypes';
import { BUILDING_IDS, UNIT_IDS, type BuildingId, type Res, type UnitCounts, type UnitId } from '../shared/gameData';
import { growBarbarian, onBarbarianDamaged, villagePoints } from './barbarians';
import { rememberFarm } from './bots';
import { recordIntel } from './intel';
import { fight, morale } from './combat';
import { push } from './eventQueue';
import { hidingCapacity, storageCapacity } from './formulas';
import { nextFloat, nextInt } from './rng';
import { BARBARIAN, HUMAN_ID, addLog, addMovement, invalidateOwners, moveOwner, nextId, removeMovement, villagesOf, type WorldState } from './state';
import { onHumanVillageLost, onIncomingAttack } from './alerts';
import { DAY, formatGameTime } from '../shared/time';
import { arriveTrade, arriveTradeReturn } from './market';
import { currentResources, isOperational, settle, type Village } from './village';
import { mateEvent, onVillageLost } from './loyalty';
import { statAttack, statConquest } from './worldStats';
import { battleBonus } from './battleBonus';
import { equipped, itemKills } from './paladin';
import { flagForConquest, flagKills, flagValue } from './flags';

export interface Movement {
  id: number;
  /** support = troops on their way to stay in another village; trade = merchants with resources. */
  kind: 'attack' | 'return' | 'support' | 'trade' | 'tradeReturn';
  owner: number;
  from: number;
  to: number;
  units: UnitCounts;
  sent: number;
  arrives: number;
  catapultTarget?: BuildingId;
  loot?: Res;
  /** Merchants: what they carry and how many walk. */
  res?: Res;
  merchants?: number;
  /** Attacks of one noble train share this id: cancelling one calls back all of them. */
  train?: number;
  /** Merchants paying for an offer: they can't be called back. */
  offer?: true;
}

/** How long after sending a command can still be cancelled (game time, like TW). */
export const CANCEL_WINDOW_MS = 10 * 60_000;

/** Whether `m` can still be called back now. */
export function cancelBlocker(state: WorldState, m: Movement): string | null {
  if (m.kind !== 'attack' && m.kind !== 'support' && m.kind !== 'trade') return 'Dit kun je niet annuleren.';
  if (m.offer) return 'Handelaren van een aangenomen aanbod kun je niet terughalen.';
  if (state.time - m.sent > CANCEL_WINDOW_MS) return 'Annuleren kan alleen in de eerste 10 minuten.';
  if (m.arrives <= state.time) return 'Al aangekomen.';
  return null;
}

/**
 * Calls a command back: the troops (or merchants with their load) turn around and are as long
 * on the way home as they have walked. A noble train comes back as a whole.
 */
export function cancelMovement(state: WorldState, movementId: number, by: number): string | null {
  const m = state.movements[movementId];
  if (!m) return 'Dit bevel bestaat niet meer.';
  if (m.owner !== by) return 'Dat is niet jouw bevel.';
  const blocker = cancelBlocker(state, m);
  if (blocker) return blocker;
  const group = m.train !== undefined ? Object.values(state.movements).filter((x) => x.train === m.train && x.owner === by) : [m];
  for (const g of group) {
    if (cancelBlocker(state, g)) continue;
    removeMovement(state, g.id);
    const walked = state.time - g.sent;
    const back: Movement = {
      id: nextId(state),
      kind: g.kind === 'trade' ? 'tradeReturn' : 'return',
      owner: g.owner,
      from: g.to,
      to: g.from,
      units: { ...g.units },
      sent: state.time,
      // at least a moment, so the return is its own event
      arrives: state.time + Math.max(1, walked),
    };
    if (g.res) back.res = [...g.res] as Res;
    if (g.merchants !== undefined) back.merchants = g.merchants;
    addMovement(state, back);
    push(state.queue, back.arrives, { kind: 'arrive', movementId: back.id });
  }
  return null;
}

export interface ReportVillage {
  id: number;
  name: string;
  x: number;
  y: number;
  ownerName: string;
  /** Owner's player id (reports from before this was kept only have the name). */
  owner?: number;
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
  scouted?: { res: Res; buildings: Partial<Record<BuildingId, number>>; units: UnitCounts; barbType?: BarbType; away?: UnitCounts };
  /** Loyalty before and after a nobleman hit it. */
  loyalty?: { before: number; after: number };
  /** The attacker took the village. */
  conquered?: boolean;
  /** Report seen from the defender's side (an attack on your village). */
  defense?: boolean;
  /** Your troops supporting the defender, and what they lost. */
  supportUnits?: { present: UnitCounts; lost: UnitCounts };
  /** What made either side stronger or weaker (faith, flags, items, research, night). */
  modifiers?: { attacker: string[]; defender: string[] };
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
  return { id: v.id, name: v.name, x: v.x, y: v.y, ownerName: ownerName(state, v.owner), owner: v.owner };
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
  train?: number,
  /** Walk at least this long (a pure clear walks with its noble train). */
  minDuration = 0,
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
  if (to.owner >= 0 && !mayAttack(state, from.owner, to.owner)) return 'Dat is een stamgenoot, bondgenoot of NAP-partner.';
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
  const duration = Math.max(minDuration, travelTimeMs(state, units, distance(from, to)));
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
  if (train !== undefined) movement.train = train;
  addMovement(state, movement);
  push(state.queue, movement.arrives, { kind: 'arrive', movementId: movement.id });
  if (to.owner === HUMAN_ID && from.owner !== HUMAN_ID) {
    onIncomingAttack(state, from.id, `Inkomende aanval op ${to.name} (${to.x}|${to.y}) van ${ownerName(state, from.owner)}, aankomst ${formatGameTime(movement.arrives)}.`);
  }
  return null;
}

/**
 * A noble train: the first nobleman goes with `first` (the clearing army), every next one
 * with its own escort. Everything leaves at once at nobleman speed, so it all arrives at the
 * same moment, in this order, before loyalty can come back. Nothing is sent unless all of
 * it can be sent.
 */
export function sendNobleTrain(
  state: WorldState,
  fromId: number,
  toId: number,
  first: UnitCounts,
  escorts: UnitCounts[],
  catapultTarget?: BuildingId,
  /** The first wave is a pure clear, without a nobleman. */
  clearFirst = false,
): string | null {
  const from = state.villages[fromId];
  const to = state.villages[toId];
  if (!from || !to) return 'Dorp bestaat niet.';
  const waves = 1 + escorts.length;
  if (waves < 2 || waves > 5) return 'Een edeltrein heeft 2 tot 5 aanvallen.';
  const firstWave = cleanCounts(first);
  delete firstWave.snob;
  if (clearFirst && Object.keys(firstWave).length === 0) return 'De eerste aanval (de clear) heeft troepen nodig.';
  const attacks: UnitCounts[] = [clearFirst ? firstWave : { ...firstWave, snob: 1 }, ...escorts.map((e) => ({ ...cleanCounts(e), snob: 1 }))];
  const total: UnitCounts = {};
  for (const a of attacks) for (const u of UNIT_IDS) if ((a[u] ?? 0) > 0) total[u] = (total[u] ?? 0) + (a[u] ?? 0);
  for (const u of UNIT_IDS) {
    if ((total[u] ?? 0) > from.units[u]) {
      return `Niet genoeg ${state.config.units[u].name.toLowerCase()} voor deze trein (${total[u]} nodig, ${from.units[u]} thuis).`;
    }
  }
  // the first attack is checked like any attack (distance, protection, place); the rest follow
  const train = nextId(state);
  // a pure clear walks with the nobles, so it lands first, right before them
  const pace = clearFirst ? Math.max(...attacks.slice(1).map((a) => travelTimeMs(state, a, distance(from, to)))) : 0;
  const error = sendAttack(state, fromId, toId, attacks[0] ?? {}, catapultTarget, train, pace);
  if (error) return error;
  for (const a of attacks.slice(1)) sendAttack(state, fromId, toId, a, undefined, train);
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

/**
 * Morale (attacker strength vs a smaller player). 'pointsTime': the floor rises from 30% to 50%
 * over the defender's first 30 days in the world (scaled by world speed), like TW.
 */
export function moraleFor(state: WorldState, attacker: number, defender: number): number {
  const { config } = state;
  const base = morale(config, playerPoints(state, attacker), playerPoints(state, defender), false);
  if (config.morale !== 'pointsTime') return base;
  const age = (state.time - (state.players[defender]?.joinedAt ?? 0)) * config.worldSpeed;
  const floor = 0.3 + 0.2 * Math.min(1, age / (30 * DAY));
  return Math.max(base, floor);
}

function arriveAttack(state: WorldState, m: Movement): void {
  const { config } = state;
  const from = state.villages[m.from];
  const target = state.villages[m.to];
  if (!from || !target) {
    removeMovement(state, m.id);
    return;
  }

  growBarbarian(state, target, state.time);
  settle(config, target, state.time);
  statAttack(state, m.owner, target.owner);

  const rolledLuck = config.luck ? (nextFloat(state.rng) * 2 - 1) * config.combat.luckRange : 0;
  // a luck flag in the attacking village pulls luck towards 0
  const luckFlag = flagValue(config, from, 'luck');
  const luck = luckFlag ? Math.sign(rolledLuck) * Math.max(0, Math.abs(rolledLuck) - luckFlag) : rolledLuck;
  // points only matter against players: skip the (expensive) count for barbarians
  const mor =
    target.owner === BARBARIAN ? 1 : moraleFor(state, m.owner, target.owner);
  const defenderPresent = defendersOf(target);
  const { notes, ...bonus } = battleBonus(state, from, target, m.units);
  const battle = fight(config, {
    attacker: m.units,
    defender: defenderPresent,
    wall: target.buildings.wall,
    morale: mor,
    luck,
    ...(m.catapultTarget ? { catapultTarget: m.catapultTarget, targetLevel: target.buildings[m.catapultTarget] } : {}),
    ...bonus,
  });

  // defender losses, shared between the village's own troops and its support
  const supportLost = applyDefenderLosses(state, target, battle.defenderLost);
  // the weapon chamber fills faster with every enemy killed
  itemKills(state, m.owner, UNIT_IDS.reduce((t, u) => t + (battle.defenderLost[u] ?? 0), 0));
  itemKills(state, target.owner, UNIT_IDS.reduce((t, u) => t + (battle.attackerLost[u] ?? 0), 0));
  if (config.flags) {
    flagKills(state, m.owner, UNIT_IDS.reduce((t, u) => t + (battle.defenderLost[u] ?? 0), 0));
    flagKills(state, target.owner, UNIT_IDS.reduce((t, u) => t + (battle.attackerLost[u] ?? 0), 0));
  }

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
    carry *= 1 + flagValue(config, from, 'haul');
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
    const rolled = nextInt(state.rng, config.conquest.loyaltyDropMin, config.conquest.loyaltyDropMax);
    // Vasco's scepter: with the paladin along, at least 30
    const drop = (m.units.knight ?? 0) > 0 && equipped(state, m.owner)?.id === 'scepter' ? Math.max(30, rolled) : rolled;
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
    addMovement(state, back);
    push(state.queue, back.arrives, { kind: 'arrive', movementId: back.id });
  }
  removeMovement(state, m.id);

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
      ...(notes.attacker.length || (seesDefender && notes.defender.length) ? { modifiers: { attacker: notes.attacker, defender: seesDefender ? notes.defender : [] } } : {}),
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
      // Kalid's telescope: the scouts also see who is away
      if (equipped(state, m.owner)?.id === 'telescope') report.scouted.away = cleanCounts(target.outside);
    }
    recordIntel(state, target, {
      ...(seesDefender ? { wall: battle.wallAfter } : {}),
      ...(report.scouted ? { scouted: report.scouted } : {}),
    });
    state.reports.push(report);
    if (state.reports.length > MAX_REPORTS) state.reports.splice(0, state.reports.length - MAX_REPORTS);
    state.lastAttack[target.id] = {
      time: report.time,
      result: report.result,
      loot: loot ? loot[0] + loot[1] + loot[2] : 0,
      ...(report.scouted ? { scouted: report.scouted.res } : {}),
    };
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
      defender: { ...reportVillage(state, target), ownerName: ownerName(state, oldOwner), owner: oldOwner },
      result: !battle.attackerWon ? 'loss' : anyLost ? 'winLosses' : 'win',
      luck,
      morale: mor,
      attackerUnits: { sent: m.units, lost: cleanCounts(battle.attackerLost) },
      defenderUnits: { present: defenderPresent, lost: cleanCounts(battle.defenderLost) },
      ...(notes.attacker.length || notes.defender.length ? { modifiers: { attacker: notes.attacker, defender: notes.defender } } : {}),
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
  statConquest(state, v.id, v.name, old, newOwner);
  delete v.flag;
  if (newOwner >= 0) flagForConquest(state, newOwner);
  if (old >= 0 && old !== HUMAN_ID) {
    const helped = Object.keys(v.support ?? {}).some((o) => state.villages[Number(o)]?.owner === HUMAN_ID);
    onVillageLost(state, old, helped, v.name);
  }
  settle(config, v, state.time);
  for (const u of UNIT_IDS) {
    v.units[u] = 0;
    v.outside[u] = 0;
  }
  v.buildQueue = [];
  for (const b of Object.keys(v.recruitQueues) as (keyof Village['recruitQueues'])[]) v.recruitQueues[b] = [];
  v.research = null;
  delete v.manager;
  delete v.groups;
  // troops that belonged to this village are lost: on the road, coming home, or supporting elsewhere
  for (const m of Object.values(state.movements)) {
    if (m.owner !== old) continue;
    if (m.from === v.id || (m.kind === 'return' && m.to === v.id)) removeMovement(state, m.id);
  }
  for (const w of Object.values(state.villages)) if (w.support?.[v.id]) delete w.support[v.id];
  // open market offers of this village go with it
  if (state.offers) state.offers = state.offers.filter((o) => o.villageId !== v.id);
  state.conquests ??= { barbarian: 0, player: 0 };
  if (old === BARBARIAN) state.conquests.barbarian++;
  else state.conquests.player++;
  v.owner = newOwner;
  const bot = state.players[newOwner]?.bot;
  if (bot) {
    bot.lastConquest = state.time;
    // the target is taken: the next train picks a new one
    if (bot.nobleTarget === v.id) delete bot.nobleTarget;
  }
  delete v.growth;
  delete v.barbType;
  v.loyalty = config.conquest.loyaltyAfterConquest;
  v.loyaltyAt = state.time;
  moveOwner(state, v.id, old, newOwner);
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
  addMovement(state, movement);
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
  addMovement(state, back);
  push(state.queue, back.arrives, { kind: 'arrive', movementId: back.id });
  return null;
}

function arriveSupport(state: WorldState, m: Movement): void {
  removeMovement(state, m.id);
  const host = state.villages[m.to];
  const origin = state.villages[m.from];
  // if the home village was lost meanwhile, conquer() already removed this movement
  if (!host || !origin || origin.owner !== m.owner) return;
  addSupport(host, origin.id, m.units);
  if (m.owner === HUMAN_ID && host.owner === HUMAN_ID) return;
  if (m.owner === HUMAN_ID) {
    addLog(state, { time: state.time, text: `Ondersteuning aangekomen in ${host.name} (${host.x}|${host.y}).` });
    mateEvent(state, state.players[host.owner], 5, 2, `je stuurde support naar ${host.name}`);
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
  removeMovement(state, m.id);
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
  else if (m.kind === 'trade') arriveTrade(state, m);
  else if (m.kind === 'tradeReturn') arriveTradeReturn(state, m);
  else arriveReturn(state, m);
}

export function unitCountsOf(units: Record<UnitId, number>): UnitCounts {
  return cleanCounts(units);
}
