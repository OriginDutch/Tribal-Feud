/**
 * Simulation worker: owns the world state, runs the clock, handles saves.
 * The UI never touches the state directly.
 */
import { deleteGroup, saveGroup, setGroup } from './groups';
import { askPermission, askTribeHelp, askTribeResources, attackedWithoutPermission, cancelOrder, giveOrder } from './tribeOrders';
import { grudge, grudgeHalfLife } from './botReact';
import { answerMessage, applyToTribe, foundTribe, invitePlayer, kickMember, leaveTribe, markInboxRead, proposeRelation, setOwnRelation } from './humanTribe';
import { fitCheck, tribeNews, tribeViews } from './tribes';
import { farmCUnits } from './intel';
import { createConfig, validateConfig } from '../shared/config';
import { AUTOSAVE_SLOT, type Command, type Snapshot, type WorkerMessage } from '../shared/protocol';
import { DAY, SECOND } from '../shared/time';
import { deleteSave, getSave, listSaves, putSave } from '../storage/saveStore';
import { randomSeed } from './rng';
import { fromSaveData, toSaveData } from './save';
import { advance, schedule, scheduleRandom, setPaused, setSpeed } from './simulation';
import { createWorld, currentVillage, playerVillage, type Player, type WorldState } from './state';
import { storageCapacity } from './formulas';
import { villageView } from './view';
import { incomingViews, mapData, movementViews } from './mapView';
import { CANCEL_WINDOW_MS, cancelBlocker, cancelMovement, conquer, distance, loyaltyNow, protectionEndsAt, returnSupport, sendAttack, sendNobleTrain, sendSupport, travelTimeMs } from './movement';
import { BARBARIAN } from './state';
import { maxMintable, mintBlocker, mintCoins } from './nobles';
import { allTemplates, deleteNobleTemplate, deleteTemplate, deleteTroopTemplate, findTemplate, saveNobleTemplate, saveTemplate, saveTroopTemplate, scheduleManager, setManager, templateUse } from './manager';
import { HUMAN_ID, addLog } from './state';
import { claimAllRewards, claimReward, demandStatus, dismissToast } from './quests';
import type { CandidateView, MarketView, OrderView, PlayerView, MovementView, OfferView, OwnVillageRow, QuestsView, InboxView, RankingRow, SupportRow, SurplusRow, EndgameView, OpinionsView, WorldStatsView } from '../shared/protocol';
import {
  MERCHANT_CARRY,
  MERCHANT_MINUTES_PER_FIELD,
  acceptOffer,
  balanceVillages,
  cancelOffer,
  createOffer,
  merchantsFree,
  merchantsTotal,
  sendResources,
  type TradeOffer,
} from './market';
import { villagesOf } from './state';
import { villagePoints } from './barbarians';
import { ARCHETYPE_NAMES } from '../shared/botProfiles';
import { UNIT_IDS, type UnitCounts, type UnitId } from '../shared/gameData';
import {
  cancelBuild,
  cancelRecruit,
  cancelResearch,
  currentResources,
  dismissUnits,
  isOperational,
  popMax,
  popUsed,
  queueBuild,
  queueDemolish,
  renameVillage,
  recruit,
  settle,
  startResearch,
  type Village,
} from './village';
import { endgameRules } from './endgame';
import { liveTribes } from './worldStats';
import { BASE_MOOD, humanBetray, moodOf } from './loyalty';
import { DEFAULT_SURPLUS, mintAll, planMintAll, planSurplus, sendSurplus, setSurplus } from './surplus';

/** Minimal typing for the worker global, so the project only needs the DOM lib. */
const ctx = self as unknown as {
  postMessage(message: WorkerMessage): void;
  onmessage: ((e: MessageEvent<Command>) => void) | null;
};

const TICK_MS = 50;
/** Longest real-time step per tick. Stops huge jumps after the browser throttled us. */
const MAX_STEP_MS = 250;
const SNAPSHOT_EVERY_TICKS = 2;
const AUTOSAVE_EVERY_MS = 60 * SECOND;
const SNAPSHOT_LOG_LINES = 40;

let state: WorldState | null = null;
let suspended = false;
let lastTick = performance.now();
let ticks = 0;
let runningSinceAutosave = 0;

function post(msg: WorkerMessage): void {
  ctx.postMessage(msg);
}

function notice(text: string, level: 'info' | 'error' = 'info'): void {
  post({ type: 'notice', level, text });
}

const VILLAGE_ORDER = new Intl.Collator('nl', { numeric: true, sensitivity: 'base' });

function ownVillageRows(s: WorldState): OwnVillageRow[] {
  const { config } = s;
  return villagesOf(s, HUMAN_ID)
    // by name, with numbers in order ("Dorp 2" before "Dorp 10"), like TW's village list
    .sort((a, b) => VILLAGE_ORDER.compare(a.name, b.name) || a.id - b.id)
    .map((v) => {
      const job = v.buildQueue[0];
      let recruiting = 0;
      for (const q of Object.values(v.recruitQueues)) for (const j of q) recruiting += j.total - j.done;
      const units: UnitCounts = {};
      for (const u of UNIT_IDS) if (v.units[u] > 0) units[u] = v.units[u];
      return {
        id: v.id,
        name: v.name,
        x: v.x,
        y: v.y,
        points: villagePoints(config, v),
        res: currentResources(config, v, s.time).map(Math.floor) as OwnVillageRow['res'],
        storage: storageCapacity(v.buildings.storage),
        pop: { used: popUsed(config, v), max: popMax(config, v) },
        building: job ? { name: config.buildings[job.building].name, level: job.level, end: job.end } : null,
        buildQueue: v.buildQueue.length,
        recruiting,
        units,
        canSend: isOperational(config, v, 'place'),
        groups: [...(v.groups ?? [])],
        loyalty: Math.floor(loyaltyNow(config, v, s.time)),
        manager: v.manager
          ? [findTemplate(s, v.manager.template)?.name, v.manager.troops ? 'troepen' : undefined].filter(Boolean).join(' · ') || 'aan'
          : null,
        maxMint: mintBlocker(s, v) === null ? maxMintable(s, v) : 0,
      };
    });
}

