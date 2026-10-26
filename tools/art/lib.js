// Shared 3D helpers for the Tribal Feud pre-renders: procedural textures, materials, parts, props and people.
import * as THREE from 'three';

/** Bake settings, set by the baker before building a scene. */
export const opts = { dusk: false, noPeople: false };
export let DUSK = new URLSearchParams(location.search).get('mode') === 'dusk';
export function setDusk(v) { DUSK = v; opts.dusk = v; M.window.color.set(v ? 0xffc560 : 0x2f3a44); M.window.emissive.set(v ? 0xffa030 : 0); M.window.emissiveIntensity = v ? 2.2 : 0; }

let seed = 7;
export const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
export const reseed = (s) => { seed = s >>> 0 || 1; };

// ---------- textures ----------
function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}
const jit = (base, amt) => { const k = (rnd() - 0.5) * amt; return `rgb(${Math.round(base[0] + k)},${Math.round(base[1] + k)},${Math.round(base[2] + k * 0.9)})`; };
function speckle(ctx, w, h, n, col, a) { ctx.fillStyle = col; ctx.globalAlpha = a; for (let i = 0; i < n; i++) ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); ctx.globalAlpha = 1; }
const stoneTex = (base = [168, 160, 146], mortar = '#6e6960') => canvasTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = mortar; ctx.fillRect(0, 0, w, h);
  const rows = 8, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rh * 0.7 : 0;
    while (x < w) {
      const bw = rh * (1.3 + rnd() * 0.9);
      ctx.fillStyle = jit(base, 34); ctx.fillRect(x + 1.5, r * rh + 1.5, bw - 3, rh - 3);
      const g = ctx.createLinearGradient(0, r * rh, 0, r * rh + rh);
      g.addColorStop(0, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(0,0,0,.2)');
      ctx.fillStyle = g; ctx.fillRect(x + 1.5, r * rh + 1.5, bw - 3, rh - 3);
      x += bw;
    }
  }
  speckle(ctx, w, h, 1400, '#000', 0.12); speckle(ctx, w, h, 600, '#fff', 0.08);
  for (let i = 0; i < 18; i++) { ctx.fillStyle = 'rgba(70,95,40,.25)'; ctx.beginPath(); ctx.ellipse(rnd() * w, h - rnd() * 40, 6 + rnd() * 14, 3 + rnd() * 6, 0, 0, 7); ctx.fill(); }
});
const plasterTex = (cols) => canvasTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#e4d6b4'; ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 2500, '#a08a60', 0.1);
  const beam = '#4a3220', bw = 12;
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, w, bw); ctx.fillRect(0, h - bw, w, bw); ctx.fillRect(0, h / 2 - bw / 2, w, bw);
  for (let i = 0; i <= cols; i++) ctx.fillRect((i * (w - bw)) / cols, 0, bw, h);
  ctx.lineWidth = 9; ctx.strokeStyle = beam;
  for (let i = 0; i < cols; i++) {
    const a = (i * (w - bw)) / cols + bw, b = ((i + 1) * (w - bw)) / cols;
    ctx.beginPath();
    if (i % 2) { ctx.moveTo(a, h / 2); ctx.lineTo(b, bw); } else { ctx.moveTo(a, bw); ctx.lineTo(b, h / 2); }
    ctx.stroke();
  }
  speckle(ctx, w, h, 800, '#000', 0.08);
});
const roofTex = (base) => canvasTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#3a1a12'; ctx.fillRect(0, 0, w, h);
  const rows = 10, rh = h / rows, tw = 22;
  for (let r = 0; r < rows; r++) for (let x = r % 2 ? -tw / 2 : 0; x < w; x += tw) {
    ctx.fillStyle = jit(base, 30);
    ctx.beginPath(); ctx.roundRect(x + 1, r * rh, tw - 2, rh + 3, [0, 0, 7, 7]); ctx.fill();
    const g = ctx.createLinearGradient(0, r * rh, 0, r * rh + rh);
    g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(0.35, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(255,255,255,.12)');
    ctx.fillStyle = g; ctx.fill();
  }
  speckle(ctx, w, h, 900, '#000', 0.12);
  for (let i = 0; i < 10; i++) { ctx.fillStyle = 'rgba(80,100,45,.22)'; ctx.beginPath(); ctx.ellipse(rnd() * w, rnd() * h, 5 + rnd() * 12, 3 + rnd() * 6, 0, 0, 7); ctx.fill(); }
});
const slateTex = () => canvasTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#20242a'; ctx.fillRect(0, 0, w, h);
  const rows = 12, rh = h / rows, tw = 18;
  for (let r = 0; r < rows; r++) for (let x = r % 2 ? -tw / 2 : 0; x < w; x += tw) { ctx.fillStyle = jit([78, 86, 98], 22); ctx.fillRect(x + 1, r * rh + 1, tw - 2, rh); }
  speckle(ctx, w, h, 700, '#fff', 0.06);
});
const thatchTex = () => canvasTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#9c7a3c'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { ctx.strokeStyle = jit([200, 160, 90], 70); ctx.globalAlpha = 0.6; const x = rnd() * w, y = rnd() * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 3, y + 10 + rnd() * 10); ctx.stroke(); }
  ctx.globalAlpha = 1;
  for (let r = 0; r < 6; r++) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, (r * h) / 6 + h / 6 - 5, w, 5); }
});
const woodTex = (base = [110, 78, 48]) => canvasTex(128, 128, (ctx, w, h) => {
  for (let x = 0; x < w; x += 16) { ctx.fillStyle = jit(base, 30); ctx.fillRect(x, 0, 15, h); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + 15, 0, 1, h); }
  for (let i = 0; i < 300; i++) { ctx.strokeStyle = 'rgba(40,25,10,.25)'; const x = rnd() * w; ctx.beginPath(); ctx.moveTo(x, rnd() * h); ctx.lineTo(x + (rnd() - 0.5) * 2, rnd() * h); ctx.stroke(); }
});
const grassTex = () => canvasTex(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#5f7f3a'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) { ctx.fillStyle = jit([95, 128, 58], 40); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 60, 12 + rnd() * 40, rnd() * 3, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 9000; i++) { ctx.strokeStyle = jit([110, 145, 70], 60); ctx.globalAlpha = 0.5; const x = rnd() * w, y = rnd() * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 3, y - 3 - rnd() * 4); ctx.stroke(); }
  ctx.globalAlpha = 1;
}, [10, 10]);
const dirtTex = () => canvasTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#9b7d55'; ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 3000, '#5a4630', 0.25); speckle(ctx, w, h, 1500, '#d8c09a', 0.2);
  for (let i = 0; i < 60; i++) { ctx.fillStyle = jit([150, 140, 125], 30); ctx.beginPath(); ctx.ellipse(rnd() * w, rnd() * h, 2 + rnd() * 4, 1.5 + rnd() * 3, rnd() * 3, 0, 7); ctx.fill(); }
}, [2, 2]);
const cobbleTex = () => canvasTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#5c5850'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { ctx.fillStyle = jit([150, 144, 132], 40); ctx.beginPath(); ctx.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 5, 5 + rnd() * 4, rnd() * 3, 0, 7); ctx.fill(); }
  speckle(ctx, w, h, 900, '#000', 0.15);
}, [3, 3]);
const fieldTex = (base) => canvasTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#6a5332'; ctx.fillRect(0, 0, w, h);
  for (let r = 0; r < 16; r++) { ctx.fillStyle = jit(base, 30); ctx.fillRect(0, r * 16 + 2, w, 10); for (let i = 0; i < 60; i++) { ctx.fillStyle = 'rgba(255,240,180,.25)'; ctx.fillRect(rnd() * w, r * 16 + 2 + rnd() * 8, 2, 3); } }
});
const clayTex = () => canvasTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#a5603a'; ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 3000, '#6e3a20', 0.3); speckle(ctx, w, h, 1500, '#d9915e', 0.25);
}, [2, 2]);
const rockTex = () => canvasTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#77736b'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 120; i++) { ctx.fillStyle = jit([130, 125, 116], 40); ctx.beginPath(); ctx.moveTo(rnd() * w, rnd() * h); for (let k = 0; k < 4; k++) ctx.lineTo(rnd() * w, rnd() * h); ctx.globalAlpha = 0.18; ctx.fill(); }
  ctx.globalAlpha = 1; speckle(ctx, w, h, 2000, '#000', 0.15);
});

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });
export const M = {
  stone: std({ map: stoneTex(), roughness: 0.95 }),
  stoneDark: std({ map: stoneTex([128, 122, 112], '#4e4a44'), roughness: 0.95 }),
  wood: std({ map: woodTex() }),
  woodLight: std({ map: woodTex([150, 112, 70]) }),
  beam: std({ color: 0x4a3220 }),
  dark: std({ color: 0x1e1712, roughness: 1 }),
  roofRed: std({ map: roofTex([176, 74, 52]), roughness: 0.8 }),
  roofOrange: std({ map: roofTex([196, 108, 60]), roughness: 0.8 }),
  roofBrown: std({ map: roofTex([128, 74, 50]), roughness: 0.85 }),
  slate: std({ map: slateTex(), roughness: 0.7 }),
  thatch: std({ map: thatchTex(), roughness: 1 }),
  grass: std({ map: grassTex(), roughness: 1 }),
  dirt: std({ map: dirtTex(), roughness: 1 }),
  cobble: std({ map: cobbleTex(), roughness: 1 }),
  wheat: std({ map: fieldTex([196, 164, 74]), roughness: 1 }),
  greens: std({ map: fieldTex([96, 130, 54]), roughness: 1 }),
  clay: std({ map: clayTex(), roughness: 1 }),
  rock: std({ map: rockTex(), roughness: 1, flatShading: true }),
  window: std({ color: DUSK ? 0xffc560 : 0x2f3a44, emissive: DUSK ? 0xffa030 : 0, emissiveIntensity: DUSK ? 2.2 : 0, roughness: 0.3 }),
  leaf: std({ color: 0x4d7230, roughness: 1, flatShading: true }),
  leafDark: std({ color: 0x35552a, roughness: 1, flatShading: true }),
  leafLight: std({ color: 0x6a8f3c, roughness: 1, flatShading: true }),
  bark: std({ color: 0x4a3320, roughness: 1 }),
  gold: std({ color: 0xe2a93b, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
  red: std({ color: 0xa8402d, side: THREE.DoubleSide }),
  blue: std({ color: 0x35558a, side: THREE.DoubleSide }),
  cloth: std({ color: 0xd9cfa0, side: THREE.DoubleSide }),
  flame: std({ color: 0xffb040, emissive: 0xff8a20, emissiveIntensity: 4 }),
  ember: std({ color: 0xff6a20, emissive: 0xff4a10, emissiveIntensity: 3 }),
  iron: std({ color: 0x3a3a3e, roughness: 0.55, metalness: 0.6 }),
  steel: std({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.8 }),
  water: std({ color: 0x3e6e8c, roughness: 0.15, metalness: 0.1 }),
  hay: std({ color: 0xd2ad5a, roughness: 1 }),
  marble: std({ color: 0xd8d2c6, roughness: 0.5 }),
  bronze: std({ color: 0x8a6a3a, roughness: 0.4, metalness: 0.7 }),
  skin: std({ color: 0xd9a77e }),
  horse: std({ color: 0x6b4428 }),
  horseDark: std({ color: 0x3a281a }),
  horseLight: std({ color: 0xc8b8a0 }),
};
const plasterCache = new Map();
export const plaster = (w) => {
  const cols = Math.max(2, Math.round(w / 1.1));
  if (!plasterCache.has(cols)) plasterCache.set(cols, std({ map: plasterTex(cols), roughness: 0.95 }));
  return plasterCache.get(cols);
};
export const lights = [];
export const movers = [];
export const people = [];
/** Every animation loops in exactly LOOP seconds, so baked frames repeat seamlessly. */
export const LOOP = 3.2, W = (2 * Math.PI) / LOOP;
export const anims = [];
export const smokes = []; // chimney tops: the game draws the smoke // (t) => void, called every frame
export const anim = (fn) => anims.push(fn);
export const flames = []; // { mesh, light? } for flicker
export const blockers = []; // { obj, x0, x1, z0, z1 } solid boxes in obj's local space
export const gates = []; // { obj, x0, x1, z0, z1 } one-way passages in obj's local space // every figure, so walkers can avoid them // { obj, v: [dx, dz] } people that walk in animated renders // [x,y,z,color,intensity,distance] collected, added by the renderer (dusk only)

// ---------- primitives ----------
export const sh = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
const UVSCALED = new Set();
export function box(g, w, h, d, mat, x = 0, y = 0, z = 0, ry = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (mat === M.stone || mat === M.stoneDark || mat === M.wood || mat === M.woodLight || mat === M.rock || UVSCALED.has(mat)) {
    const uv = geo.attributes.uv, n = geo.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
      const su = nx > 0.5 ? d : w, sv = ny > 0.5 ? d : h;
      uv.setXY(i, uv.getX(i) * su * 0.45, uv.getY(i) * sv * 0.45);
    }
  }
  const m = sh(new THREE.Mesh(geo, mat));
  m.position.set(x, y + h / 2, z);
  m.rotation.y = ry;
  g.add(m);
  return m;
}
export function cyl(g, rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 12, open = false) {
  const m = sh(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat));
  m.position.set(x, y + h / 2, z); g.add(m); return m;
}
export function cone(g, r, h, mat, x = 0, y = 0, z = 0, seg = 12, rot = 0) {
  const m = sh(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat));
  m.position.set(x, y + h / 2, z); m.rotation.y = rot; g.add(m); return m;
}
export function group(parent, x = 0, z = 0, ry = 0, y = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g; }

