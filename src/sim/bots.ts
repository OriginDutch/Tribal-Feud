/**
 * Bot economy layer ("domme bots"): bots build, research, recruit and farm barbarians.
 * They play by exactly the same rules as the player: every action goes through the same
 * functions (queueBuild, recruit, startResearch, sendAttack) and they only know what their
 * own reports told them. They don't attack players yet.
 */
import { botScavenge } from './scavenge';
import { outclassed } from './warCause';
import { BOT_SPIES, beatable, farmablePlayerVillage, scoutForConquest, scoutForFarming, strike } from './botStrategy';
import { ARCHETYPES, BOT_PROFILES, type BotProfile } from '../shared/botProfiles';
import { RECRUIT_BUILDINGS, UNIT_IDS, type BuildingId, type Res, type UnitCounts, type UnitId } from '../shared/gameData';
import { MINUTE } from '../shared/time';
import { DIFFICULTIES, type DifficultyDef } from '../shared/config';

const DAY = 86_400_000;
import { push } from './eventQueue';
import { buildingCost } from './formulas';
import { distance, protectionBlocker, protectionEndsAt, sendAttack, sendNobleTrain, sendSupport, travelTimeMs } from './movement';
import { coinsForSlots, curveOf, mintCoins, noblesAllowed, playerCoins, slotsUsed } from './nobles';
import { MERCHANT_CARRY, acceptOffer, cancelOffer, createOffer, merchantsFree, offersOf, type TradeOffer } from './market';
import { hashFloat, nextFloat } from './rng';
import { startBarbarianGrowth, villagePoints } from './barbarians';
import { edgeSpot } from './map';
import { grudge, reactToIncoming } from './botReact';
import { focusWeight, spares, tribeDuties } from './tribeOrders';
import { helpShare, isHelping, mayAttack, targetWeight, threatsFor } from './tribes';
import { BARBARIAN, addLog, invalidateOwners, nextId, removeMovement, villagesOf, type BotState, type BotTier, type Player, type WorldState } from './state';
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
  researchCost,
  startResearch,
  techLevel,
  type Village,
} from './village';
import { hasFaith, hasFirstChurch } from './church';

/** Gives every bot player a personality and schedules its first turn. */
export function initBots(state: WorldState): void {
  for (const p of state.players) {
    if (!p.isBot || p.bot) continue;
    const archetype = ARCHETYPES[Math.floor(hashFloat(state.config.seed, p.id, 1) * ARCHETYPES.length)] ?? 'farmer';
    const tier = tierFor(state, p.id);
    const activity = activityFor(state, p.id, tier);
    // spread the first turns so not all bots think at the same moment
    const first = state.time + Math.round(hashFloat(state.config.seed, p.id, 3) * turnInterval(state, activity));
    p.bot = { archetype, tier, activity, nextTurn: first, farmLog: {}, outgoing: [] };
    startPresence(state, p.id, p.bot);
    push(state.queue, first, { kind: 'botTurn', playerId: p.id });
  }
}

/** How sharp a tier plays: 1 = never forgets anything. */
const SKILL: Record<BotTier, number> = { pro: 1, mid: 0.85, casual: 0.7 };

// --- tiers and presence ----------------------------------------------------------

/** Pyramid like a real world: a few no-lifers, a middle group, many casuals. */
function tierFor(state: WorldState, id: number): BotTier {
  const { pro, mid } = state.config.bots.tiers ?? { pro: 0.1, mid: 0.3 };
  const h = hashFloat(state.config.seed, id, 5);
  return h < pro ? 'pro' : h < pro + mid ? 'mid' : 'casual';
}

/** Where in the activity range (config) each tier sits. */
const ACTIVITY_BAND: Record<BotTier, [number, number]> = { pro: [0.8, 1], mid: [0.4, 0.8], casual: [0, 0.45] };
function activityFor(state: WorldState, id: number, tier: BotTier): number {
  const { activityMin, activityMax } = state.config.bots;
  const [lo, hi] = ACTIVITY_BAND[tier];
  const f = lo + hashFloat(state.config.seed, id, 2) * (hi - lo);
  return activityMin + f * (activityMax - activityMin);
}

/**
 * Online and offline stretches in game hours at world speed 1, divided by the world speed: on a
 * fast world everything moves faster, being away included, so the pyramid looks the same at any
 * speed (fixed hours made casuals stand still at speed 20). Mid: online 0.5-2.5 h, away 1-4 h
 * (~35% of the time). Casual: online 0.25-1 h, away 3-9 h (~10%, a few short visits a "day"). Pros: always online.
 */