function snapshot(): Snapshot | null {
  if (!state) return null;
  return {
    worldName: state.config.name,
    seed: state.config.seed,
    preset: state.config.preset,
    time: state.time,
    speed: state.speed,
    paused: state.paused,
    suspended,
    queueSize: state.queue.heap.length,
    multipliers: {
      world: state.config.worldSpeed,
      production: state.config.productionMultiplier,
      build: state.config.buildSpeed,
      recruit: state.config.recruitSpeed,
      farm: state.config.farmMultiplier ?? 1,
    },
    log: state.log.slice(-SNAPSHOT_LOG_LINES),
    village: (() => {
      const v = currentVillage(state);
      return v ? villageView(state, v) : null;
    })(),
    villages: ownVillageRows(state),
    movements: movementViews(state),
    incoming: incomingViews(state),
    protectionEndsAt: protectionEndsAt(state),
    alertMode: state.alertMode ?? 'perVillage',
    myTribe: state.players[HUMAN_ID]?.tribe ?? null,
    myTribeLeader: (() => { const t = state.players[HUMAN_ID]?.tribe; return t !== undefined && state.tribes?.[t]?.leader === HUMAN_ID; })(),
    inboxUnread: (state.inbox ?? []).filter((m) => !m.read).length,
    inboxOpen: (state.inbox ?? []).filter((m) => m.status === 'open').length,
    tribePause: state.tribePause ?? { war: true, requests: true },
    helpAsked: (state.helpAsks ?? []).map((a) => a.movement),
    orders: orderViews(state),
    templates: allTemplates(state),
    troopTemplates: state.troopTemplates ?? [],
    nobleTemplates: state.nobleTemplates ?? [],
    groups: state.villageGroups ?? [],
    surplus: state.surplus ?? DEFAULT_SURPLUS,
    difficulty: state.config.bots.difficulty,
    endgame: endgameView(state),
    templateUse: templateUse(state),
    unreadReports: state.reports.filter((r) => !r.read).length,
    farmTemplates: state.farmTemplates,
    marchFactor: state.config.worldSpeed * state.config.unitSpeed * state.config.marchSpeed,
    unitSpeeds: Object.fromEntries(UNIT_IDS.map((u) => [u, state!.config.units[u].speed])) as Record<UnitId, number>,
    quests: questsView(state),
    market: marketView(state),
  };
}

/** Ranking, tribes, diplomacy news and your pending tribe asks: the ranking and tribe screens. */
function sendRanking(s: WorldState): void {
  const ranking: RankingRow[] = s.players.map((p) => {
    const villages = villagesOf(s, p.id);
    const row: RankingRow = {
      id: p.id,
      name: p.name,
      points: villages.reduce((sum, v) => sum + villagePoints(s.config, v), 0),
      villages: villages.length,
      isBot: p.isBot,
    };
    if (p.tribe !== undefined) row.tribe = p.tribe;
    if (p.bot) {
      row.archetype = ARCHETYPE_NAMES[p.bot.archetype];
      row.activity = p.bot.activity;
    }
    return row;
  });
  ranking.sort((a, b) => b.points - a.points);
  post({ type: 'ranking', ranking, tribes: tribeViews(s), news: tribeNews(s), asks: [...(s.tribeAsks ?? [])], candidates: inviteCandidates(s, ranking), refusedApplications: { ...(s.tribeRefusals?.applications ?? {}) }, refusedInvites: { ...(s.tribeRefusals?.invites ?? {}) } });
}

/** For a leader: the 20 players nearest to your villages that are not in your tribe. */
function worldStatsView(s: WorldState): WorldStatsView {
  const ws = s.worldStats ?? { days: [], players: {}, conquests: [] };
  const name = (id: number) => (id < 0 ? 'barbaren' : (s.players[id]?.name ?? '?'));
  const tagOf = (id: number) => { const t = s.players[id]?.tribe; return t !== undefined ? s.tribes?.[t]?.tag : undefined; };
  const row = (id: number) => { const p = ws.players[id]!; return { id, name: name(id), ...(tagOf(id) ? { tag: tagOf(id)! } : {}), pvp: p.pvp, barb: p.barb, took: p.took, lost: p.lost }; };
  const ids = Object.keys(ws.players).map(Number);
  const live = liveTribes(s);
  const days = ws.days;
  // tribe series: every tribe in the top 8 of any day (or now), that still exists
  const tribeIds = new Set<number>(Object.keys(live).map(Number));
  for (const d of days) for (const id of Object.keys(d.tribes ?? {})) tribeIds.add(Number(id));
  const tribes = [...tribeIds].map((id) => s.tribes?.[id]).filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => ({ id: t.id, tag: t.tag, color: t.color, you: t.members.includes(HUMAN_ID), series: [...days.slice(0, -1).map((d) => d.tribes?.[t.id] ?? null), live[t.id] ?? null] }))
    .sort((a, b) => (b.series.at(-1) ?? 0) - (a.series.at(-1) ?? 0)).slice(0, 8);
  const you = ws.players[HUMAN_ID] ?? { pvp: 0, barb: 0, took: 0, tookBarb: 0, lost: 0 };
  const wars = Object.values(s.tribes ?? {}).reduce((a, t) => a + Object.values(t.relations).filter((r) => r === 'war').length, 0) / 2;
  const botsAlive = s.players.filter((p) => p.bot && villagesOf(s, p.id).length);
  return {
    days: days.map((d) => ({ day: d.day, attacksPvp: d.attacksPvp, attacksBarb: d.attacksBarb, conquestsPvp: d.conquestsPvp, conquestsBarb: d.conquestsBarb, onYou: d.onYou, byYou: d.byYou, wars: d.wars ?? wars })),
    tribes,
    topAttackers: ids.filter((id) => ws.players[id]!.pvp > 0).sort((a, b) => ws.players[b]!.pvp - ws.players[a]!.pvp).slice(0, 10).map(row),
    topConquerors: ids.filter((id) => ws.players[id]!.took > 0).sort((a, b) => ws.players[b]!.took - ws.players[a]!.took).slice(0, 10).map(row),
    recent: ws.conquests.slice(-30).reverse().map((c) => ({ time: c.time, name: c.name, from: c.from, fromName: name(c.from), to: c.to, toName: name(c.to) })),
    you: { ...you },
    totals: { conquestsPvp: s.conquests?.player ?? 0, conquestsBarb: s.conquests?.barbarian ?? 0, tribes: Object.keys(s.tribes ?? {}).length, wars, solo: botsAlive.filter((p) => p.tribe === undefined).length, bots: botsAlive.length },
  };
}