/** Gable roof, ridge along x, eaves at y. */
export function gable(g, w, d, h, over, mat, x, y, z, gableMat) {
  const hw = w / 2 + over, hd = d / 2 + over * 0.8;
  const v = [], uv = [];
  const quad = (a, b, c, e, slope) => { v.push(...a, ...b, ...c, ...a, ...c, ...e); const U = hw, V = slope * 0.55; uv.push(0, 0, U, 0, U, V, 0, 0, U, V, 0, V); };
  const slope = Math.hypot(hd, h);
  quad([-hw, 0, hd], [hw, 0, hd], [hw, h, 0], [-hw, h, 0], slope);
  quad([hw, 0, -hd], [-hw, 0, -hd], [-hw, h, 0], [hw, h, 0], slope);
  // underside so the roof has thickness from below
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const mat2 = mat.clone(); mat2.side = THREE.DoubleSide;
  const roof = sh(new THREE.Mesh(geo, mat2));
  roof.position.set(x, y, z); g.add(roof);
  for (const s of [-1, 1]) box(g, w + over * 2, 0.12, 0.14, M.beam, x, y - 0.06, z + s * hd);
  for (const s of [-1, 1]) { // barge boards along the gable edges
    const len = Math.hypot(hd, h);
    for (const t of [-1, 1]) {
      const b = box(g, 0.1, 0.16, len, M.beam, x + s * hw, y + h / 2 - 0.08, z + (t * hd) / 2);
      b.rotation.x = t * Math.atan2(h, hd);
    }
  }
  const gd = d / 2, tv = [];
  for (const s of [-1, 1]) { const X = (s * w) / 2; tv.push(X, 0, gd, X, 0, -gd, X, h * (gd / hd), 0); }
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute(tv, 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 0.5, 0, 0, 1, 0, 0.5, 0.5], 2));
  tri.computeVertexNormals();
  const gm = sh(new THREE.Mesh(tri, (gableMat ?? M.wood).clone()));
  gm.material.side = THREE.DoubleSide;
  gm.position.set(x, y, z); g.add(gm);
  box(g, w + over * 2 + 0.1, 0.16, 0.2, M.beam, x, y + h - 0.08, z);
  return roof;
}
/** Pyramid roof for square towers. */
export function pyramid(g, w, h, mat, x, y, z) { const m = sh(new THREE.Mesh(new THREE.ConeGeometry(w * 0.74, h, 4), mat)); m.rotation.y = Math.PI / 4; m.position.set(x, y + h / 2, z); g.add(m); return m; }