const PRESENCE: Record<Exclude<BotTier, 'pro'>, { on: [number, number]; off: [number, number] }> = {
  mid: { on: [0.5, 2.5], off: [1, 4] },
  casual: { on: [0.25, 1], off: [3, 9] },
};
const HOUR_MS = 60 * MINUTE;
function stretch(state: WorldState, id: number, tier: Exclude<BotTier, 'pro'>, online: boolean, n: number): number {
  const [lo, hi] = PRESENCE[tier][online ? 'on' : 'off'];
  return Math.round(((lo + hashFloat(state.config.seed, id, 100, n) * (hi - lo)) * HOUR_MS) / state.config.worldSpeed);
}
export function startPresence(state: WorldState, id: number, bot: BotState): void {
  const tier = bot.tier ?? 'pro';
  if (tier === 'pro') { delete bot.presence; return; }
  // start somewhere in a stretch, online or not
  const online = hashFloat(state.config.seed, id, 99) < (tier === 'mid' ? 0.35 : 0.1);
  const len = stretch(state, id, tier, online, 0);
  bot.presence = { online, until: state.time + Math.round(len * hashFloat(state.config.seed, id, 98)), n: 0 };
}
/** Old saves: every bot gets a tier, an activity that fits it and its presence. */
export function assignTiers(state: WorldState): void {
  state.config.bots.tiers ??= { pro: 0.1, mid: 0.3 };
  for (const p of state.players) {
    if (!p.bot || p.bot.tier) continue;
    p.bot.tier = tierFor(state, p.id);
    p.bot.activity = activityFor(state, p.id, p.bot.tier);
    startPresence(state, p.id, p.bot);
  }
}

