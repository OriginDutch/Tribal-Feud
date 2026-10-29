import { nameAllBotVillages } from './botNames';
import { assignTiers } from './bots';
import { rescheduleBotRecruits } from './village';
import { initDiplomacy } from './tribes';
import { PRESETS, defaultTables } from '../shared/config';
import { CHURCH_BUILDINGS, DEFAULT_BUILDINGS, UNIT_IDS, type UnitId } from '../shared/gameData';
import { generateMap } from './map';
import { ALL_CHAINS, defaultQuests } from '../shared/quests';
import { checkQuests } from './quests';
import { initBots } from './bots';
import { HUMAN_ID, type WorldState } from './state';
import { createVillage } from './village';

/**
 * Save format. Bump SAVE_VERSION whenever WorldState changes shape,
 * and add a migration from the previous version to MIGRATIONS.
 */
export const SAVE_VERSION = 19;

/** Barbarian growth of worlds made before 28 October 2026: keep it as it was. */
const OLD_BARB_GROWTH = { capMode: 'fixed', speedScaling: 'linear', startRelative: undefined } as const;

export interface SaveData {
  version: number;
  savedAt: number;
  state: WorldState;
}

export interface SaveMeta {
  slot: string;
  worldName: string;
  gameTime: number;
  savedAt: number;
  version: number;
}

