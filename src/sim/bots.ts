/**
 * Bot economy layer ("domme bots"): bots build, research, recruit and farm barbarians.
 * They play by exactly the same rules as the player: every action goes through the same
 * functions (queueBuild, recruit, startResearch, sendAttack) and they only know what their
 * own reports told them. They don't attack players yet.
 */
import { ARCHETYPES, BOT_PROFILES, type BotProfile } from '../shared/botProfiles';
import { RECRUIT_BUILDINGS, UNIT_IDS, type BuildingId, type Res, type UnitCounts, type UnitId } from '../shared/gameData';
import { MINUTE } from '../shared/time';

const DAY = 86_400_000;
import { push } from './eventQueue';
import { buildingCost } from './formulas';
import { distance, protectionBlocker, protectionEndsAt, sendAttack } from './movement';
import { mintCoins, noblesAllowed } from './nobles';
import { hashFloat, nextFloat } from './rng';
import { startBarbarianGrowth, villagePoints } from './barbarians';
import { edgeSpot } from './map';
import { BARBARIAN, addLog, invalidateOwners, nextId, villagesOf, type Player, type WorldState } from './state';
import {
  buildBlocker,
  createVillage,
  settle,
  currentResources,
  isOperational,
  maxRecruitable,
  plannedLevel,
  popMax,
  popUsed,
  queueBuild,
  recruit,
  recruitBlocker,
  researchBlocker,
  startResearch,
  type Village,
} from './village';

/** Gives every bot player a personality and schedules its first turn. */
export function initBots(state: WorldState): void {
  for (const p of state.players) {
    if (!p.isBot || p.bot) continue;
    const { activityMin, activityMax } = state.config.bots;
    const archetype = ARCHETYPES[Math.floor(hashFloat(state.config.seed, p.id, 1) * ARCHETYPES.length)] ?? 'farmer';
    const activity = activityMin + hashFloat(state.config.seed, p.id, 2) * (activityMax - activityMin);
    // spread the first turns so not all bots think at the same moment
    const first = state.time + Math.round(hashFloat(state.config.seed, p.id, 3) * turnInterval(state, activity));
    p.bot = { archetype, activity, nextTurn: first, farmLog: {}, outgoing: [] };
    push(state.queue, first, { kind: 'botTurn', playerId: p.id });
  }
}

/**
 * How fast things happen for a bot: with a higher build or recruit speed its jobs finish
 * sooner, so it needs turns more often to keep up (same as a player clicking more often).
 */
function botSpeed(state: WorldState): number {
  const c = state.config;
  return c.worldSpeed * Math.max(1, c.buildSpeed, c.recruitSpeed);
}

function turnInterval(state: WorldState, activity: number): number {
  const { turnMinMinutes, turnMaxMinutes } = state.config.bots;
  const minutes = turnMaxMinutes - (turnMaxMinutes - turnMinMinutes) * activity;
  return (minutes * MINUTE) / botSpeed(state);
}

export function onBotTurn(state: WorldState, playerId: number): void {
  const player = state.players[playerId];
  const bot = player?.bot;
  if (!player || !bot || bot.nextTurn !== state.time) return; // stale event

  if (shouldAbandon(state, player)) abandonAndRestart(state, player);
  for (const v of villagesOf(state, playerId)) villageTurn(state, player, v);

  // next turn, with a little jitter
  const jitter = 0.8 + nextFloat(state.rng) * 0.4;
  bot.nextTurn = state.time + Math.max(MINUTE, Math.round(turnInterval(state, bot.activity) * jitter));
  push(state.queue, bot.nextTurn, { kind: 'botTurn', playerId });
}

function villageTurn(state: WorldState, player: Player, v: Village): void {
  if (!player.bot) return;
  const profile = BOT_PROFILES[player.bot.archetype];
  const reserve = build(state, v, profile);
  research(state, v, profile);
  nobleTurn(state, player, v, profile, reserve);
  recruitDefense(state, v, profile, reserve);
  recruitTroops(state, v, profile, reserve);
  farm(state, player, v, profile);
}

// --- giving up ----------------------------------------------------------------

