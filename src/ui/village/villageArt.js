/**
 * The village view: a drawn village (front view, slightly from above) whose buildings grow
 * with their level. Original art for Tribal Feud, drawn as SVG markup.
 * Plain JavaScript (lots of small drawing helpers); types in villageArt.d.ts.
 */
/* eslint-disable */

const P = {
  grass: '#5d7a3a', grassLight: '#6d8b46', grassDark: '#4e6a31',
  dirt: '#a88759', dirtLight: '#bf9f70', dirtDark: '#8a6b44', cobble: '#9d9384', cobbleDark: '#857b6d',
  plaster: '#e2d3ae', plasterShade: '#cdbb92', timber: '#5a3d26', timberLight: '#71503a',
  wood: '#7a5634', woodDark: '#4f3823', woodLight: '#9a7350', plank: '#8b6542',
  roofA: '#b04e37', roofB: '#93402e', roofC: '#c0663a', slate: '#5f6670', thatch: '#c9a35a', thatchDark: '#a8843f',
  stone: '#aaa59c', stoneDark: '#7f7a72', stoneLight: '#cbc6bd', stoneFace: '#98928a', mortar: '#8a857c',
  shadow: 'rgba(0,0,0,0.25)', tree: '#355226', treeMid: '#41622d', treeLight: '#557a35', trunk: '#4a3320',
  glass: '#2e3a42', glassLit: '#e8c46a', gold: '#e0b04a', red: '#a8402d', cloth: '#d9cfa0', water: '#4f7f9e',
  clay: '#b0643f', iron: '#5d6168',
};
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};
const f = (n) => n.toFixed(1);
let seed = 7;
const R = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- primitives ----------
function shadowE(x, y, rx, ry) { return `<ellipse cx="${f(x + rx * 0.08)}" cy="${f(y + 1)}" rx="${f(rx)}" ry="${f(ry)}" fill="${P.shadow}"/>`; }

function stoneBase(x, y, w, h) {
  let s = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${P.stoneFace}"/>`;
  const rows = Math.max(1, Math.round(h / 4));
  for (let r = 0; r < rows; r++) {
    const ry = y + (r * h) / rows;
    s += `<line x1="${f(x)}" y1="${f(ry)}" x2="${f(x + w)}" y2="${f(ry)}" stroke="${P.mortar}" stroke-width="0.7"/>`;
    const step = 7;
    for (let cx = x + (r % 2 ? step / 2 : 0); cx < x + w; cx += step) s += `<line x1="${f(cx)}" y1="${f(ry)}" x2="${f(cx)}" y2="${f(ry + h / rows)}" stroke="${P.mortar}" stroke-width="0.6"/>`;
  }
  return s;
}

function halfTimber(x, y, w, h, plaster = P.plaster) {
  let s = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${plaster}"/>`;
  s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h * 0.12)}" fill="${P.plasterShade}"/>`;
  const posts = Math.max(2, Math.round(w / 14));
  for (let i = 0; i <= posts; i++) { const px = x + (i * w) / posts; s += `<rect x="${f(px - 1.2)}" y="${f(y)}" width="2.4" height="${f(h)}" fill="${P.timber}"/>`; }
  s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="2.4" fill="${P.timber}"/><rect x="${f(x)}" y="${f(y + h * 0.5)}" width="${f(w)}" height="2" fill="${P.timber}"/><rect x="${f(x)}" y="${f(y + h - 2.4)}" width="${f(w)}" height="2.4" fill="${P.timber}"/>`;
  for (let i = 0; i < posts; i++) {
    const a = x + (i * w) / posts, b = x + ((i + 1) * w) / posts;
    if (i % 2 === 0) s += `<line x1="${f(a)}" y1="${f(y + h * 0.5)}" x2="${f(b)}" y2="${f(y)}" stroke="${P.timber}" stroke-width="2"/>`;
    else s += `<line x1="${f(a)}" y1="${f(y)}" x2="${f(b)}" y2="${f(y + h * 0.5)}" stroke="${P.timber}" stroke-width="2"/>`;
  }
  return s;
}

function planks(x, y, w, h, col = P.plank) {
  let s = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${col}"/>`;
  for (let px = x + 4; px < x + w; px += 4) s += `<line x1="${f(px)}" y1="${f(y)}" x2="${f(px)}" y2="${f(y + h)}" stroke="${shade(col, -0.2)}" stroke-width="0.7"/>`;
  return s;
}

function windowW(x, y, w, h, lit) {
  return `<rect x="${f(x - 1.2)}" y="${f(y - 1.2)}" width="${f(w + 2.4)}" height="${f(h + 2.4)}" fill="${P.timber}"/>` +
    `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${lit ? P.glassLit : P.glass}"/>` +
    `<line x1="${f(x + w / 2)}" y1="${f(y)}" x2="${f(x + w / 2)}" y2="${f(y + h)}" stroke="${P.timber}" stroke-width="0.9"/>` +
    `<line x1="${f(x)}" y1="${f(y + h / 2)}" x2="${f(x + w)}" y2="${f(y + h / 2)}" stroke="${P.timber}" stroke-width="0.9"/>` +
    `<rect x="${f(x - 1.5)}" y="${f(y + h + 1.2)}" width="${f(w + 3)}" height="1.6" fill="${P.timberLight}"/>`;
}

function door(x, y, w, h, arch = true) {
  const r = w / 2;
  let s = arch ? `<path d="M${f(x)} ${f(y + h)} v${f(-(h - r))} a${f(r)} ${f(r)} 0 0 1 ${f(w)} 0 v${f(h - r)}z" fill="${P.woodDark}"/>` : `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${P.woodDark}"/>`;
  for (let px = x + 2.5; px < x + w; px += 2.5) s += `<line x1="${f(px)}" y1="${f(y + (arch ? r * 0.4 : 0))}" x2="${f(px)}" y2="${f(y + h)}" stroke="${P.timber}" stroke-width="0.6"/>`;
  s += `<circle cx="${f(x + w * 0.75)}" cy="${f(y + h * 0.6)}" r="0.9" fill="${P.gold}"/>`;
  return s;
}