/** MIGRATIONS[n] upgrades a save from version n to n + 1. */
const MIGRATIONS: Record<number, (data: SaveData) => SaveData> = {
  // v1 (phase 1) had no villages: add the game tables, a player and a starting village.
  1: (data) => {
    const state = data.state as WorldState & Partial<Pick<WorldState, 'players' | 'villages' | 'nextId'>>;
    state.config = { ...defaultTables(), ...state.config };
    state.players = [{ id: HUMAN_ID, name: 'Jij', isBot: false }];
    state.nextId = 1;
    const village = createVillage(state.config, state.nextId++, HUMAN_ID, 'Jouw dorp', 500, 500, state.time);
    state.villages = { [village.id]: village };
    return { ...data, version: 2, state };
  },
  // v2 had no separate multipliers: keep old worlds exactly as they were (all 1).
  2: (data) => {
    const config = data.state.config as Partial<WorldState['config']> & WorldState['config'];
    config.productionMultiplier ??= 1;
    config.buildSpeed ??= 1;
    config.recruitSpeed ??= 1;
    return { ...data, version: 3 };
  },
  // v3 (phase 2) had one village and no map: add map settings, troop movements and generate the world around it.
  3: (data) => {
    const state = data.state;
    const base = PRESETS.classic;
    const config = state.config as Partial<WorldState['config']> & WorldState['config'];
    config.marchSpeed ??= 1;
    config.map ??= structuredClone(base.map);
    config.combat ??= structuredClone(base.combat);
    config.barbarians = { ...base.barbarians, ...OLD_BARB_GROWTH, ...config.barbarians };
    for (const v of Object.values(state.villages)) {
      if (!v.outside) {
        v.outside = Object.fromEntries(UNIT_IDS.map((u) => [u, 0])) as Record<UnitId, number>;
      }
    }
    state.movements ??= {};
    state.reports ??= [];
    state.lastAttack ??= {};
    state.farmTemplates ??= { A: { light: 5 }, B: { spear: 10 } };
    generateMap(state);
    return { ...data, version: 4 };
  },
  // v4 (phase 3) had no quests: add them; quests already done complete on the next check.
  4: (data) => {
    const state = data.state;
    const config = state.config as Partial<WorldState['config']> & WorldState['config'];
    config.quests ??= defaultQuests();
    state.questProgress ??= {};
    state.rewards ??= [];
    state.stats ??= { plunders: 0, loot: 0, rewardsClaimed: 0 };
    checkQuests(state);
    return { ...data, version: 5 };
  },
  // v5 had passive bots: give them the new bot settings, personalities and turns.
  5: (data) => {
    const state = data.state;
    state.config.bots = { ...PRESETS.classic.bots, ...state.config.bots };
    initBots(state);
    return { ...data, version: 6 };
  },
  // v6 barbarians grew one level per interval and had no types: keep that for old worlds.
  6: (data) => {
    const c = data.state.config;
    c.barbarians = {
      ...PRESETS.classic.barbarians,
      ...OLD_BARB_GROWTH,
      ...c.barbarians,
      types: structuredClone(PRESETS.classic.barbarians.types),
      growthMode: 'levels',
      bonusShare: 0,
    };
    c.bots = { ...PRESETS.classic.bots, ...c.bots };
    // rebuild what the player knew from the reports (oldest first, so newer ones win)
    const state = data.state;
    state.intel ??= {};
    for (const r of state.reports) {
      const intel = (state.intel[r.defender.id] ??= {});
      if (r.wall) {
        intel.wall = r.wall.after;
        intel.wallAt = r.time;
      }
      if (r.scouted) intel.scout = { time: r.time, res: r.scouted.res, buildings: r.scouted.buildings };
    }
    return { ...data, version: 7 };
  },
  // v7 had no quest toasts.
  7: (data) => {
    data.state.questToasts ??= [];
    return { ...data, version: 8 };
  },
  // v8 had no conquest settings.
  8: (data) => {
    const c = data.state.config;
    c.conquest = { ...structuredClone(PRESETS.classic.conquest), ...c.conquest };
    return { ...data, version: 9 };
  },
  // v9 bots played at full strength: keep that as 'hard' for old worlds.
  9: (data) => {
    data.state.config.bots.difficulty = 'hard';
    return { ...data, version: 10 };
  },
  // v10 kept the last attack per target as a report id: keep the summary itself, so reports can be deleted.
  10: (data) => {
    const state = data.state as WorldState & { lastReportByTarget?: Record<number, number> };
    const byId = new Map(state.reports.map((r) => [r.id, r]));
    state.lastAttack = {};
    for (const [target, id] of Object.entries(state.lastReportByTarget ?? {})) {
      const r = byId.get(id);
      if (!r) continue;
      state.lastAttack[Number(target)] = {
        time: r.time,
        result: r.result,
        loot: r.loot ? r.loot[0] + r.loot[1] + r.loot[2] : 0,
        ...(r.scouted ? { scouted: r.scouted.res } : {}),
      };
    }
    delete state.lastReportByTarget;
    return { ...data, version: 11 };
  },
  // v11 had no tribes: start the diplomacy layer, bots form tribes as the game runs.
  11: (data) => {
    initDiplomacy(data.state);
    return { ...data, version: 12 };
  },
  // v12 had an event per recruited unit for bots too: give every bot job its single end event.
  12: (data) => {
    rescheduleBotRecruits(data.state);
    return { ...data, version: 13 };
  },
  // v13 bots were all equally "there": give them a tier (pro / mid / casual) and presence.
  13: (data) => {
    assignTiers(data.state);
    return { ...data, version: 14 };
  },
  // v14 had no churches: add the buildings (level 0) and their definitions.
  14: (data) => {
    const c = data.state.config;
    for (const b of CHURCH_BUILDINGS) c.buildings[b] ??= structuredClone(DEFAULT_BUILDINGS[b]);
    for (const v of Object.values(data.state.villages)) for (const b of CHURCH_BUILDINGS) v.buildings[b] ??= 0;
    return { ...data, version: 15 };
  },
  // v15 had only the build and plunder quests: add the tribe, empire, faith, paladin and flag chains.
  15: (data) => {
    const chains = data.state.config.quests.chains;
    for (const c of ALL_CHAINS) if (!chains.some((x) => x.id === c.id)) chains.push(structuredClone(c));
    checkQuests(data.state);
    return { ...data, version: 16 };
  },
  // v16 bot villages were all called "Barbarendorp" or "X's dorp": bots name them in their style.
  16: (data) => {
    nameAllBotVillages(data.state);
    return { ...data, version: 17 };
  },
  // v17 bot armies were mixed in every village: specialised villages, no handfuls, graded by skill
  // and difficulty (and on easy the pause after a conquest that keeps its old pace).
  17: (data) => {
    const b = data.state.config.bots;
    b.villageRoles ??= true;
    b.strikeMinShare ??= 0.5;
    b.armyGrades ??= true;
    return { ...data, version: 18 };
  },
  // peace goes through talks now: treaties still on offer and their inbox questions run out
  18: (data) => {
    const st = data.state as unknown as { treaties?: { status: string }[]; inbox?: { kind: string; status?: string }[] };
    if (st.treaties) st.treaties = st.treaties.filter((t) => t.status === 'signed');
    for (const m of st.inbox ?? []) if (m.kind === 'treaty' && m.status === 'open') m.status = 'expired';
    return { ...data, version: 19 };
  },
};

export function toSaveData(state: WorldState, now: number, clone = true): SaveData {
  // structuredClone so later mutations of the live state never leak into a stored save; skip it
  // only when the save is serialized right away (putSave turns it into a string before any await)
  return { version: SAVE_VERSION, savedAt: now, state: clone ? structuredClone(state) : state };
}

export function fromSaveData(raw: unknown): WorldState {
  if (typeof raw !== 'object' || raw === null || !('version' in raw) || !('state' in raw)) {
    throw new Error('Ongeldige save.');
  }
  let data = structuredClone(raw) as SaveData;
  if (data.version > SAVE_VERSION) {
    throw new Error(`Save is van een nieuwere versie (${data.version}) dan dit spel (${SAVE_VERSION}).`);
  }
  while (data.version < SAVE_VERSION) {
    const migrate = MIGRATIONS[data.version];
    if (!migrate) throw new Error(`Geen migratie van saveversie ${data.version}.`);
    data = migrate(data);
  }
  return data.state;
}
