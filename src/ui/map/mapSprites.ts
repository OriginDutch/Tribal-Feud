/**
 * Top-down village sprites (north up), drawn as SVG and turned into bitmaps once.
 * Original art for Tribal Feud. Every sprite is one map field: a 64×64 frame.
 */

/** Points from which a village shows the next size: six sizes, like TW's map. */
export const TIER_POINTS = [0, 300, 1000, 3000, 9000, 11000] as const;

export function tierOf(points: number): number {
  let t = 0;
  for (let i = 1; i < TIER_POINTS.length; i++) if (points >= TIER_POINTS[i]!) t = i;
  return t;
}

const SIZE = 64;
/** Bitmap resolution per sprite unit: crisp up to the largest zoom. */
const RES = 2;

const PAL = {
  dirt: '#9a7b4f',
  dirtDark: '#7d6240',
  wood: '#6e5034',
  woodDark: '#4f3823',
  roofA: '#b5523b',
  roofB: '#9c4431',
  roofC: '#c46a3c',
  thatch: '#c9a35a',
  thatchDark: '#a8843f',
  stone: '#a7a29a',
  stoneDark: '#7f7a72',
  stoneLight: '#c4bfb6',
  shadow: 'rgba(0,0,0,0.22)',
  tree: '#3f5e2a',
  treeLight: '#557a35',
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

function house(x: number, y: number, w: number, h: number, roof: string, ridgeVertical: boolean): string {
  const dark = shade(roof, -0.18);
  let s = `<rect x="${x + 1.2}" y="${y + 1.4}" width="${w}" height="${h}" fill="${PAL.shadow}"/>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${roof}"/>`;
  s += ridgeVertical
    ? `<rect x="${x + w / 2}" y="${y}" width="${w / 2}" height="${h}" fill="${dark}"/>`
    : `<rect x="${x}" y="${y + h / 2}" width="${w}" height="${h / 2}" fill="${dark}"/>`;
  return s;
}

function tree(x: number, y: number, r: number): string {
  return (
    `<circle cx="${x + 0.8}" cy="${y + 1}" r="${r}" fill="${PAL.shadow}"/>` +
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${PAL.tree}"/>` +
    `<circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.55}" fill="${PAL.treeLight}"/>`
  );
}

function banner(x: number, y: number, color: string, scale: number): string {
  const h = 9 * scale;
  return (
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - h}" stroke="#3a2a1a" stroke-width="${0.9 * scale}"/>` +
    `<path d="M${x} ${y - h} l${5.5 * scale} ${1.6 * scale} l${-5.5 * scale} ${1.8 * scale}z" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="0.4"/>`
  );
}

/**
 * One village, no grass (the map draws the ground). `ring`: the owner's colour as a ring
 * around it, for players.
 */