export function windowZ(g, x, y, z, w = 0.42, h = 0.48, shutters = true) {
  box(g, w + 0.16, h + 0.16, 0.08, M.beam, x, y - 0.08, z);
  box(g, w, h, 0.1, M.window, x, y, z + 0.02);
  box(g, w + 0.3, 0.08, 0.16, M.beam, x, y - 0.1, z + 0.05);
  if (shutters && !DUSK) for (const s of [-1, 1]) box(g, w * 0.5, h, 0.05, M.woodLight, x + s * (w * 0.78), y, z + 0.05);
}
export function windowX(g, x, y, z, w = 0.42, h = 0.48) {
  box(g, 0.08, h + 0.16, w + 0.16, M.beam, x, y - 0.08, z);
  box(g, 0.1, h, w, M.window, x + 0.02, y, z);
  box(g, 0.16, 0.08, w + 0.3, M.beam, x + 0.05, y - 0.1, z);
}
export function doorZ(g, x, y, z, w = 0.6, h = 0.95, mat = M.wood) {
  box(g, w + 0.2, h + 0.1, 0.1, M.beam, x, y, z);
  box(g, w, h, 0.14, mat, x, y, z + 0.02);
  const a = sh(new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.14, 16, 1, false, 0, Math.PI), mat));
  a.rotation.x = Math.PI / 2; a.rotation.z = Math.PI / 2; a.position.set(x, y + h, z + 0.02); g.add(a);
}
export function chimney(g, x, y, z, h, smoke = true) {
  box(g, 0.55, h, 0.55, M.stone, x, y, z); box(g, 0.7, 0.14, 0.7, M.stone, x, y + h, z);
  if (smoke) smokes.push({ obj: g, p: new THREE.Vector3(x, y + h + 0.2, z) });
  if (smoke) for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), new THREE.MeshStandardMaterial({ color: 0xcfc8bb, transparent: true, opacity: 0.4, roughness: 1, depthWrite: false }));
    g.add(s); s.userData.animated = true; s.userData.smoke = true; s.visible = false; const off = i / 4 + rnd() * 0.05;
    anim((t) => { const c = (t / LOOP + off) % 1; s.position.set(x + c * 0.9, y + h + 0.25 + c * 2.2, z - c * 0.3); s.scale.setScalar(0.6 + c * 1.6); s.material.opacity = 0.45 * Math.sin(Math.PI * Math.min(1, c * 1.15)); s.visible = false; });
  }
}
export function torch(g, x, y, z, k = 1) {
  box(g, 0.06, 0.4, 0.06, M.beam, x, y, z);
  box(g, 0.16, 0.12, 0.16, M.iron, x, y + 0.4, z);
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 8), M.flame); f.position.set(x, y + 0.65, z); g.add(f);
  flicker(f);
  if (DUSK) addLight(g, x, y + 0.75, z + 0.3, 0xff9a3a, 3.2 * k, 5);
}
export function flicker(f) { f.userData.animated = true; const y0 = f.position.y, ph = rnd() * 9; anim((t) => { const k = 1 + Math.sin(t * W * 9 + ph) * 0.12 + Math.sin(t * W * 15 + ph * 2) * 0.08; f.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k)); f.position.y = y0 + (k - 1) * 0.1; f.rotation.y = t * W + ph; }); }
export function addLight(g, x, y, z, col, i, d) { const p = new THREE.Vector3(x, y, z); lights.push({ obj: g, p, col, i, d }); }
export function crenels(g, x, y, z, w, d, sides = 'all') {
  box(g, w + 0.3, 0.25, d + 0.3, M.stone, x, y, z);
  const n = Math.max(3, Math.round(w / 0.55)), m = Math.max(3, Math.round(d / 0.55));
  for (let i = 0; i < n; i += 2) { const cx = x - w / 2 + ((i + 0.5) * w) / n; box(g, w / n, 0.45, 0.3, M.stone, cx, y + 0.25, z + d / 2); if (sides === 'all') box(g, w / n, 0.45, 0.3, M.stone, cx, y + 0.25, z - d / 2); }
  for (let i = 0; i < m; i += 2) { const cz = z - d / 2 + ((i + 0.5) * d) / m; box(g, 0.3, 0.45, d / m, M.stone, x + w / 2, y + 0.25, cz); box(g, 0.3, 0.45, d / m, M.stone, x - w / 2, y + 0.25, cz); }
}
export function flag(g, x, y, z, mat = M.gold, h = 1.6) {
  box(g, 0.07, h, 0.07, M.beam, x, y, z);
  const geo = new THREE.PlaneGeometry(0.9, 0.55, 6, 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) + 0.45) * 5) * 0.06);
  const m = new THREE.Mesh(geo, mat); m.position.set(x + 0.48, y + h - 0.3, z); m.castShadow = true; m.userData.animated = true; g.add(m);
  const base = p.array.slice(), ph = rnd() * 6;
  anim((t) => { for (let i = 0; i < p.count; i++) { const u = base[i * 3] + 0.45; p.setZ(i, Math.sin(u * 6 - t * W * 4 + ph) * 0.09 * u); } p.needsUpdate = true; geo.computeVertexNormals(); });
}
export function bannerZ(g, x, y, z, mat = M.gold, w = 0.5, h = 1.1) { const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); b.position.set(x, y, z); g.add(b); const t = new THREE.Mesh(new THREE.ConeGeometry(w * 0.36, h * 0.2, 3), mat); void t; }

