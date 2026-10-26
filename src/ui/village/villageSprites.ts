// The baked 3D village (see tools/art): sprite atlases + where every piece goes, per light mode.
export type Light = 'day' | 'dusk';
export interface Glow { x: number; y: number; r: number; i: number; col: string }
export interface Sprite {
  a: number; sx: number; sy: number; w: number; h: number; // in the atlas
  x: number; y: number; d: number; // in the scene, and depth (draw low to high)
  label?: [number, number]; foot?: [number, number];
  glow?: Glow[];
}
export interface Manifest {
  w: number; h: number; ppu: number;
  stageLevels: Record<string, number[]>;
  homes: number; wallN: number; wallKinds: string[];
  atlases: string[];
  sprites: Record<string, Sprite>;
}
export interface Baked { m: Manifest; atlases: HTMLImageElement[]; ground: HTMLImageElement; alpha: ImageData[] }

const cache = new Map<Light, Promise<Baked>>();
const img = (src: string) => new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error(`kon ${src} niet laden`)); i.src = src; });

export function loadVillage(light: Light): Promise<Baked> {
  let p = cache.get(light);
  if (!p) {
    const base = `${import.meta.env.BASE_URL}village/${light}/`;
    p = (async () => {
      const m = (await (await fetch(`${base}manifest.json`)).json()) as Manifest;
      const [ground, ...atlases] = await Promise.all([img(`${base}ground.webp`), ...m.atlases.map((a) => img(base + a))]);
      // alpha of each atlas, for pixel-exact clicks
      const alpha = atlases.map((a) => { const c = document.createElement('canvas'); c.width = a.width; c.height = a.height; const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(a, 0, 0); return x.getImageData(0, 0, a.width, a.height); });
      return { m, atlases, ground: ground!, alpha };
    })();
    p.catch(() => cache.delete(light));
    cache.set(light, p);
  }
  return p;
}

/** Stage of a building for its level: 0 = plot, 1..n. */
export function stageFor(m: Manifest, id: string, level: number): number {
  const lv = m.stageLevels[id];
  if (!lv || level <= 0) return 0;
  let s = 0;
  lv.forEach((min, i) => { if (level >= min) s = i + 1; });
  return s;
}

/** Homes that stand in the village, growing with the headquarters. */
export const homesFor = (m: Manifest, main: number) => Math.max(0, Math.min(m.homes, Math.floor((main + 2) / 3)));

export interface Piece { key: string; s: Sprite; building?: string }
/** Every sprite to draw for these levels, ground decals first, then back to front. */
export function piecesFor(m: Manifest, levels: Record<string, number>): Piece[] {
  const decals: Piece[] = [], bodies: Piece[] = [];
  const add = (key: string, building?: string) => {
    const s = m.sprites[key]; if (s) bodies.push({ key, s, building });
    const d = m.sprites[`${key}:decal`]; if (d) decals.push({ key: `${key}:decal`, s: d, building });
  };
  for (const id of Object.keys(m.stageLevels)) {
    if (id === 'wall') continue;
    const lvl = levels[id] ?? 0;
    add(`${id}@${stageFor(m, id, lvl)}`, id);
  }
  const ws = stageFor(m, 'wall', levels.wall ?? 0);
  if (ws > 0) { const kind = m.wallKinds[ws - 1]; for (let i = 0; i < m.wallN; i++) add(`wall-${kind}-${i}`, 'wall'); add(`gate-${kind}`, 'wall'); }
  for (let i = 0; i < homesFor(m, levels.main ?? 1); i++) add(`home${i}`);
  add('well');
  for (const key of Object.keys(m.sprites)) if (key.startsWith('trees')) add(key);
  bodies.sort((a, b) => a.s.d - b.s.d);
  return [...decals, ...bodies];
}

/** Is (x, y) in scene pixels on a non-transparent pixel of this sprite? */
export function hits(b: Baked, s: Sprite, x: number, y: number): boolean {
  const lx = Math.floor(x - s.x), ly = Math.floor(y - s.y);
  if (lx < 0 || ly < 0 || lx >= s.w || ly >= s.h) return false;
  const a = b.alpha[s.a]!;
  return a.data[((s.sy + ly) * a.width + s.sx + lx) * 4 + 3]! > 60;
}