// gable roof from the front: slope with tile rows; ridge; overhang
function roof(x, y, w, h, col, kind = 'tile') {
  const ov = 5;
  const top = y - h;
  let s = `<polygon points="${f(x - ov)},${f(y)} ${f(x + w + ov)},${f(y)} ${f(x + w - 2)},${f(top)} ${f(x + 2)},${f(top)}" fill="${col}"/>`;
  // back slope sliver
  s += `<polygon points="${f(x + 2)},${f(top)} ${f(x + w - 2)},${f(top)} ${f(x + w - 6)},${f(top - h * 0.35)} ${f(x + 6)},${f(top - h * 0.35)}" fill="${shade(col, 0.18)}"/>`;
  const rows = Math.max(3, Math.round(h / 4));
  for (let r = 1; r < rows; r++) {
    const t = r / rows, ry = top + (y - top) * t;
    const lx = x + 2 + (-ov - 2) * t, rx = x + w - 2 + (ov + 2) * t;
    s += `<line x1="${f(lx)}" y1="${f(ry)}" x2="${f(rx)}" y2="${f(ry)}" stroke="${shade(col, kind === 'thatch' ? -0.12 : -0.22)}" stroke-width="${kind === 'thatch' ? 1.2 : 0.8}"/>`;
    if (kind === 'tile') for (let tx = lx + (r % 2 ? 3 : 0); tx < rx; tx += 6) s += `<line x1="${f(tx)}" y1="${f(ry)}" x2="${f(tx)}" y2="${f(ry - (y - top) / rows)}" stroke="${shade(col, -0.18)}" stroke-width="0.5"/>`;
  }
  s += `<line x1="${f(x - ov)}" y1="${f(y)}" x2="${f(x + w + ov)}" y2="${f(y)}" stroke="${shade(col, -0.35)}" stroke-width="1.6"/>`;
  s += `<line x1="${f(x + 2)}" y1="${f(top)}" x2="${f(x + w - 2)}" y2="${f(top)}" stroke="${shade(col, -0.3)}" stroke-width="1.6"/>`;
  return s;
}

function chimney(x, y, h, smoke) {
  let s = stoneBase(x, y - h, 7, h) + `<rect x="${f(x - 1)}" y="${f(y - h - 2)}" width="9" height="2.4" fill="${P.stoneDark}"/>`;
  if (smoke) s += `<circle cx="${f(x + 4)}" cy="${f(y - h - 8)}" r="4" fill="#cfc8bb" opacity="0.55"/><circle cx="${f(x + 8)}" cy="${f(y - h - 16)}" r="5.5" fill="#cfc8bb" opacity="0.4"/><circle cx="${f(x + 13)}" cy="${f(y - h - 26)}" r="7" fill="#cfc8bb" opacity="0.25"/>`;
  return s;
}

// a full house: anchor bottom centre (x, y)
function house(x, y, w, wallH, roofH, opts = {}) {
  const l = x - w / 2, top = y - wallH;
  let s = shadowE(x, y, w * 0.62, 5);
  const base = opts.base ?? 5;
  if (opts.stone) s += stoneBase(l, top, w, wallH);
  else { s += stoneBase(l, y - base, w, base); s += opts.plank ? planks(l, top, w, wallH - base) : halfTimber(l, top, w, wallH - base, opts.plaster); }
  const nWin = opts.windows ?? Math.max(1, Math.floor(w / 26));
  const dw = opts.doorW ?? Math.min(14, w * 0.22);
  const doorX = x - dw / 2 + (opts.doorOffset ?? 0);
  for (let i = 0; i < nWin * 2; i++) {
    const slot = (i + 0.5) / (nWin * 2);
    const wx = l + slot * w - 4;
    if (Math.abs(wx + 4 - (doorX + dw / 2)) < dw) continue;
    s += windowW(wx, top + wallH * 0.22, 8, 8, opts.lit && i % 3 === 0);
  }
  if (opts.door !== false) s += door(doorX, y - wallH * 0.62, dw, wallH * 0.62, true);
  if (opts.chimney) s += chimney(x + w * 0.22, top - roofH * 0.35, roofH * 0.55, opts.smoke);
  s += roof(l, top, w, roofH, opts.roof ?? P.roofA, opts.roofKind ?? 'tile');
  if (opts.dormer) {
    const dx = x - 7, dy = top - roofH * 0.5;
    s += `<rect x="${f(dx)}" y="${f(dy)}" width="14" height="9" fill="${P.plaster}"/>` + windowW(dx + 3, dy + 1.5, 8, 6, false) + `<polygon points="${f(dx - 2)},${f(dy)} ${f(dx + 16)},${f(dy)} ${f(dx + 7)},${f(dy - 7)}" fill="${shade(opts.roof ?? P.roofA, -0.08)}"/>`;
  }
  return s;
}