function opinionsView(s: WorldState): OpinionsView {
  const t = s.players[HUMAN_ID]?.tribe !== undefined ? s.tribes?.[s.players[HUMAN_ID]!.tribe!] : undefined;
  const mates = t && t.leader === HUMAN_ID
    ? t.members.filter((m) => m !== HUMAN_ID).map((m) => s.players[m]!).filter((p) => p?.bot).map((p) => ({
        id: p.id, name: p.name, archetype: p.bot!.archetype, mood: Math.round(moodOf(p)), favor: p.bot!.favor ?? 0, notes: [...(p.bot!.moodNotes ?? [])].reverse(),
      })).sort((a, b) => a.mood - b.mood)
    : [];
  const leader = t && t.leader !== HUMAN_ID ? s.players[t.leader] : undefined;
  const grudges = s.players.filter((p) => p.bot?.grudges?.[HUMAN_ID]).map((p) => {
    const g = p.bot!.grudges![HUMAN_ID]!;
    const pt = p.tribe !== undefined ? s.tribes?.[p.tribe] : undefined;
    return { id: p.id, name: p.name, ...(pt ? { tribeTag: pt.tag } : {}), score: grudge(s, p, HUMAN_ID), ...(g.why ? { why: g.why } : {}), at: g.at, halfLife: grudgeHalfLife(s) };
  }).filter((g) => g.score >= 0.05).sort((a, b) => b.score - a.score);
  const ask = (s.resourceAsks ?? []).find((a) => a.at > s.time - DAY);
  return {
    mates,
    ...(leader ? { standing: { leader: leader.id, leaderName: leader.name, value: Math.round(s.standing ?? BASE_MOOD), notes: [...(s.standingNotes ?? [])].reverse() } } : {}),
    grudges,
    betrayals: s.betrayals ?? 0,
    permissions: Object.entries(s.permissions ?? {}).map(([id, p]) => ({ target: Number(id), name: s.players[Number(id)]?.name ?? '?', ...(p.answer ? { answer: p.answer } : {}), ...(p.until ? { until: p.until } : {}) })),
    ...(ask ? { resourceAsk: { village: ask.village, res: [...ask.res] as [number, number, number], sent: [...ask.sent] as [number, number, number], at: ask.at } } : {}),
  };
}

function endgameView(s: WorldState): EndgameView {
  const r = endgameRules(s);
  const eg = s.endgame;
  const lt = eg?.leader !== undefined ? s.tribes?.[eg.leader] : undefined;
  return {
    target: r.target, warnAt: r.warnAt, countBarbarians: r.countBarbarians, holdDays: r.holdMs / DAY,
    ...(lt && eg?.since !== undefined ? { leader: { tribe: lt.id, tag: lt.tag, since: eg.since, winsAt: eg.since + r.holdMs, you: lt.members.includes(HUMAN_ID) } } : {}),
    ...(eg?.winner ? { winner: { ...eg.winner } } : {}),
    continued: !!eg?.continued,
  };
}

function mintRows(s: WorldState, keep: number) {
  return planMintAll(s, keep).map((p) => { const v = s.villages[p.village]!; return { id: v.id, name: v.name, x: v.x, y: v.y, coins: p.coins }; });
}

function surplusRows(s: WorldState, keep: number): SurplusRow[] {
  const ref = (id: number) => { const v = s.villages[id]!; return { id, name: v.name, x: v.x, y: v.y }; };
  return planSurplus(s, { keep, auto: false }).map((sh) => ({ from: ref(sh.from), to: ref(sh.to), res: [...sh.res] as [number, number, number], merchants: sh.merchants, travel: sh.travel }));
}

/** Every support that involves you: in your villages, yours elsewhere, and between your own villages. */
function supportRows(s: WorldState): SupportRow[] {
  const ref = (v: Village) => ({ id: v.id, name: v.name, x: v.x, y: v.y, owner: v.owner, ownerName: v.owner < 0 ? 'barbaren' : (s.players[v.owner]?.name ?? '?') });
  const rows: SupportRow[] = [];
  for (const host of Object.values(s.villages)) {
    if (!host.support) continue;
    for (const [originId, units] of Object.entries(host.support)) {
      const origin = s.villages[Number(originId)];
      if (!origin || Object.keys(units).length === 0) continue;
      const hostMine = host.owner === HUMAN_ID, originMine = origin.owner === HUMAN_ID;
      if (!hostMine && !originMine) continue;
      rows.push({
        kind: hostMine && originMine ? 'own' : hostMine ? 'foreign' : 'mine',
        host: ref(host), origin: ref(origin), units: { ...units },
        travel: travelTimeMs(s, units, distance(host, origin)),
      });
    }
  }
  return rows;
}

