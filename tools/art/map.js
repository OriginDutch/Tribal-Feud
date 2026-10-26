// Map mockup: villages in 6 sizes on a north-up grid, light front view, with terrain.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { M, DUSK, lights, opts, reseed, rnd, group, box, cyl, cone, gable, house, tree, pine, bush, rock, crenels, flag, torch, pyramid, sh } from './lib.js';

opts.noPeople = true;
const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'map';
const F = 4; // field size in world units
const COLS = Number(q.get('cols') ?? 12), ROWS = Number(q.get('rows') ?? 8);
const scene = new THREE.Scene();
scene.background = new THREE.Color(DUSK ? 0x1a2014 : 0x5f7f3a);
const root = new THREE.Group(); scene.add(root);

// ---------- villages ----------
const ROOFS = () => [M.roofRed, M.roofOrange, M.roofBrown, M.thatch];
function hut(g, x, z, ry, s, roof) { const h = group(g, x, z, ry); h.scale.setScalar(s); house(h, 0, 0, 1.8, 1.6, { f1: 1.1, f2: 0, roof, roofH: 1.0, chimney: rnd() < 0.4 }); }
function stakes(g, rx, rz, h = 0.7) { const n = Math.round((rx + rz) * 9); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const x = Math.cos(a) * rx, z = Math.sin(a) * rz; if (Math.abs(x) < 0.3 && z > 0) continue; cyl(g, 0.05, 0.06, h, M.wood, x, 0, z, 5); cone(g, 0.05, 0.12, M.woodLight, x, h, z, 5); } }
function stoneRing(g, rx, rz, h, towers, roofed) {
  const N = 20;
  for (let i = 0; i < N; i++) {
    const a1 = (i / N) * Math.PI * 2, a2 = ((i + 1) / N) * Math.PI * 2;
    const x1 = Math.cos(a1) * rx, z1 = Math.sin(a1) * rz, x2 = Math.cos(a2) * rx, z2 = Math.sin(a2) * rz;
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2; if (Math.abs(mx) < 0.35 && mz > 0) continue;
    const len = Math.hypot(x2 - x1, z2 - z1) + 0.12;
    const seg = group(g, mx, mz, -Math.atan2(z2 - z1, x2 - x1));
    box(seg, len, h, 0.28, M.stone, 0, 0, 0);
    if (i % 2 === 0) box(seg, len * 0.45, 0.14, 0.3, M.stone, 0, h, 0);
  }
  for (let k = 0; k < towers; k++) { const a = (k / towers) * Math.PI * 2 + (towers === 2 ? 0 : Math.PI / towers); const x = Math.cos(a) * rx, z = Math.sin(a) * rz; cyl(g, 0.32, 0.35, h + 0.55, M.stone, x, 0, z, 10); if (roofed) cone(g, 0.42, 0.55, M.roofRed, x, h + 0.55, z, 10); else crenels(g, x, h + 0.55, z, 0.45, 0.45); }
  // gate
  for (const s of [-1, 1]) box(g, 0.32, h + 0.35, 0.36, M.stone, s * 0.36, 0, rz);
}
function keep(g, x, z, w, h, roof) { box(g, w, h, w, M.stone, x, 0, z); if (roof) pyramid(g, w + 0.2, w * 0.9, M.slate, x, h, z); else crenels(g, x, h, z, w * 0.9, w * 0.9); }