function tower(x, y, w, h, opts = {}) {
  const l = x - w / 2;
  let s = shadowE(x, y, w * 0.75, 5) + stoneBase(l, y - h, w, h) + `<rect x="${f(l)}" y="${f(y - h)}" width="${f(w * 0.28)}" height="${f(h)}" fill="${P.stoneLight}" opacity="0.35"/>`;
  for (let i = 0; i < (opts.slits ?? 2); i++) s += `<rect x="${f(x - 1.5)}" y="${f(y - h + 10 + i * 16)}" width="3" height="8" fill="#2d2925"/>`;
  if (opts.roof) s += `<polygon points="${f(l - 4)},${f(y - h)} ${f(l + w + 4)},${f(y - h)} ${f(x)},${f(y - h - w * 1.1)}" fill="${opts.roof}"/><line x1="${f(x)}" y1="${f(y - h)}" x2="${f(x)}" y2="${f(y - h - w * 1.1)}" stroke="${shade(opts.roof, -0.25)}" stroke-width="0.8"/>`;
  else {
    s += `<rect x="${f(l - 2)}" y="${f(y - h - 5)}" width="${f(w + 4)}" height="5" fill="${P.stoneLight}"/>`;
    for (let i = 0; i < 5; i++) s += `<rect x="${f(l - 2 + i * (w + 4) / 4.5)}" y="${f(y - h - 10)}" width="${f((w + 4) / 9)}" height="5" fill="${P.stoneLight}"/>`;
  }
  if (opts.flag) s += `<line x1="${f(x)}" y1="${f(y - h - (opts.roof ? w * 1.1 : 10))}" x2="${f(x)}" y2="${f(y - h - (opts.roof ? w * 1.1 : 10) - 22)}" stroke="#3a2a1a" stroke-width="1.6"/><path d="M${f(x)} ${f(y - h - (opts.roof ? w * 1.1 : 10) - 22)} l16 4 l-16 6z" fill="${opts.flag}"/>`;
  return s;
}

function tree(x, y, r, kind = 'round') {
  let s = `<ellipse cx="${f(x + 3)}" cy="${f(y + 1)}" rx="${f(r)}" ry="${f(r * 0.32)}" fill="${P.shadow}"/><rect x="${f(x - r * 0.12)}" y="${f(y - r)}" width="${f(r * 0.24)}" height="${f(r)}" fill="${P.trunk}"/>`;
  if (kind === 'pine') {
    for (let i = 0; i < 3; i++) { const ty = y - r * 0.6 - i * r * 0.55, tw = r * (1.1 - i * 0.25); s += `<polygon points="${f(x - tw)},${f(ty)} ${f(x + tw)},${f(ty)} ${f(x)},${f(ty - r * 0.9)}" fill="${i === 2 ? P.treeMid : P.tree}"/>`; }
    return s;
  }
  s += `<circle cx="${f(x)}" cy="${f(y - r * 1.5)}" r="${f(r)}" fill="${P.tree}"/><circle cx="${f(x - r * 0.45)}" cy="${f(y - r * 1.35)}" r="${f(r * 0.7)}" fill="${P.treeMid}"/><circle cx="${f(x - r * 0.3)}" cy="${f(y - r * 1.85)}" r="${f(r * 0.5)}" fill="${P.treeLight}"/>`;
  return s;
}

