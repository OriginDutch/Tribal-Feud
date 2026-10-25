/**
 * Quests and rewards for the human player.
 * Quests complete by themselves once their demands are met; their reward (if any) goes to
 * the rewards list, where the player claims it. Finished buildings up to a level also add
 * a reward. Claiming adds as much as fits in the storage; the rest stays claimable.
 */
import type { QuestDemand } from '../shared/quests';
import type { BuildingId, Res, UnitCounts } from '../shared/gameData';
import { UNIT_IDS } from '../shared/gameData';
import { storageCapacity } from './formulas';
import { HUMAN_ID, addLog, nextId, playerVillage, type WorldState } from './state';
import { settle, type Village } from './village';

export interface PendingReward {
  id: number;
  text: string;
  res: Res;
  units?: UnitCounts;
}

/** A finished quest the player hasn't dismissed yet (shown as a toast). */
export interface QuestToast {
  id: number;
  title: string;
  /** The reward to claim from the toast, if the quest has one. */
  rewardId?: number;
}

const MAX_TOASTS = 20;

export interface QuestStats {
  plunders: number;
  loot: number;
  rewardsClaimed: number;
}

export interface DemandStatus {
  text: string;
  current: number;
  target: number;
  done: boolean;
}

export function demandStatus(state: WorldState, d: QuestDemand): DemandStatus {
  switch (d.kind) {
    case 'building': {
      const v = playerVillage(state);
      const current = v?.buildings[d.building] ?? 0;
      const name = state.config.buildings[d.building].name;
      const text = d.level === 1 ? `Bouw ${name.toLowerCase()}` : `${name} naar level ${d.level}`;
      return { text, current, target: d.level, done: current >= d.level };
    }
    case 'plunders':
      return {
        text: d.count === 1 ? 'Plunder een barbarendorp' : `Plunder ${d.count} keer`,
        current: state.stats.plunders,
        target: d.count,
        done: state.stats.plunders >= d.count,
      };
    case 'loot':
      return {
        text: `Haal ${d.amount.toLocaleString('nl-NL')} grondstoffen buit binnen`,
        current: state.stats.loot,
        target: d.amount,
        done: state.stats.loot >= d.amount,
      };
    case 'rewardsClaimed':
      return {
        text: 'Haal een beloning op',
        current: state.stats.rewardsClaimed,
        target: d.count,
        done: state.stats.rewardsClaimed >= d.count,
      };
  }
}

/** Completes every quest whose demands are met (several in a row if possible). */
export function checkQuests(state: WorldState): void {
  for (const chain of state.config.quests.chains) {
    for (;;) {
      const index = state.questProgress[chain.id] ?? 0;
      const quest = chain.quests[index];
      if (!quest) break;
      if (!quest.demands.every((d) => demandStatus(state, d).done)) break;
      state.questProgress[chain.id] = index + 1;
      const hasReward = quest.reward.res !== undefined || quest.reward.units !== undefined;
      const toast: QuestToast = { id: nextId(state), title: quest.title };
      if (hasReward) {
        const reward: PendingReward = { id: nextId(state), text: `Opdracht: ${quest.title}`, res: quest.reward.res ? [...quest.reward.res] : [0, 0, 0] };
        if (quest.reward.units) reward.units = { ...quest.reward.units };
        state.rewards.push(reward);
        toast.rewardId = reward.id;
      }
      state.questToasts.push(toast);
      if (state.questToasts.length > MAX_TOASTS) state.questToasts.splice(0, state.questToasts.length - MAX_TOASTS);
      addLog(state, { time: state.time, text: `Opdracht voltooid: ${quest.title}.` });
    }
  }
}

/**
 * Reward for a finished building. The human player claims it from the rewards list;
 * bots get the same reward straight into their storage (up to the cap).
 */
export function buildingReward(state: WorldState, v: Village, building: BuildingId, level: number, cost: Res): void {
  const { maxLevel, share } = state.config.quests.buildingReward;
  if (v.owner < 0 || level > maxLevel || share <= 0) return;
  if (v.owner !== HUMAN_ID) {
    settle(state.config, v, state.time);
    const cap = storageCapacity(v.buildings.storage);
    for (const i of [0, 1, 2] as const) v.res[i] = Math.max(v.res[i], Math.min(cap, v.res[i] + Math.floor(cost[i] * share)));
    return;
  }
  state.rewards.push({
    id: nextId(state),
    text: `${state.config.buildings[building].name} level ${level}`,
    res: cost.map((c) => Math.floor(c * share)) as Res,
  });
}

/** Drops toasts whose reward has been claimed in full (from the toast or the quests screen). */
export function pruneToasts(state: WorldState): void {
  const open = new Set(state.rewards.map((r) => r.id));
  state.questToasts = state.questToasts.filter((t) => t.rewardId === undefined || open.has(t.rewardId));
}

export function dismissToast(state: WorldState, id: number | 'all'): void {
  state.questToasts = id === 'all' ? [] : state.questToasts.filter((t) => t.id !== id);
}

/** Claims as much of a reward as fits. Returns an error message or null. */
export function claimReward(state: WorldState, rewardId: number, villageId?: number): string | null {
  const chosen = villageId !== undefined ? state.villages[villageId] : undefined;
  const v = chosen && chosen.owner === HUMAN_ID ? chosen : playerVillage(state);
  const reward = state.rewards.find((r) => r.id === rewardId);
  if (!v || !reward) return 'Beloning bestaat niet.';
  settle(state.config, v, state.time);
  const cap = storageCapacity(v.buildings.storage);
  let claimed = false;
  for (const i of [0, 1, 2] as const) {
    const room = Math.max(0, Math.floor(cap - v.res[i]));
    const take = Math.min(room, reward.res[i]);
    if (take > 0) {
      v.res[i] += take;
      reward.res[i] -= take;
      claimed = true;
    }
  }
  if (reward.units) {
    for (const u of UNIT_IDS) v.units[u] += reward.units[u] ?? 0;
    delete reward.units;
    claimed = true;
  }
  if (!claimed) return 'Je opslag zit vol.';
  if (reward.res.every((r) => r <= 0)) {
    state.rewards = state.rewards.filter((r) => r.id !== rewardId);
    pruneToasts(state);
  }
  state.stats.rewardsClaimed++;
  checkQuests(state);
  return null;
}

export function claimAllRewards(state: WorldState, villageId?: number): string | null {
  let anyClaimed = false;
  for (const r of [...state.rewards]) if (claimReward(state, r.id, villageId) === null) anyClaimed = true;
  return anyClaimed ? null : 'Je opslag zit vol.';
}