/** Half-timber house with stone plinth, optional jettied upper floor and gable roof. Faces +z. */
export function house(g, x, z, w, d, o = {}) {
  const base = 0.45, f1 = o.f1 ?? 1.5, f2 = o.f2 ?? 1.3, jet = 0.18;
  box(g, w, base, d, M.stone, x, 0, z);
  box(g, w, f1, d, o.wall ?? plaster(w), x, base, z);
  let top = base + f1;
  if (f2) { box(g, w + jet * 2, 0.14, d + jet * 2, M.beam, x, top, z); box(g, w + jet * 2, f2, d + jet * 2, o.wall2 ?? plaster(w), x, top + 0.14, z); top += f2 + 0.14; }
  const roofH = o.roofH ?? d * 0.55;
  gable(g, w + (f2 ? jet * 2 : 0), d + (f2 ? jet * 2 : 0), roofH, 0.35, o.roof ?? M.roofRed, x, top, z, o.gableMat ?? plaster(w));
  const fz = z + d / 2;
  if (o.door !== false) doorZ(g, x + (o.doorX ?? 0), base, fz + 0.01, o.doorW ?? 0.6, o.doorH ?? 0.95);
  const nw = Math.max(1, Math.floor(w / 1.5));
  for (let i = 0; i < nw; i++) {
    const wx = x - w / 2 + ((i + 0.5) * w) / nw;
    if (o.door === false || Math.abs(wx - x - (o.doorX ?? 0)) > 0.6) windowZ(g, wx, base + 0.7, fz + 0.02);
    if (f2) windowZ(g, wx, base + f1 + 0.5, fz + jet + 0.02);
  }
  windowX(g, x + w / 2 + (f2 ? jet : 0) + 0.02, base + f1 + (f2 ? 0.5 : -0.8), z);
  if (o.chimney) chimney(g, x + w * 0.28, top + roofH * 0.3, z - d * 0.15, roofH * 0.9, o.smoke !== false);
  return top + roofH;
}