// props
const barrel = (x, y) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="4" ry="1.5" fill="${P.shadow}"/><rect x="${f(x - 3.5)}" y="${f(y - 9)}" width="7" height="9" rx="2" fill="${P.wood}"/><line x1="${f(x - 3.5)}" y1="${f(y - 6.5)}" x2="${f(x + 3.5)}" y2="${f(y - 6.5)}" stroke="${P.stoneDark}" stroke-width="1"/><line x1="${f(x - 3.5)}" y1="${f(y - 2.5)}" x2="${f(x + 3.5)}" y2="${f(y - 2.5)}" stroke="${P.stoneDark}" stroke-width="1"/><ellipse cx="${f(x)}" cy="${f(y - 9)}" rx="3.5" ry="1.2" fill="${P.woodLight}"/>`;
const crate = (x, y, s = 8) => `<rect x="${f(x - s / 2)}" y="${f(y - s)}" width="${s}" height="${s}" fill="${P.woodLight}" stroke="${P.woodDark}" stroke-width="0.8"/><path d="M${f(x - s / 2)} ${f(y - s)} L${f(x + s / 2)} ${f(y)} M${f(x + s / 2)} ${f(y - s)} L${f(x - s / 2)} ${f(y)}" stroke="${P.woodDark}" stroke-width="0.6"/>`;
const hay = (x, y) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="9" ry="2.5" fill="${P.shadow}"/><path d="M${f(x - 9)} ${f(y)} q9 -18 18 0z" fill="${P.thatch}"/><path d="M${f(x - 5)} ${f(y - 4)} q5 -8 10 0" stroke="${P.thatchDark}" fill="none" stroke-width="1"/>`;
const fence = (x1, y1, x2, y2) => { let s = `<line x1="${f(x1)}" y1="${f(y1 - 5)}" x2="${f(x2)}" y2="${f(y2 - 5)}" stroke="${P.woodLight}" stroke-width="1.6"/><line x1="${f(x1)}" y1="${f(y1 - 2)}" x2="${f(x2)}" y2="${f(y2 - 2)}" stroke="${P.woodLight}" stroke-width="1.6"/>`; const n = Math.round(Math.hypot(x2 - x1, y2 - y1) / 8); for (let i = 0; i <= n; i++) { const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n; s += `<rect x="${f(x - 1)}" y="${f(y - 8)}" width="2" height="8" fill="${P.wood}"/>`; } return s; };
const well = (x, y) => shadowE(x, y, 12, 3) + `<ellipse cx="${f(x)}" cy="${f(y - 6)}" rx="11" ry="4" fill="${P.stoneDark}"/>` + stoneBase(x - 11, y - 8, 22, 8) + `<ellipse cx="${f(x)}" cy="${f(y - 8)}" rx="9" ry="3" fill="${P.water}"/><rect x="${f(x - 10)}" y="${f(y - 26)}" width="2" height="18" fill="${P.wood}"/><rect x="${f(x + 8)}" y="${f(y - 26)}" width="2" height="18" fill="${P.wood}"/><polygon points="${f(x - 14)},${f(y - 25)} ${f(x + 14)},${f(y - 25)} ${f(x)},${f(y - 34)}" fill="${P.roofB}"/>`;
const cart = (x, y) => `<rect x="${f(x - 12)}" y="${f(y - 12)}" width="22" height="7" fill="${P.wood}"/><circle cx="${f(x - 6)}" cy="${f(y - 4)}" r="4.5" fill="none" stroke="${P.woodDark}" stroke-width="2"/><circle cx="${f(x + 6)}" cy="${f(y - 4)}" r="4.5" fill="none" stroke="${P.woodDark}" stroke-width="2"/><line x1="${f(x + 10)}" y1="${f(y - 9)}" x2="${f(x + 22)}" y2="${f(y - 4)}" stroke="${P.wood}" stroke-width="1.6"/><rect x="${f(x - 10)}" y="${f(y - 18)}" width="9" height="6" fill="${P.iron}"/><rect x="${f(x)}" y="${f(y - 17)}" width="8" height="5" fill="${P.clay}"/>`;
const banner = (x, y, col) => `<rect x="${f(x - 0.8)}" y="${f(y - 30)}" width="1.6" height="30" fill="#3a2a1a"/><rect x="${f(x - 6)}" y="${f(y - 30)}" width="12" height="2" fill="#3a2a1a"/><path d="M${f(x - 5)} ${f(y - 28)} h10 v14 l-5 -3 l-5 3z" fill="${col}"/>`;
const stall = (x, y, col) => shadowE(x, y, 16, 3) + planks(x - 14, y - 10, 28, 10, P.woodLight) + `<rect x="${f(x - 14)}" y="${f(y - 24)}" width="2" height="14" fill="${P.wood}"/><rect x="${f(x + 12)}" y="${f(y - 24)}" width="2" height="14" fill="${P.wood}"/>` + `<polygon points="${f(x - 17)},${f(y - 22)} ${f(x + 17)},${f(y - 22)} ${f(x + 13)},${f(y - 30)} ${f(x - 13)},${f(y - 30)}" fill="${col}"/>` + [0, 1, 2, 3, 4].map((i) => `<rect x="${f(x - 17 + i * 6.8)}" y="${f(y - 22)}" width="3.4" height="3" fill="${i % 2 ? col : P.cloth}"/>`).join('') + `<circle cx="${f(x - 7)}" cy="${f(y - 12)}" r="2.4" fill="${P.red}"/><circle cx="${f(x - 2)}" cy="${f(y - 12)}" r="2.4" fill="${P.gold}"/><circle cx="${f(x + 5)}" cy="${f(y - 12)}" r="2.4" fill="${P.treeLight}"/>`;
const anvil = (x, y) => `<rect x="${f(x - 5)}" y="${f(y - 4)}" width="10" height="4" fill="${P.iron}"/><path d="M${f(x - 8)} ${f(y - 8)} h14 l3 2 h-17z" fill="${P.iron}"/><rect x="${f(x - 2)}" y="${f(y - 6)}" width="4" height="2" fill="${P.iron}"/>`;
const target = (x, y) => `<rect x="${f(x - 1)}" y="${f(y - 18)}" width="2" height="18" fill="${P.wood}"/><circle cx="${f(x)}" cy="${f(y - 20)}" r="7" fill="${P.cloth}"/><circle cx="${f(x)}" cy="${f(y - 20)}" r="4.5" fill="${P.red}"/><circle cx="${f(x)}" cy="${f(y - 20)}" r="2" fill="${P.cloth}"/>`;
const logs = (x, y) => [0, 1, 2].map((i) => `<rect x="${f(x - 14 + i * 2)}" y="${f(y - 5 - i * 5)}" width="${28 - i * 4}" height="5" rx="2.5" fill="${i % 2 ? P.woodLight : P.wood}"/><circle cx="${f(x - 14 + i * 2)}" cy="${f(y - 2.5 - i * 5)}" r="2.5" fill="${P.dirtLight}"/>`).join('');
const flowers = (x, y) => [0, 1, 2, 3, 4].map((i) => `<circle cx="${f(x + i * 3.5)}" cy="${f(y - (i % 2) * 2)}" r="1.4" fill="${['#e8c46a', '#d97a6a', '#ece3d4'][i % 3]}"/>`).join('');


// ---------- growth ----------

/** 0 = not built, 1 = level 1-9, 2 = 10-19, 3 = 20 and up. */
export const stageOf = (level) => (level <= 0 ? 0 : level < 10 ? 1 : level < 20 ? 2 : 3);

const fieldsPatch = (x, y, n) => {
  let s = '';
  for (let k = 0; k < n; k++) {
    const i = k % 3, j = Math.floor(k / 3);
    const fx = x - 54 + i * 36, fy = y - 18 + j * 20;
    s += `<rect x="${f(fx)}" y="${f(fy)}" width="32" height="16" fill="${(i + j) % 2 ? '#b29a4a' : P.thatch}"/>`;
    for (let r = 3; r < 16; r += 4) s += `<line x1="${f(fx)}" y1="${f(fy + r)}" x2="${f(fx + 32)}" y2="${f(fy + r)}" stroke="${P.thatchDark}" stroke-width="0.8"/>`;
  }
  return s + fence(x - 58, y + 26, x + 58, y + 26);
};

