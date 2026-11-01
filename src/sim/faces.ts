/**
 * Which face a bot has: drawn from its archetype's pool by the world seed and its id (the same
 * after every load). Tribe mates of the same kind never share a face: a clash moves to the next.
 */
import { FACE_COUNTS, type Face } from '../shared/faces';
import { hashFloat } from './rng';
import type { WorldState } from './state';

function baseIndex(state: WorldState, id: number, count: number): number {
  return Math.floor(hashFloat(state.config.seed, id, 0xface) * count);
}

/** The face of a bot (null for you and for the world). */
export function faceOf(state: WorldState, id: number): Face | null {
  const p = state.players[id];
  const pool = p?.bot?.archetype;
  if (!p || !pool) return null;
  const count = FACE_COUNTS[pool];
  let index = baseIndex(state, id, count);
  const t = p.tribe !== undefined ? state.tribes?.[p.tribe] : undefined;
  if (t) {
    // mates of the same kind with a lower id keep theirs; this one steps aside
    const taken = new Set<number>();
    for (const m of [...t.members].sort((a, b) => a - b)) {
      if (m === id) break;
      const q = state.players[m];
      if (q?.bot?.archetype !== pool) continue;
      taken.add(faceOf(state, m)!.index);
    }
    for (let i = 0; i < count && taken.has(index); i++) index = (index + 1) % count;
  }
  return { pool, index };
}
