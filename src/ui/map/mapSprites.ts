/**
 * Village sprites for the map: north up, seen slightly from the front (roofs and front walls),
 * like TW. Original art for Tribal Feud. A sprite is one field wide (64 units) and may reach
 * up to OVERHANG units above its field (keeps, banners, trees).
 */

/** Points from which a village shows the next size: six sizes, like TW's map. */
export const TIER_POINTS = [0, 300, 1000, 3000, 9000, 11000] as const;

export function tierOf(points: number): number {
  let t = 0;
  for (let i = 1; i < TIER_POINTS.length; i++) if (points >= TIER_POINTS[i]!) t = i;
  return t;
}

const SIZE = 64;
/** How far a sprite may stick out above its field, in sprite units. */
export const OVERHANG = 18;
/** Bitmap resolution per sprite unit: crisp up to the largest zoom. */
const RES = 2;

const P = {
  dirt: '#9a7b4f',
  dirtDark: '#7d6240',
  wood: '#6e5034',
  woodDark: '#4f3823',
  woodLight: '#8a6a48',
  wallHouse: '#d8c49a',
  wallHouseDark: '#bfa877',
  roofA: '#b5523b',
  roofB: '#9c4431',
  roofC: '#c46a3c',
  thatch: '#c9a35a',
  stone: '#a7a29a',
  stoneDark: '#837e76',
  stoneLight: '#c4bfb6',
  stoneFace: '#958f86',
  shadow: 'rgba(0,0,0,0.22)',
  tree: '#3f5e2a',
  treeLight: '#557a35',
  trunk: '#4a3320',
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

function house(x: number, y: number, w: number, roof: string, big: boolean): string {
  const wallH = big ? 5 : 3.6;
  const roofH = big ? 6 : 4.4;
  const depth = big ? 3.4 : 2.6;
  let s = `<ellipse cx="${x + 1}" cy="${y + 0.6}" rx="${w * 0.62}" ry="1.6" fill="${P.shadow}"/>`;
  // front wall with a door
  s += `<rect x="${x - w / 2}" y="${y - wallH}" width="${w}" height="${wallH}" fill="${P.wallHouse}"/>`;
  s += `<rect x="${x - w / 2}" y="${y - wallH}" width="${w}" height="${wallH * 0.25}" fill="${P.wallHouseDark}"/>`;
  s += `<rect x="${x - 0.8}" y="${y - wallH * 0.7}" width="1.6" height="${wallH * 0.7}" fill="${P.woodDark}"/>`;
  // roof: the front slope you see, and a sliver of the back slope above the ridge
  const top = y - wallH - roofH;
  s += `<polygon points="${x - w / 2 - 0.8},${y - wallH} ${x + w / 2 + 0.8},${y - wallH} ${x + w / 2},${top} ${x - w / 2},${top}" fill="${roof}"/>`;
  s += `<polygon points="${x - w / 2},${top} ${x + w / 2},${top} ${x + w / 2 - 0.4},${top - depth} ${x - w / 2 + 0.4},${top - depth}" fill="${shade(roof, 0.15)}"/>`;
  s += `<line x1="${x - w / 2}" y1="${top}" x2="${x + w / 2}" y2="${top}" stroke="${shade(roof, -0.25)}" stroke-width="0.6"/>`;
  return s;
}

function tree(x: number, y: number, r: number): string {
  return (
    `<ellipse cx="${x + 1}" cy="${y + 0.5}" rx="${r * 0.9}" ry="${r * 0.35}" fill="${P.shadow}"/>` +
    `<rect x="${x - 0.6}" y="${y - r * 0.9}" width="1.2" height="${r * 0.9}" fill="${P.trunk}"/>` +
    `<circle cx="${x}" cy="${y - r * 1.5}" r="${r}" fill="${P.tree}"/>` +
    `<circle cx="${x - r * 0.35}" cy="${y - r * 1.8}" r="${r * 0.5}" fill="${P.treeLight}"/>`
  );
}

function banner(x: number, y: number, color: string, k = 1): string {
  const h = 11 * k;
  return (
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - h}" stroke="#3a2a1a" stroke-width="${0.9 * k}"/>` +
    `<path d="M${x} ${y - h} l${6 * k} ${1.8 * k} l${-6 * k} ${2 * k}z" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="0.4"/>`
  );
}

const CX = 32;
const CY = 38;

