import type { MapMarks, MapVillage, TribeView } from '../../shared/protocol';

/** Village colours on the map: gold = you, tribe colour, brown = bot without tribe, grey = barbarians. */
export const OWNER_COLORS = { own: '#e2a93b', bot: '#9c6b4e', barb: '#6d7177' } as const;

/** Colours you can mark players and tribes with. */
export const MARK_COLORS = ['#e5533f', '#f08a3c', '#f2d14b', '#6fcf6a', '#4fa3f0', '#b07ef0', '#f2f2f2'] as const;

export function tribeIndex(tribes: TribeView[] | undefined): Map<number, TribeView> {
  return new Map((tribes ?? []).map((t) => [t.id, t]));
}

/** Your mark on the player wins over your mark on his tribe, which wins over the tribe's colour. */
export function villageColor(v: MapVillage, tribes: Map<number, TribeView>, marks?: MapMarks): string {
  if (v.kind === 'own') return OWNER_COLORS.own;
  if (v.kind === 'barb') return OWNER_COLORS.barb;
  const mark = marks?.players[v.owner] ?? (v.tribe !== undefined ? marks?.tribes[v.tribe] : undefined);
  if (mark) return mark;
  return (v.tribe !== undefined && tribes.get(v.tribe)?.color) || OWNER_COLORS.bot;
}