/**
 * A bot that lost all its villages, or whose points stopped growing for
 * `abandonAfterDays` (scaled by world speed) while it could still build, gives up.
 */
function shouldAbandon(state: WorldState, player: Player): boolean {
  const bot = player.bot;
  if (!bot) return false;
  const villages = villagesOf(state, player.id);
  if (villages.length === 0) return true;
  const days = state.config.bots.abandonAfterDays;
  if (days <= 0) return false;
  let points = 0;
  for (const v of villages) points += villagePoints(state.config, v);
  if (!bot.peak || points > bot.peak.points) {
    bot.peak = { points, at: state.time };
    return false;
  }
  const maxed = villages.every((v) => fallbackStep(state, v) === null);
  return !maxed && state.time - bot.peak.at > (days * DAY) / botSpeed(state);
}

/** The bot's villages become barbarian; the bot starts over with one fresh village at the edge. */
export function abandonAndRestart(state: WorldState, player: Player): Village {
  const { config } = state;
  const old = villagesOf(state, player.id);
  for (const v of old) {
    settle(config, v, state.time);
    v.owner = BARBARIAN;
    v.name = 'Barbarendorp';
    for (const u of UNIT_IDS) {
      v.units[u] = 0;
      v.outside[u] = 0;
    }
    v.buildQueue = [];
    for (const b of RECRUIT_BUILDINGS) v.recruitQueues[b] = [];
    v.research = null;
    startBarbarianGrowth(config, v, state.time);
  }
  // troops on the road are lost with the player
  for (const m of Object.values(state.movements)) if (m.owner === player.id) delete state.movements[m.id];
  invalidateOwners(state);
  nearCache.delete(state);

  const [x, y] = edgeSpot(state);
  const fresh = createVillage(config, nextId(state), player.id, `${player.name}s dorp`, x, y, state.time);
  state.villages[fresh.id] = fresh;
  invalidateOwners(state);
  if (player.bot) {
    player.bot.farmLog = {};
    player.bot.outgoing = [];
    delete player.bot.peak;
  }
  const where = old[0] ? ` (${old.map((v) => `${v.x}|${v.y}`).join(', ')})` : '';
  addLog(state, {
    time: state.time,
    text: `${player.name} heeft het opgegeven${where}: barbarendorp. Begint opnieuw aan de rand op ${x}|${y}.`,
  });
  return fresh;
}

// --- building ---------------------------------------------------------------

/** The first build step that isn't done yet (counting queued levels). */
function nextStep(v: Village, profile: BotProfile): [BuildingId, number] | null {
  for (const step of profile.buildOrder) {
    if (plannedLevel(v, step[0]) < step[1]) return step;
  }
  return null;
}

/** Fallback when the build order is done: the lowest of the economy buildings. */
function fallbackStep(state: WorldState, v: Village): BuildingId | null {
  const candidates: BuildingId[] = ['wood', 'stone', 'iron', 'storage', 'farm', 'main'];
  let best: BuildingId | null = null;
  for (const b of candidates) {
    if (plannedLevel(v, b) >= state.config.buildings[b].maxLevel) continue;
    if (!best || plannedLevel(v, b) < plannedLevel(v, best)) best = b;
  }
  return best;
}

/**
 * Keeps the build queue busy. Returns the resources the bot wants to keep for its next
 * building, so recruiting doesn't eat them.
 */