/** Each building in its three stages, anchored at the bottom centre. */
const BUILD = {
  main: (x, y, st) =>
    st === 1 ? house(x, y, 58, 26, 20, { roof: P.roofB, windows: 1, chimney: true, smoke: true })
    : st === 2 ? house(x - 46, y + 6, 42, 24, 18, { roof: P.roofC }) + house(x + 10, y, 70, 32, 26, { roof: P.roofB, windows: 2, chimney: true, smoke: true, lit: true, dormer: true }) + banner(x + 52, y + 8, P.gold)
    : house(x - 56, y + 8, 50, 30, 24, { roof: P.roofC, chimney: true, lit: true }) + house(x + 56, y + 8, 50, 30, 24, { roof: P.roofC, lit: true }) +
      tower(x, y, 56, 70, { flag: P.gold, slits: 2 }) + door(x - 8, y - 22, 16, 22, true) + banner(x - 34, y + 10, P.gold) + banner(x + 34, y + 10, P.gold),
  barracks: (x, y, st) =>
    st === 1 ? house(x, y, 54, 22, 16, { roof: P.thatch, roofKind: 'thatch', plank: true, windows: 0 }) + target(x + 38, y + 4)
    : st === 2 ? house(x, y, 76, 28, 22, { roof: P.roofB, windows: 1 }) + target(x + 50, y + 2) + crate(x - 46, y + 3)
    : house(x, y, 96, 34, 26, { roof: P.roofB, windows: 2, chimney: true }) + target(x + 62, y + 2) + target(x + 78, y + 6) + crate(x - 56, y + 2) + crate(x - 64, y + 4, 7),
  stable: (x, y, st) =>
    st === 1 ? house(x, y, 56, 22, 16, { roof: P.thatch, roofKind: 'thatch', plank: true, windows: 0, doorW: 16 }) + hay(x - 38, y + 4)
    : st === 2 ? house(x, y, 76, 26, 20, { roof: P.thatch, roofKind: 'thatch', plank: true, windows: 0, doorW: 20 }) + fence(x + 42, y + 14, x + 64, y + 12) + hay(x - 48, y + 5)
    : house(x, y, 94, 30, 24, { roof: P.thatch, roofKind: 'thatch', plank: true, windows: 0, doorW: 22 }) + fence(x - 70, y + 14, x - 50, y + 16) + fence(x + 50, y + 16, x + 76, y + 12) + hay(x - 58, y + 6) + `<rect x="${f(x + 54)}" y="${f(y - 4)}" width="16" height="5" fill="${P.wood}"/>`,
  garage: (x, y, st) =>
    st === 1 ? house(x, y, 48, 22, 14, { roof: P.slate, plank: true, windows: 0, doorW: 18 }) + logs(x - 36, y + 6)
    : st === 2 ? house(x, y, 60, 26, 18, { roof: P.slate, plank: true, windows: 1, doorW: 22 }) + logs(x - 44, y + 8)
    : house(x, y, 70, 30, 20, { roof: P.slate, plank: true, windows: 1, doorW: 24 }) + cart(x + 50, y + 8) + logs(x - 46, y + 8),
  snob: (x, y) => tower(x - 40, y, 28, 66, { roof: P.roofB, flag: P.red, slits: 3 }) + house(x + 12, y + 4, 70, 40, 28, { stone: true, roof: P.roofB, windows: 2, dormer: true, lit: true }) + banner(x + 52, y + 8, P.red),
  smith: (x, y, st) =>
    st === 1 ? house(x, y, 44, 22, 16, { roof: P.thatch, roofKind: 'thatch', stone: true, windows: 0, chimney: true, smoke: true }) + anvil(x + 30, y + 5)
    : st === 2 ? house(x, y, 56, 26, 20, { roof: P.roofA, stone: true, windows: 1, chimney: true, smoke: true }) + anvil(x + 38, y + 6) + barrel(x - 36, y + 4)
    : house(x, y, 66, 30, 22, { roof: P.roofA, stone: true, windows: 1, chimney: true, smoke: true }) + anvil(x + 42, y + 6) + barrel(x - 40, y + 4) + barrel(x - 46, y + 6),
  place: (x, y) => `<ellipse cx="${f(x)}" cy="${f(y - 4)}" rx="40" ry="12" fill="${P.cobble}"/>` + well(x - 16, y) + banner(x + 20, y, P.red) + `<circle cx="${f(x + 34)}" cy="${f(y - 4)}" r="5" fill="#e07a2e"/><circle cx="${f(x + 34)}" cy="${f(y - 6)}" r="3" fill="#f2c14e"/>`,
  statue: (x, y) => shadowE(x, y, 12, 3) + stoneBase(x - 10, y - 10, 20, 10) + `<rect x="${f(x - 4)}" y="${f(y - 34)}" width="8" height="24" fill="${P.stoneLight}"/><circle cx="${f(x)}" cy="${f(y - 38)}" r="5" fill="${P.stoneLight}"/><line x1="${f(x + 5)}" y1="${f(y - 46)}" x2="${f(x + 5)}" y2="${f(y - 18)}" stroke="${P.stoneDark}" stroke-width="1.6"/>` + flowers(x - 18, y + 2) + flowers(x + 10, y + 3),
  market: (x, y, st) =>
    st === 1 ? stall(x, y, P.red) + crate(x - 26, y + 4)
    : st === 2 ? stall(x - 20, y, P.red) + stall(x + 22, y + 6, P.gold) + barrel(x + 50, y + 6)
    : stall(x - 34, y, P.red) + stall(x + 6, y + 8, P.slate) + stall(x + 46, y, P.gold) + crate(x - 64, y + 6) + barrel(x + 72, y + 6) + barrel(x + 66, y + 9),
  storage: (x, y, st) =>
    st === 1 ? house(x, y, 46, 22, 16, { roof: P.thatch, roofKind: 'thatch', plank: true, windows: 0, doorW: 16 }) + barrel(x - 30, y + 4)
    : st === 2 ? house(x, y, 66, 28, 22, { roof: P.roofB, plank: true, windows: 0, doorW: 20, base: 7 }) + barrel(x - 42, y + 4) + crate(x + 42, y + 5)
    : house(x, y, 84, 36, 26, { roof: P.roofB, plank: true, windows: 0, doorW: 24, base: 8 }) + barrel(x - 54, y + 4) + barrel(x - 48, y + 6) + crate(x + 52, y + 6) + crate(x + 60, y + 4, 7) + crate(x + 56, y - 3, 6),
  farm: (x, y, st) =>
    st === 1 ? house(x, y, 44, 22, 18, { roof: P.thatch, roofKind: 'thatch', plank: true, windows: 0, doorW: 16 })
    : st === 2 ? house(x, y, 56, 28, 22, { roof: P.roofA, plank: true, windows: 0, doorW: 20 }) + hay(x - 38, y + 4)
    : house(x, y, 66, 32, 26, { roof: P.roofA, plank: true, windows: 0, doorW: 22 }) + hay(x - 44, y + 4),
  hide: (x, y) => `<ellipse cx="${f(x)}" cy="${f(y - 2)}" rx="22" ry="8" fill="${P.grassDark}"/>` + planks(x - 11, y - 9, 22, 8, P.woodDark) + `<rect x="${f(x - 11)}" y="${f(y - 9)}" width="22" height="1.6" fill="${P.woodLight}"/><circle cx="${f(x + 6)}" cy="${f(y - 5)}" r="1.2" fill="${P.iron}"/>`,
  wood: (x, y, st) =>
    house(x, y, 34 + st * 6, 18 + st * 2, 14 + st * 2, { roof: P.thatch, roofKind: 'thatch', plank: true, windows: 0 }) +
    logs(x + 34 + st * 3, y + 8) + (st >= 2 ? logs(x + 46 + st * 3, y + 2) : '') + (st >= 3 ? logs(x - 46, y + 8) : '') +
    `<rect x="${f(x - 30 - st * 4)}" y="${f(y - 6)}" width="10" height="6" fill="${P.wood}"/><ellipse cx="${f(x - 25 - st * 4)}" cy="${f(y - 6)}" rx="5" ry="2" fill="${P.dirtLight}"/>`,
  stone: (x, y, st) => {
    const rx = 26 + st * 7, ry = 9 + st * 2;
    return `<ellipse cx="${f(x)}" cy="${f(y - 6)}" rx="${rx}" ry="${ry}" fill="${P.clay}"/><ellipse cx="${f(x - 2)}" cy="${f(y - 8)}" rx="${rx * 0.74}" ry="${ry * 0.66}" fill="${shade(P.clay, -0.28)}"/><path d="M${f(x - rx * 0.65)} ${f(y - 8)} q${f(rx * 0.65)} -8 ${f(rx * 1.3)} 0" stroke="${shade(P.clay, 0.2)}" fill="none" stroke-width="1.5"/>` +
      (st >= 3 ? cart(x + rx + 10, y + 4) : '') + (st >= 2 ? `<rect x="${f(x - rx - 14)}" y="${f(y - 10)}" width="14" height="10" fill="${P.clay}"/><rect x="${f(x - rx - 14)}" y="${f(y - 10)}" width="14" height="2" fill="${shade(P.clay, 0.2)}"/>` : '');
  },
  iron: (x, y, st) => `<polygon points="${f(x - 70)},${f(y)} ${f(x - 50)},${f(y - 46)} ${f(x - 16)},${f(y - 66)} ${f(x + 22)},${f(y - 56)} ${f(x + 52)},${f(y - 30)} ${f(x + 70)},${f(y)}" fill="${P.stoneDark}"/><polygon points="${f(x - 50)},${f(y - 46)} ${f(x - 16)},${f(y - 66)} ${f(x - 12)},${f(y - 40)} ${f(x - 36)},${f(y - 28)}" fill="${P.stoneLight}" opacity="0.45"/><polygon points="${f(x + 22)},${f(y - 56)} ${f(x + 52)},${f(y - 30)} ${f(x + 30)},${f(y - 26)}" fill="${P.stone}" opacity="0.5"/>` +
    `<path d="M${f(x - 12)} ${f(y)} v-18 a12 12 0 0 1 24 0 v18z" fill="#2a2622"/>` +
    (st >= 2 ? `<rect x="${f(x - 15)}" y="${f(y - 22)}" width="30" height="4" fill="${P.wood}"/><rect x="${f(x - 15)}" y="${f(y - 22)}" width="4" height="22" fill="${P.wood}"/><rect x="${f(x + 11)}" y="${f(y - 22)}" width="4" height="22" fill="${P.wood}"/>` : '') +
    (st >= 3 ? `<path d="M${f(x)} ${f(y)} L${f(x + 40)} ${f(y + 14)}" stroke="${P.iron}" stroke-width="2"/><path d="M${f(x + 4)} ${f(y)} L${f(x + 44)} ${f(y + 14)}" stroke="${P.iron}" stroke-width="2"/><rect x="${f(x + 30)}" y="${f(y + 2)}" width="14" height="8" fill="${P.iron}"/>` : ''),
};