// ---------- props ----------
export function barrel(g, x, z, y = 0) { cyl(g, 0.22, 0.22, 0.5, M.wood, x, y, z); for (const yy of [0.1, 0.4]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.02, 4, 16), M.iron); r.rotation.x = Math.PI / 2; r.position.set(x, y + yy, z); g.add(r); } }
export function crate(g, x, z, s = 0.45, y = 0) { box(g, s, s, s, M.woodLight, x, y, z, rnd()); }
export function sack(g, x, z) { const m = sh(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M.cloth)); m.scale.set(1, 1.2, 0.9); m.position.set(x, 0.2, z); g.add(m); }
export function hay(g, x, z, r = 0.4) { const m = sh(new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 1.3, 14), M.hay)); m.rotation.z = Math.PI / 2; m.rotation.y = rnd() * 3; m.position.set(x, r, z); g.add(m); }
export function logs(g, x, z, n = 6, ry = 0) {
  const gg = group(g, x, z, ry);
  let k = 0;
  for (let row = 0; k < n; row++) for (let i = 0; i < 4 - row && k < n; i++, k++) { const l = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 8), M.wood)); l.rotation.z = Math.PI / 2; l.position.set(0, 0.16 + row * 0.28, (i - (3 - row) / 2) * 0.32); gg.add(l); }
}
export function fence(g, pts, h = 0.6) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1), a = -Math.atan2(z2 - z1, x2 - x1);
    for (const yy of [0.25, 0.5]) box(g, len, 0.06, 0.06, M.woodLight, (x1 + x2) / 2, yy * h / 0.6, (z1 + z2) / 2, a);
    const n = Math.max(1, Math.round(len / 0.9));
    for (let k = 0; k <= n; k++) box(g, 0.1, h + 0.1, 0.1, M.wood, x1 + ((x2 - x1) * k) / n, 0, z1 + ((z2 - z1) * k) / n);
  }
}
export function tree(g, x, z, s = 1) {
  cyl(g, 0.1 * s, 0.16 * s, 1.1 * s, M.bark, x, 0, z, 6);
  const mats = [M.leaf, M.leafDark, M.leafLight];
  for (let i = 0; i < 4; i++) { const r = (0.55 + rnd() * 0.35) * s; const b = sh(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mats[Math.floor(rnd() * 3)])); b.position.set(x + (rnd() - 0.5) * 0.7 * s, (1.25 + rnd() * 0.7) * s, z + (rnd() - 0.5) * 0.7 * s); b.scale.y = 0.85; g.add(b); }
}
export function pine(g, x, z, s = 1) { cyl(g, 0.08 * s, 0.12 * s, 0.6 * s, M.bark, x, 0, z, 6); for (let i = 0; i < 3; i++) cone(g, (0.85 - i * 0.22) * s, 1.0 * s, M.leafDark, x, (0.4 + i * 0.55) * s, z, 7, rnd()); }
export function bush(g, x, z, s = 0.5) { for (let i = 0; i < 3; i++) { const b = sh(new THREE.Mesh(new THREE.IcosahedronGeometry(s * (0.7 + rnd() * 0.4), 0), rnd() < 0.5 ? M.leaf : M.leafLight)); b.position.set(x + (rnd() - 0.5) * s, s * 0.5, z + (rnd() - 0.5) * s); g.add(b); } }
export function rock(g, x, z, s = 0.6) { const r = sh(new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), M.rock)); r.position.set(x, s * 0.45, z); r.scale.y = 0.7; r.rotation.set(rnd(), rnd() * 3, rnd()); g.add(r); return r; }
export function well(g, x, z) {
  cyl(g, 0.6, 0.65, 0.6, M.stone, x, 0, z, 14);
  cyl(g, 0.48, 0.48, 0.05, M.water, x, 0.5, z, 14);
  for (const s of [-1, 1]) box(g, 0.1, 1.2, 0.1, M.beam, x + s * 0.55, 0.6, z);
  box(g, 1.3, 0.08, 0.08, M.beam, x, 1.7, z);
  const r = sh(new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.6, 4), M.roofRed)); r.rotation.y = Math.PI / 4; r.position.set(x, 2.05, z); g.add(r);
  cyl(g, 0.12, 0.12, 0.2, M.wood, x, 1.1, z, 8);
}
export function brazier(g, x, z, s = 1) {
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.9 * s), M.iron); l.position.set(x + Math.cos(a) * 0.18 * s, 0.42 * s, z + Math.sin(a) * 0.18 * s); l.rotation.z = Math.cos(a) * 0.3; l.rotation.x = -Math.sin(a) * 0.3; g.add(l); }
  const bowl = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.38 * s, 0.22 * s, 0.22 * s, 12, 1, true), M.iron)); bowl.material = M.iron.clone(); bowl.material.side = THREE.DoubleSide; bowl.position.set(x, 0.9 * s, z); g.add(bowl);
  for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry((0.14 - i * 0.02) * s, (0.5 - i * 0.08) * s, 8), M.flame); f.position.set(x + (i - 1) * 0.12 * s, 1.2 * s, z + (i % 2) * 0.06 * s); g.add(f); flicker(f); }
  if (DUSK) addLight(g, x, 1.7 * s, z, 0xff9030, 16 * s, 9 * s);
}
export function cart(g, x, z, ry = 0) {
  const c = group(g, x, z, ry);
  box(c, 1.2, 0.35, 0.7, M.woodLight, 0, 0.35, 0);
  for (const s of [-1, 1]) { const w = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12), M.wood)); w.rotation.x = Math.PI / 2; w.position.set(-0.1, 0.3, s * 0.4); c.add(w); }
  box(c, 0.9, 0.05, 0.05, M.beam, 1.0, 0.45, 0.15); box(c, 0.9, 0.05, 0.05, M.beam, 1.0, 0.45, -0.15);
  sack(c, -0.2, 0); c.children.at(-1).position.y = 0.85; crate(c, 0.25, 0.1, 0.35, 0.7);
  return c;
}

