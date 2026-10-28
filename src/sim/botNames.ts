/**
 * Bots name their villages, each in its own style that fits how seriously it plays:
 *   pros   systematic: "007 OFF" / "012 DEF", "K45 03", or "[TAG] 004"
 *   mids   themed: "Wolfsheuvel", "Noordwacht"; or "Gorwin 3"
 *   casual sloppy: "dorp 2", "nieuw", "Gorwins dorp 3", or they just leave "Barbarendorp"
 * The style follows from the seed and the bot, so it is the same every time.
 */
import { hashFloat } from './rng';
import { BARBARIAN, villagesOf, type Player, type WorldState } from './state';
import type { Village } from './village';

const PRE = ['Wolfs', 'Eiken', 'Noord', 'Zuid', 'Raven', 'Steen', 'IJzer', 'Vuur', 'Hoog', 'Diep', 'Groen', 'Grijs', 'Storm', 'Mist', 'Berken', 'Valken', 'Beren', 'Oost', 'West', 'Rood', 'Zilver', 'Donker', 'Wit', 'Eenhoorn'];
const POST = ['heuvel', 'wacht', 'burcht', 'hof', 'veld', 'dal', 'poort', 'mond', 'stede', 'haven', 'rots', 'woud', 'brug', 'toren', 'moer', 'kamp', 'horst', 'gaard'];
const LAZY = ['nieuw', 'dorp', 'jaja', 'xx', 'farm', 'hier', 'test', 'mijn dorp'];

type Style = 'role' | 'continent' | 'tag' | 'theme' | 'firstnum' | 'lazy';

function styleOf(state: WorldState, p: Player): Style {
  const h = hashFloat(state.config.seed, p.id, 31);
  const tier = p.bot?.tier ?? 'pro';
  if (tier === 'pro') return h < 0.45 ? 'role' : h < 0.75 ? 'continent' : 'tag';
  if (tier === 'mid') return h < 0.6 ? 'theme' : 'firstnum';
  return 'lazy';
}

const pad = (n: number, w: number) => String(n).padStart(w, '0');
const pick = <T>(list: readonly T[], h: number): T => list[Math.floor(h * list.length) % list.length]!;
const firstName = (p: Player) => p.name.split(' ')[0] ?? p.name;

/** What a village is for, from its troops: offense, defense, or nothing clear yet. */
function role(v: Village): 'OFF' | 'DEF' | null {
  const n = (u: keyof Village['units']) => v.units[u] + v.outside[u];
  const off = n('axe') + 4 * n('light') + 5 * n('marcher') + 8 * n('ram');
  const def = n('spear') + n('sword') + n('archer') + 6 * n('heavy');
  if (off + def < 500) return null;
  return off > def ? 'OFF' : 'DEF';
}

/** A fitting name for the `n`-th village of this bot (1 = its first). Null = it leaves the name as it is. */
export function botVillageName(state: WorldState, p: Player, v: Village, n: number): string | null {
  const h = hashFloat(state.config.seed, p.id, v.id, 37);
  switch (styleOf(state, p)) {
    case 'role': {
      const r = role(v);
      return `${pad(n, 3)}${r ? ` ${r}` : ''}`;
    }
    case 'continent':
      return `K${Math.floor(v.y / 100)}${Math.floor(v.x / 100)} ${pad(n, 2)}`;
    case 'tag': {
      const t = p.tribe !== undefined ? state.tribes?.[p.tribe] : undefined;
      return `${t ? `[${t.tag}]` : firstName(p).slice(0, 4).toUpperCase()} ${pad(n, 3)}`;
    }
    case 'theme':
      return `${pick(PRE, h)}${pick(POST, hashFloat(state.config.seed, p.id, v.id, 41))}`;
    case 'firstnum':
      return n === 1 ? `${firstName(p)}s dorp` : `${firstName(p)} ${n}`;
    case 'lazy': {
      // half the time they don't bother at all
      if (h < 0.5) return null;
      if (h < 0.7) return `dorp ${n}`;
      if (h < 0.85) return `${firstName(p)}s dorp ${n}`;
      return pick(LAZY, hashFloat(state.config.seed, p.id, v.id, 43));
    }
  }
}

/** A bot just took this village: it gets a name in the bot's style. */
export function nameConquered(state: WorldState, v: Village): void {
  const p = state.players[v.owner];
  if (!p?.bot || v.owner === BARBARIAN) return;
  const n = (p.bot.named = (p.bot.named ?? villagesOf(state, p.id).length - 1) + 1);
  const name = botVillageName(state, p, v, n);
  if (name) v.name = name.slice(0, 32);
}

/** Old saves and new worlds: every bot village that still has a default name gets one. */
export function nameAllBotVillages(state: WorldState): void {
  for (const p of state.players) {
    if (!p.bot) continue;
    const mine = villagesOf(state, p.id).sort((a, b) => a.id - b.id);
    mine.forEach((v, i) => {
      // still a default name: barbarian, a start name (theirs or a conquered player's), or yours
      const plain = v.name === 'Barbarendorp' || v.name === 'Jouw dorp' || /s dorp$/.test(v.name);
      if (!plain) return;
      const name = botVillageName(state, p, v, i + 1);
      if (name) v.name = name.slice(0, 32);
    });
    p.bot.named = mine.length;
  }
}

/** A pro numbering "007" adds what the village became once it is clear: "007 OFF". */
export function refreshRoleName(state: WorldState, p: Player, v: Village): void {
  if (styleOf(state, p) !== 'role' || !/^\d{3}$/.test(v.name)) return;
  const r = role(v);
  if (r) v.name = `${v.name} ${r}`;
}