/** One village on a field centred at (0,0), tier 0..5. */
function village(g, tier, seed) {
  reseed(seed);
  const R = ROOFS();
  const pick = () => R[Math.floor(rnd() * (tier < 2 ? 4 : 3))];
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(1, 28), M.dirt); dirt.rotation.x = -Math.PI / 2; dirt.scale.set(0.9 + tier * 0.17, 0.8 + tier * 0.15, 1); dirt.position.y = 0.015; dirt.receiveShadow = true; g.add(dirt);
  const spots = [[-0.55, -0.3], [0.55, -0.35], [-0.6, 0.45], [0.55, 0.5], [0, -0.75], [-0.95, 0.05], [0.95, 0.05], [0.1, 0.85]];
  const nh = [2, 4, 5, 5, 4, 5][tier];
  const s = [0.36, 0.38, 0.38, 0.36, 0.34, 0.34][tier];
  const spread = [0.8, 0.9, 0.95, 1.05, 1.1, 1.15][tier];
  for (let i = 0; i < nh; i++) { const [x, z] = spots[(i + (tier >= 3 ? 1 : 0)) % spots.length]; if (tier >= 3 && Math.hypot(x, z) < 0.5) continue; hut(g, x * spread, z * spread, (rnd() - 0.5) * 0.8, s, tier === 0 ? M.thatch : pick()); }
  if (tier === 0) { box(g, 0.6, 0.02, 0.4, M.wheat, 0.6, 0, 0.7); }
  if (tier === 2) stakes(g, 1.45, 1.25);
  if (tier === 3) { stakes(g, 1.55, 1.35, 0.8); const h = group(g, 0, -0.1, 0); h.scale.setScalar(0.42); house(h, 0, 0, 3.2, 2.2, { f2: 1.1, roof: M.roofRed, chimney: true }); flag(g, 0.75, -0.3, -0.2, M.gold, 1.1); }
  if (tier === 4) { stoneRing(g, 1.55, 1.38, 0.55, 2, false); keep(g, 0, -0.2, 0.95, 1.2, true); flag(g, 0.3, 1.2, -0.45, M.gold, 0.6); }
  if (tier === 5) { stoneRing(g, 1.7, 1.5, 0.7, 4, true); keep(g, 0, -0.1, 0.95, 2.1, true); flag(g, 0, 2.95, -0.1, M.gold, 0.7); const w = group(g, 0.85, -0.55, 0); w.scale.setScalar(0.32); house(w, 0, 0, 2.6, 2, { f2: 1.0, roof: M.roofOrange }); }
  if (DUSK && tier >= 3) torch(g, 0.3, 0.1, 1.3, 0.6);
}

// ---------- terrain ----------
function hash(i, j, s = 1) { const x = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return x - Math.floor(x); }
const tiers = [];
const RIVER = (t) => [(-0.5 + t * (COLS + 1)) * F, (1.2 + Math.sin(t * 5.2) * 1.4 + t * (ROWS - 2.8)) * F];
const riverPts = []; for (let i = 0; i <= 80; i++) riverPts.push(RIVER(i / 80));
const nearRiver = (x, z, d) => riverPts.some(([rx, rz]) => Math.hypot(rx - x, rz - z) < d);
const HILLS = [[2.5, 6.0, 1.6], [9.5, 1.2, 1.9], [6.3, 0.6, 1.1]];
const inHill = (cx, cz) => HILLS.some(([hx, hy, r]) => Math.hypot(cx - hx * F, cz - hy * F) < r * F * 0.75);
const FORESTS = [[0.5, 3.4], [1.3, 4.0], [0.6, 4.6], [10.6, 4.2], [11.3, 4.9], [10.9, 3.4], [5.4, 7.6], [6.2, 7.8], [3.4, 0.3], [11.4, 7.4], [8.2, 3.0], [7.6, 5.6]];
const inForest = (cx, cz) => FORESTS.some(([fx, fz]) => Math.hypot(cx - fx * F, cz - fz * F) < F * 0.8);
const OWN = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const cx = (c + 0.5) * F, cz = (r + 0.5) * F;
  if (nearRiver(cx, cz, F * 0.85) || inHill(cx, cz) || inForest(cx, cz)) continue;
  if (hash(c, r) < 0.42) continue;
  const p = hash(c, r, 2), tier = p < 0.18 ? 0 : p < 0.36 ? 1 : p < 0.58 ? 2 : p < 0.78 ? 3 : p < 0.92 ? 4 : 5;
  const owner = hash(c, r, 3) < 0.35 ? 2 : 1;
  tiers.push({ c, r, tier, owner });
}
for (const [c, r, t] of [[5, 2, 5], [6, 2, 3], [4, 2, 4], [5, 1, 2]]) { const i = tiers.findIndex((v) => v.c === c && v.r === r); const v = { c, r, tier: t, owner: 0 }; if (i >= 0) tiers[i] = v; else tiers.push(v); }