// ---------- people ----------
const TUNICS = [0x7a4a2a, 0x5a6a3a, 0x8a3a2a, 0x4a5a7a, 0x9a8a5a, 0x6a4a6a, 0x3a5a4a];
/** A small low-poly figure, 0.8 tall, facing +z. kind: villager | soldier | archer | knight | smith | noble */
export function person(g, x, z, ry = 0, o = {}) {
  const kind = o.kind ?? 'villager';
  const p = opts.noPeople ? new THREE.Group() : group(g, x, z, ry);
  if (opts.noPeople) p.position.set(x, 0, z);
  people.push(p);
  const tunic = std({ color: o.color ?? (kind === 'soldier' || kind === 'knight' ? 0x8a2d22 : TUNICS[Math.floor(rnd() * TUNICS.length)]) });
  const legs = std({ color: kind === 'soldier' ? 0x3a3530 : 0x4a3a2a });
  const U = (p.userData = { legs: [], arms: [], animated: true });
  for (const s of [-1, 1]) { const lg = new THREE.CylinderGeometry(0.05, 0.045, 0.34, 6); lg.translate(0, -0.17, 0); const l = sh(new THREE.Mesh(lg, legs)); l.position.set(s * 0.07, 0.34, 0); p.add(l); U.legs.push(l); }
  const torso = group(p, 0, 0, 0); U.torso = torso;
  const body = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.36, 8), tunic)); body.position.y = 0.5; torso.add(body);
  if (kind === 'soldier' || kind === 'knight') { const mail = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.12, 0.2, 8), M.steel)); mail.position.y = 0.6; torso.add(mail); }
  for (const s of [-1, 1]) { const ag = new THREE.CylinderGeometry(0.035, 0.03, 0.3, 6); ag.translate(0, -0.15, 0); const a = sh(new THREE.Mesh(ag, tunic)); a.position.set(s * 0.15, 0.67, 0); a.rotation.z = s * 0.15; torso.add(a); U.arms.push(a); }
  const head = sh(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), M.skin)); head.position.y = 0.77; torso.add(head); U.head = head;
  if (kind === 'soldier' || kind === 'knight') { const h = sh(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.14, 8), M.steel)); h.position.y = 0.86; torso.add(h); }
  else if (o.hat !== false && rnd() < 0.5) { const h = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.06, 8), std({ color: 0x6a5032 }))); h.position.y = 0.84; torso.add(h); }
  else { const hair = sh(new THREE.Mesh(new THREE.SphereGeometry(0.092, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: [0x3a2a1a, 0x8a6a3a, 0x1a1410][Math.floor(rnd() * 3)] }))); hair.position.y = 0.79; torso.add(hair); }
  const R = U.arms[1]; // right arm: tools hang from the hand (local y = -0.3)
  if (kind === 'soldier') {
    const spear = group(R, 0, 0, 0); spear.position.set(0, -0.28, 0.02); U.spear = spear;
    const sp = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.25, 5), M.beam)); sp.position.y = 0.25; spear.add(sp);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5), M.steel); tip.position.y = 0.92; spear.add(tip);
    const shd = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 10), std({ color: 0xa8402d }))); shd.rotation.x = Math.PI / 2; shd.position.set(-0.13, 0.5, 0.12); torso.add(shd);
  }
  if (kind === 'archer') { const b = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 4, 12, Math.PI), M.beam); b.rotation.z = Math.PI / 2; b.position.set(0, -0.3, 0); U.arms[0].add(b); U.bow = b; }
  if (kind === 'smith' || o.tool === 'hammer') { if (kind === 'smith') { const ap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.02), std({ color: 0x3a2a1a })); ap.position.set(0, 0.48, 0.15); torso.add(ap); } const h = group(R, 0, 0, 0); h.position.y = -0.3; box(h, 0.02, 0.24, 0.02, M.beam, 0, -0.02, 0.06).rotation.x = Math.PI / 2; box(h, 0.07, 0.07, 0.12, M.iron, 0, -0.035, 0.2); }
  if (o.tool === 'axe' || o.carry === 'axe') { const h = group(R, 0, 0, 0); h.position.y = -0.3; box(h, 0.025, 0.5, 0.025, M.beam, 0, -0.02, 0.22).rotation.x = Math.PI / 2; box(h, 0.03, 0.14, 0.1, M.steel, 0, -0.06, 0.44); }
  if (o.carry === 'sack') { const s = sh(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), M.cloth)); s.position.set(0, 0.68, -0.13); torso.add(s); }
  if (o.carry === 'basket') { const b = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.1, 8), M.hay)); b.position.set(0, -0.32, 0.03); U.arms[1].add(b); }
  return p;
}
/** Walk pose from distance travelled; standing still = legs together. */
export function walkPose(p, dist, moving) {
  const ph = dist * 9.5, a = moving ? Math.sin(ph) * 0.5 : 0;
  p.userData.legs[0].rotation.x = a; p.userData.legs[1].rotation.x = -a;
  p.userData.arms[0].rotation.x = -a * 0.7; if (!p.userData.busyArm) p.userData.arms[1].rotation.x = a * 0.7;
  p.userData.torso.position.y = moving ? Math.abs(Math.sin(ph)) * 0.025 : 0;
}
/** A low-poly horse, 1.2 long, facing +x. graze: lowers its head now and then. */
export function horseFig(g, x, z, ry = 0, mat = M.horse, o = {}) {
  const h = group(g, x, z, ry);
  h.userData.animated = true;
  box(h, 0.9, 0.38, 0.32, mat, 0, 0.55, 0);
  for (const [lx, lz] of [[-0.35, -0.11], [-0.35, 0.11], [0.35, -0.11], [0.35, 0.11]]) box(h, 0.08, 0.55, 0.08, mat, lx, 0, lz);
  const neck = group(h, 0.36, 0, 0, 0.82); // pivot at the shoulder
  box(neck, 0.22, 0.45, 0.2, mat, 0.06, -0.05, 0).rotation.z = -0.5;
  box(neck, 0.36, 0.16, 0.16, mat, 0.26, 0.26, 0).rotation.z = -0.3;
  box(neck, 0.3, 0.18, 0.05, M.horseDark, 0.09, 0.13, 0).rotation.z = -0.5;
  const tail = group(h, -0.45, 0, 0, 0.88);
  const tm = box(tail, 0.06, 0.38, 0.06, M.horseDark, 0, -0.38, 0); void tm;
  tail.rotation.z = 0.35;
  const seed0 = rnd() * 10;
  anim((t) => {
    tail.rotation.x = Math.sin(t * W * 2 + seed0) * 0.35 * Math.max(0, Math.sin(t * W + seed0));
    if (o.graze) { const c = (t / LOOP + seed0 / 10) % 1; const down = c < 0.5 ? Math.sin(c * 2 * Math.PI) : 0; neck.rotation.z = -down * 1.1; }
    else neck.rotation.z = Math.sin(t * W + seed0) * 0.06;
  });
  return h;
}

