/**
 * Bot personalities (economy layer). Phase "domme bots": the archetype only decides the
 * build order and the troop mix. Diplomat and opportunist play a balanced economy; their
 * real behaviour comes with diplomacy.
 */
import type { BuildingId, UnitId } from './gameData';

export const ARCHETYPES = ['turtle', 'rusher', 'farmer', 'diplomat', 'opportunist', 'supporter'] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const ARCHETYPE_NAMES: Record<Archetype, string> = {
  turtle: 'Turtle',
  rusher: 'Rusher',
  farmer: 'Farmer',
  diplomat: 'Diplomaat',
  opportunist: 'Opportunist',
  supporter: 'Supporter',
};

export interface BotProfile {
  /** Build steps in order: building -> target level. */
  buildOrder: [BuildingId, number][];
  /** Troop mix as weights. */
  troops: Partial<Record<UnitId, number>>;
  /** Units used to farm barbarians, best first. */
  farmUnits: UnitId[];
  /** Share of spare resources spent on troops each turn (0..1). */
  troopShare: number;
  /** Farms and nobles other players (not only barbarians). */
  attacksPlayers: boolean;
  /** Defensive farm space a village keeps per village point (spear/sword/archer/heavy). */
  defensePerPoint: number;
}

type Step = [BuildingId, number];

/** Everyone starts the same way: resources, HQ, storage, farm, barracks. */
const OPENING: Step[] = [
  ['wood', 2], ['stone', 2], ['iron', 2], ['main', 2], ['wood', 3], ['stone', 3], ['iron', 3], ['main', 3],
  ['storage', 3], ['farm', 3], ['barracks', 1], ['wood', 5], ['stone', 5], ['iron', 4], ['main', 5],
  ['storage', 5], ['farm', 5], ['smith', 1], ['wood', 7], ['stone', 7], ['iron', 6], ['storage', 7],
];

/** Everyone ends the same way: a maxed economy and an academy. */
const ENDGAME: Step[] = [
  ['wood', 20], ['stone', 20], ['iron', 20], ['storage', 20], ['farm', 20], ['main', 20], ['smith', 20],
  ['market', 10], ['snob', 1], ['wood', 25], ['stone', 25], ['iron', 25], ['storage', 25], ['farm', 25],
  ['wood', 30], ['stone', 30], ['iron', 30], ['storage', 30], ['farm', 30], ['wall', 20], ['barracks', 25],
  ['stable', 20], ['garage', 10], ['hide', 10],
];

const MID_OFFENSE: Step[] = [
  ['barracks', 5], ['smith', 5], ['main', 10], ['wood', 10], ['stone', 10], ['iron', 10], ['storage', 10],
  ['farm', 10], ['stable', 3], ['smith', 10], ['garage', 2], ['stable', 5], ['barracks', 10], ['wood', 15],
  ['stone', 15], ['iron', 15], ['storage', 15], ['farm', 15], ['stable', 10], ['main', 15], ['wall', 5],
];

const MID_DEFENSE: Step[] = [
  ['wall', 5], ['barracks', 5], ['smith', 5], ['main', 10], ['wood', 10], ['stone', 10], ['iron', 10],
  ['storage', 10], ['farm', 10], ['wall', 10], ['barracks', 10], ['stable', 3], ['wood', 15], ['stone', 15],
  ['iron', 15], ['storage', 15], ['farm', 15], ['smith', 15], ['stable', 10], ['wall', 15], ['main', 15],
];

const MID_ECONOMY: Step[] = [
  ['wood', 10], ['stone', 10], ['iron', 10], ['storage', 10], ['farm', 8], ['main', 10], ['barracks', 5],
  ['smith', 5], ['stable', 3], ['wood', 15], ['stone', 15], ['iron', 15], ['storage', 15], ['farm', 12],
  ['market', 5], ['stable', 5], ['main', 15], ['wall', 5], ['barracks', 10],
];