function inviteCandidates(s: WorldState, ranking: RankingRow[]): CandidateView[] {
  const me = s.players[HUMAN_ID];
  const t = me?.tribe !== undefined ? s.tribes?.[me.tribe] : undefined;
  if (!t || t.leader !== HUMAN_ID) return [];
  const points = new Map(ranking.map((r) => [r.id, r.points]));
  const out: CandidateView[] = [];
  for (const p of s.players) {
    if (!p.bot || p.tribe === t.id) continue;
    const fit = fitCheck(s, t, p.id);
    if (fit.reason === 'gone') continue;
    const declined = s.tribeRefusals?.invites[p.id];
    out.push({
      id: p.id, name: p.name, points: points.get(p.id) ?? 0,
      distance: Math.round(fit.distance * 10) / 10, reach: Math.round(fit.reach * 10) / 10,
      ...(fit.reason !== 'ok' ? { blocked: fit.reason } : {}),
      ...(p.tribe !== undefined ? { tribe: p.tribe } : {}), ...(declined ? { declined } : {}),
    });
  }
  return out.sort((a, b) => a.distance - b.distance).slice(0, 20);
}

function orderViews(s: WorldState): OrderView[] {
  const t = s.players[HUMAN_ID]?.tribe !== undefined ? s.tribes?.[s.players[HUMAN_ID]!.tribe!] : undefined;
  const mates = t ? t.members.filter((m) => m !== HUMAN_ID).length : 0;
  return (s.tribeOrders ?? []).filter((o) => o.expires > s.time).map((o) => {
    const v = o.kind === 'attack' ? s.villages[o.target] : undefined;
    const targetName = v ? `${v.name} (${v.x}|${v.y}) van ${v.owner < 0 ? 'barbaren' : (s.players[v.owner]?.name ?? '?')}` : (s.players[o.target]?.name ?? '?');
    const answers = Object.values(o.answers);
    return {
      id: o.id, kind: o.kind, target: o.target, targetName, binding: o.binding, expires: o.expires,
      yes: answers.filter((a) => a === 'yes').length, half: answers.filter((a) => a === 'half').length, no: answers.filter((a) => a === 'no').length,
      waiting: Math.max(0, mates - answers.length),
    };
  });
}

function inboxViews(s: WorldState): InboxView[] {
  return [...(s.inbox ?? [])].reverse().map((m) => ({
    id: m.id, time: m.time, kind: m.kind, from: m.from, fromName: m.from >= 0 ? (s.players[m.from]?.name ?? '?') : 'Wereld',
    title: m.title, text: m.text, read: m.read,
    ...(m.tribe !== undefined ? { tribe: m.tribe } : {}),
    ...(m.request ? { request: m.request } : {}),
    ...(m.status ? { status: m.status } : {}),
    ...(m.expires !== undefined ? { expires: m.expires } : {}),
  }));
}