// ---------- actions (looping, in place) ----------
const ease = (x) => x * x * (3 - 2 * x);
/** Raise the right arm and bring it down hard every `period` s; onHit fires at the strike. */
export function hammering(p, period = 1.1, ph = rnd(), onHit = null, big = false) {
  period = LOOP / Math.max(1, Math.round(LOOP / period));
  const A = p.userData.arms[1]; p.userData.busyArm = true;
  let last = -1;
  anim((t) => {
    const c = (t / period + ph) % 1;
    const up = c < 0.7 ? ease(c / 0.7) : 1 - ease((c - 0.7) / 0.3);
    A.rotation.x = -0.5 - up * (big ? 2.6 : 2.0);
    p.userData.torso.rotation.x = big ? -up * 0.15 + (1 - up) * 0.12 : 0;
    const n = Math.floor(t / period + ph);
    if (c > 0.97 && n !== last) { last = n; onHit?.(t); }
  });
}
/** Two-arm overhead chop. */
export function chopping(p, period = 1.4, ph = rnd(), onHit) {
  hammering(p, period, ph, onHit, true);
  const L = p.userData.arms[0];
  anim((t) => { L.rotation.x = p.userData.arms[1].rotation.x * 0.9; L.rotation.z = -0.35; });
}
export function waving(p, ph = rnd()) { const A = p.userData.arms[1]; p.userData.busyArm = true; anim((t) => { const on = Math.sin(t * W + ph * 6) > -0.2; A.rotation.x = on ? -2.3 + Math.sin(t * W * 4) * 0.25 : -0.1; A.rotation.z = on ? 0.35 : 0.15; }); }
export function idle(p, ph = rnd()) { anim((t) => { p.userData.torso.rotation.y = Math.sin(t * W + ph * 9) * 0.18; p.userData.head.rotation.y = Math.sin(t * W + ph * 5) * 0.4; p.userData.torso.rotation.z = Math.sin(t * W + ph * 7) * 0.025; });  return p; }
export function talking(p, ph = rnd()) { idle(p, ph); const A = p.userData.arms[0]; anim((t) => { const k = Math.max(0, Math.sin(t * W + ph * 7)); A.rotation.x = -k * 1.0 + Math.sin(t * W * 3) * 0.12 * k; A.rotation.z = -0.15 - k * 0.3; }); }
export function bending(p, ph = rnd()) { const T = p.userData.torso; anim((t) => { const c = (t / LOOP + ph) % 1; T.rotation.x = c < 0.5 ? Math.sin(c * 2 * Math.PI) * 0.6 : 0; p.userData.arms[1].rotation.x = -T.rotation.x * 1.4; }); }
/** Spear drill: lower spears together, thrust twice, raise again. */
export function drilling(p, period = 3.2) {
  const A = p.userData.arms[1], S = p.userData.spear; p.userData.busyArm = true;
  anim((t) => {
    const c = (t / period) % 1;
    const low = c < 0.15 ? ease(c / 0.15) : c < 0.8 ? 1 : 1 - ease((c - 0.8) / 0.2);
    const th = c > 0.2 && c < 0.75 ? Math.max(0, Math.sin(((c - 0.2) / 0.55) * Math.PI * 2 * 2)) : 0;
    const arm = -0.25 - low * 0.35 - th * 0.55;
    A.rotation.x = arm; S.rotation.x = low * (Math.PI / 2) - arm;
    p.userData.legs[0].rotation.x = -low * 0.3; p.userData.legs[1].rotation.x = low * 0.15;
  });
}
/** Sparks / chips: a few bits that fly out from a point after a hit. */
export function burst(g, x, y, z, mat, n = 6, spread = 0.6) {
  const bits = [];
  for (let i = 0; i < n; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), mat); b.visible = false; b.userData.animated = true; g.add(b); bits.push({ b, vx: (rnd() - 0.5) * spread * 2, vy: 0.6 + rnd() * 0.9, vz: (rnd() - 0.5) * spread * 2 }); }
  let t0 = -9;
  anim((t) => { const dt = t - t0; for (const s of bits) { s.b.visible = dt < 0.45; if (!s.b.visible) continue; s.b.position.set(x + s.vx * dt, y + s.vy * dt - 4.5 * dt * dt, z + s.vz * dt); } });
  return (t) => { t0 = t; };
}
export const SPARK = new THREE.MeshStandardMaterial({ color: 0xffd070, emissive: 0xffa020, emissiveIntensity: 5 });