export const BOT_PROFILES: Record<Archetype, BotProfile> = {
  turtle: {
    buildOrder: [...OPENING, ...MID_DEFENSE, ...ENDGAME],
    troops: { spear: 4, sword: 4, archer: 2, heavy: 1 },
    farmUnits: ['light', 'spear'],
    troopShare: 0.5,
    attacksPlayers: false,
    defensePerPoint: 0.15,
  },
  rusher: {
    buildOrder: [...OPENING, ...MID_OFFENSE, ...ENDGAME],
    troops: { axe: 5, light: 3, ram: 1 },
    farmUnits: ['light', 'axe'],
    troopShare: 0.6,
    attacksPlayers: true,
    defensePerPoint: 0.04,
  },
  farmer: {
    buildOrder: [...OPENING, ...MID_ECONOMY, ...ENDGAME],
    troops: { spear: 3, light: 3 },
    farmUnits: ['light', 'spear'],
    troopShare: 0.35,
    attacksPlayers: false,
    defensePerPoint: 0.08,
  },
  diplomat: {
    buildOrder: [...OPENING, ...MID_ECONOMY, ...ENDGAME],
    troops: { spear: 3, sword: 2, light: 1 },
    farmUnits: ['light', 'spear'],
    troopShare: 0.4,
    attacksPlayers: false,
    defensePerPoint: 0.1,
  },
  opportunist: {
    buildOrder: [...OPENING, ...MID_OFFENSE, ...ENDGAME],
    troops: { axe: 3, light: 2, spear: 2 },
    farmUnits: ['light', 'axe', 'spear'],
    troopShare: 0.45,
    attacksPlayers: true,
    defensePerPoint: 0.06,
  },
  supporter: {
    buildOrder: [...OPENING, ...MID_DEFENSE, ...ENDGAME],
    troops: { spear: 4, sword: 3, heavy: 1 },
    farmUnits: ['light', 'spear'],
    troopShare: 0.5,
    attacksPlayers: false,
    defensePerPoint: 0.12,
  },
};

/** Build orders the player can give a village (account manager), same as the bots use. */
/**
 * A full village (all military buildings, market 20, everything maxed but the HQ) by a balanced
 * path: economy first, but a rally point, barracks 5, smithy 5, a wall and stable 3 early enough
 * to farm and not be helpless. Farm and storage grow along with the pits so nothing waits on them.
 */
const FULL_VILLAGE: Step[] = [
  ['wood', 2], ['stone', 2], ['iron', 2], ['main', 2], ['wood', 3], ['stone', 3], ['iron', 3], ['main', 3],
  ['storage', 3], ['farm', 3], ['barracks', 1], ['place', 1], ['wood', 5], ['stone', 5], ['iron', 4], ['main', 5],
  ['storage', 5], ['farm', 5], ['smith', 1], ['wall', 1], ['wood', 7], ['stone', 7], ['iron', 6], ['storage', 7],
  ['farm', 7], ['barracks', 3], ['smith', 3], ['statue', 1], ['wood', 9], ['stone', 9], ['iron', 8], ['main', 7],
  ['storage', 9], ['farm', 9], ['barracks', 5], ['smith', 5], ['wall', 5], ['main', 10], ['wood', 11], ['stone', 11],
  ['iron', 10], ['storage', 11], ['farm', 11], ['stable', 3], ['market', 3], ['smith', 10], ['wood', 13], ['stone', 13],
  ['iron', 12], ['storage', 13], ['farm', 13], ['barracks', 10], ['stable', 5], ['garage', 2], ['wood', 15], ['stone', 15],
  ['iron', 15], ['storage', 15], ['farm', 15], ['main', 15], ['wall', 10], ['hide', 5], ['wood', 18], ['stone', 18],
  ['iron', 18], ['storage', 18], ['farm', 18], ['market', 10], ['smith', 15], ['stable', 10], ['barracks', 15], ['wood', 20],
  ['stone', 20], ['iron', 20], ['storage', 20], ['farm', 20], ['main', 20], ['smith', 20], ['snob', 1], ['wall', 15],
  ['wood', 23], ['stone', 23], ['iron', 23], ['storage', 23], ['farm', 23], ['stable', 15], ['garage', 5], ['market', 15],
  ['wood', 26], ['stone', 26], ['iron', 26], ['storage', 26], ['farm', 26], ['barracks', 20], ['garage', 10], ['wall', 20],
  ['hide', 10], ['wood', 30], ['stone', 30], ['iron', 30], ['storage', 30], ['farm', 30], ['market', 20], ['stable', 20],
  ['barracks', 25], ['garage', 15],
];

export const BUILD_PRESETS: { id: string; name: string; steps: [BuildingId, number][] }[] = [
  { id: 'preset:economy', name: 'Economie (zoals Farmer)', steps: [...OPENING, ...MID_ECONOMY, ...ENDGAME] },
  { id: 'preset:offense', name: 'Offensief (zoals Rusher)', steps: [...OPENING, ...MID_OFFENSE, ...ENDGAME] },
  { id: 'preset:defense', name: 'Defensief (zoals Turtle)', steps: [...OPENING, ...MID_DEFENSE, ...ENDGAME] },
  { id: 'preset:full', name: 'Volledig dorp (gebalanceerd)', steps: FULL_VILLAGE },
];