/** A staked-out plot for a building that isn't there yet. */
function plot(x, y, w) {
  return `<rect x="${f(x - w / 2)}" y="${f(y - w * 0.3)}" width="${f(w)}" height="${f(w * 0.3)}" fill="${P.dirt}" opacity="0.4" stroke="${P.woodLight}" stroke-dasharray="4 3" stroke-width="1.4"/>` +
    [[x - w / 2, y - w * 0.3], [x + w / 2, y - w * 0.3], [x - w / 2, y], [x + w / 2, y]].map(([px, py]) => `<rect x="${f(px - 1)}" y="${f(py - 6)}" width="2" height="6" fill="${P.wood}"/>`).join('');
}
const PLOT_W = { main: 60, barracks: 60, stable: 66, garage: 56, snob: 80, smith: 50, place: 60, statue: 26, market: 70, storage: 56, farm: 54, hide: 30, wood: 50, stone: 60, iron: 70 };

// ---------- layout ----------

const WALL = { cx: 490, cy: 330, rx: 430, ry: 215 };
const LAYOUT = {
  snob: [262, 232], statue: [362, 214], main: [490, 255], smith: [635, 228], garage: [795, 278],
  barracks: [318, 338], stable: [662, 340],
  place: [490, 355],
  storage: [255, 440], market: [490, 440], farm: [712, 445], hide: [380, 488],
  iron: [805, 150], wood: [118, 152], stone: [120, 590],
};
/** Where each label goes (below the building), in scene units. */
export const LABELS = Object.fromEntries(Object.entries(LAYOUT).map(([id, [x, y]]) => [id, [x, y + 12]]));
LABELS.wall = [490, 578];
export const SCENE_W = 980;
export const SCENE_H = 620;

