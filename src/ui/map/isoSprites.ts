/**
 * Isometric village sprites, drawn as SVG and turned into bitmaps once.
 * Original art for Tribal Feud. Every sprite uses the same frame: 64×48 units, the
 * ground diamond of the field is 48 wide and 24 high with its centre at (32, 32).
 */

/** Points from which a village shows the next size, like TW's six map sizes. */
export const TIER_POINTS = [0, 300, 1000, 3000, 9000, 11000] as const;

export function tierOf(points: number): number {
  let t = 0;
  for (let i = 1; i < TIER_POINTS.length; i++) if (points >= TIER_POINTS[i]!) t = i;
  return t;
}

export const SPRITE_W = 64;
export const SPRITE_H = 48;
/** Diamond centre and half sizes inside the sprite frame. */
export const DIAMOND = { cx: 32, cy: 32, hw: 24, hh: 12 } as const;
/** Bitmap resolution per sprite unit: crisp up to the largest zoom. */
const RES = 2.5;

const PAL = {
  grass: '#5f7d3c',
  dirt: '#9a7b4f',
  wood: '#6e5034',
  roofA: '#b5523b',
  roofB: '#9c4431',
  roofC: '#c46a3c',
  thatch: '#c9a35a',
  wall: '#c9b48a',
  hall: '#b89a6a',
  stone: '#a7a29a',
  stoneDark: '#7f7a72',
  stoneLight: '#c4bfb6',
  shadow: 'rgba(0,0,0,0.22)',
  tree: '#3f5e2a',
  treeLight: '#557a35',
  treeDark: '#2f4a20',
};

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = f < 0 ? 0 : 255;
  const p = Math.abs(f);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Field units (0..24 on both axes) to sprite units. */
function iso(x: number, y: number, z = 0): [number, number] {
  return [32 + (x - y), 20 + (x + y) * 0.5 - z];
}
const pt = (x: number, y: number, z = 0) =>
  iso(x, y, z)
    .map((n) => n.toFixed(2))
    .join(',');

function box(x: number, y: number, w: number, d: number, h: number, wall: string, roof: string, flat = false): string {
  let s = `<polygon points="${pt(x, y + d)} ${pt(x + w, y + d)} ${pt(x + w + h * 0.5, y + d + h * 0.5)} ${pt(x + h * 0.5, y + d + h * 0.5)}" fill="${PAL.shadow}"/>`;
  s += `<polygon points="${pt(x, y + d)} ${pt(x + w, y + d)} ${pt(x + w, y + d, h)} ${pt(x, y + d, h)}" fill="${shade(wall, -0.12)}"/>`;
  s += `<polygon points="${pt(x + w, y)} ${pt(x + w, y + d)} ${pt(x + w, y + d, h)} ${pt(x + w, y, h)}" fill="${shade(wall, 0.05)}"/>`;
  if (flat) return s + `<polygon points="${pt(x, y, h)} ${pt(x + w, y, h)} ${pt(x + w, y + d, h)} ${pt(x, y + d, h)}" fill="${roof}"/>`;
  const rh = Math.min(w, d) * 0.7;
  const my = y + d / 2;
  s += `<polygon points="${pt(x + w, y, h)} ${pt(x + w, y + d, h)} ${pt(x + w, my, h + rh)}" fill="${shade(wall, 0.12)}"/>`;
  s += `<polygon points="${pt(x, y + d, h)} ${pt(x + w, y + d, h)} ${pt(x + w, my, h + rh)} ${pt(x, my, h + rh)}" fill="${roof}"/>`;
  return s;
}

function banner(x: number, y: number, color: string): string {
  const h = 10;
  return (
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - h}" stroke="#3a2a1a" stroke-width="1"/>` +
    `<path d="M${x} ${y - h} l6 1.8 l-6 2z" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="0.4"/>`
  );
}

function tree(x: number, y: number, size: number): string {
  const [cx, cy] = iso(x, y, 0);
  const top = cy - size * 1.3;
  return (
    `<ellipse cx="${cx + 1}" cy="${cy}" rx="${size * 0.8}" ry="${size * 0.4}" fill="${PAL.shadow}"/>` +
    `<rect x="${cx - 0.5}" y="${cy - size * 0.8}" width="1" height="${size * 0.8}" fill="#4a3320"/>` +
    `<circle cx="${cx}" cy="${top}" r="${size}" fill="${PAL.tree}"/>` +
    `<circle cx="${cx - size * 0.35}" cy="${top - size * 0.3}" r="${size * 0.5}" fill="${PAL.treeLight}"/>`
  );
}