// ---------- fixed routes (no avoidance needed: one-way loops with fixed spacing, or a lane of one's own) ----------
function polyLen(pts, closed) { let L = 0; const n = closed ? pts.length : pts.length - 1; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); } return L; }
function polyAt(pts, closed, s) {
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (s <= L || i === n - 1) { const k = Math.min(1, s / L); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[0] - a[0], b[1] - a[1])]; } s -= L; }
}
/** Walk a closed loop forever at constant speed, starting `offset` metres in. */
export function loopRoute(p, pts, speed = 0.8, offset = 0) {
  p.userData.moving = true;
  const L = polyLen(pts, true);
  anim((t) => { const s = (offset + t * speed) % L; const [x, z] = polyAt(pts, true, s); const [x2, z2] = polyAt(pts, true, (s + 0.25) % L); p.position.x = x; p.position.z = z; p.rotation.y = Math.atan2(x2 - x, z2 - z); walkPose(p, t * speed, true); });
}
/** Back and forth between a and b: walk, stop, turn around on the spot, walk back. */
export function shuttle(p, a, b, speed = 0.7, pause = 1.4, ph = 0, onStop = null) {
  p.userData.moving = true;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), walkT = L / speed, turnT = 0.7, cyc = 2 * (walkT + pause + turnT);
  const head = Math.atan2(b[0] - a[0], b[1] - a[1]);
  anim((t) => {
    let c = (t + ph * cyc) % cyc; let k, dir, moving = false, rot, dist = 0;
    const leg = (c0) => { if (c0 < walkT) { moving = true; dist = c0 * speed; return [c0 / walkT, 0]; } if (c0 < walkT + pause) return [1, 0]; return [1, Math.min(1, (c0 - walkT - pause) / turnT)]; };
    if (c < cyc / 2) { const [u, tt] = leg(c); k = u; rot = head + tt * Math.PI; dir = 1; }
    else { const [u, tt] = leg(c - cyc / 2); k = 1 - u; rot = head + Math.PI + tt * Math.PI; dir = -1; }
    p.position.x = a[0] + (b[0] - a[0]) * k; p.position.z = a[1] + (b[1] - a[1]) * k; p.rotation.y = rot;
    if (p.userData.legs) walkPose(p, dist, moving);
    onStop?.(!moving && (c % (cyc / 2)) >= walkT, dir);
  });
}
