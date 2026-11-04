/**
 * Build templates as plain text, to share or keep outside a save:
 *
 *   # Volledig dorp
 *   Houthakker 2
 *   Hoofdgebouw 3
 *
 * One step per line: building (Dutch or English name or id, any case) and the level to reach.
 * Export writes the names in the current language; import takes both languages (old Dutch exports).
 */
import { BUILDING_IDS, DEFAULT_BUILDINGS, DEFAULT_UNITS, UNIT_IDS, type BuildingId, type UnitCounts, type UnitId } from './gameData';
import { tr } from './i18n';
import { terms } from './i18n/en/terms';

/** A building or unit name in the current language. */
const bName = (b: BuildingId) => tr(DEFAULT_BUILDINGS[b].name);
const uName = (u: UnitId) => tr(DEFAULT_UNITS[u].name);
/** The English name for a Dutch game word (always, whatever the current language). */
const english = (nl: string) => terms[nl] ?? nl;

export function templateToText(name: string, steps: [BuildingId, number][]): string {
  return [`# ${name}`, ...steps.map(([b, l]) => `${bName(b)} ${l}`)].join('\n');
}

const lookup = new Map<string, BuildingId>();
for (const id of BUILDING_IDS) {
  lookup.set(id.toLowerCase(), id);
  lookup.set(DEFAULT_BUILDINGS[id].name.toLowerCase(), id);
  lookup.set(english(DEFAULT_BUILDINGS[id].name).toLowerCase(), id);
}

export function textToTemplate(text: string): { name: string; steps: [BuildingId, number][] } | { error: string } {
  let name = tr('Geïmporteerd sjabloon');
  const steps: [BuildingId, number][] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    if (line.startsWith('#')) { name = line.slice(1).trim().slice(0, 40) || name; continue; }
    const m = /^(.+?)[\s:]+(\d+)$/.exec(line);
    const id = m ? lookup.get(m[1]!.trim().toLowerCase()) : undefined;
    if (!m || !id) return { error: tr('Regel {n} snap ik niet: "{line}"', { n: i + 1, line }) };
    const level = Number(m[2]);
    const max = DEFAULT_BUILDINGS[id].maxLevel;
    if (level < 1 || level > max) return { error: tr('Regel {n}: {building} kan level 1 t/m {max}.', { n: i + 1, building: DEFAULT_BUILDINGS[id].name, max }) };
    steps.push([id, level]);
  }
  if (!steps.length) return { error: tr('Geen stappen gevonden.') };
  return { name, steps };
}

// --- troop templates: "# Naam" and then "Bijlstrijder 8000" per line ---------------------

/** Short names players use (Dutch and English), next to the full names and the ids. */
const UNIT_ALIASES: Record<UnitId, string[]> = {
  spear: ['speer', 'speren'], sword: ['zwaard', 'zwaarden'], axe: ['bijl', 'bijlen'], archer: ['boog', 'boogschutters'],
  spy: ['verk', 'verk.', 'verkenners', 'scout', 'scouts'], light: ['lc', 'lichte cav'], marcher: ['bb', 'bereden boog'],
  heavy: ['zc', 'zware cav'], ram: ['rammen'], catapult: ['kata', "katapulten", 'katas'], knight: ['pala', 'paladijn'], snob: ['edel', 'edelen'],
};
const UNIT_ALIASES_EN: Record<UnitId, string[]> = {
  spear: ['spears', 'spear fighters'], sword: ['swords', 'swordsmen'], axe: ['axes', 'axemen'], archer: ['archers'],
  spy: ['scout'], light: ['lc', 'lcav', 'light cav'], marcher: ['ma', 'mounted archers'],
  heavy: ['hc', 'hcav', 'heavy cav'], ram: ['rams'], catapult: ['cat', 'cats', 'catas', 'catapults'], knight: ['pala'], snob: ['noble', 'nobles', 'noblemen'],
};
const unitLookup = new Map<string, UnitId>();
for (const id of UNIT_IDS) {
  for (const n of [id, DEFAULT_UNITS[id].name, english(DEFAULT_UNITS[id].name), ...UNIT_ALIASES[id], ...UNIT_ALIASES_EN[id]]) unitLookup.set(n.toLowerCase(), id);
}

export function troopsToText(name: string, troops: UnitCounts): string {
  return [`# ${name}`, ...UNIT_IDS.filter((u) => (troops[u] ?? 0) > 0).map((u) => `${uName(u)} ${troops[u]}`)].join('\n');
}

