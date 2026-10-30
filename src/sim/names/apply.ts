/**
 * Names in a world: bots get a gamertag that fits their tier, tribes a name and tag as players
 * make them. Uses its own random numbers (from the seed), so naming never changes the world itself.
 */
import { nextFloat, seedRng, hashFloat } from '../rng';
import { HUMAN_ID, type WorldState } from '../state';
import { playerName, tribeName, type Tier } from './generate';

/** Random numbers for one naming, fixed by the seed and the given numbers. */
export function nameRng(state: WorldState, ...parts: number[]): () => number {
  const rng = seedRng(Math.floor(hashFloat(state.config.seed, ...parts) * 2 ** 31));
  return () => nextFloat(rng);
}

/** Gives every bot a new name. Returns the old names (by player id). */
export function nameBots(state: WorldState): Map<number, string> {
  const old = new Map<number, string>();
  const taken = new Set(state.players.filter((p) => !p.bot).map((p) => p.name.toLowerCase()));
  for (const p of state.players) {
    if (!p.bot || p.id === HUMAN_ID) continue;
    old.set(p.id, p.name);
    p.name = playerName((p.bot.tier ?? 'pro') as Tier, nameRng(state, p.id, 101), taken);
  }
  return old;
}

/** A name and tag for a tribe being founded. */
export function newTribeName(state: WorldState, seed: number): [string, string] {
  const taken = new Set<string>();
  for (const t of Object.values(state.tribes ?? {})) {
    taken.add(`n:${t.name.toLowerCase()}`);
    taken.add(`t:${t.tag.toLowerCase().replace(/[^a-z0-9&]/g, '')}`);
  }
  return tribeName(nameRng(state, seed, 103), taken);
}