/** Profile of a player: villages, tribe, and what your reports say about the two of you. */
function playerView(s: WorldState, id: number): PlayerView | null {
  const p = s.players[id];
  if (!p) return null;
  const vs = villagesOf(s, id);
  const mine = villagesOf(s, HUMAN_ID);
  const pts = (pid: number) => villagesOf(s, pid).reduce((t, v) => t + villagePoints(s.config, v), 0);
  const points = pts(id);
  const rank = 1 + s.players.filter((o) => o.id !== id && pts(o.id) > points).length;
  const villages = vs
    .map((v) => ({
      id: v.id, name: v.name, x: v.x, y: v.y, points: villagePoints(s.config, v),
      distance: mine.length ? Math.round(Math.min(...mine.map((m) => distance(m, v))) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.points - a.points);
  let cx = 0, cy = 0, w = 0;
  for (const v of villages) { const k = v.points + 1; cx += v.x * k; cy += v.y * k; w += k; }
  const t = p.tribe !== undefined ? s.tribes?.[p.tribe] : undefined;
  const is = (r: { owner?: number; ownerName: string }) => (r.owner !== undefined ? r.owner === id : r.ownerName === p.name);
  const history: PlayerView['history'] = { theirAttacks: 0, theirWins: 0, yourAttacks: 0, yourWins: 0, villagesTakenFromYou: 0, villagesYouTook: 0 };
  for (const r of s.reports) {
    const won = r.result !== 'loss';
    if (r.defense && is(r.attacker)) {
      history.theirAttacks++;
      if (won) history.theirWins++;
      if (r.conquered) history.villagesTakenFromYou++;
      history.lastTheirs = Math.max(history.lastTheirs ?? 0, r.time);
    } else if (!r.defense && is(r.defender)) {
      history.yourAttacks++;
      if (won) history.yourWins++;
      if (r.conquered) history.villagesYouTook++;
      history.lastYours = Math.max(history.lastYours ?? 0, r.time);
    }
  }
  const incoming = Object.values(s.movements).filter((m) => m.kind === 'attack' && m.owner === id && s.villages[m.to]?.owner === HUMAN_ID).length;
  return {
    id, name: p.name, isBot: p.isBot, rank, points, villages,
    centre: w ? { x: Math.round(cx / w), y: Math.round(cy / w) } : null,
    ...(t ? { tribe: { id: t.id, tag: t.tag, name: t.name, color: t.color } } : {}),
    history, incoming,
    ...playerBond(s, p),
  };
}

function playerBond(s: WorldState, p: Player): Pick<PlayerView, 'bond' | 'grudge' | 'mood' | 'canAskPermission' | 'permission'> {
  const me = s.players[HUMAN_ID];
  const mine = me?.tribe !== undefined ? s.tribes?.[me.tribe] : undefined;
  const theirs = p.tribe !== undefined ? s.tribes?.[p.tribe] : undefined;
  const rel = mine && theirs && mine.id !== theirs.id ? mine.relations[theirs.id] : undefined;
  const bond = mine && theirs?.id === mine.id ? 'mate' : rel === 'ally' || rel === 'nap' ? rel : undefined;
  const perm = s.permissions?.[p.id];
  return {
    ...(bond && p.id !== HUMAN_ID ? { bond } : {}),
    grudge: p.bot ? Math.round(grudge(s, p, HUMAN_ID) * 100) / 100 : 0,
    ...(mine?.leader === HUMAN_ID && bond === 'mate' && p.bot ? { mood: Math.round(moodOf(p)) } : {}),
    canAskPermission: !!mine && mine.leader !== HUMAN_ID && p.id !== HUMAN_ID && bond !== 'mate',
    ...(perm ? { permission: { ...(perm.answer ? { answer: perm.answer } : {}), ...(perm.until ? { until: perm.until } : {}) } } : {}),
  };
}

/** How far the market screen looks for other players' offers. */
const OFFER_RADIUS = 40;

function marketView(s: WorldState): MarketView | null {
  const v = currentVillage(s);
  if (!v || v.buildings.market <= 0) return null;
  const offerView = (o: TradeOffer): OfferView | null => {
    const at = s.villages[o.villageId];
    if (!at) return null;
    return {
      id: o.id,
      village: { id: at.id, name: at.name, x: at.x, y: at.y, ownerName: s.players[at.owner]?.name ?? '?' },
      give: o.give,
      want: o.want,
      distance: distance(at, v),
      created: o.created,
    };
  };
  const all = s.offers ?? [];
  const pick = (list: TradeOffer[]) => list.map(offerView).filter((x): x is OfferView => x !== null);
  const trades: MovementView[] = [];
  for (const m of Object.values(s.movements)) {
    if (m.kind !== 'trade' && m.kind !== 'tradeReturn') continue;
    if (m.from !== v.id && m.to !== v.id) continue;
    const from = s.villages[m.from];
    const to = s.villages[m.to];
    if (!from || !to) continue;
    const view: MovementView = {
      id: m.id,
      kind: m.kind,
      from: { id: from.id, name: from.name, x: from.x, y: from.y },
      to: { id: to.id, name: to.name, x: to.x, y: to.y },
      sent: m.sent,
      arrives: m.arrives,
      units: {},
    };
    if (m.res) view.res = m.res;
    if (m.owner === HUMAN_ID && cancelBlocker(s, m) === null) view.cancelUntil = m.sent + CANCEL_WINDOW_MS;
    trades.push(view);
  }
  return {
    merchantsFree: merchantsFree(s, v),
    merchantsTotal: merchantsTotal(v),
    carry: MERCHANT_CARRY,
    minutesPerField: MERCHANT_MINUTES_PER_FIELD / s.config.worldSpeed,
    myOffers: pick(all.filter((o) => o.villageId === v.id)),
    offers: pick(all.filter((o) => o.owner !== HUMAN_ID))
      .filter((o) => o.distance <= OFFER_RADIUS)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 60),
    trades: trades.sort((a, b) => a.arrives - b.arrives),
  };
}

function questsView(s: WorldState): QuestsView {
  return {
    chains: s.config.quests.chains.map((chain) => {
      const done = s.questProgress[chain.id] ?? 0;
      const quest = chain.quests[done];
      return {
        id: chain.id,
        name: chain.name,
        done,
        total: chain.quests.length,
        current: quest
          ? { title: quest.title, text: quest.text, demands: quest.demands.map((d) => demandStatus(s, d)), reward: quest.reward }
          : null,
      };
    }),
    rewards: s.rewards,
    toasts: s.questToasts.map((t) => {
      const reward = t.rewardId !== undefined ? s.rewards.find((r) => r.id === t.rewardId) : undefined;
      return reward ? { id: t.id, title: t.title, reward } : { id: t.id, title: t.title };
    }),
    buildingReward: s.config.quests.buildingReward,
  };
}

function postSnapshot(): void {
  post({ type: 'snapshot', snapshot: snapshot() });
}

async function postSaves(): Promise<void> {
  post({ type: 'saves', saves: await listSaves() });
}

async function save(slot: string, quiet = false): Promise<void> {
  if (!state) return;
  await putSave(slot, toSaveData(state, Date.now()));
  runningSinceAutosave = 0;
  if (!quiet) notice(`Opgeslagen in "${slot}".`);
  await postSaves();
}

function autosave(): void {
  save(AUTOSAVE_SLOT, true).catch((e: unknown) => notice(`Autosave mislukt: ${String(e)}`, 'error'));
}

function tick(): void {
  const now = performance.now();
  const dt = Math.min(now - lastTick, MAX_STEP_MS);
  lastTick = now;
  if (!state) return;

  if (!state.paused && !suspended) {
    const result = advance(state, dt);
    runningSinceAutosave += dt;
    if (result.autoPaused) {
      post({ type: 'autoPaused', entry: result.autoPaused });
      autosave();
    } else if (runningSinceAutosave >= AUTOSAVE_EVERY_MS) {
      autosave();
    }
  }

  if (++ticks % SNAPSHOT_EVERY_TICKS === 0) postSnapshot();
}

async function handle(cmd: Command): Promise<void> {
  switch (cmd.type) {
    case 'newWorld': {
      const config = createConfig(cmd.preset, cmd.name.trim() || 'Naamloze wereld', cmd.seed ?? randomSeed(), cmd.overrides);
      const errors = validateConfig(config);
      if (errors.length > 0) {
        notice(errors.join(' '), 'error');
        return;
      }
      state = createWorld(config);
      await save(AUTOSAVE_SLOT, true);
      break;
    }
    case 'setSpeed':
      if (state) setSpeed(state, cmd.speed);
      break;
    case 'setPaused':
      if (state) {
        setPaused(state, cmd.paused);
        if (cmd.paused) autosave();
      }
      break;
    case 'setVisible':
      suspended = !cmd.visible;
      if (suspended && state && !state.paused) autosave();
      break;
    case 'scheduleTest':
      if (state) {
        schedule(state, cmd.delayMs, {
          kind: 'test',
          label: cmd.autoPause ? 'auto-pause' : 'gewoon',
          autoPause: cmd.autoPause,
        });
      }
      break;
    case 'scheduleRandom':
      if (state) scheduleRandom(state);
      break;
    case 'save':
      await save(cmd.slot);
      break;
    case 'load': {
      const data = await getSave(cmd.slot);
      if (!data) {
        notice(`Save "${cmd.slot}" niet gevonden.`, 'error');
        return;
      }
      state = fromSaveData(data);
      // always resume paused, so nothing happens before the player looks
      state.paused = true;
      notice(`"${state.config.name}" geladen.`);
      break;
    }
    case 'deleteSave':
      await deleteSave(cmd.slot);
      await postSaves();
      break;
    case 'listSaves':
      await postSaves();
      break;
    case 'sendAttack':
      if (!state) return;
      if (state.villages[cmd.from]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      {
        const error = sendAttack(state, cmd.from, cmd.to, cmd.units, cmd.catapultTarget);
        if (error) notice(error, 'error');
        else { const owner = state.villages[cmd.to]?.owner; if (owner !== undefined && owner >= 0) attackedWithoutPermission(state, owner); }
      }
      break;
    case 'sendFarm': {
      if (!state) return;
      if (state.villages[cmd.from]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      const units = cmd.template === 'C' ? farmCUnits(state, cmd.from, cmd.to) : state.farmTemplates[cmd.template];
      const error = typeof units === 'string' ? units : sendAttack(state, cmd.from, cmd.to, units);
      if (error) notice(error, 'error');
      break;
    }
    case 'setFarmTemplate': {
      if (!state) return;
      const units: UnitCounts = {};
      for (const u of UNIT_IDS) {
        const n = Math.floor(cmd.units[u] ?? 0);
        if (n > 0) units[u] = n;
      }
      state.farmTemplates[cmd.template] = units;
      break;
    }
    case 'claimReward': {
      if (!state) return;
      const error = claimReward(state, cmd.id, cmd.villageId ?? currentVillage(state)?.id);
      if (error) notice(error, 'error');
      break;
    }
    case 'sendResources': {
      if (!state) return;
      if (state.villages[cmd.from]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      const error = sendResources(state, cmd.from, cmd.to, cmd.res);
      if (error) notice(error, 'error');
      break;
    }
    case 'createOffer': {
      if (!state) return;
      if (state.villages[cmd.villageId]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      const count = Math.max(1, Math.min(50, Math.floor(cmd.count)));
      let made = 0;
      let error: string | null = null;
      while (made < count && (error = createOffer(state, cmd.villageId, cmd.give, cmd.want)) === null) made++;
      if (error && made === 0) notice(error, 'error');
      else if (error) notice(`${made} van ${count} aanbiedingen geplaatst: ${error}`, 'error');
      break;
    }
    case 'cancelOffer': {
      if (!state) return;
      const error = cancelOffer(state, cmd.id, HUMAN_ID);
      if (error) notice(error, 'error');
      break;
    }
    case 'acceptOffer': {
      if (!state) return;
      if (state.villages[cmd.villageId]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      const error = acceptOffer(state, cmd.id, cmd.villageId);
      if (error) notice(error, 'error');
      break;
    }
    case 'cancelMovement': {
      if (!state) return;
      const error = cancelMovement(state, cmd.id, HUMAN_ID);
      if (error) notice(error, 'error');
      break;
    }
    case 'balanceVillages': {
      if (!state) return;
      const n = balanceVillages(state, HUMAN_ID);
      notice(n > 0 ? `${n} zending${n === 1 ? '' : 'en'} onderweg.` : 'Niets te balanceren (of geen vrije handelaren).');
      break;
    }
    case 'dismissToast':
      if (!state) return;
      dismissToast(state, cmd.id);
      break;
    case 'claimAllRewards': {
      if (!state) return;
      const error = claimAllRewards(state, cmd.villageId ?? currentVillage(state)?.id);
      if (error) notice(error, 'error');
      break;
    }
    case 'mintCoins': {
      if (!state) return;
      if (state.villages[cmd.villageId]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      const error = mintCoins(state, cmd.villageId, cmd.count);
      if (error) notice(error, 'error');
      break;
    }
    case 'sendNobleTrain': {
      if (!state) return;
      if (state.villages[cmd.from]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      const error = sendNobleTrain(state, cmd.from, cmd.to, cmd.first, cmd.escorts, cmd.catapultTarget, cmd.clearFirst ?? false);
      if (error) notice(error, 'error');
      else { const owner = state.villages[cmd.to]?.owner; if (owner !== undefined && owner >= 0) attackedWithoutPermission(state, owner); }
      break;
    }
    case 'sendSupport': {
      if (!state) return;
      if (state.villages[cmd.from]?.owner !== HUMAN_ID) return notice('Dat is niet jouw dorp.', 'error');
      const error = sendSupport(state, cmd.from, cmd.to, cmd.units);
      if (error) notice(error, 'error');
      break;
    }
    case 'returnSupport': {
      if (!state) return;
      const error = returnSupport(state, HUMAN_ID, cmd.hostId, cmd.originId);
      if (error) notice(error, 'error');
      break;
    }
    case 'returnSupportMany': {
      if (!state) return;
      let ok = 0;
      for (const { hostId, originId } of cmd.pairs) if (returnSupport(state, HUMAN_ID, hostId, originId) === null) ok++;
      notice(ok ? `${ok} ondersteuning${ok === 1 ? '' : 'en'} op weg naar huis.` : 'Niets teruggestuurd.', ok ? 'info' : 'error');
      post({ type: 'supportList', rows: supportRows(state) });
      break;
    }
    case 'debugSkip': {
      if (!state) return;
      // run the world forward at speed 1, past any auto-pause
      const speed = state.speed, paused = state.paused;
      state.speed = 1;
      const end = state.time + cmd.hours * 3_600_000;
      while (state.time < end) { state.paused = false; advance(state, Math.min(end - state.time, 3_600_000)); }
      state.speed = speed; state.paused = paused;
      addLog(state, { time: state.time, text: `Debug: ${cmd.hours} uur doorgespoeld.` });
      break;
    }
    case 'debugConquer': {
      if (!state) return;
      const here = currentVillage(state);
      if (!here) return;
      const target = Object.values(state.villages)
        .filter((x) => x.owner === BARBARIAN)
        .sort((a, b) => distance(a, here) - distance(b, here))[0];
      if (!target) return;
      conquer(state, target, HUMAN_ID);
      addLog(state, { time: state.time, text: `Debug: ${target.name} (${target.x}|${target.y}) overgenomen.` });
      break;
    }
    case 'setManager': {
      if (!state) return;
      const error = setManager(state, cmd.villageId, cmd.manager);
      if (error) notice(error, 'error');
      break;
    }
    case 'setManagerAll': {
      if (!state) return;
      for (const v of villagesOf(state, HUMAN_ID)) {
        const error = setManager(state, v.id, cmd.manager);
        if (error) return notice(error, 'error');
      }
      break;
    }
    case 'saveTemplate': {
      if (!state) return;
      const error = saveTemplate(state, cmd.template);
      if (error) notice(error, 'error');
      break;
    }
    case 'saveNobleTemplate':
    case 'deleteNobleTemplate': {
      if (!state) return;
      const error = cmd.type === 'saveNobleTemplate' ? saveNobleTemplate(state, cmd.template) : deleteNobleTemplate(state, cmd.id);
      if (error) notice(error, 'error');
      break;
    }
    case 'saveTroopTemplate':
    case 'deleteTroopTemplate': {
      if (!state) return;
      const error = cmd.type === 'saveTroopTemplate' ? saveTroopTemplate(state, cmd.template) : deleteTroopTemplate(state, cmd.id);
      if (error) post({ type: 'notice', level: 'error', text: error });
      break;
    }
    case 'dismissUnits': {
      if (!state) return;
      const error = dismissUnits(state, cmd.villageId, cmd.units);
      if (error) notice(error, 'error');
      break;
    }
    case 'sendSupportMany': {
      if (!state) return;
      let sent = 0;
      const errors: string[] = [];
      for (const o of cmd.orders) {
        const error = sendSupport(state, o.from, cmd.to, o.units);
        if (error) errors.push(`${state.villages[o.from]?.name ?? '?'}: ${error}`);
        else sent++;
      }
      if (sent) notice(`Support verstuurd vanuit ${sent} ${sent === 1 ? 'dorp' : 'dorpen'}.`, 'info');
      if (errors.length) notice(errors.join(' · '), 'error');
      break;
    }
    case 'deleteTemplate': {
      if (!state) return;
      const error = deleteTemplate(state, cmd.id);
      if (error) notice(error, 'error');
      break;
    }
    case 'setAlertMode':
      if (!state) return;
      state.alertMode = cmd.mode;
      break;
    case 'tribeFound':
    case 'tribeApply':
    case 'tribeLeave':
    case 'tribeInvite':
    case 'tribeKick':
    case 'tribePropose':
    case 'tribeRelation':
    case 'inboxAnswer': {
      if (!state) return;
      const s = state;
      const error =
        cmd.type === 'tribeFound' ? foundTribe(s, cmd.name, cmd.tag)
        : cmd.type === 'tribeApply' ? applyToTribe(s, cmd.tribe)
        : cmd.type === 'tribeLeave' ? leaveTribe(s)
        : cmd.type === 'tribeInvite' ? invitePlayer(s, cmd.player)
        : cmd.type === 'tribeKick' ? kickMember(s, cmd.player)
        : cmd.type === 'tribePropose' ? proposeRelation(s, cmd.tribe, cmd.relation)
        : cmd.type === 'tribeRelation' ? setOwnRelation(s, cmd.tribe, cmd.action)
        : answerMessage(s, cmd.id, cmd.accept);
      if (error) post({ type: 'notice', level: 'error', text: error });
      post({ type: 'inbox', inbox: inboxViews(s) });
      sendRanking(s);
      break;
    }
    case 'inboxRead':
      if (!state) return;
      markInboxRead(state);
      post({ type: 'inbox', inbox: inboxViews(state) });
      break;
    case 'saveGroup':
    case 'deleteGroup':
    case 'setGroup': {
      if (!state) return;
      const error = cmd.type === 'saveGroup' ? saveGroup(state, cmd.group) : cmd.type === 'deleteGroup' ? deleteGroup(state, cmd.id) : setGroup(state, cmd.group, cmd.villages, cmd.member);
      if (error) notice(error, 'error');
      break;
    }
    case 'askTribeHelp':
    case 'giveOrder':
    case 'cancelOrder': {
      if (!state) return;
      const error = cmd.type === 'askTribeHelp' ? askTribeHelp(state, cmd.movement) : cmd.type === 'giveOrder' ? giveOrder(state, cmd.kind, cmd.target) : cancelOrder(state, cmd.id);
      if (error) notice(error, 'error');
      else if (cmd.type === 'askTribeHelp') notice('Je stam is om hulp gevraagd. Stamgenoten antwoorden als ze online zijn.', 'info');
      break;
    }
    case 'getPlayer':
      if (state) post({ type: 'player', player: playerView(state, cmd.id) });
      return;
    case 'getInbox':
      if (state) post({ type: 'inbox', inbox: inboxViews(state) });
      return;
    case 'askTribeResources':
    case 'askPermission':
    case 'betray': {
      if (!state) return;
      const error = cmd.type === 'askTribeResources' ? askTribeResources(state, cmd.village, cmd.res) : cmd.type === 'askPermission' ? askPermission(state, cmd.target) : humanBetray(state, cmd.target);
      if (error) notice(error, 'error');
      else notice(cmd.type === 'askTribeResources' ? 'Je stam is om grondstoffen gevraagd. Stamgenoten antwoorden als ze online zijn.' : cmd.type === 'askPermission' ? 'Gevraagd. Je leider antwoordt als hij online is.' : 'Het is gebeurd. Er is geen weg terug.', 'info');
      post({ type: 'opinions', opinions: opinionsView(state) });
      break;
    }
    case 'getWorldStats':
      if (state) post({ type: 'worldStats', stats: worldStatsView(state) });
      return;
    case 'getOpinions':
      if (state) post({ type: 'opinions', opinions: opinionsView(state) });
      return;
    case 'continueWorld':
      if (!state?.endgame?.winner) return;
      state.endgame.continued = true;
      break;
    case 'setDifficulty': {
      if (!state) return;
      if (!['easy', 'normal', 'hard'].includes(cmd.difficulty)) return;
      state.config.bots.difficulty = cmd.difficulty;
      addLog(state, { time: state.time, text: `Moeilijkheid van de bots: ${({ easy: 'Makkelijk', normal: 'Normaal', hard: 'Moeilijk' } as const)[cmd.difficulty]}.` });
      break;
    }
    case 'getMintPlan':
      if (state) post({ type: 'mintPlan', rows: mintRows(state, cmd.keep), keep: cmd.keep });
      return;
    case 'mintAll': {
      if (!state) return;
      const n = mintAll(state, cmd.keep);
      notice(n ? `${n} munt${n === 1 ? '' : 'en'} geslagen.` : 'Geen munten geslagen: geen afgebouwd dorp met adelshoeve en genoeg grondstoffen.', n ? 'info' : 'error');
      post({ type: 'mintPlan', rows: mintRows(state, cmd.keep), keep: cmd.keep });
      break;
    }
    case 'getSurplusPlan':
      if (state) post({ type: 'surplusPlan', rows: surplusRows(state, cmd.keep), keep: cmd.keep });
      return;
    case 'setSurplus': {
      if (!state) return;
      const error = setSurplus(state, { keep: cmd.keep, auto: cmd.auto });
      if (error) notice(error, 'error');
      else if (cmd.auto) scheduleManager(state);
      break;
    }
    case 'sendSurplus': {
      if (!state) return;
      const n = sendSurplus(state, { keep: cmd.keep, auto: state.surplus?.auto ?? false });
      notice(n ? `${n} zending${n === 1 ? '' : 'en'} onderweg naar bouwende dorpen.` : 'Niets te versturen: geen overschot, geen vrije handelaren of geen dorp dat tekortkomt.', n ? 'info' : 'error');
      post({ type: 'surplusPlan', rows: surplusRows(state, cmd.keep), keep: cmd.keep });
      break;
    }
    case 'getSupportList':
      if (state) post({ type: 'supportList', rows: supportRows(state) });
      return;
    case 'setTribePause':
      if (!state) return;
      state.tribePause = { war: cmd.war, requests: cmd.requests };
      break;
    case 'selectVillage':
      if (!state) return;
      if (state.villages[cmd.id]?.owner === HUMAN_ID) state.current = cmd.id;
      break;
    case 'debugGive': {
      if (!state) return;
      const v = currentVillage(state);
      if (!v) return;
      settle(state.config, v, state.time);
      if (cmd.resources) for (const i of [0, 1, 2] as const) v.res[i] += cmd.resources;
      for (const u of UNIT_IDS) v.units[u] += Math.max(0, Math.floor(cmd.units?.[u] ?? 0));
      for (const [b, level] of Object.entries(cmd.buildings ?? {})) {
        const id = b as keyof typeof v.buildings;
        if (id in v.buildings) v.buildings[id] = Math.max(v.buildings[id], Math.min(state.config.buildings[id].maxLevel, level ?? 0));
      }
      addLog(state, { time: state.time, text: 'Debug: troepen/grondstoffen toegevoegd.' });
      break;
    }
    case 'getMap':
      if (state) post({ type: 'map', map: mapData(state) });
      return;
    case 'getRanking':
      if (state) sendRanking(state);
      return;
    case 'getReports':
      if (state) post({ type: 'reports', reports: state.reports });
      return;
    case 'deleteReports': {
      if (!state) return;
      const drop = cmd.ids === 'read' ? new Set(state.reports.filter((r) => r.read).map((r) => r.id)) : new Set(cmd.ids);
      state.reports = state.reports.filter((r) => !drop.has(r.id));
      post({ type: 'reports', reports: state.reports });
      break;
    }
    case 'markReportsRead':
      if (!state) return;
      for (const r of state.reports) if (cmd.ids === 'all' || cmd.ids.includes(r.id)) r.read = true;
      post({ type: 'reports', reports: state.reports });
      break;
    case 'build':
    case 'cancelBuild':
    case 'demolish':
    case 'renameVillage':
    case 'research':
    case 'cancelResearch':
    case 'recruit':
    case 'cancelRecruit': {
      if (!state) return;
      const error = villageAction(state, cmd);
      if (error) notice(error, 'error');
      break;
    }
  }
  postSnapshot();
}

type VillageCommand = Extract<
  Command,
  { type: 'build' | 'cancelBuild' | 'demolish' | 'renameVillage' | 'research' | 'cancelResearch' | 'recruit' | 'cancelRecruit' }
>;

function villageAction(s: WorldState, cmd: VillageCommand): string | null {
  if (s.villages[cmd.villageId]?.owner !== HUMAN_ID) return 'Dat is niet jouw dorp.';
  switch (cmd.type) {
    case 'build':
      return queueBuild(s, cmd.villageId, cmd.building);
    case 'cancelBuild':
      return cancelBuild(s, cmd.villageId, cmd.jobId);
    case 'demolish':
      return queueDemolish(s, cmd.villageId, cmd.building);
    case 'renameVillage':
      return renameVillage(s, cmd.villageId, cmd.name);
    case 'research':
      return startResearch(s, cmd.villageId, cmd.unit);
    case 'cancelResearch':
      return cancelResearch(s, cmd.villageId);
    case 'recruit':
      return recruit(s, cmd.villageId, cmd.unit, cmd.count);
    case 'cancelRecruit':
      return cancelRecruit(s, cmd.villageId, cmd.jobId);
  }
}

ctx.onmessage = (e: MessageEvent<Command>) => {
  handle(e.data).catch((err: unknown) => {
    notice(err instanceof Error ? err.message : String(err), 'error');
  });
};

setInterval(tick, TICK_MS);
postSnapshot();
postSaves().catch((err: unknown) => notice(`Saves laden mislukt: ${String(err)}`, 'error'));