/** The ring wall as an ellipse: the back half goes behind the houses, the front half (with its face) in front. */
function wallArc(rx: number, ry: number, front: boolean, kind: 'palisade' | 'stone'): string {
  const n = 40;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = front ? (i / n) * Math.PI : Math.PI + (i / n) * Math.PI;
    pts.push([CX + Math.cos(a) * rx, CY + Math.sin(a) * ry]);
  }
  let s = '';
  if (kind === 'palisade') {
    for (const [x, y] of pts) {
      if (front && Math.abs(x - CX) < 3 && y > CY) continue; // the gate
      const h = 4.2;
      s += `<rect x="${(x - 0.8).toFixed(2)}" y="${(y - h).toFixed(2)}" width="1.6" height="${h}" fill="${P.wood}"/>`;
      s += `<polygon points="${(x - 0.8).toFixed(2)},${(y - h).toFixed(2)} ${(x + 0.8).toFixed(2)},${(y - h).toFixed(2)} ${x.toFixed(2)},${(y - h - 1).toFixed(2)}" fill="${P.woodLight}"/>`;
    }
    return s;
  }
  const h = 5;
  const top = pts.map(([x, y]) => `${x.toFixed(2)},${(y - h).toFixed(2)}`).join(' ');
  const bottom = pts
    .slice()
    .reverse()
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  if (front) {
    s += `<polygon points="${top} ${bottom}" fill="${P.stoneFace}"/>`;
    for (let i = 0; i < pts.length; i += 2) {
      const [x, y] = pts[i]!;
      s += `<rect x="${(x - 0.9).toFixed(2)}" y="${(y - h - 1.4).toFixed(2)}" width="1.8" height="1.6" fill="${P.stoneLight}"/>`;
    }
    s += `<polyline points="${top}" fill="none" stroke="${P.stoneLight}" stroke-width="1.6"/>`;
    s += `<path d="M${CX - 3} ${CY + ry} v-4 a3 3 0 0 1 6 0 v4z" fill="${P.woodDark}"/>`;
  } else {
    s += `<polyline points="${top}" fill="none" stroke="${P.stoneLight}" stroke-width="2.2"/>`;
    s += `<polygon points="${top} ${bottom}" fill="${P.stoneDark}" opacity="0.6"/>`;
  }
  return s;
}

function tower(x: number, y: number, h: number, roof: string | null): string {
  return (
    `<ellipse cx="${x + 1}" cy="${y + 0.6}" rx="3.4" ry="1.4" fill="${P.shadow}"/>` +
    `<rect x="${x - 2.6}" y="${y - h}" width="5.2" height="${h}" fill="${P.stoneFace}"/>` +
    `<rect x="${x - 2.6}" y="${y - h}" width="1.6" height="${h}" fill="${P.stoneLight}" opacity="0.5"/>` +
    `<ellipse cx="${x}" cy="${y - h}" rx="2.9" ry="1.3" fill="${P.stoneLight}"/>` +
    (roof ? `<polygon points="${x - 3.2},${y - h} ${x + 3.2},${y - h} ${x},${y - h - 4.5}" fill="${roof}"/>` : '')
  );
}

function keep(tier: number): string {
  const w = tier === 5 ? 13 : 10;
  const h = tier === 5 ? 15 : 11;
  const x = CX;
  const y = CY + 1;
  let s = `<ellipse cx="${x + 1.5}" cy="${y + 0.8}" rx="${w * 0.7}" ry="2" fill="${P.shadow}"/>`;
  s += `<rect x="${x - w / 2}" y="${y - h}" width="${w}" height="${h}" fill="${P.stoneFace}"/>`;
  s += `<rect x="${x - w / 2}" y="${y - h - 3}" width="${w}" height="3" fill="${P.stoneLight}"/>`;
  for (let i = 0; i < 4; i++) s += `<rect x="${x - w / 2 + i * (w / 3.5)}" y="${y - h - 4.4}" width="${w / 7}" height="1.6" fill="${P.stoneLight}"/>`;
  s += `<rect x="${x - 1.4}" y="${y - h * 0.6}" width="2.8" height="3.4" fill="#3b3631"/>`;
  s += `<path d="M${x - 2} ${y} v-3.4 a2 2 0 0 1 4 0 v3.4z" fill="${P.woodDark}"/>`;
  return s;
}

/** Barbarians: weathered grey roofs and no banner, so players' villages stand out. */
const BARB = { roofs: ['#8f8b84', '#7b7770', '#9d988f', '#a9a49a'], thatch: '#a39e94', dirt: '#857f75' };

