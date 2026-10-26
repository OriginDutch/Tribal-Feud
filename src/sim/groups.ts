/**
 * Village groups: your own labels for villages (OFF, DEF, SUPP, Front, ...). A village can be in
 * several. A group can carry a build and a troop template: villages added to it get them.
 */
import { HUMAN_ID, type WorldState } from './state';
import { findTemplate, setManager } from './manager';

export interface VillageGroup {
  id: string;
  name: string;
  color: string;
  /** Build template given to villages added to the group. */
  template?: string;
  /** Troop template given to villages added to the group. */
  troopTemplate?: string;
}

export function saveGroup(state: WorldState, g: VillageGroup): string | null {
  const name = g.name.trim().slice(0, 20);
  if (!name) return 'Geef de groep een naam.';
  if (!/^#[0-9a-f]{6}$/i.test(g.color)) return 'Ongeldige kleur.';
  if ((state.villageGroups ?? []).some((x) => x.id !== g.id && x.name.toLowerCase() === name.toLowerCase())) return 'Die groep bestaat al.';
  if (g.template && !findTemplate(state, g.template)) return 'Dat bouwsjabloon bestaat niet.';
  if (g.troopTemplate && !state.troopTemplates?.some((t) => t.id === g.troopTemplate)) return 'Dat troepensjabloon bestaat niet.';
  const clean: VillageGroup = { id: g.id, name, color: g.color.toLowerCase() };
  if (g.template) clean.template = g.template;
  if (g.troopTemplate) clean.troopTemplate = g.troopTemplate;
  state.villageGroups ??= [];
  const i = state.villageGroups.findIndex((x) => x.id === g.id);
  if (i >= 0) state.villageGroups[i] = clean;
  else state.villageGroups.push(clean);
  return null;
}

export function deleteGroup(state: WorldState, id: string): string | null {
  if (!state.villageGroups?.some((g) => g.id === id)) return 'Die groep bestaat niet.';
  state.villageGroups = state.villageGroups.filter((g) => g.id !== id);
  for (const v of Object.values(state.villages)) if (v.groups?.includes(id)) v.groups = v.groups.filter((x) => x !== id);
  return null;
}

/** Adds (or removes) villages to (from) a group; added villages get the group's templates. */
export function setGroup(state: WorldState, groupId: string, villageIds: number[], member: boolean): string | null {
  const g = state.villageGroups?.find((x) => x.id === groupId);
  if (!g) return 'Die groep bestaat niet.';
  for (const id of villageIds) {
    const v = state.villages[id];
    if (!v || v.owner !== HUMAN_ID) continue;
    const has = v.groups?.includes(groupId) ?? false;
    if (member && !has) {
      v.groups = [...(v.groups ?? []), groupId];
      if (g.template || g.troopTemplate) {
        const m = v.manager ?? { troopShare: 0.5 };
        setManager(state, v.id, {
          troopShare: m.troopShare,
          ...(g.template ?? m.template ? { template: g.template ?? m.template } : {}),
          ...(g.troopTemplate ? { troopTemplate: g.troopTemplate } : m.troopTemplate ? { troopTemplate: m.troopTemplate } : m.troops ? { troops: m.troops } : {}),
        });
      }
    } else if (!member && has) {
      v.groups = v.groups!.filter((x) => x !== groupId);
    }
  }
  return null;
}