export function villageSvg(tier: number, color: string, seed: number, ring: boolean): string {
  const R = rng(seed * 97 + tier * 13);
  const clear = [15, 19, 22, 24, 25, 26][tier] ?? 15;
  let s = '';
  if (ring) s += `<circle cx="32" cy="32" r="${Math.min(29.5, clear + 3.5)}" fill="none" stroke="${color}" stroke-width="4"/>`;
  s += `<circle cx="32" cy="32" r="${clear}" fill="${PAL.dirt}" opacity="0.55"/>`;
  if (tier >= 1) s += `<path d="M32 32 L32 ${32 + clear} M32 32 L${32 + clear} 32" stroke="${PAL.dirtDark}" stroke-width="2" opacity="0.5"/>`;

  // walls under the houses
  if (tier === 2 || tier === 3) {
    const r = clear - 1.5;
    const n = Math.round(r * 2.6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (Math.abs(a - Math.PI / 2) < 0.22) continue; // gate south
      s += `<circle cx="${(32 + Math.cos(a) * r).toFixed(2)}" cy="${(32 + Math.sin(a) * r).toFixed(2)}" r="1.3" fill="${i % 2 ? PAL.wood : PAL.woodDark}"/>`;
    }
  }
  if (tier >= 4) {
    const r = clear - 1.5;
    s += `<circle cx="32.8" cy="33.2" r="${r}" fill="none" stroke="${PAL.shadow}" stroke-width="3.6"/>`;
    s += `<circle cx="32" cy="32" r="${r}" fill="none" stroke="${PAL.stoneDark}" stroke-width="3.6"/>`;
    s += `<circle cx="32" cy="32" r="${r}" fill="none" stroke="${PAL.stone}" stroke-width="2.2" stroke-dasharray="2.4 1.2"/>`;
    s += `<rect x="29" y="${32 + r - 2.5}" width="6" height="5" fill="${PAL.woodDark}"/>`;
    const towers = tier === 5 ? 6 : 4;
    for (let i = 0; i < towers; i++) {
      const a = (i / towers) * Math.PI * 2 + Math.PI / towers;
      const tx = (32 + Math.cos(a) * r).toFixed(2);
      const ty = (32 + Math.sin(a) * r).toFixed(2);
      s += `<circle cx="${tx}" cy="${ty}" r="3" fill="${PAL.stoneDark}"/><circle cx="${tx}" cy="${ty}" r="1.9" fill="${PAL.stoneLight}"/>`;
    }
  }

  // houses
  const count = [2, 4, 6, 9, 11, 12][tier] ?? 2;
  const spots: [number, number][] = [];
  const inner = clear - (tier >= 2 ? 5 : 3);
  const keepClear = tier >= 3 ? 7 : 0;
  for (let guard = 0; spots.length < count && guard < 400; guard++) {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * inner;
    const x = 32 + Math.cos(a) * d;
    const y = 32 + Math.sin(a) * d;
    if (Math.hypot(x - 32, y - 32) < keepClear) continue;
    if (spots.some(([px, py]) => Math.abs(px - x) < 6 && Math.abs(py - y) < 5.5)) continue;
    spots.push([x, y]);
  }
  spots.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of spots) {
    const vertical = R() < 0.5;
    const w = vertical ? 4 : 6;
    const h = vertical ? 6 : 4;
    const roof = tier === 0 ? PAL.thatch : [PAL.roofA, PAL.roofB, PAL.roofC, PAL.thatch][Math.floor(R() * (tier >= 3 ? 3 : 4))]!;
    s += house(x - w / 2, y - h / 2, w, h, roof, vertical);
  }
  // the centre: a hall, later a keep
  if (tier === 3) s += house(28, 28.5, 8, 7, PAL.roofB, false);
  if (tier >= 4) {
    const k = tier === 5 ? 11 : 9;
    s += `<rect x="${32 - k / 2 + 1.4}" y="${32 - k / 2 + 1.6}" width="${k}" height="${k}" fill="${PAL.shadow}"/>`;
    s += `<rect x="${32 - k / 2}" y="${32 - k / 2}" width="${k}" height="${k}" fill="${PAL.stoneDark}"/>`;
    s += `<rect x="${32 - k / 2 + 1.5}" y="${32 - k / 2 + 1.5}" width="${k - 3}" height="${k - 3}" fill="${PAL.stone}"/>`;
    if (tier === 5) {
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        s += `<rect x="${32 + (dx * k) / 2 - 2}" y="${32 + (dy * k) / 2 - 2}" width="4" height="4" fill="${PAL.stoneLight}" stroke="${PAL.stoneDark}" stroke-width="0.8"/>`;
      }
    }
  }
  // a field next to small villages
  if (tier <= 1) {
    const fx = tier ? 6 : 10;
    s += `<rect x="${fx}" y="8" width="11" height="8" fill="${PAL.thatch}" opacity="0.65"/>`;
    s += `<path d="M${fx} 10h11M${fx} 12h11M${fx} 14h11" stroke="${PAL.thatchDark}" stroke-width="0.6" opacity="0.7"/>`;
  }
  const first = spots[0];
  const bx = tier >= 4 || !first ? 32 : first[0] + 1;
  const by = tier >= 4 ? 32 - (tier === 5 ? 5.5 : 4.5) : first ? first[1] - 2 : 31;
  s += banner(bx, by, color, tier >= 4 ? 1.2 : 1);
  return s;
}

/** A patch of forest for an empty field. */
export function forestSvg(seed: number): string {
  const R = rng(seed);
  let s = '';
  const n = 5 + Math.floor(R() * 4);
  const trees: [number, number, number][] = [];
  for (let i = 0; i < n; i++) trees.push([8 + R() * 48, 8 + R() * 48, 5 + R() * 4]);
  trees.sort((a, b) => a[1] - b[1]);
  for (const [x, y, r] of trees) s += tree(x, y, r);
  return s;
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
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE * RES}" height="${SIZE * RES}" viewBox="0 0 ${SIZE} ${SIZE}">${body()}</svg>`;
    img = new Image();
    img.onload = () => onLoad?.();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    cache.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Variants per size, so a map full of equal villages doesn't look tiled. */
const VARIANTS = 3;

/** Copies at the size they are drawn: scaling thousands of sprites every frame is slow. */
const scaled = new Map<string, HTMLCanvasElement>();
let scaledSize = 0;

function atSize(img: HTMLImageElement, key: string, px: number): CanvasImageSource {
  const size = Math.max(1, Math.round(px));
  if (size !== scaledSize) {
    scaled.clear();
    scaledSize = size;
  }
  let c = scaled.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return img;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, size, size);
    scaled.set(key, c);
  }
  return c;
}

/** A village at `px` device pixels square, or null while it is still loading. */
export function villageAt(tier: number, color: string, ring: boolean, villageId: number, px: number): CanvasImageSource | null {
  const variant = villageId % VARIANTS;
  const key = `v${tier}-${color}-${ring ? 1 : 0}-${variant}`;
  const img = image(key, () => villageSvg(tier, color, variant + 1, ring));
  return img ? atSize(img, key, px) : null;
}

export function forestAt(variant: number, px: number): CanvasImageSource | null {
  const key = `f${variant % 4}`;
  const img = image(key, () => forestSvg((variant % 4) + 11));
  return img ? atSize(img, key, px) : null;
}
