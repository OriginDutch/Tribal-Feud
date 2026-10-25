/** Map, movement and report data for the UI. Computed in the worker. */
import type { IncomingView, MapData, MapVillage, MovementView } from '../shared/protocol';
import { growBarbarian, villagePoints } from './barbarians';
import { estimateLoot } from './intel';
import { BARBARIAN, HUMAN_ID, currentVillage, type WorldState } from './state';
import { CANCEL_WINDOW_MS, cancelBlocker } from './movement';

export function mapData(state: WorldState): MapData {
  const own = currentVillage(state);
  const reportsById = new Map(state.reports.map((r) => [r.id, r]));
  const villages: MapVillage[] = [];
  for (const v of Object.values(state.villages)) {
    if (v.owner === BARBARIAN) growBarbarian(state, v, state.time);
    const kind = v.owner === HUMAN_ID ? 'own' : v.owner === BARBARIAN ? 'barb' : 'bot';
    const mv: MapVillage = {
      id: v.id,
      x: v.x,
      y: v.y,
      name: v.name,
      owner: v.owner,
      ownerName: v.owner === BARBARIAN ? 'Barbaren' : (state.players[v.owner]?.name ?? '?'),
      kind,
      points: villagePoints(state.config, v),
    };
    if (v.bonus) mv.bonus = v.bonus;
    const intel = state.intel[v.id];
    if (intel) {
      if (intel.type && v.owner === BARBARIAN) mv.barbType = intel.type;
      if (intel.wall !== undefined) mv.wall = intel.wall;
      const estimate = estimateLoot(state, v.id);
      if (estimate !== undefined) mv.estimate = estimate;
    }
    const reportId = state.lastReportByTarget[v.id];
    const report = reportId !== undefined ? reportsById.get(reportId) : undefined;
    if (report) {
      mv.last = {
        time: report.time,
        result: report.result,
        loot: report.loot ? report.loot[0] + report.loot[1] + report.loot[2] : 0,
      };
      if (report.scouted) mv.last.scouted = report.scouted.res;
    }
    villages.push(mv);
  }
  return { ownVillageId: own?.id ?? -1, villages };
}

/** Attacks by others on the human's villages: origin, target and arrival only, like TW. */
export function incomingViews(state: WorldState): IncomingView[] {
  const out: IncomingView[] = [];
  for (const m of Object.values(state.movements)) {
    if (m.kind !== 'attack' || m.owner === HUMAN_ID) continue;
    const to = state.villages[m.to];
    if (!to || to.owner !== HUMAN_ID) continue;
    const from = state.villages[m.from];
    if (!from) continue;
    out.push({
      id: m.id,
      from: { id: from.id, name: from.name, x: from.x, y: from.y, ownerName: state.players[m.owner]?.name ?? '?' },
      to: { id: to.id, name: to.name, x: to.x, y: to.y },
      arrives: m.arrives,
    });
  }
  return out.sort((a, b) => a.arrives - b.arrives);
}

export function movementViews(state: WorldState): MovementView[] {
  const views: MovementView[] = [];
  for (const m of Object.values(state.movements)) {
    // merchants are listed on the market screen
    if (m.owner !== HUMAN_ID || m.kind === 'trade' || m.kind === 'tradeReturn') continue;
    const from = state.villages[m.from];
    const to = state.villages[m.to];
    if (!from || !to) continue;
    const view: MovementView = {
      id: m.id,
      kind: m.kind,
      from: { id: from.id, name: from.name, x: from.x, y: from.y },
      to: { id: to.id, name: to.name, x: to.x, y: to.y },
      sent: m.sent,
      arrives: m.arrives,
      units: m.units,
    };
    if (m.loot) view.loot = m.loot;
    if (m.res) view.res = m.res;
    if (cancelBlocker(state, m) === null) view.cancelUntil = m.sent + CANCEL_WINDOW_MS;
    if (m.train !== undefined) view.train = true;
    views.push(view);
  }
  return views.sort((a, b) => a.arrives - b.arrives);
}