function ground() {
  const W = COLS * F, H = ROWS * F;
  const geo = new THREE.PlaneGeometry(W + 8, H + 8, 160, 110);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + W / 2, z = -p.getY(i) + H / 2;
    let y = 0;
    for (const [hx, hz, r] of HILLS) { const d = Math.hypot(x - hx * F, z - hz * F) / (r * F); if (d < 1) y += Math.pow(Math.cos(d * Math.PI / 2), 2) * r * 2.2; }
    y += (hash(Math.floor(x * 2), Math.floor(z * 2), 9) - 0.5) * 0.05;
    let dr = Infinity; for (const [rx, rz] of riverPts) dr = Math.min(dr, Math.hypot(rx - x, rz - z));
    if (dr < 1.6) y -= (1 - dr / 1.6) * 0.45;
    p.setZ(i, y);
  }
  geo.computeVertexNormals();
  const g = new THREE.Mesh(geo, M.grass.clone()); g.material.map = M.grass.map.clone(); g.material.map.repeat.set(14, 10); g.material.map.needsUpdate = true;
  g.rotation.x = -Math.PI / 2; g.position.set(W / 2, 0, H / 2); g.receiveShadow = true; root.add(g);
  // river surface
  const path = new THREE.CatmullRomCurve3(riverPts.map(([x, z]) => new THREE.Vector3(x, -0.12, z)));
  const shape = []; const N = 200;
  const left = [], right = [];
  for (let i = 0; i <= N; i++) { const t = i / N; const a = path.getPoint(t), d = path.getTangent(t); const n = new THREE.Vector3(-d.z, 0, d.x).normalize(); const w = 1.05 + Math.sin(t * 17) * 0.18; left.push(a.clone().addScaledVector(n, w)); right.push(a.clone().addScaledVector(n, -w)); }
  const v = []; for (let i = 0; i < N; i++) { const a = left[i], b = right[i], c = left[i + 1], d = right[i + 1]; v.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z); }
  void shape;
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); rg.computeVertexNormals();
  const water = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: DUSK ? 0x23465e : 0x3f7aa0, roughness: 0.12, metalness: 0.2, side: THREE.DoubleSide }));
  water.receiveShadow = true; root.add(water);
  // bridge where the river is crossed by the road between my villages
  const bt = 0.62, bp = path.getPoint(bt), bd = path.getTangent(bt);
  const br = group(root, bp.x, bp.z, -Math.atan2(bd.z, bd.x), 0.05); box(br, 0.9, 0.1, 3.0, M.woodLight, 0, 0, 0); for (const s of [-1, 1]) box(br, 0.06, 0.25, 3.0, M.beam, s * 0.42, 0.1, 0);
  // rocks on hills
  for (const [hx, hz, r] of HILLS) for (let k = 0; k < 6; k++) { const a = hash(k, hx, 5) * 6.28, d = hash(k, hz, 6) * r * F * 0.5; const rr = rock(root, hx * F + Math.cos(a) * d, hz * F + Math.sin(a) * d, 0.3 + hash(k, 1, 7) * 0.35); let y = 0; const dd = d / (r * F); y = Math.pow(Math.cos(dd * Math.PI / 2), 2) * r * 2.2; rr.position.y += y - 0.1; }
  // forests
  reseed(77);
  for (const [fx, fz] of FORESTS) for (let k = 0; k < 9; k++) { const x = fx * F + (rnd() - 0.5) * F * 1.3, z = fz * F + (rnd() - 0.5) * F * 1.0; if (nearRiver(x, z, 1.4)) continue; (rnd() < 0.55 ? pine : tree)(root, x, z, 0.75 + rnd() * 0.4); }
  // loose trees
  for (let k = 0; k < 70; k++) { const x = rnd() * COLS * F, z = rnd() * ROWS * F; const c = Math.floor(x / F), r = Math.floor(z / F); if (tiers.some((t) => t.c === c && t.r === r) || nearRiver(x, z, 1.5) || inHill(x, z)) continue; (rnd() < 0.5 ? pine : tree)(root, x, z, 0.55 + rnd() * 0.3); }
}