function layer([x, y]) {
  const dx = (x - WALL.cx) / WALL.rx;
  if (Math.abs(dx) >= 1) return 'front';
  const h = WALL.ry * Math.sqrt(1 - dx * dx);
  if (y < WALL.cy - h + 8) return 'back';
  if (y > WALL.cy + h - 8) return 'front';
  return 'in';
}
function nearOutside(x, y, which) {
  return Object.keys(LAYOUT).some((id) => { const p = LAYOUT[id]; return layer(p) === which && Math.abs(x - p[0]) < 85 && y > p[1] - 90 && y < p[1] + 40; });
}

function wallArc(a0, a1) {
  const p = [];
  for (let i = 0; i <= 80; i++) { const t = a0 + ((a1 - a0) * i) / 80; p.push([WALL.cx + Math.cos(t) * WALL.rx, WALL.cy + Math.sin(t) * WALL.ry]); }
  return p;
}
function stoneFace(pts, h) {
  return `<polygon points="${pts.map(([x, y]) => `${f(x)},${f(y - h)}`).join(' ')} ${pts.slice().reverse().map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="${P.stoneFace}"/>` +
    pts.filter((_, i) => i % 2 === 0).map(([x, y]) => `<rect x="${f(x - 2.5)}" y="${f(y - h - 6)}" width="5" height="6" fill="${P.stoneLight}"/>`).join('') +
    `<polyline points="${pts.map(([x, y]) => `${f(x)},${f(y - h)}`).join(' ')}" fill="none" stroke="${P.stoneLight}" stroke-width="2.5"/>` +
    `<polyline points="${pts.map(([x, y]) => `${f(x)},${f(y - h * 0.5)}`).join(' ')}" fill="none" stroke="${P.mortar}" stroke-width="0.8"/>`;
}
function palisade(pts, h) {
  let s = '';
  for (const [x, y] of pts) s += `<rect x="${f(x - 2.2)}" y="${f(y - h)}" width="4.4" height="${f(h)}" fill="${P.wood}"/><polygon points="${f(x - 2.2)},${f(y - h)} ${f(x + 2.2)},${f(y - h)} ${f(x)},${f(y - h - 3)}" fill="${P.woodLight}"/>`;
  return s;
}
/** The wall: none, a palisade (1-9), stone (10-19), stone with roofed gate towers (20). */
function wall(level, back) {
  if (level <= 0) return '';
  const st = stageOf(level);
  const { cx, cy, ry } = WALL;
  if (back) return st === 1 ? palisade(wallArc(Math.PI, 2 * Math.PI).filter((_, i) => i % 1 === 0), 14) : stoneFace(wallArc(Math.PI, 2 * Math.PI), 18 + st * 2);
  const left = wallArc(Math.PI / 2 + 0.07, Math.PI - 0.05);
  const right = wallArc(0.05, Math.PI / 2 - 0.07);
  if (st === 1) {
    return palisade(right, 14) + palisade(left, 14) +
      `<rect x="${f(cx - 22)}" y="${f(cy + ry - 26)}" width="6" height="30" fill="${P.woodDark}"/><rect x="${f(cx + 16)}" y="${f(cy + ry - 26)}" width="6" height="30" fill="${P.woodDark}"/><rect x="${f(cx - 22)}" y="${f(cy + ry - 28)}" width="44" height="5" fill="${P.wood}"/>`;
  }
  const h = 18 + st * 2;
  let s = stoneFace(right, h) + stoneFace(left, h);
  for (const t of [0.05, Math.PI - 0.05]) s += tower(cx + Math.cos(t) * WALL.rx, cy + Math.sin(t) * ry + 2, 26, 44, { slits: 1 });
  const roof = st === 3 ? P.roofB : null;
  s += tower(cx - 34, cy + ry + 4, 30, 52, { slits: 1, roof }) + tower(cx + 34, cy + ry + 4, 30, 52, { slits: 1, roof });
  s += `<rect x="${f(cx - 19)}" y="${f(cy + ry - 30)}" width="38" height="34" fill="${P.stoneFace}"/><path d="M${f(cx - 13)} ${f(cy + ry + 4)} v-20 a13 13 0 0 1 26 0 v20z" fill="#2a2622"/>` +
    [0, 1, 2, 3, 4].map((i) => `<line x1="${f(cx - 11 + i * 5.5)}" y1="${f(cy + ry - 14)}" x2="${f(cx - 11 + i * 5.5)}" y2="${f(cy + ry + 4)}" stroke="${P.iron}" stroke-width="1.2"/>`).join('');
  return s;
}

const HOMES = [[385, 400, 40, 'roofC'], [598, 405, 38, 'roofA'], [580, 505, 40, 'roofB'], [205, 335, 34, 'thatch'], [812, 380, 34, 'roofC']];
const PROPS = [
  [392, () => cart(440, 392)], [520, () => well(630, 520)], [380, () => hay(560, 380)], [348, () => barrel(395, 348) + crate(405, 351)],
  [300, () => tree(560, 300, 10)], [312, () => tree(840, 312, 11, 'pine')], [470, () => flowers(450, 470)], [470, () => flowers(520, 470)], [515, () => barrel(320, 515) + crate(332, 517)],
];

