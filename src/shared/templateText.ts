/**
 * Build templates as plain text, to share or keep outside a save:
 *
 *   # Volledig dorp
 *   Houthakker 2
 *   Hoofdgebouw 3
 *
 * One step per line: building (Dutch name or id, any case) and the level to reach.
 */
import { BUILDING_IDS, DEFAULT_BUILDINGS, DEFAULT_UNITS, UNIT_IDS, type BuildingId, type UnitCounts, type UnitId } from './gameData';

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

// --- troop templates: "# Naam" and then "Bijlstrijder 8000" per line ---------------------

/** Short names players use, next to the full Dutch names and the ids. */
const UNIT_ALIASES: Record<UnitId, string[]> = {
  spear: ['speer', 'speren'], sword: ['zwaard', 'zwaarden'], axe: ['bijl', 'bijlen'], archer: ['boog', 'boogschutters'],
  spy: ['verk', 'verk.', 'verkenners', 'scout', 'scouts'], light: ['lc', 'lichte cav'], marcher: ['bb', 'bereden boog'],
  heavy: ['zc', 'zware cav'], ram: ['rammen'], catapult: ['kata', "katapulten", 'katas'], knight: ['pala', 'paladijn'], snob: ['edel', 'edelen'],
};
const unitLookup = new Map<string, UnitId>();
for (const id of UNIT_IDS) {
  for (const n of [id, DEFAULT_UNITS[id].name, ...UNIT_ALIASES[id]]) unitLookup.set(n.toLowerCase(), id);
}

export function troopsToText(name: string, troops: UnitCounts): string {
  return [`# ${name}`, ...UNIT_IDS.filter((u) => (troops[u] ?? 0) > 0).map((u) => `${DEFAULT_UNITS[u].name} ${troops[u]}`)].join('\n');
}

export function textToTroops(text: string): { name: string; troops: UnitCounts } | { error: string } {
  let name = 'Geïmporteerd troepensjabloon';
  const troops: UnitCounts = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    if (line.startsWith('#')) { name = line.slice(1).trim().slice(0, 40) || name; continue; }
    const m = /^(.+?)[\s:]+([\d.]+)$/.exec(line);
    const id = m ? unitLookup.get(m[1]!.trim().toLowerCase()) : undefined;
    if (!m || !id) return { error: `Regel ${i + 1} snap ik niet: "${line}"` };
    const n = Number(m[2]!.replace(/\./g, ''));
    if (!Number.isInteger(n) || n < 0) return { error: `Regel ${i + 1}: ${m[2]} is geen geldig aantal.` };
    if (n > 0) troops[id] = (troops[id] ?? 0) + n;
  }
  if (!Object.keys(troops).length) return { error: 'Geen eenheden gevonden.' };
  return { name, troops };
}

// --- noble trains: "# Naam", "Katapultdoel: Smederij", "Edel 1: Bijl 6000, LC 2000", "Edel 2: Bijl 200" ---------

export function trainToText(name: string, first: UnitCounts, escorts: UnitCounts[], catapultTarget?: BuildingId, clearFirst = false): string {
  const line = (u: UnitCounts) => UNIT_IDS.filter((x) => (u[x] ?? 0) > 0).map((x) => `${DEFAULT_UNITS[x].name} ${u[x]}`).join(', ') || '-';
  return [
    `# ${name}`,
    ...(catapultTarget ? [`Katapultdoel: ${DEFAULT_BUILDINGS[catapultTarget].name}`] : []),
    ...(clearFirst ? ['Eerste wave zonder edel'] : []),
    `Edel 1: ${line(first)}`,
    ...escorts.map((e, i) => `Edel ${i + 2}: ${line(e)}`),
  ].join('\n');
}

export function textToTrain(text: string): { name: string; first: UnitCounts; escorts: UnitCounts[]; catapultTarget?: BuildingId; clearFirst?: boolean } | { error: string } {
  let name = 'Geïmporteerde edeltrein';
  let clearFirst = false;
  let catapultTarget: BuildingId | undefined;
  const waves: UnitCounts[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    if (line.startsWith('#')) { name = line.slice(1).trim().slice(0, 40) || name; continue; }
    if (/^eerste wave zonder edel/i.test(line)) { clearFirst = true; continue; }
    const cat = /^katapult(?:doel)?\s*:?\s*(.+)$/i.exec(line);
    if (cat) {
      const id = lookup.get(cat[1]!.trim().toLowerCase());
      if (!id) return { error: `Regel ${i + 1}: onbekend gebouw "${cat[1]}"` };
      catapultTarget = id;
      continue;
    }
    const wave = /^edel\s*(\d)\s*:\s*(.*)$/i.exec(line);
    if (!wave) return { error: `Regel ${i + 1} snap ik niet: "${line}"` };
    const n = Number(wave[1]);
    if (n !== waves.length + 1 || n > 5) return { error: `Regel ${i + 1}: verwacht Edel ${waves.length + 1}.` };
    const units: UnitCounts = {};
    const body = wave[2]!.trim();
    if (body && body !== '-') {
      for (const part of body.split(',')) {
        const m = /^(.+?)\s+([\d.]+)$/.exec(part.trim());
        const id = m ? unitLookup.get(m[1]!.trim().toLowerCase()) : undefined;
        if (!m || !id || id === 'snob') return { error: `Regel ${i + 1}: "${part.trim()}" snap ik niet.` };
        units[id] = (units[id] ?? 0) + Number(m[2]!.replace(/\./g, ''));
      }
    }
    waves.push(units);
  }
  if (waves.length < 2) return { error: 'Een edeltrein heeft minstens Edel 1 en Edel 2.' };
  return { name, first: waves[0]!, escorts: waves.slice(1), ...(catapultTarget ? { catapultTarget } : {}), ...(clearFirst ? { clearFirst } : {}) };
}
