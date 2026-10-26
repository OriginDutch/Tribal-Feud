import type { MapVillage, TribeView } from '../../shared/protocol';

/** Village colours on the map: gold = you, tribe colour, brown = bot without tribe, grey = barbarians. */
export const OWNER_COLORS = { own: '#e2a93b', bot: '#9c6b4e', barb: '#8a8378' } as const;

export function tribeIndex(tribes: TribeView[] | undefined): Map<number, TribeView> {
  return new Map((tribes ?? []).map((t) => [t.id, t]));
}

export function villageColor(v: MapVillage, tribes: Map<number, TribeView>): string {
  if (v.kind === 'own') return OWNER_COLORS.own;
  if (v.kind === 'barb') return OWNER_COLORS.barb;
  return (v.tribe !== undefined && tribes.get(v.tribe)?.color) || OWNER_COLORS.bot;
}