function build(state: WorldState, v: Village, profile: BotProfile): Res {
  const { config } = state;
  // bots keep at most 2 jobs queued: enough to stay busy without locking up resources
  for (let guard = 0; guard < 4 && v.buildQueue.length < 2; guard++) {
    const step = nextStep(v, profile);
    let target: BuildingId | null = step ? step[0] : fallbackStep(state, v);
    if (!target) break;

    // the economy comes first: a full storage or farm blocks everything else
    const res = currentResources(config, v, state.time);
    const cap = config.buildings.storage;
    const storageFull = res.some((r) => r >= 0.9 * storageOf(v));
    const farmFull = popMax(v) - popUsed(config, v) < Math.max(10, popMax(v) * 0.08);
    if (farmFull && plannedLevel(v, 'farm') < config.buildings.farm.maxLevel) target = 'farm';
    else if (storageFull && plannedLevel(v, 'storage') < cap.maxLevel) target = 'storage';

    const blocker = buildBlocker(state, v, target);
    if (blocker === null) {
      queueBuild(state, v.id, target);
      continue;
    }
    if (blocker === 'Opslagplaats te klein' && buildBlocker(state, v, 'storage') === null) {
      queueBuild(state, v.id, 'storage');
      continue;
    }
    if (blocker === 'Boerderij is vol' && buildBlocker(state, v, 'farm') === null) {
      queueBuild(state, v.id, 'farm');
      continue;
    }
    break; // not affordable yet (or waiting on a requirement): save up
  }

  const step = nextStep(v, profile);
  const b = step ? step[0] : fallbackStep(state, v);
  if (!b) return [0, 0, 0];
  const level = plannedLevel(v, b) + 1;
  return level <= config.buildings[b].maxLevel ? buildingCost(config.buildings[b], level) : [0, 0, 0];
}

function storageOf(v: Village): number {
  // same formula as storageCapacity, kept local to avoid an import cycle in hot code
  return Math.round(1000 * 1.2294934 ** (v.buildings.storage - 1));
}

// --- smithy -----------------------------------------------------------------

function research(state: WorldState, v: Village, profile: BotProfile): void {
  if (v.research) return;
  const wanted = [...profile.farmUnits, ...(Object.keys(profile.troops) as UnitId[])];
  for (const u of wanted) {
    if (v.researched.includes(u)) continue;
    if (researchBlocker(state, v, u) === null) {
      startResearch(state, v.id, u);
      return;
    }
  }
}

// --- recruiting -------------------------------------------------------------

function recruitTroops(state: WorldState, v: Village, profile: BotProfile, reserve: Res): void {
  const { config } = state;
  const have = currentResources(config, v, state.time);
  const spare: Res = [0, 1, 2].map((i) => Math.max(0, have[i as 0 | 1 | 2] - reserve[i as 0 | 1 | 2])) as Res;
  const budget: Res = spare.map((r) => r * profile.troopShare) as Res;

  const weights = Object.entries(profile.troops) as [UnitId, number][];
  const totalWeight = weights.reduce((s, [, w]) => s + w, 0);
  for (const [u, w] of weights) {
    if (recruitBlocker(state, v, u) !== null) continue;
    const def = config.units[u];
    // don't stack hours of recruiting: one building's queue stays short
    if (v.recruitQueues[def.building].length >= 2) continue;
    const share = w / totalWeight;
    const affordable = Math.floor(
      Math.min(...[0, 1, 2].map((i) => (def.cost[i as 0 | 1 | 2] > 0 ? (budget[i as 0 | 1 | 2] * share) / def.cost[i as 0 | 1 | 2] : Infinity))),
    );
    const n = Math.min(affordable, maxRecruitable(state, v, u));
    if (n >= 1) recruit(state, v.id, u, n);
  }
}

// --- farming ----------------------------------------------------------------

/** Group size per farm attack, by unit. */
const FARM_GROUP: Partial<Record<UnitId, number>> = { light: 5, spear: 15, axe: 15, sword: 15 };

function farm(state: WorldState, player: Player, v: Village, profile: BotProfile): void {
  const bot = player.bot;
  if (!bot || !isOperational(state.config, v, 'place')) return;
  const { farmRadius, farmAttacksPerTurn } = state.config.bots;

  if (!profile.farmUnits.some((u) => v.units[u] >= (FARM_GROUP[u] ?? 10))) return;
  // villages this bot already has troops on the way to
  const busy = new Set<number>(bot.outgoing);

  let sent = 0;
  for (const u of profile.farmUnits) {
    const group = FARM_GROUP[u] ?? 10;
    if (v.units[u] < group) continue;
    const targets = farmTargets(state, player, v, profile, farmRadius).filter((t) => {
      if (busy.has(t.id)) return false;
      const log = bot.farmLog[t.id];
      // a lost attack: stay away for a day
      return !(log && !log.won && state.time - log.at < 24 * 60 * MINUTE);
    });
    for (const t of targets) {
      if (sent >= farmAttacksPerTurn || v.units[u] < group) break;
      const units: UnitCounts = { [u]: group };
      if (sendAttack(state, v.id, t.id, units) === null) {
        busy.add(t.id);
        bot.outgoing.push(t.id);
        sent++;
      }
    }
  }
}

