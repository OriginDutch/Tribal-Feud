import { snapshot } from './store';

/** Templates for a picker: hidden ones are left out, except the one that is chosen now. */
export function pickable<T extends { id: string }>(list: T[], selected?: string): T[] {
  const hidden = new Set(snapshot.value?.hiddenTemplates ?? []);
  return list.filter((t) => t.id === selected || !hidden.has(t.id));
}