/** One village on its field. `ring`: the owner's colour around it, for players (barbarians: none, and grey). */
export function village(tier: number, color: string, seed: number, ring: boolean): string {
  const barb = !ring;
  const R = rng(seed * 97 + tier * 13);
  const rx = [16, 20, 23, 25, 26, 27][tier] ?? 16;
  const ry = rx * 0.62;
  let s = '';
  if (ring) {
    const r = Math.min(30, rx + 3.5);
    s += `<ellipse cx="${CX}" cy="${CY}" rx="${r}" ry="${r * 0.62}" fill="none" stroke="${color}" stroke-width="3.4"/>`;
  }
  s += `<ellipse cx="${CX}" cy="${CY}" rx="${rx}" ry="${ry}" fill="${barb ? BARB.dirt : P.dirt}" opacity="0.55"/>`;
  const wallKind = tier >= 4 ? 'stone' : tier >= 2 ? 'palisade' : null;
  const wrx = rx - 1.5;
  const wry = ry - 1;
  if (wallKind) s += wallArc(wrx, wry, false, wallKind);
  // houses, back to front
  const count = [2, 4, 6, 8, 9, 10][tier] ?? 2;
  const spots: [number, number][] = [];
  for (let g = 0; spots.length < count && g < 500; g++) {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R());
    const x = CX + Math.cos(a) * d * (wrx - 5);
    const y = CY + Math.sin(a) * d * (wry - 2) + 2;
    if (tier >= 3 && Math.abs(x - CX) < 8 && Math.abs(y - (CY - 1)) < 6) continue;
    if (spots.some(([px, py]) => Math.abs(px - x) < 7.5 && Math.abs(py - y) < 6)) continue;
    spots.push([x, y]);
  }
  const roofs = barb ? BARB.roofs : [P.roofA, P.roofB, P.roofC, P.thatch];
  const thatch = barb ? BARB.thatch : P.thatch;
  const items = spots.map(([x, y]) => ({
    y,
    svg: house(x, y, 6, tier === 0 ? thatch : roofs[Math.floor(R() * (tier >= 3 ? 3 : 4))]!, false),
  }));
  if (tier === 3) items.push({ y: CY + 1, svg: house(CX, CY + 1, 10, roofs[1]!, true) });
  if (tier >= 4) items.push({ y: CY + 1, svg: keep(tier) });
  items.sort((p, q) => p.y - q.y);
  for (const it of items) s += it.svg;
  if (wallKind) s += wallArc(wrx, wry, true, wallKind);
  if (tier >= 4) {
    const spots4 = tier === 5 ? [0.7, 0.3, 0.9, 0.1] : [0.75, 0.25];
    for (const f of spots4) {
      const a = f * Math.PI;
      s += tower(CX + Math.cos(a) * wrx, CY + Math.sin(a) * wry, tier === 5 ? 10 : 8, tier === 5 ? roofs[1]! : null);
    }
  }
  if (tier <= 1) s += tree(8, 16, 3.2) + tree(56, 20, 2.8);
  const first = spots[0];
  const bx = tier >= 4 || !first ? CX : first[0] + 2;
  const by = tier >= 4 ? CY + 1 - (tier === 5 ? 19 : 15) : first ? first[1] - 8 : CY - 6;
  if (!barb) s += banner(bx, by, color, tier >= 4 ? 1.2 : 1);
  return s;
}

/** A patch of forest for an empty field. */
export function forest(seed: number): string {
  const R = rng(seed);
  const trees: [number, number, number][] = [];
  for (let i = 0; i < 7; i++) trees.push([8 + R() * 48, 16 + R() * 44, 4 + R() * 2.5]);
  trees.sort((p, q) => p[1] - q[1]);
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
    const h = SIZE + OVERHANG;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE * RES}" height="${h * RES}" viewBox="0 ${-OVERHANG} ${SIZE} ${h}">${body()}</svg>`;
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
  const w = Math.max(1, Math.round(px));
  const h = Math.max(1, Math.round((px * (SIZE + OVERHANG)) / SIZE));
  if (w !== scaledSize) {
    scaled.clear();
    scaledSize = w;
  }
  let c = scaled.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return img;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    scaled.set(key, c);
  }
  return c;
}

/** A village `px` device pixels wide (and taller, by the overhang), or null while loading. */
export function villageAt(tier: number, color: string, ring: boolean, villageId: number, px: number): CanvasImageSource | null {
  const variant = villageId % VARIANTS;
  const key = `v${tier}-${color}-${ring ? 1 : 0}-${variant}`;
  const img = image(key, () => village(tier, color, variant + 2, ring));
  return img ? atSize(img, key, px) : null;
}

export function forestAt(variant: number, px: number): CanvasImageSource | null {
  const key = `f${variant % 4}`;
  const img = image(key, () => forest((variant % 4) + 11));
  return img ? atSize(img, key, px) : null;
}