export function textToTroops(text: string): { name: string; troops: UnitCounts } | { error: string } {
  let name = tr('Geïmporteerd troepensjabloon');
  const troops: UnitCounts = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    if (line.startsWith('#')) { name = line.slice(1).trim().slice(0, 40) || name; continue; }
    const m = /^(.+?)[\s:]+([\d.]+)$/.exec(line);
    const id = m ? unitLookup.get(m[1]!.trim().toLowerCase()) : undefined;
    if (!m || !id) return { error: tr('Regel {n} snap ik niet: "{line}"', { n: i + 1, line }) };
    const n = Number(m[2]!.replace(/\./g, ''));
    if (!Number.isInteger(n) || n < 0) return { error: tr('Regel {n}: {count} is geen geldig aantal.', { n: i + 1, count: m[2] }) };
    if (n > 0) troops[id] = (troops[id] ?? 0) + n;
  }
  if (!Object.keys(troops).length) return { error: tr('Geen eenheden gevonden.') };
  return { name, troops };
}

// --- noble trains: "# Naam", "Katapultdoel: Smederij", "Edel 1: Bijl 6000, LC 2000", "Edel 2: Bijl 200" ---------

export function trainToText(name: string, first: UnitCounts, escorts: UnitCounts[], catapultTarget?: BuildingId, clearFirst = false): string {
  const line = (u: UnitCounts) => UNIT_IDS.filter((x) => (u[x] ?? 0) > 0).map((x) => `${uName(x)} ${u[x]}`).join(', ') || '-';
  // the wave number stays a plain digit (no number formatting): the parser reads it back
  const wave = (n: number, u: UnitCounts) => tr('Edel {n}: {units}', { n: String(n), units: line(u) });
  return [
    `# ${name}`,
    ...(catapultTarget ? [tr('Katapultdoel: {building}', { building: bName(catapultTarget) })] : []),
    ...(clearFirst ? [tr('Eerste wave zonder edel')] : []),
    wave(1, first),
    ...escorts.map((e, i) => wave(i + 2, e)),
  ].join('\n');
}

export function textToTrain(text: string): { name: string; first: UnitCounts; escorts: UnitCounts[]; catapultTarget?: BuildingId; clearFirst?: boolean } | { error: string } {
  let name = tr('Geïmporteerde edeltrein');
  let clearFirst = false;
  let catapultTarget: BuildingId | undefined;
  const waves: UnitCounts[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    if (line.startsWith('#')) { name = line.slice(1).trim().slice(0, 40) || name; continue; }
    if (/^(?:eerste wave zonder edel|first wave without noble)/i.test(line)) { clearFirst = true; continue; }
    const cat = /^(?:katapult(?:doel)?|catapult(?:\s+target)?)\s*:?\s*(.+)$/i.exec(line);
    if (cat) {
      const id = lookup.get(cat[1]!.trim().toLowerCase());
      if (!id) return { error: tr('Regel {n}: onbekend gebouw "{name}"', { n: i + 1, name: cat[1] }) };
      catapultTarget = id;
      continue;
    }
    const wave = /^(?:edel|noble(?:man)?)\s*(\d)\s*:\s*(.*)$/i.exec(line);
    if (!wave) return { error: tr('Regel {n} snap ik niet: "{line}"', { n: i + 1, line }) };
    const n = Number(wave[1]);
    if (n !== waves.length + 1 || n > 5) return { error: tr('Regel {n}: verwacht Edel {wave}.', { n: i + 1, wave: waves.length + 1 }) };
    const units: UnitCounts = {};
    const body = wave[2]!.trim();
    if (body && body !== '-') {
      for (const part of body.split(',')) {
        const m = /^(.+?)\s+([\d.]+)$/.exec(part.trim());
        const id = m ? unitLookup.get(m[1]!.trim().toLowerCase()) : undefined;
        if (!m || !id || id === 'snob') return { error: tr('Regel {n}: "{part}" snap ik niet.', { n: i + 1, part: part.trim() }) };
        units[id] = (units[id] ?? 0) + Number(m[2]!.replace(/\./g, ''));
      }
    }
    waves.push(units);
  }
  if (waves.length < 2) return { error: tr('Een edeltrein heeft minstens Edel 1 en Edel 2.') };
  return { name, first: waves[0]!, escorts: waves.slice(1), ...(catapultTarget ? { catapultTarget } : {}), ...(clearFirst ? { clearFirst } : {}) };
}