let fit;
if (view === 'tiers') {
  for (let t = 0; t < 6; t++) { const g = group(root, t * F * 1.05, 0, 0); village(g, t, 100 + t); const d = new THREE.Mesh(new THREE.PlaneGeometry(F, F), M.grass); d.rotation.x = -Math.PI / 2; d.position.set(t * F * 1.05, 0, 0); d.receiveShadow = true; root.add(d); }
  fit = new THREE.Box3(new THREE.Vector3(-F / 2, 0, -F / 2), new THREE.Vector3(5 * F * 1.05 + F / 2, 2, F / 2));
} else {
  ground();
  for (const v of tiers) { const g = group(root, (v.c + 0.5) * F, (v.r + 0.5) * F, 0); village(g, v.tier, v.c * 31 + v.r * 7); }
  fit = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(COLS * F, 0, ROWS * F));
}
window.__tiers = tiers; window.__F = F;

// ---------- lights + camera ----------
scene.add(new THREE.HemisphereLight(DUSK ? 0x7484b8 : 0xcfe0ff, DUSK ? 0x302a20 : 0x5a4a30, DUSK ? 1.35 : 1.0));
const sun = new THREE.DirectionalLight(DUSK ? 0xd89a78 : 0xfff1d6, DUSK ? 1.4 : 2.6);
const ctr = fit.getCenter(new THREE.Vector3()), span = fit.getSize(new THREE.Vector3()).length();
sun.position.copy(ctr).add(new THREE.Vector3(DUSK ? -14 : -8, DUSK ? 6 : 16, DUSK ? 3 : 6).normalize().multiplyScalar(span)); sun.target.position.copy(ctr); scene.add(sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -span / 1.6, right: span / 1.6, top: span / 1.6, bottom: -span / 1.6, near: 0.5, far: span * 3 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; scene.add(sun);
if (DUSK) for (const l of lights) { if (!l.i) continue; l.obj.updateWorldMatrix(true, false); const p = new THREE.PointLight(l.col, l.i, l.d, 1.8); p.position.copy(l.p).applyMatrix4(l.obj.matrixWorld); scene.add(p); }

const W = Number(q.get('w') ?? 1440), H = Number(q.get('h') ?? 960);
const pitch = THREE.MathUtils.degToRad(Number(q.get('pitch') ?? 52));
const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, span * 6);
cam.position.copy(ctr).addScaledVector(dir, span * 2); cam.lookAt(ctr); cam.updateMatrixWorld();
const toCam = (v) => v.clone().applyMatrix4(cam.matrixWorldInverse);
let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
for (const x of [fit.min.x, fit.max.x]) for (const y of [fit.min.y, fit.max.y]) for (const z of [fit.min.z, fit.max.z]) { const p = toCam(new THREE.Vector3(x, y, z)); a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.y); d = Math.max(d, p.y); }
let hw = (b - a) / 2, hh = (d - c) / 2; const asp = W / H; if (hw / hh > asp) hh = hw / asp; else hw = hh * asp;
if (view === 'tiers') { hw *= 1.04; hh *= 1.04; }
Object.assign(cam, { left: (a + b) / 2 - hw, right: (a + b) / 2 + hw, top: (c + d) / 2 + hh, bottom: (c + d) / 2 - hh }); cam.updateProjectionMatrix();
window.__project = (x, y, z) => { const p = new THREE.Vector3(x, y, z).project(cam); return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H]; };

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = DUSK ? 1.45 : 1.0;
document.body.appendChild(renderer.domElement);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, cam));
const ao = new GTAOPass(scene, cam, W, H); ao.updateGtaoMaterial({ radius: 0.4, distanceExponent: 1.5, thickness: 1, scale: 1.2 }); composer.addPass(ao);
composer.addPass(new OutputPass());
composer.render();
window.__done = true;
void sh; void bush;
