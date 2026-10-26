// The baked 3D village (see tools/art): sprite atlases + where every piece goes, per light mode.
export type Light = 'day' | 'dusk';
export interface Glow { x: number; y: number; r: number; i: number; col: string }
export interface Sprite {
  a: number; sx: number; sy: number; w: number; h: number; // in the atlas
  x: number; y: number; d: number; // in the scene, and depth (draw low to high)
  label?: [number, number]; foot?: [number, number];
  glow?: Glow[]; smoke?: [number, number][];
}
export interface Manifest {
  w: number; h: number; ppu: number;
  /** world → scene: [ax, ay, az, c] for screen x, screen y and depth */
  proj: [number[], number[], number[]];
  loop: number; frames: number; walkSteps: number; dirs: number;
  stageLevels: Record<string, number[]>;
  homes: number; outerHomes: number; wallN: number; wallKinds: string[];
  atlases: string[]; staticAtlases: number;
  sprites: Record<string, Sprite>;
}
export interface Baked {
  m: Manifest; atlases: HTMLImageElement[]; ground: HTMLImageElement; alpha: ImageData[];
  /** animation clusters per base key: each cluster is `frames` sprites */
  anim: Map<string, Sprite[][]>;
}

const cache = new Map<Light, Promise<Baked>>();
const img = (src: string) => new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error(`kon ${src} niet laden`)); i.src = src; });

export function loadVillage(light: Light): Promise<Baked> {
  let p = cache.get(light);
  if (!p) {
    const base = `${import.meta.env.BASE_URL}village/${light}/`;
    p = (async () => {
      const m = (await (await fetch(`${base}manifest.json`)).json()) as Manifest;
      const [ground, ...atlases] = await Promise.all([img(`${base}ground.webp`), ...m.atlases.map((a) => img(base + a))]);
      // alpha of the static atlases, for pixel-exact clicks
      const alpha = atlases.slice(0, m.staticAtlases).map((a) => { const c = document.createElement('canvas'); c.width = a.width; c.height = a.height; const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(a, 0, 0); return x.getImageData(0, 0, a.width, a.height); });
      const anim = new Map<string, Sprite[][]>();
      for (const [key, s] of Object.entries(m.sprites)) {
        const parts = key.split('~');
        if (parts.length !== 3) continue;
        const [b, c, k] = [parts[0]!, Number(parts[1]), Number(parts[2])];
        if (!anim.has(b)) anim.set(b, []);
        const cl = anim.get(b)!;
        (cl[c] ??= [])[k] = s;
      }
      return { m, atlases, ground: ground!, alpha, anim };
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

/** Simpler homes outside the wall, once the village has outgrown it. */
export const outerHomesFor = (m: Manifest, main: number) => Math.max(0, Math.min(m.outerHomes ?? 0, Math.round(((main - 6) / 24) * (m.outerHomes ?? 0))));

export interface Piece { key: string; s: Sprite; d: number; building?: string; frames?: Sprite[]; decal?: boolean }
/** Every sprite to draw for these levels: ground decals first, then everything else back to front. */
/** churches: does this world have churches (then the church plot shows the church, or a building plot). */
export function piecesFor(b: Baked, levels: Record<string, number>, churches = false): { decals: Piece[]; bodies: Piece[] } {
  const { m } = b;
  const decals: Piece[] = [], bodies: Piece[] = [];
  const add = (key: string, building?: string) => {
    const s = m.sprites[key];
    if (s) bodies.push({ key, s, d: s.d, building });
    const dc = m.sprites[`${key}:decal`];
    if (dc) decals.push({ key: `${key}:decal`, s: dc, d: dc.d, building, decal: true });
    for (const frames of b.anim.get(key) ?? []) if (frames?.length) bodies.push({ key: `${key}~`, s: frames[0]!, d: frames[0]!.d + 1e-3, building, frames });
  };
  for (const id of Object.keys(m.stageLevels)) {
    if (id === 'wall' || id === 'church' || id === 'firstchurch') continue;
    add(`${id}@${stageFor(m, id, levels[id] ?? 0)}`, id);
  }
  if (!churches) add('slothome');
  else if ((levels.firstchurch ?? 0) > 0) add('firstchurch@1', 'firstchurch');
  else add(`church@${stageFor(m, 'church', levels.church ?? 0)}`, 'church');
  const ws = stageFor(m, 'wall', levels.wall ?? 0);
  if (ws > 0) { const kind = m.wallKinds[ws - 1]; for (let i = 0; i < m.wallN; i++) add(`wall-${kind}-${i}`, 'wall'); add(`gate-${kind}`, 'wall'); }
  for (let i = 0; i < homesFor(m, levels.main ?? 1); i++) add(`home${i}`);
  for (let i = 0; i < outerHomesFor(m, levels.main ?? 1); i++) add(`outer${i}`);
  add('well');
  for (const key of Object.keys(m.sprites)) if (key.startsWith('trees')) add(key);
  return { decals, bodies };
}

/** Is (x, y) in scene pixels on a non-transparent pixel of this (static) sprite? */
export function hits(b: Baked, s: Sprite, x: number, y: number): boolean {
  const a = b.alpha[s.a];
  if (!a) return false;
  const lx = Math.floor(x - s.x), ly = Math.floor(y - s.y);
  if (lx < 0 || ly < 0 || lx >= s.w || ly >= s.h) return false;
  return a.data[((s.sy + ly) * a.width + s.sx + lx) * 4 + 3]! > 60;
}

export const project = (m: Manifest, x: number, y: number, z: number): [number, number, number] =>
  m.proj.map(([ax, ay, az, c]) => ax! * x + ay! * y + az! * z + c!) as [number, number, number];
