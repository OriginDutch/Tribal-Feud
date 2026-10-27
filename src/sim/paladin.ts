/**
 * Paladin items (world setting "paladin: items", TW new style). Every player with a statue
 * slowly finds weapons for the weapon chamber: 3% per world day (x world speed), faster for
 * every enemy unit killed. One item is equipped at a time; it works where the paladin is:
 * with an attack (offense) or in a village (defense, for all units of its type there).
 * Items stay in the chamber when the paladin dies. Bots equip what suits their style.
 */
import type { Archetype } from '../shared/botProfiles';
import type { UnitId } from '../shared/gameData';
import { DAY } from '../shared/time';
import { addMessage } from './humanTribe';
import { nextFloat } from './rng';
import { HUMAN_ID, addLog, villagesOf, type Player, type WorldState } from './state';
import type { Village } from './village';

export type ItemId = 'halberd' | 'longsword' | 'battleaxe' | 'longbow' | 'telescope' | 'lance' | 'banner' | 'compositebow' | 'morningstar' | 'bonfire' | 'scepter';

export interface ItemDef {
  name: string;
  text: string;
  /** Unit items: the unit and its bonus in attack / defense. */
  unit?: UnitId;
  attack?: number;
  defense?: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  halberd: { name: 'Hellebaard van Guan Yu', text: 'Speerdragers +30% aanval, +20% verdediging', unit: 'spear', attack: 0.3, defense: 0.2 },
  longsword: { name: 'Langzwaard van Paracelsus', text: 'Zwaardvechters +40% aanval, +30% verdediging', unit: 'sword', attack: 0.4, defense: 0.3 },
  battleaxe: { name: 'Strijdbijl van Thorgard', text: 'Bijlstrijders +40% aanval, +30% verdediging', unit: 'axe', attack: 0.4, defense: 0.3 },
  longbow: { name: 'Langboog van Nimrod', text: 'Boogschutters +30% aanval, +20% verdediging', unit: 'archer', attack: 0.3, defense: 0.2 },
  telescope: { name: 'Telescoop van Kalid', text: 'Verkenners zien ook de troepen die niet thuis zijn' },
  lance: { name: 'Lans van Mieszko', text: 'Lichte cavalerie +30% aanval, +20% verdediging', unit: 'light', attack: 0.3, defense: 0.2 },
  banner: { name: 'Banier van Baptiste', text: 'Zware cavalerie +30% aanval, +20% verdediging', unit: 'heavy', attack: 0.3, defense: 0.2 },
  compositebow: { name: 'Composietboog van Nimrod', text: 'Bereden boogschutters +30% aanval, +20% verdediging', unit: 'marcher', attack: 0.3, defense: 0.2 },
  morningstar: { name: 'Morgenster van Carol', text: 'Rammen doen dubbele schade' },
  bonfire: { name: 'Vreugdevuur van Aletheia', text: 'Katapulten doen dubbele schade en verdedigen 11× zo sterk' },
  scepter: { name: 'Scepter van Vasco', text: 'Een edelman verlaagt de toestemming met minstens 30' },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export interface PaladinItems { found: ItemId[]; equipped?: ItemId; progress: number; at: number }

const PREFER: Record<Archetype, ItemId[]> = {
  rusher: ['battleaxe', 'lance', 'morningstar', 'scepter'],
  opportunist: ['battleaxe', 'lance', 'scepter', 'morningstar'],
  farmer: ['lance', 'battleaxe', 'morningstar'],
  turtle: ['longsword', 'halberd', 'banner', 'longbow'],
  supporter: ['halberd', 'longsword', 'banner', 'longbow'],
  diplomat: ['longsword', 'halberd', 'banner'],
};

const enabled = (state: WorldState): boolean => state.config.paladin === 'items';
const available = (state: WorldState): ItemId[] =>
  ITEM_IDS.filter((i) => state.config.archers || (ITEMS[i].unit !== 'archer' && ITEMS[i].unit !== 'marcher'));

export function itemsOf(p: Player | undefined): PaladinItems | undefined {
  return p?.items;
}
/** The equipped item of a player, if items are on. */
export function equipped(state: WorldState, owner: number): ItemDef & { id: ItemId } | null {
  if (!enabled(state) || owner < 0) return null;
  const id = state.players[owner]?.items?.equipped;
  return id ? { id, ...ITEMS[id] } : null;
}

export function equipItem(state: WorldState, owner: number, item: ItemId | null): string | null {
  if (!enabled(state)) return 'Paladijn-items staan uit op deze wereld.';
  const p = state.players[owner];
  const it = p?.items;
  if (!p || !it) return 'Je hebt nog geen items.';
  if (item === null) { delete it.equipped; return null; }
  if (!it.found.includes(item)) return 'Dat item heb je niet.';
  it.equipped = item;
  return null;
}

/** Progress for everyone with a statue (runs with the diplomacy tick); a full bar finds an item. */
export function itemsTick(state: WorldState): void {
  if (!enabled(state)) return;
  for (const p of state.players) {
    if (!villagesOf(state, p.id).some((v) => v.buildings.statue > 0)) continue;
    const it = (p.items ??= { found: [], progress: 0, at: state.time });
    const dt = state.time - it.at;
    it.at = state.time;
    it.progress += (0.03 * state.config.worldSpeed * dt) / DAY;
    findItems(state, p);
  }
}

/** Units killed by a player in battle make the bar fill faster. */
export function itemKills(state: WorldState, owner: number, killed: number): void {
  if (!enabled(state) || owner < 0 || killed <= 0) return;
  const it = state.players[owner]?.items;
  if (!it) return;
  it.progress += killed * 0.00002;
  findItems(state, state.players[owner]!);
}

function findItems(state: WorldState, p: Player): void {
  const it = p.items!;
  while (it.progress >= 1) {
    const left = available(state).filter((i) => !it.found.includes(i));
    if (!left.length) { it.progress = 1; return; }
    it.progress -= 1;
    const item = left[Math.floor(nextFloat(state.rng) * left.length)]!;
    it.found.push(item);
    if (p.id === HUMAN_ID) {
      addMessage(state, { kind: 'info', from: -1, title: `Item gevonden: ${ITEMS[item].name}`, text: `Je paladijn vond ${ITEMS[item].name}: ${ITEMS[item].text}. Rust hem uit in het standbeeld.` });
      addLog(state, { time: state.time, text: `Item gevonden: ${ITEMS[item].name}.` });
    } else if (p.bot) {
      const pref = PREFER[p.bot.archetype];
      const best = pref.find((x) => it.found.includes(x)) ?? it.found[0];
      if (best) it.equipped = best;
    }
  }
}

/** Defending paladins in a village: their owners' items (own paladin and support). */
export function defendingItems(state: WorldState, target: Village): (ItemDef & { id: ItemId })[] {
  if (!enabled(state)) return [];
  const out: (ItemDef & { id: ItemId })[] = [];
  if (target.units.knight > 0) { const e = equipped(state, target.owner); if (e) out.push(e); }
  for (const [origin, units] of Object.entries(target.support ?? {})) {
    if ((units.knight ?? 0) <= 0) continue;
    const e = equipped(state, state.villages[Number(origin)]?.owner ?? -1);
    if (e) out.push(e);
  }
  return out;
}