/**
 * The whole village as SVG markup (980×620 units). `levels`: building id → level.
 * `homes`: how many villagers' houses (0-5), so the village fills up as it grows.
 */
export function villageSvg(levels, homes) {
  seed = 7;
  const lv = (id) => levels[id] ?? 0;
  let s = `<defs><linearGradient id="tf-v-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f6b33"/><stop offset="1" stop-color="#5d7a3a"/></linearGradient></defs><rect width="980" height="620" fill="url(#tf-v-bg)"/>`;
  s += `<ellipse cx="490" cy="335" rx="440" ry="225" fill="${P.grassLight}"/>`;
  for (let i = 0; i < 60; i++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()); s += `<ellipse cx="${f(490 + Math.cos(a) * d * 400)}" cy="${f(335 + Math.sin(a) * d * 200)}" rx="${f(10 + R() * 26)}" ry="${f(4 + R() * 7)}" fill="${R() < 0.5 ? P.grass : '#78964f'}" opacity="0.55"/>`; }
  const back = [];
  for (let i = 0; i < 70; i++) { const x = R() * 980, y = 20 + R() * 120; if (Math.hypot((x - 490) / 440, (y - 335) / 225) < 1.02) continue; if (nearOutside(x, y, 'back')) continue; back.push([x, y, 13 + R() * 9, R() < 0.35 ? 'pine' : 'round']); }
  back.sort((a, b) => a[1] - b[1]);
  for (const [x, y, r, k] of back) s += tree(x, y, r, k);
  const draw = (id) => { const [x, y] = LAYOUT[id]; const st = stageOf(lv(id)); return st === 0 ? plot(x, y, PLOT_W[id]) : BUILD[id](x, y, st); };
  for (const id of Object.keys(LAYOUT).filter((k) => layer(LAYOUT[k]) === 'back')) s += draw(id);
  s += wall(lv('wall'), true);
  // roads and the square
  s += `<path d="M490 345 L490 560 L500 620" stroke="${P.dirt}" stroke-width="30" fill="none" stroke-linecap="round"/><path d="M490 345 L490 560 L500 620" stroke="${P.dirtLight}" stroke-width="18" fill="none" stroke-linecap="round" opacity="0.5"/>`;
  s += `<path d="M490 340 Q380 330 300 310 M490 340 Q600 330 690 320 M490 340 Q470 390 470 430 M300 310 Q250 380 250 420 M690 320 Q740 400 760 450 M490 250 L490 340 M300 310 Q260 250 230 205 M690 320 Q660 250 640 215" stroke="${P.dirt}" stroke-width="14" fill="none" stroke-linecap="round" opacity="0.9"/>`;
  s += `<ellipse cx="490" cy="345" rx="70" ry="22" fill="${P.cobble}"/>`;
  for (let i = 0; i < 40; i++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()); s += `<ellipse cx="${f(490 + Math.cos(a) * d * 64)}" cy="${f(345 + Math.sin(a) * d * 19)}" rx="3" ry="1.6" fill="${P.cobbleDark}"/>`; }
  // inside, back to front
  const items = Object.keys(LAYOUT).filter((id) => layer(LAYOUT[id]) === 'in').map((id) => ({ y: LAYOUT[id][1], svg: draw(id) }));
  for (const [x, y, w, rf] of HOMES.slice(0, Math.max(0, Math.min(HOMES.length, homes)))) {
    items.push({ y, svg: house(x, y, w, 20, 15, { roof: P[rf], roofKind: rf === 'thatch' ? 'thatch' : 'tile', windows: 1, chimney: w > 36, smoke: w > 39, lit: w > 38 }) });
  }
  const props = Math.round((PROPS.length * Math.max(0, Math.min(5, homes))) / 5);
  for (const [y, make] of PROPS.slice(0, props)) items.push({ y, svg: make() });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) s += it.svg;
  s += wall(lv('wall'), false);
  for (const id of Object.keys(LAYOUT).filter((k) => layer(LAYOUT[k]) === 'front')) s += draw(id);
  const farm = stageOf(lv('farm'));
  if (farm > 0) s += fieldsPatch(800, 585, farm * 2);
  // front forest
  const front = [];
  for (let i = 0; i < 40; i++) { const x = R() * 980, y = 560 + R() * 80; if (Math.abs(x - 500) < 60 || (x > 300 && x < 720 && y < 600) || nearOutside(x, y, 'front') || (x > 690 && x < 920 && y < 625)) continue; front.push([x, y, 15 + R() * 10, R() < 0.3 ? 'pine' : 'round']); }
  for (let i = 0; i < 16; i++) { const left = i < 8; const x = left ? R() * 50 : 935 + R() * 45, y = 200 + R() * 330; front.push([x, y, 12 + R() * 7, 'round']); }
  front.sort((a, b) => a[1] - b[1]);
  for (const [x, y, r, k] of front) s += tree(x, y, r, k);
  return s;
}

// ---------- click areas ----------

/** Size of each building at its biggest stage, in scene units (width, height above its base). */
const HIT = {
  main: [170, 105], barracks: [110, 75], stable: [110, 65], garage: [100, 60], snob: [130, 100], smith: [86, 68],
  place: [90, 45], statue: [34, 52], market: [150, 46], storage: [100, 75], farm: [90, 70], hide: [50, 22],
  wood: [110, 55], stone: [110, 32], iron: [140, 72],
};
/** The clickable box of a building at its current level: [x, y, width, height] in scene units. */
export function hitbox(id, level) {
  const at = LAYOUT[id];
  const size = HIT[id];
  if (!at || !size) return null;
  const st = stageOf(level);
  const w = st === 0 ? PLOT_W[id] + 8 : size[0] * [0, 0.6, 0.82, 1][st];
  const h = st === 0 ? 26 : size[1] * [0, 0.65, 0.84, 1][st];
  return [at[0] - w / 2, at[1] - h + 4, w, h];
}