/** All villages within `radius` of `v`, nearest first (any owner). Cached per world and village. */
const nearCache = new WeakMap<WorldState, Map<string, number[]>>();
function villagesNear(state: WorldState, v: Village, radius: number): Village[] {
  let cache = nearCache.get(state);
  if (!cache) {
    cache = new Map();
    nearCache.set(state, cache);
  }
  const key = `${v.id}:${radius}`;
  let ids = cache.get(key);
  if (!ids) {
    ids = Object.values(state.villages)
      .filter((x) => x.id !== v.id && distance(x, v) <= radius)
      .sort((a, b) => distance(a, v) - distance(b, v))
      .map((x) => x.id);
    cache.set(key, ids);
  }
  const out: Village[] = [];
  for (const id of ids) {
    const x = state.villages[id];
    if (x) out.push(x);
  }
  return out;
}

/** New villages appeared (a restart at the edge): forget the cached neighbourhoods. */
export function forgetNeighbourhoods(state: WorldState): void {
  nearCache.delete(state);
}

/**
 * Farm targets: barbarians, and for aggressive bots also other players' villages once
 * beginner protection is over (players they beat before, or never tried).
 */
function farmTargets(state: WorldState, player: Player, v: Village, profile: BotProfile, radius: number): Village[] {
  const players = profile.attacksPlayers && state.time >= protectionEndsAt(state);
  return villagesNear(state, v, radius).filter(
    (x) => x.owner === BARBARIAN || (players && x.owner !== player.id && x.owner >= 0),
  );
}

// --- defense ------------------------------------------------------------------

const DEFENSE_UNITS: UnitId[] = ['spear', 'sword', 'archer', 'heavy'];

/** Farm space of defensive troops a village has (home, outside and in training). */
function defensePop(state: WorldState, v: Village): number {
  let pop = 0;
  for (const u of DEFENSE_UNITS) {
    let n = v.units[u] + v.outside[u];
    for (const job of v.recruitQueues[state.config.units[u].building]) if (job.unit === u) n += job.total - job.done;
    pop += n * state.config.units[u].pop;
  }
  return pop;
}

/** Keeps a defense in proportion to the village's size before spending on anything else. */
function recruitDefense(state: WorldState, v: Village, profile: BotProfile, reserve: Res): void {
  const { config } = state;
  const want = villagePoints(config, v) * profile.defensePerPoint;
  const missing = want - defensePop(state, v);
  if (missing < 10) return;
  const have = currentResources(config, v, state.time);
  const spare: Res = [0, 1, 2].map((i) => Math.max(0, have[i as 0 | 1 | 2] - reserve[i as 0 | 1 | 2])) as Res;
  for (const u of ['spear', 'sword'] as const) {
    if (recruitBlocker(state, v, u) !== null) continue;
    if (v.recruitQueues.barracks.length >= 2) return;
    const def = config.units[u];
    const affordable = Math.floor(Math.min(...[0, 1, 2].map((i) => spare[i as 0 | 1 | 2] / 2 / Math.max(1, def.cost[i as 0 | 1 | 2]))));
    const n = Math.min(affordable, maxRecruitable(state, v, u), Math.ceil(missing / 2 / def.pop));
    if (n >= 1) recruit(state, v.id, u, n);
  }
}

// --- noblemen ----------------------------------------------------------------

/** How far bots look for villages to noble. */
const NOBLE_RADIUS = 20;
/** Escort that goes with a nobleman to a barbarian village. */
const BARB_ESCORT = 50;

/**
 * Mints coins, trains one nobleman per village and sends him with an escort, again and again,
 * at one target until it falls. The nobleman comes home after every attack (he is only used
 * up when he takes the village).
 */
