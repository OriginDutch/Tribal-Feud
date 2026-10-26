/**
 * Build templates as plain text, to share or keep outside a save:
 *
 *   # Volledig dorp
 *   Houthakker 2
 *   Hoofdgebouw 3
 *
 * One step per line: building (Dutch name or id, any case) and the level to reach.
 */
import { BUILDING_IDS, DEFAULT_BUILDINGS, type BuildingId } from './gameData';

export function templateToText(name: string, steps: [BuildingId, number][]): string {
  return [`# ${name}`, ...steps.map(([b, l]) => `${DEFAULT_BUILDINGS[b].name} ${l}`)].join('\n');
}

const lookup = new Map<string, BuildingId>();
for (const id of BUILDING_IDS) {
  lookup.set(id.toLowerCase(), id);
  lookup.set(DEFAULT_BUILDINGS[id].name.toLowerCase(), id);
}

export function textToTemplate(text: string): { name: string; steps: [BuildingId, number][] } | { error: string } {
  let name = 'Geïmporteerd sjabloon';
  const steps: [BuildingId, number][] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    if (line.startsWith('#')) { name = line.slice(1).trim().slice(0, 40) || name; continue; }
    const m = /^(.+?)[\s:]+(\d+)$/.exec(line);
    const id = m ? lookup.get(m[1]!.trim().toLowerCase()) : undefined;
    if (!m || !id) return { error: `Regel ${i + 1} snap ik niet: "${line}"` };
    const level = Number(m[2]);
    const max = DEFAULT_BUILDINGS[id].maxLevel;
    if (level < 1 || level > max) return { error: `Regel ${i + 1}: ${DEFAULT_BUILDINGS[id].name} kan level 1 t/m ${max}.` };
    steps.push([id, level]);
  }
  if (!steps.length) return { error: 'Geen stappen gevonden.' };
  return { name, steps };
}