/** Is the bot at the game now? Walks its stretches up to the current time. */
export function isOnline(state: WorldState, id: number, bot: BotState): boolean {
  const p = bot.presence;
  const tier = bot.tier ?? 'pro';
  if (!p || tier === 'pro' || bot.reference) return true;
  while (p.until <= state.time) {
    p.online = !p.online;
    p.n++;
    p.until += Math.max(MINUTE, stretch(state, id, tier, p.online, p.n));
  }
  return p.online;
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

export function difficulty(state: WorldState): DifficultyDef {
  return DIFFICULTIES[state.config.bots.difficulty] ?? DIFFICULTIES.normal;
}

export function onBotTurn(state: WorldState, playerId: number): void {
  const player = state.players[playerId];
  const bot = player?.bot;
  if (!player || !bot || bot.nextTurn !== state.time) return; // stale event

  // away from the game: nothing new happens until it comes back (queues keep running)
  if (!isOnline(state, playerId, bot)) {
    bot.nextTurn = bot.presence!.until;
    push(state.queue, bot.nextTurn, { kind: 'botTurn', playerId });
    return;
  }

  if (!bot.reference && shouldAbandon(state, player)) abandonAndRestart(state, player);
  // incoming attacks show up account-wide: judge the new ones first
  reactToIncoming(state, player);
  // in your tribe: help asks, orders, and requests to you
  tribeDuties(state, player);
  // like a player, a bot looks at a few villages per turn, taking turns
  const villages = villagesOf(state, playerId);
  const per = bot.reference ? Infinity : Math.max(1, difficulty(state).villagesPerTurn);
  if (villages.length <= per) {
    for (const v of villages) villageTurn(state, player, v);
  } else {
    const start = (bot.cursor ?? 0) % villages.length;
    for (let i = 0; i < per; i++) {
      const v = villages[(start + i) % villages.length];
      if (v) villageTurn(state, player, v);
    }
    bot.cursor = (start + per) % villages.length;
  }

  // next turn, with a little jitter
  const jitter = 0.8 + nextFloat(state.rng) * 0.4;
  if (checksIn(state, bot)) bot.lastCheck = state.time;
  const interval = turnInterval(state, bot.activity);
  bot.nextTurn = state.time + Math.max(MINUTE, Math.round(interval * jitter));
  push(state.queue, bot.nextTurn, { kind: 'botTurn', playerId });
}

function villageTurn(state: WorldState, player: Player, v: Village): void {
  if (!player.bot) return;
  const profile = BOT_PROFILES[player.bot.archetype];
  // farming and noblemen only when the bot looks at the game; building and troops always
  const attentive = checksIn(state, player.bot);
  // coins and noblemen come first once there is an academy; while saving, buildings wait too
  const saving = attentive ? nobleTurn(state, player, v, profile, [0, 0, 0]) : false;
  // churches: a village without faith gets one (the first church again if it was lost)
  if (attentive && state.config.churches && v.buildQueue.length < 2 && !hasFaith(state, v)) {
    if (!hasFirstChurch(state, player.id)) { if (buildBlocker(state, v, 'church_f') === null) queueBuild(state, v.id, 'church_f'); }
    else if (buildBlocker(state, v, 'church') === null) queueBuild(state, v.id, 'church');
  }
  // sloppiness: less serious players forget things now and then
  const skill = SKILL[player.bot.tier ?? 'pro'];
  const forgets = (weight: number) => skill < 1 && nextFloat(state.rng) < (1 - skill) * weight;
  const reserve = forgets(0.6) ? [0, 0, 0] as Res : autoBuild(state, v, profile.buildOrder, saving ? nobleNeed(state, v) : [0, 0, 0]);
  if (!forgets(0.6)) research(state, v, profile);
  // saving: only the most needed defense, no other troops
  if (!forgets(0.5)) recruitDefense(state, v, profile, reserve, saving ? 0.5 : 1);
  if (!saving) recruitTroops(state, v, profile, reserve);
  if (attentive) helpTribe(state, player, v, profile);
  if (attentive && !forgets(0.8)) farm(state, player, v, profile, skill);
  // war and revenge: a real army at an enemy it scouted and can beat
  if (attentive && !saving) strike(state, player, v);
  // what stays home after farming goes scavenging (not when the bot is about to fight)
  if (attentive && !forgets(0.5) && !atWar(state, player)) botScavenge(state, v, profile.farmUnits);
  if (attentive) trade(state, player, v);
}

/** A tribe at war (or a bot hunting a village) keeps its army home. */
function atWar(state: WorldState, player: Player): boolean {
  if (player.bot?.nobleTarget !== undefined) return true;
  const t = player.tribe !== undefined ? state.tribes?.[player.tribe] : undefined;
  return !!t && Object.values(t.relations).includes('war');
}

// --- tribe ---------------------------------------------------------------------

/** Sends part of the home defense to a tribe mate under a real attack nearby, if it gets there in time. */
function helpTribe(state: WorldState, player: Player, v: Village, profile: BotProfile): void {
  if (player.tribe === undefined || !player.bot || !isOperational(state.config, v, 'place')) return;
  void profile;
  for (const threat of threatsFor(state, player.tribe)) {
    const target = state.villages[threat.village];
    if (!target || target.owner === player.id || distance(target, v) > 12) continue;
    // already helping this village
    if (isHelping(state, player.id, target.id)) continue;
    const share = helpShare(player.bot.archetype);
    const units: UnitCounts = {};
    let any = false;
    for (const u of ['spear', 'sword', 'archer', 'heavy'] as const) { const n = Math.floor(v.units[u] * share); if (n > 0) { units[u] = n; any = true; } }
    if (!any) continue;
    if (state.time + travelTimeMs(state, units, distance(v, target)) > threat.arrives) continue;
    if (sendSupport(state, v.id, target.id, units) === null) return; // one help per turn
  }
}

// --- market -----------------------------------------------------------------------

/** How far a bot looks for offers. */
const TRADE_RADIUS = 40;
/** The worst deal a bot takes: it pays at most this much for each unit it gets. */
const TRADE_MAX_PRICE = 1.5;

/**
 * Bots trade their surplus for what they are short of: they take a good-enough offer
 * nearby, otherwise they put up one of their own at 1:1 (and withdraw it after a while).
 */
function trade(state: WorldState, player: Player, v: Village): void {
  const { config } = state;
  if (!isOperational(config, v, 'market')) return;
  const have = currentResources(config, v, state.time);
  let low: 0 | 1 | 2 = 0;
  let high: 0 | 1 | 2 = 0;
  for (const i of [1, 2] as const) {
    if (have[i] < have[low]) low = i;
    if (have[i] > have[high]) high = i;
  }
  const mine = offersOf(state, v.id);
  // stale own offers go back after half a game day (world speed 1)
  for (const o of mine) if (state.time - o.created > (12 * 3_600_000) / config.worldSpeed) cancelOffer(state, o.id, player.id);
  if (have[high] < 5000 || have[high] < 2 * have[low]) return;

  // take the best offer that sells what we lack for what we have too much of
  let best: TradeOffer | null = null;
  for (const o of state.offers ?? []) {
    if (o.owner === player.id || o.give.res !== low || o.want.res !== high) continue;
    if (o.want.amount > o.give.amount * TRADE_MAX_PRICE || o.want.amount > have[high] - have[low]) continue;
    const seller = state.villages[o.villageId];
    if (!seller || distance(seller, v) > TRADE_RADIUS) continue;
    if (!best || o.give.amount / o.want.amount > best.give.amount / best.want.amount) best = o;
  }
  if (best && acceptOffer(state, best.id, v.id) === null) return;

  // otherwise offer half the gap, 1:1
  if (offersOf(state, v.id).length > 0) return;
  const free = merchantsFree(state, v);
  const amount = Math.min(free * MERCHANT_CARRY, Math.floor((have[high] - have[low]) / 2 / MERCHANT_CARRY) * MERCHANT_CARRY);
  if (amount >= MERCHANT_CARRY) createOffer(state, v.id, { res: high, amount }, { res: low, amount });
}

/** Is this a turn where the bot looks at the game? (difficulty attention, game time) */
function checksIn(state: WorldState, bot: NonNullable<Player['bot']>): boolean {
  const interval = bot.reference
    ? bot.reference.interval
    : difficulty(state).attentionMinutes * (1.5 - bot.activity) * MINUTE;
  return bot.lastCheck === undefined || state.time - bot.lastCheck >= interval;
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
  // a bot with an academy may save up for a long time without growing: that is not giving up
  const saving = villages.some((v) => v.buildings.snob > 0);
  return !maxed && !saving && state.time - bot.peak.at > (days * DAY) / state.config.worldSpeed;
}

/** The bot's villages become barbarian; the bot starts over with one fresh village at the edge. */
export function abandonAndRestart(state: WorldState, player: Player): Village {
  const { config } = state;
  const old = villagesOf(state, player.id);
  for (const v of old) {
    settle(config, v, state.time);
    v.owner = BARBARIAN;
    v.name = 'Barbarendorp';
    delete v.scav;
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
  for (const m of Object.values(state.movements)) if (m.owner === player.id) removeMovement(state, m.id);
  invalidateOwners(state);
  forgetNeighbourhoods(state);

  const [x, y] = edgeSpot(state);
  const fresh = createVillage(config, nextId(state), player.id, `${player.name}s dorp`, x, y, state.time);
  state.villages[fresh.id] = fresh;
  player.joinedAt = state.time;
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
function nextStep(v: Village, order: readonly (readonly [BuildingId, number])[]): readonly [BuildingId, number] | null {
  for (const step of order) {
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
 * Keeps the build queue busy along a build order (bots, and the player's account manager).
 * Returns the resources to keep for the next building, so recruiting doesn't eat them.
 */
export function autoBuild(
  state: WorldState,
  v: Village,
  order: readonly (readonly [BuildingId, number])[],
  keep: Res = [0, 0, 0],
  /** strict: follow the order exactly (no balancing pits, nothing after its last step). */
  strict = false,
): Res {
  const { config } = state;
  // bots keep at most 2 jobs queued: enough to stay busy without locking up resources
  for (let guard = 0; guard < 4 && v.buildQueue.length < 2; guard++) {
    const step = nextStep(v, order);
    let target: BuildingId | null = step ? step[0] : strict ? null : fallbackStep(state, v);
    if (!target) break;

    // keep the three resources in balance: a pit that falls behind goes first
    const scarce = strict ? null : scarcePit(state, v);
    if (scarce) target = scarce;

    // the economy comes first: a full storage or farm blocks everything else
    const res = currentResources(config, v, state.time);
    const cap = config.buildings.storage;
    const storageFull = res.some((r) => r >= 0.9 * storageOf(v));
    const farmFull = popMax(config, v) - popUsed(config, v) < Math.max(10, popMax(config, v) * 0.08);
    // ...but only if that can actually be built now: an unaffordable farm or storage must not
    // hold up a step that can (a full farm of troops, or a storage full of wood but short on iron)
    const planned = target;
    if (farmFull && plannedLevel(v, 'farm') < config.buildings.farm.maxLevel) target = 'farm';
    else if (storageFull && plannedLevel(v, 'storage') < cap.maxLevel) target = 'storage';
    if (target !== planned && buildBlocker(state, v, target) !== null && buildBlocker(state, v, planned) === null) target = planned;

    const blocker = buildBlocker(state, v, target);
    if (blocker === null) {
      // saving for a coin: only build what leaves the coin money untouched (farm/storage always go)
      const have = currentResources(config, v, state.time);
      const cost = buildingCost(config.buildings[target], plannedLevel(v, target) + 1);
      const urgent = target === 'farm' || target === 'storage';
      if (!urgent && [0, 1, 2].some((i) => have[i as 0 | 1 | 2] - cost[i as 0 | 1 | 2] < keep[i as 0 | 1 | 2])) break;
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

  // keep what the next building needs (a short resource first), so troops don't eat it
  return nextBuildCost(state, v, order, strict);
}

/** What the next building of this build order costs (a short resource first); zeros when done. */
export function nextBuildCost(state: WorldState, v: Village, order: readonly (readonly [BuildingId, number])[], strict = false): Res {
  const { config } = state;
  const step = nextStep(v, order);
  const b = strict ? (step ? step[0] : null) : (scarcePit(state, v) ?? (step ? step[0] : fallbackStep(state, v)));
  if (!b) return [0, 0, 0];
  const level = plannedLevel(v, b) + 1;
  return level <= config.buildings[b].maxLevel ? buildingCost(config.buildings[b], level) : [0, 0, 0];
}

const PITS = ['wood', 'stone', 'iron'] as const;

/**
 * The resource building to build first when one resource runs short: its stock is under a
 * third of the richest one (and not near full storage), and its pit is not already ahead.
 * Buildings eat more clay than wood or iron, so without this bots starve on clay.
 */
function scarcePit(state: WorldState, v: Village): BuildingId | null {
  const res = currentResources(state.config, v, state.time);
  const max = Math.max(...res);
  if (max < 1000) return null;
  let low = 0;
  for (const i of [1, 2] as const) if (res[i] < res[low as 0 | 1 | 2]) low = i;
  if (res[low as 0 | 1 | 2] >= max / 3) return null;
  const pit = PITS[low] ?? 'stone';
  const levels = PITS.map((b) => plannedLevel(v, b));
  if (plannedLevel(v, pit) >= state.config.buildings[pit].maxLevel) return null;
  if (plannedLevel(v, pit) > Math.min(...levels) + 3) return null;
  return pit;
}

function storageOf(v: Village): number {
  // same formula as storageCapacity, kept local to avoid an import cycle in hot code
  return Math.round(1000 * 1.2294934 ** (v.buildings.storage - 1));
}

// --- smithy -----------------------------------------------------------------

function research(state: WorldState, v: Village, profile: BotProfile): void {
  if (v.research) return;
  const wanted = [...profile.farmUnits, ...(Object.keys(profile.troops) as UnitId[]), 'spy' as UnitId];
  for (const u of wanted) {
    if (v.researched.includes(u)) continue;
    if (researchBlocker(state, v, u) === null) {
      startResearch(state, v.id, u);
      return;
    }
  }
  // research levels: once everything is developed, the main units go up a level when money allows
  if (state.config.research === 'simple') return;
  const main = (Object.entries(profile.troops) as [UnitId, number][]).sort((a, b) => b[1] - a[1]).map(([u]) => u);
  const have = currentResources(state.config, v, state.time);
  for (const u of main) {
    const next = techLevel(state.config, v, u) + 1;
    if (next < 2 || researchBlocker(state, v, u) !== null) continue;
    // only with plenty left over: troops and buildings come first
    const cost = researchCost(state.config, u, next);
    if ([0, 1, 2].some((i) => have[i as 0 | 1 | 2] < cost[i as 0 | 1 | 2] * 3)) continue;
    startResearch(state, v.id, u);
    return;
  }
}

// --- recruiting -------------------------------------------------------------

function recruitTroops(state: WorldState, v: Village, profile: BotProfile, reserve: Res): void {
  const { config } = state;
  // one paladin, kept at home: with items he guards the village with his weapon
  if (config.paladin !== 'off' && v.buildings.statue > 0 && recruitBlocker(state, v, 'knight') === null && maxRecruitable(state, v, 'knight') > 0) {
    recruit(state, v.id, 'knight', 1);
  }
  // a few scouts in every village: bots look before they attack a player
  const spies = v.units.spy + v.outside.spy + v.recruitQueues.stable.filter((j) => j.unit === 'spy').reduce((n, j) => n + j.total - j.done, 0);
  if (spies < BOT_SPIES && recruitBlocker(state, v, 'spy') === null) {
    const n = Math.min(BOT_SPIES - spies, maxRecruitable(state, v, 'spy'));
    if (n > 0) recruit(state, v.id, 'spy', n);
  }
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
    const n = Math.min(affordable, maxRecruitable(state, v, u), troopRoom(state, v, def.pop));
    if (n >= 1) recruit(state, v.id, u, n);
  }
}

// --- farming ----------------------------------------------------------------

/** Group size per farm attack, by unit. */
const FARM_GROUP: Partial<Record<UnitId, number>> = { light: 5, spear: 15, axe: 15, sword: 15 };

function farm(state: WorldState, player: Player, v: Village, profile: BotProfile, skill = 1): void {
  const bot = player.bot;
  if (!bot || !isOperational(state.config, v, 'place')) return;
  const { farmRadius } = state.config.bots;
  // sloppier players send fewer farm runs
  const farmAttacksPerTurn = Math.max(1, Math.round(state.config.bots.farmAttacksPerTurn * skill));

  const near = farmTargets(state, player, v, profile, farmRadius);
  // players in range: look before farming them
  scoutForFarming(state, player, v, profile, near);
  if (!profile.farmUnits.some((u) => v.units[u] >= (FARM_GROUP[u] ?? 10))) return;
  // villages this bot already has troops on the way to
  const busy = new Set<number>(bot.outgoing);

  let sent = 0;
  for (const u of profile.farmUnits) {
    // bigger armies farm in bigger groups: at most ~20 groups of a unit on the road per village,
    // which keeps the number of attacks (and the work for the simulation) in check
    const group = Math.max(FARM_GROUP[u] ?? 10, Math.ceil((v.units[u] + v.outside[u]) / 20));
    if (v.units[u] < group) continue;
    const targets = near.filter((t) => {
      if (busy.has(t.id)) return false;
      // a player village only when scouted and (nearly) empty
      if (t.owner >= 0 && !farmablePlayerVillage(state, player, t, { [u]: group })) return false;
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

/**
 * Spatial grid of village ids (cells of GRID fields), so "who is near" never scans the whole world.
 * Villages never move; new ones (restarts at the edge) are added by forgetNeighbourhoods().
 */
const GRID = 8;
const gridCache = new WeakMap<WorldState, { cells: Map<number, number[]>; size: number }>();
const cellKey = (cx: number, cy: number) => cx * 4096 + cy;
function grid(state: WorldState): Map<number, number[]> {
  let g = gridCache.get(state);
  if (!g) {
    const cells = new Map<number, number[]>();
    for (const x of Object.values(state.villages)) {
      const k = cellKey(Math.floor(x.x / GRID), Math.floor(x.y / GRID));
      const list = cells.get(k);
      if (list) list.push(x.id);
      else cells.set(k, [x.id]);
    }
    g = { cells, size: Object.keys(state.villages).length };
    gridCache.set(state, g);
  }
  return g.cells;
}

/** All villages within `radius` of `v`, nearest first (any owner). Cached per world and village. */
const nearCache = new WeakMap<WorldState, Map<string, number[]>>();
export function villagesNear(state: WorldState, v: Village, radius: number): Village[] {
  let cache = nearCache.get(state);
  if (!cache) {
    cache = new Map();
    nearCache.set(state, cache);
  }
  const key = `${v.id}:${radius}`;
  let ids = cache.get(key);
  if (!ids) {
    const cells = grid(state);
    const found: { id: number; d: number }[] = [];
    for (let cx = Math.floor((v.x - radius) / GRID); cx <= Math.floor((v.x + radius) / GRID); cx++) {
      for (let cy = Math.floor((v.y - radius) / GRID); cy <= Math.floor((v.y + radius) / GRID); cy++) {
        for (const id of cells.get(cellKey(cx, cy)) ?? []) {
          const x = state.villages[id];
          if (!x || x.id === v.id) continue;
          const d = distance(x, v);
          if (d <= radius) found.push({ id, d });
        }
      }
    }
    ids = found.sort((a, b) => a.d - b.d || a.id - b.id).map((f) => f.id);
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
  gridCache.delete(state);
}

/**
 * Farm targets: barbarians, and for aggressive bots also other players' villages once
 * beginner protection is over (players they beat before, or never tried).
 */
function farmTargets(state: WorldState, player: Player, v: Village, profile: BotProfile, radius: number): Village[] {
  const players = profile.attacksPlayers && state.time >= protectionEndsAt(state);
  return villagesNear(state, v, radius).filter(
    (x) => x.owner === BARBARIAN || (players && x.owner !== player.id && x.owner >= 0 && mayAttack(state, player.id, x.owner) && !spares(state, player.bot, x.owner)),
  );
}

/**
 * How many units of `pop` farm space each may still be recruited: a village with an academy
 * keeps room for a full train of noblemen (100 each).
 */
function troopRoom(state: WorldState, v: Village, pop: number): number {
  const free = popMax(state.config, v) - popUsed(state.config, v);
  let keep = 0;
  if (v.buildings.snob > 0) {
    let nobles = v.units.snob + v.outside.snob;
    for (const job of v.recruitQueues.snob) nobles += job.total - job.done;
    keep = Math.max(0, NOBLE_TRAIN - nobles) * state.config.units.snob.pop;
  }
  return Math.max(0, Math.floor((free - keep) / Math.max(1, pop)));
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
export function recruitDefense(state: WorldState, v: Village, profile: BotProfile, reserve: Res, share = 1): void {
  const { config } = state;
  // more room in the farm (fun option): keep defense in step, not only offense
  const want = villagePoints(config, v) * profile.defensePerPoint * share * (config.farmMultiplier ?? 1);
  const missing = want - defensePop(state, v);
  if (missing < 10) return;
  const have = currentResources(config, v, state.time);
  const spare: Res = [0, 1, 2].map((i) => Math.max(0, have[i as 0 | 1 | 2] - reserve[i as 0 | 1 | 2])) as Res;
  for (const u of ['spear', 'sword'] as const) {
    if (recruitBlocker(state, v, u) !== null) continue;
    if (v.recruitQueues.barracks.length >= 2) return;
    const def = config.units[u];
    const affordable = Math.floor(Math.min(...[0, 1, 2].map((i) => spare[i as 0 | 1 | 2] / 2 / Math.max(1, def.cost[i as 0 | 1 | 2]))));
    const n = Math.min(affordable, maxRecruitable(state, v, u), Math.ceil(missing / 2 / def.pop), troopRoom(state, v, def.pop));
    if (n >= 1) recruit(state, v.id, u, n);
  }
}

// --- noblemen ----------------------------------------------------------------

/** How far bots look for villages to noble. */
const NOBLE_RADIUS = 20;
/**
 * Attack strength that goes with a nobleman to a barbarian village. Barbarians have no
 * troops, but a wall: a defensive barbarian's wall 15 alone holds ~1300 attack.
 */
const BARB_ESCORT_ATTACK = 2000;
/** Noblemen a bot sends together (a "train"). */
const NOBLE_TRAIN = 4;

/**
 * Mints coins, trains one nobleman per village and sends him with an escort, again and again,
 * at one target until it falls. The nobleman comes home after every attack (he is only used
 * up when he takes the village).
 */
/** What the village saves for: a coin, or a nobleman once the coins are there. */
function nobleNeed(state: WorldState, v: Village): Res {
  return noblesAllowed(state, v) > 0 ? state.config.units.snob.cost : state.config.conquest.coinCost;
}

/** Returns true while the village saves up for a coin or a nobleman. */
function nobleTurn(state: WorldState, player: Player, v: Village, profile: BotProfile, reserve: Res): boolean {
  const { config } = state;
  const bot = player.bot;
  if (!bot || !isOperational(config, v, 'snob')) return false;
  // the difficulty decides how soon after a conquest a bot goes for the next village
  const cooldown = ((difficulty(state).conquestCooldownHours * (1.5 - bot.activity)) * 3_600_000) / config.worldSpeed;
  if (!bot.reference && bot.lastConquest !== undefined && state.time - bot.lastConquest < cooldown) return false;
  const queued = v.recruitQueues.snob.reduce((n, j) => n + j.total - j.done, 0);
  const nobles = v.units.snob + v.outside.snob + queued;

  // build up a train: loyalty comes back +1/hour x world speed, so one nobleman at a time
  // never gets a village down on a fast world; four arriving together take it in one go
  if (nobles < NOBLE_TRAIN) {
    const have = currentResources(config, v, state.time);
    const free = (cost: Res) => [0, 1, 2].every((i) => have[i as 0 | 1 | 2] - reserve[i as 0 | 1 | 2] >= cost[i as 0 | 1 | 2]);
    const missing = NOBLE_TRAIN - nobles;
    // as many coins and noblemen as the money allows, up to a full train
    const affordable = (cost: Res) =>
      Math.floor(Math.min(...[0, 1, 2].map((i) => (have[i as 0 | 1 | 2] - reserve[i as 0 | 1 | 2]) / Math.max(1, cost[i as 0 | 1 | 2]))));
    const allowed = noblesAllowed(state, v);
    if (allowed > 0) {
      const n = Math.min(allowed, missing, affordable(config.units.snob.cost), maxRecruitable(state, v, 'snob'));
      if (n > 0) recruit(state, v.id, 'snob', n);
    } else if (free(config.conquest.coinCost)) {
      const used = slotsUsed(state, v.owner) + missing;
      const need = Math.max(1, coinsForSlots(used, curveOf(state)) - playerCoins(state, v.owner));
      const n = config.nobleCost === 'coins' ? Math.min(need, affordable(config.conquest.coinCost)) : 1;
      if (n > 0) mintCoins(state, v.id, n);
    }
    // keep saving while the train is not complete, unless nobles already wait at home
    if (v.units.snob < NOBLE_TRAIN) return true;
  }
  if (v.units.snob < NOBLE_TRAIN || !isOperational(config, v, 'place')) return false;

  const target = nobleTarget(state, player, v, profile);
  if (!target) {
    // nothing known it can take: look around for a player village to go for
    if (profile.attacksPlayers) scoutForConquest(state, player, v, villagesNear(state, v, Math.min(NOBLE_RADIUS, config.conquest.maxDistance)));
    return false;
  }
  // a player: first a pure clear with the whole army, the nobles right behind it (like a player
  // does), so a lost battle never costs a nobleman
  if (target.owner !== BARBARIAN) {
    const clear: UnitCounts = {};
    for (const u of ['axe', 'light', 'marcher', 'ram', 'catapult'] as const) if (v.units[u] > 0) clear[u] = v.units[u];
    const left = (u: 'spear' | 'sword') => Math.floor(v.units[u] / NOBLE_TRAIN);
    const escorts: UnitCounts[] = Array.from({ length: NOBLE_TRAIN }, () => {
      const e: UnitCounts = {};
      for (const u of ['spear', 'sword'] as const) if (left(u) > 0) e[u] = left(u);
      return e;
    });
    if (sendNobleTrain(state, v.id, target.id, clear, escorts, undefined, true) === null) {
      bot.nobleTarget = target.id;
      bot.outgoing.push(target.id);
    }
    return false;
  }
  // each nobleman gets his own escort: they arrive together, one after the other
  let sent = 0;
  for (let i = 0; i < NOBLE_TRAIN; i++) {
    const escort: UnitCounts = { snob: 1 };
    if (target.owner === BARBARIAN || i > 0) {
      // a wall still stands for every attack: enough attack to break through it
      let left = BARB_ESCORT_ATTACK;
      for (const u of ['axe', 'light', 'spear', 'sword'] as const) {
        const attack = config.units[u].attack;
        const n = Math.min(v.units[u], Math.ceil(left / attack));
        if (n > 0) escort[u] = n;
        left -= n * attack;
        if (left <= 0) break;
      }
      if (left > BARB_ESCORT_ATTACK / 2) break;
    } else {
      // a player: everything offensive goes with the first nobleman
      for (const u of ['axe', 'light', 'marcher', 'ram', 'catapult'] as const) if (v.units[u] > 0) escort[u] = v.units[u];
      if ((escort.axe ?? 0) + (escort.light ?? 0) * 4 < 400) break;
    }
    if (sendAttack(state, v.id, target.id, escort) !== null) break;
    sent++;
  }
  if (sent > 0) {
    bot.nobleTarget = target.id;
    bot.outgoing.push(target.id);
  }
  return false;
}

function nobleTarget(state: WorldState, player: Player, v: Village, profile: BotProfile): Village | null {
  const bot = player.bot;
  if (!bot) return null;
  const maxDist = Math.min(NOBLE_RADIUS, state.config.conquest.maxDistance);
  const current = bot.nobleTarget !== undefined ? state.villages[bot.nobleTarget] : undefined;
  // tribe claims: what a tribe mate is going for is his
  const claimed = new Set<number>();
  const tribe = player.tribe !== undefined ? state.tribes?.[player.tribe] : undefined;
  for (const m of tribe?.members ?? []) {
    const c = m !== player.id ? state.players[m]?.bot?.nobleTarget : undefined;
    if (c !== undefined) claimed.add(c);
  }
  const ok = (t: Village) => {
    if (t.owner === player.id || distance(t, v) > maxDist || claimed.has(t.id)) return false;
    if (t.owner === BARBARIAN) return true;
    if (!profile.attacksPlayers || protectionBlocker(state, player.id, t.owner) !== null || !mayAttack(state, player.id, t.owner) || spares(state, bot, t.owner)) return false;
    if (outclassed(state, player.id, t.owner)) return false;
    // a player only after a fresh scout says the army clearly breaks him (an old win says little)
    return beatable(state, player, t, v);
  };
  if (current && ok(current) && bot.farmLog[current.id]?.won !== false) return current;
  let best: Village | null = null;
  let bestScore = -Infinity;
  for (const t of villagesNear(state, v, maxDist)) {
    if (!ok(t)) continue;
    const log = bot.farmLog[t.id];
    if (log && !log.won && state.time - log.at < 24 * 60 * MINUTE) continue;
    const score = (villagePoints(state.config, t) / (3 + distance(t, v))) * (t.owner >= 0 ? targetWeight(state, player.id, t.owner) * (1 + Math.min(2, grudge(state, player, t.owner))) * focusWeight(state, bot, t.owner) : 1);
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
  // trim in batches: sorting on every report was a hot spot
  if (ids.length > 250) {
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
