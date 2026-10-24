/**
 * Seeded RNG (sfc32). All randomness in the simulation comes from here,
 * so the same seed + the same commands give the same game.
 * The state is four uint32s and is stored in the save.
 */

export type RngState = [number, number, number, number];

export function seedRng(seed: number): RngState {
  // splitmix32 to spread a single seed over four words
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const state: RngState = [next(), next(), next(), next()];
  // warm up
  for (let i = 0; i < 12; i++) nextUint32(state);
  return state;
}

/** Advances the state in place and returns a uint32. */
export function nextUint32(st: RngState): number {
  let [a, b, c, d] = st;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = ((c << 21) | (c >>> 11)) >>> 0;
  c = (c + t) >>> 0;
  st[0] = a >>> 0;
  st[1] = b;
  st[2] = c;
  st[3] = d;
  return t;
}

/** Float in [0, 1). */
export function nextFloat(st: RngState): number {
  return nextUint32(st) / 4294967296;
}

/** Integer in [min, max], inclusive. */
export function nextInt(st: RngState, min: number, max: number): number {
  if (max < min) throw new Error(`nextInt: max (${max}) < min (${min})`);
  return min + Math.floor(nextFloat(st) * (max - min + 1));
}

export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}