function nobleTurn(state: WorldState, player: Player, v: Village, profile: BotProfile, reserve: Res): void {
  const { config } = state;
  const bot = player.bot;
  if (!bot || !isOperational(config, v, 'snob')) return;
  const queued = v.recruitQueues.snob.reduce((n, j) => n + j.total - j.done, 0);
  const nobles = v.units.snob + v.outside.snob + queued;

  if (nobles === 0) {
    const have = currentResources(config, v, state.time);
    const free = (cost: Res) => [0, 1, 2].every((i) => have[i as 0 | 1 | 2] - reserve[i as 0 | 1 | 2] >= cost[i as 0 | 1 | 2]);
    if (noblesAllowed(state, v) > 0) {
      if (free(config.units.snob.cost)) recruit(state, v.id, 'snob', 1);
    } else if (free(config.conquest.coinCost)) {
      mintCoins(state, v.id, 1);
    }
    return;
  }
  if (v.units.snob === 0 || !isOperational(config, v, 'place')) return;

  const target = nobleTarget(state, player, v, profile);
  if (!target) return;
  const escort: UnitCounts = { snob: 1 };
  if (target.owner === BARBARIAN) {
    // a barbarian village has no troops: a small escort is enough
    let left = BARB_ESCORT;
    for (const u of ['axe', 'light', 'spear', 'sword'] as const) {
      const n = Math.min(left, v.units[u]);
      if (n > 0) escort[u] = n;
      left -= n;
    }
    if (left > BARB_ESCORT / 2) return;
  } else {
    // a player: everything offensive goes along
    for (const u of ['axe', 'light', 'marcher', 'ram', 'catapult'] as const) if (v.units[u] > 0) escort[u] = v.units[u];
    if ((escort.axe ?? 0) + (escort.light ?? 0) * 4 < 400) return;
  }
  if (sendAttack(state, v.id, target.id, escort) === null) {
    bot.nobleTarget = target.id;
    bot.outgoing.push(target.id);
  }
}

function nobleTarget(state: WorldState, player: Player, v: Village, profile: BotProfile): Village | null {
  const bot = player.bot;
  if (!bot) return null;
  const maxDist = Math.min(NOBLE_RADIUS, state.config.conquest.maxDistance);
  const current = bot.nobleTarget !== undefined ? state.villages[bot.nobleTarget] : undefined;
  const ok = (t: Village) => {
    if (t.owner === player.id || distance(t, v) > maxDist) return false;
    if (t.owner === BARBARIAN) return true;
    if (!profile.attacksPlayers || protectionBlocker(state, player.id, t.owner) !== null) return false;
    // only players it beat before
    return bot.farmLog[t.id]?.won === true;
  };
  if (current && ok(current) && bot.farmLog[current.id]?.won !== false) return current;
  let best: Village | null = null;
  let bestScore = -Infinity;
  for (const t of villagesNear(state, v, maxDist)) {
    if (!ok(t)) continue;
    const log = bot.farmLog[t.id];
    if (log && !log.won && state.time - log.at < 24 * 60 * MINUTE) continue;
    const score = villagePoints(state.config, t) / (3 + distance(t, v));
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/** Called from the battle code: bots remember how their attacks went (farm and noble). */
export function rememberFarm(state: WorldState, owner: number, targetId: number, won: boolean): void {
  const bot = state.players[owner]?.bot;
  if (!bot) return;
  bot.farmLog[targetId] = { at: state.time, won };
  const i = bot.outgoing.indexOf(targetId);
  if (i >= 0) bot.outgoing.splice(i, 1);
  const ids = Object.keys(bot.farmLog);
  if (ids.length > 150) {
    // forget the oldest entries
    ids
      .map(Number)
      .sort((a, b) => (bot.farmLog[a]?.at ?? 0) - (bot.farmLog[b]?.at ?? 0))
      .slice(0, ids.length - 100)
      .forEach((id) => delete bot.farmLog[id]);
  }
}

export function totalUnits(v: Village): number {
  let n = 0;
  for (const u of UNIT_IDS) n += v.units[u] + v.outside[u];
  return n;
}