/** One village: no grass (the map draws the ground), a dirt patch, houses, walls, keep, banner. */
export function villageSvg(tier: number, color: string, seed: number): string {
  const R = rng(seed * 31 + tier);
  let s = `<polygon points="${pt(3, 3)} ${pt(21, 3)} ${pt(21, 21)} ${pt(3, 21)}" fill="${PAL.dirt}" opacity="${0.3 + tier * 0.06}"/>`;
  const stone = tier >= 4;
  const wallCol = stone ? PAL.stone : PAL.wood;
  const wallH = stone ? 3 : 2.2;
  if (tier >= 2) {
    s += `<polygon points="${pt(2, 2)} ${pt(22, 2)} ${pt(22, 2, wallH)} ${pt(2, 2, wallH)}" fill="${shade(wallCol, 0.05)}"/>`;
    s += `<polygon points="${pt(2, 2)} ${pt(2, 22)} ${pt(2, 22, wallH)} ${pt(2, 2, wallH)}" fill="${shade(wallCol, -0.1)}"/>`;
  }
  const count = [2, 3, 5, 6, 7, 7][tier] ?? 2;
  const slots: [number, number][] = [
    [5, 5],
    [12, 5],
    [5, 12],
    [16, 9],
    [9, 16],
    [16, 16],
    [5, 18],
    [18, 5],
  ];
  // shuffle the slots a little per village so neighbours don't look identical
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [slots[i], slots[j]] = [slots[j]!, slots[i]!];
  }
  const items: { k: number; svg: string }[] = [];
  const used = slots.slice(0, count);
  for (const [x, y] of used) {
    const roof = tier === 0 ? PAL.thatch : [PAL.roofA, PAL.roofB, PAL.roofC][Math.floor(R() * 3)]!;
    items.push({ k: x + y, svg: box(x, y, 4, 3, 2.6, PAL.wall, roof) });
  }
  if (tier === 3) items.push({ k: 20, svg: box(10, 10, 5, 4, 3.5, PAL.hall, PAL.roofB) });
  if (stone) {
    const h = tier === 5 ? 9 : 7;
    let keep = box(10, 10, 5, 5, h, PAL.stone, PAL.stoneDark, true);
    if (tier === 5) keep += box(10, 10, 1.6, 1.6, 11, PAL.stoneLight, PAL.stoneDark, true) + box(13.4, 13.4, 1.6, 1.6, 11, PAL.stoneLight, PAL.stoneDark, true);
    items.push({ k: 25, svg: keep });
  }
  items.sort((a, b) => a.k - b.k);
  for (const it of items) s += it.svg;
  if (tier >= 2) {
    s += `<polygon points="${pt(2, 22)} ${pt(22, 22)} ${pt(22, 22, wallH)} ${pt(2, 22, wallH)}" fill="${shade(wallCol, -0.12)}"/>`;
    s += `<polygon points="${pt(22, 2)} ${pt(22, 22)} ${pt(22, 22, wallH)} ${pt(22, 2, wallH)}" fill="${shade(wallCol, 0.06)}"/>`;
    if (stone) for (const [x, y] of [[2, 2], [22, 2], [2, 22], [22, 22]] as const) s += box(x - 1.2, y - 1.2, 2.4, 2.4, 5, PAL.stoneLight, PAL.stoneDark, true);
  }
  if (tier <= 1) for (const [x, y] of [[20, 3], [3, 20]] as const) s += tree(x, y, 2.6);
  const first = used[0] ?? [10, 10];
  const [bx, by] = stone ? iso(12.5, 12.5, tier === 5 ? 9 : 7) : iso(first[0] + 2, first[1] + 1.5, 4.5);
  s += banner(bx, by, color);
  return s;
}

/** A patch of forest for an empty field. */
export function forestSvg(seed: number): string {
  const R = rng(seed);
  const trees: [number, number, number][] = [];
  const n = 4 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) trees.push([3 + R() * 18, 3 + R() * 18, 2.4 + R() * 1.6]);
  trees.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  return trees.map(([x, y, r]) => tree(x, y, r)).join('');
}

// --- bitmaps ---------------------------------------------------------------------

const cache = new Map<string, HTMLImageElement>();
let onLoad: (() => void) | null = null;

/** Called whenever a sprite finished loading, so the map can redraw. */
export function onSpriteLoad(fn: (() => void) | null): void {
  onLoad = fn;
}

function image(key: string, body: () => string): HTMLImageElement | null {
  let img = cache.get(key);
  if (!img) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SPRITE_W * RES}" height="${SPRITE_H * RES}" viewBox="0 0 ${SPRITE_W} ${SPRITE_H}">${body()}</svg>`;
    img = new Image();
    img.onload = () => onLoad?.();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    cache.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Variants per size, so a map full of equal villages doesn't look tiled. */
const VARIANTS = 3;

export function villageSprite(tier: number, color: string, villageId: number): HTMLImageElement | null {
  const variant = villageId % VARIANTS;
  return image(`v${tier}-${color}-${variant}`, () => villageSvg(tier, color, variant + 1));
}

export function forestSprite(variant: number): HTMLImageElement | null {
  const v = variant % 4;
  return image(`f${v}`, () => forestSvg(v + 11));
}

// --- pre-scaled copies -------------------------------------------------------------

/** Copies at the size they are drawn, per zoom: scaling thousands of sprites every frame is slow. */
const scaled = new Map<string, HTMLCanvasElement>();
let scaledWidth = 0;

/** The sprite at exactly `w`×`h` pixels (device pixels), cached until the size changes. */
export function atSize(img: HTMLImageElement, key: string, w: number, h: number): CanvasImageSource {
  const pw = Math.max(1, Math.round(w));
  const ph = Math.max(1, Math.round(h));
  if (pw !== scaledWidth) {
    scaled.clear();
    scaledWidth = pw;
  }
  let c = scaled.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = pw;
    c.height = ph;
    const ctx = c.getContext('2d');
    if (!ctx) return img;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, pw, ph);
    scaled.set(key, c);
  }
  return c;
}

/** Village sprite at its drawn size, or null while it is still loading. */
export function villageAt(tier: number, color: string, villageId: number, w: number, h: number): CanvasImageSource | null {
  const img = villageSprite(tier, color, villageId);
  return img ? atSize(img, `v${tier}-${color}-${villageId % VARIANTS}`, w, h) : null;
}

export function forestAt(variant: number, w: number, h: number): CanvasImageSource | null {
  const img = forestSprite(variant);
  return img ? atSize(img, `f${variant % 4}`, w, h) : null;
}
