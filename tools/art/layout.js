// The village layout shared by the baker: where every building, home, tree and wall piece stands.
import * as THREE from 'three';
import { M, rnd, reseed, group, tree, pine, bush, rock, well, house, barrel, crate, box, cyl, fence, logs, gable, hay } from './lib.js';
import { B, wallRing, palisadeGate, stoneGate, gatehouse } from './buildings.js';

export const RX = 18.5, RZ = 14, WALL_N = 28;
export const BOUNDS = new THREE.Box3(new THREE.Vector3(-31, 0, -16), new THREE.Vector3(31, 6, 24));

/** Lowest level of each stage, per building. Level 0 = a building plot. */
export const STAGE_LEVELS = {
  main: [1, 5, 15, 25], barracks: [1, 10, 20], stable: [1, 7, 15], garage: [1, 5, 10], smith: [1, 7, 15],
  market: [1, 10, 20], storage: [1, 10, 20], wood: [1, 10, 20], stone: [1, 10, 20], iron: [1, 10, 20], farm: [1, 10, 20],
  hide: [1, 5], snob: [1], place: [1], statue: [1], wall: [1, 6, 15], church: [1, 2, 3], firstchurch: [1],
};
/** Where each building stands: x, z, rotation, scale, plot size (w, d) for level 0. */
export const SLOTS = {
  main: [0, -7.4, 0, 1.0, 7, 4], snob: [-9.6, -5.4, 0.45, 0.9, 5, 3.5], smith: [9.2, -6.0, -0.45, 0.92, 4.5, 3.5],
  barracks: [-11.6, 1.4, 0.6, 0.86, 6, 4], stable: [11.8, 1.8, -0.6, 0.86, 6, 4], place: [-5.4, 7.0, 0.2, 0.82, 5, 4],
  market: [5.6, 7.2, -0.2, 0.86, 5.5, 4], statue: [0, 1.3, 0, 0.62, 3, 3], storage: [-10.2, 7.4, 0.8, 0.8, 5, 3.5],
  garage: [10.2, 7.4, -0.8, 0.8, 5, 3.5], hide: [-4.2, 11.6, 0.15, 0.6, 3, 2.5],
  church: [-5.6, -1.4, 1.15, 1.0, 5, 6.5], firstchurch: [-5.6, -1.4, 1.15, 1.0, 5, 6.5],
  wood: [-27, -3.5, 0.5, 0.9, 5, 4], stone: [-20.5, 18.5, 0.35, 0.9, 5, 4], iron: [26.5, -5, -0.5, 0.9, 5, 4], farm: [23, 16, -0.45, 0.9, 6, 4],
};
/** Villagers' homes, in the order they appear as the headquarters grows. */
export const HOMES = [[-14.6, -3.6, 1.0, 2.2], [14.8, -3.2, -1.0, 2.2], [-4.4, -12.0, 0.05, 2.4], [4.8, -12.2, -0.05, 2.4], [-15.0, 5.0, 1.3, 2.0], [15.2, 5.4, -1.3, 2.0], [4.6, 11.8, -0.15, 2.0], [-8.8, -10.2, 0.6, 2.0], [9.0, -10.2, -0.6, 2.0]];
export const WALL_KINDS = ['palisade', 'stone', 'full'];
/** Homes outside the wall, simpler than anything inside: x, z, rotation, style (0 hut, 1 cottage, 2 small house). */
export const OUTER_HOMES = (() => {
  // farmsteads scattered over the fields south of the wall, nearest the gate first.
  // [x, z, rotation, style 0 hut | 1 cottage | 2 small house, yard, seed]
  let sd = 9137; const r = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
  const keepOut = [[-20.5, 18.5, 6.5], [23, 16, 7.5], [-27, -3.5, 6], [26.5, -5, 6]];
  const ok = (x, z) => Math.abs(x) > 3.2 && (x / (RX * 1.2)) ** 2 + (z / (RZ * 1.2)) ** 2 > 1 && !keepOut.some(([a, b, d]) => Math.hypot(x - a, z - b) < d);
  const pts = [];
  for (let t = 0; t < 4000 && pts.length < 20; t++) {
    const x = (r() - 0.5) * 36, z = 15 + r() * 24;
    if (!ok(x, z) || pts.some(([a, b]) => Math.hypot(x - a, z - b) < 5.4)) continue;
    pts.push([x, z]);
  }
  pts.sort((a, b) => Math.hypot(a[0], a[1] - RZ) - Math.hypot(b[0], b[1] - RZ));
  return pts.map(([x, z], n) => {
    const style = n < 5 ? 2 - (n % 2) : n < 13 ? 1 - (n % 4 === 0 ? 1 : 0) : (n % 3 === 0 ? 1 : 0);
    const face = Math.atan2(-x, 2) + (r() - 0.5) * 0.9; // roughly toward the road
    return [x, z, face, style, n % 2, 400 + n * 13];
  });
})();

function road(g, pts, w = 1.4, mat = M.dirt) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len + w * 0.6), mat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(x2 - x1, z2 - z1);
    m.position.set((x1 + x2) / 2, 0.01 + i * 0.0005, (z1 + z2) / 2); m.receiveShadow = true; g.add(m);
    const c = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 16), mat); c.rotation.x = -Math.PI / 2; c.position.set(x2, 0.011, z2); c.receiveShadow = true; g.add(c);
  }
}
export function buildGround(root) {
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(140, 140, 1, 1), M.grass.clone());
  gr.material.map = M.grass.map.clone(); gr.material.map.repeat.set(32, 32); gr.material.map.needsUpdate = true;
  gr.rotation.x = -Math.PI / 2; gr.receiveShadow = true; root.add(gr);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: 0x8a7a50, transparent: true, opacity: 0.18, roughness: 1, depthWrite: false }));
  inner.rotation.x = -Math.PI / 2; inner.scale.set(RX - 1, RZ - 1, 1); inner.position.y = 0.005; root.add(inner);
  road(root, [[0, 70], [0, 14], [0, 1.5], [0, -3.6]], 1.8);
  road(root, [[0, 1.5], [-6, 3.4], [-10.4, 2.6]]); road(root, [[0, 1.5], [6, 3.4], [10.6, 3.0]]);
  road(root, [[-6, 3.4], [-9.8, 8.4]]); road(root, [[6, 3.4], [9.8, 8.4]]);
  road(root, [[0, -1.2], [-8, -3.6]]); road(root, [[0, -1.2], [7.6, -3.8]]);
  road(root, [[0, 19.5], [-8, 22], [-17.5, 18.5]], 1.2); road(root, [[0, 19.5], [10, 20.5], [19.5, 16.5]], 1.2);
  road(root, [[-18, 9], [-25, -1]], 1.1); road(root, [[18.5, 5], [23, -2]], 1.1);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), M.cobble); plaza.rotation.x = -Math.PI / 2; plaza.scale.y = 0.8; plaza.position.set(0, 0.02, 1.4); plaza.receiveShadow = true; root.add(plaza);
}

/** A building plot: stakes and a rope around the footprint. */
export function plot(g, w, d) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0x8a6f4a, roughness: 1, transparent: true, opacity: 0.55 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.015; m.receiveShadow = true; g.add(m);
  const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  for (const [x, z] of pts) { box(g, 0.1, 0.55, 0.1, M.woodLight, x, 0, z); }
  for (let i = 0; i < 4; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % 4]; const len = Math.hypot(x2 - x1, z2 - z1); box(g, len, 0.025, 0.025, M.cloth, (x1 + x2) / 2, 0.42, (z1 + z2) / 2, -Math.atan2(z2 - z1, x2 - x1)); }
}

export function slotGroup(root, id) { const [x, z, ry, s] = SLOTS[id]; const g = group(root, x, z, ry); g.scale.setScalar(s); return g; }
export function buildBuilding(root, id, stage) {
  const g = slotGroup(root, id);
  if (stage === 0) { const [, , , s, w, d] = SLOTS[id]; plot(g, w / s, d / s); } else B[id](g, stage);
  return g;
}
export function buildHome(root, i) {
  reseed(1000 + i * 17);
  const [x, z, ry, w] = HOMES[i];
  const roofs = [M.roofRed, M.roofOrange, M.thatch, M.roofBrown];
  const h = group(root, x, z, ry); h.scale.setScalar(0.85);
  house(h, 0, 0, w, 1.9, { f2: rnd() < 0.5 ? 0 : 1.0, roof: roofs[Math.floor(rnd() * 4)], chimney: rnd() < 0.6, roofH: 1.2 });
  if (rnd() < 0.6) barrel(h, w / 2 + 0.3, 1.2); else crate(h, -w / 2 - 0.2, 1.2);
  return h;
}
/** A field: an irregular quad with furrows, at (x, z). */
function field(root, x, z, w, d, rot, mat) {
  const j = () => (rnd() - 0.5) * 0.7;
  const c = [[-w / 2 + j(), -d / 2 + j()], [w / 2 + j(), -d / 2 + j()], [w / 2 + j(), d / 2 + j()], [-w / 2 + j(), d / 2 + j()]];
  const sh2 = new THREE.Shape(c.map(([a, b]) => new THREE.Vector2(a, b)));
  const geo = new THREE.ShapeGeometry(sh2);
  const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 3, uv.getY(k) / 3);
  const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.rotation.z = rot; m.position.set(x, 0.018, z); m.receiveShadow = true; root.add(m);
}
/** A winding footpath from a to b. */
function footpath(root, a, b, w = 0.5) {
  const n = 5, pts = [];
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), px = -dz / L, pz = dx / L;
  for (let k = 0; k <= n; k++) { const t = k / n, wob = k === 0 || k === n ? 0 : Math.sin(t * Math.PI + rnd()) * L * 0.07; pts.push([a[0] + dx * t + px * wob, a[1] + dz * t + pz * wob]); }
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const N = 30, v = [];
  let prevL, prevR;
  for (let k = 0; k <= N; k++) { const p = curve.getPoint(k / N), d = curve.getTangent(k / N); const nx = -d.z, nz = d.x; const l = [p.x + nx * w / 2, p.z + nz * w / 2], r2 = [p.x - nx * w / 2, p.z - nz * w / 2]; if (prevL) v.push(prevL[0], 0.014, prevL[1], prevR[0], 0.014, prevR[1], l[0], 0.014, l[1], prevR[0], 0.014, prevR[1], r2[0], 0.014, r2[1], l[0], 0.014, l[1]); prevL = l; prevR = r2; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const uv = []; for (let k = 0; k < v.length / 3; k++) uv.push(v[k * 3] / 3, v[k * 3 + 2] / 3); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, M.dirt.clone()); m.material.side = THREE.DoubleSide; m.receiveShadow = true; root.add(m);
}
export function buildOuterHome(root, i) {
  const [x, z, ry, style, yard, seed] = OUTER_HOMES[i];
  reseed(seed);
  const h = group(root, x, z, ry); h.scale.setScalar(0.85);
  if (style === 0) house(h, 0, 0, 1.8, 1.6, { f1: 1.2, f2: 0, roof: M.thatch, roofH: 1.0, wall: M.wood, gableMat: M.wood, chimney: rnd() < 0.5 });
  else if (style === 1) house(h, 0, 0, 2.1, 1.8, { f1: 1.3, f2: 0, roof: M.thatch, roofH: 1.1, chimney: true });
  else house(h, 0, 0, 2.3, 1.9, { f1: 1.4, f2: 0, roof: rnd() < 0.5 ? M.roofBrown : M.roofOrange, roofH: 1.2, chimney: true });
  if (rnd() < 0.5) barrel(h, 1.3, 1.1); else crate(h, -1.3, 1.1);
  if (yard === 0) { logs(h, -1.4, -1.4, 4, 0.3); hay(h, 1.5, -1.2, 0.35); }
  else { box(h, 1.0, 0.9, 0.8, M.wood, 1.6, 0, -1.4); gable(h, 1.0, 0.8, 0.4, 0.1, M.thatch, 1.6, 0.9, -1.4, M.wood); }
  // one or two uneven fields beside the farmstead, partly fenced
  const away = Math.sign(x) || 1;
  const fx = x + away * (2.6 + rnd() * 1.2), fz = z + (rnd() - 0.4) * 2.4, fw = 2.8 + rnd() * 1.8, fd = 2.0 + rnd() * 1.4, fr = (rnd() - 0.5) * 0.8;
  field(root, fx, fz, fw, fd, fr, rnd() < 0.55 ? M.wheat : M.greens);
  if (rnd() < 0.6) field(root, fx + (rnd() - 0.5) * 1.5, fz + fd * 0.9 + 0.4, fw * (0.6 + rnd() * 0.3), fd * 0.7, fr + (rnd() - 0.5) * 0.4, rnd() < 0.5 ? M.wheat : M.greens);
  if (rnd() < 0.6) { const c = Math.cos(-fr), s2 = Math.sin(-fr); const P = (a, b) => [fx + a * c - b * s2, fz + a * s2 + b * c]; fence(root, [P(-fw / 2, -fd / 2 - 0.2), P(fw / 2, -fd / 2 - 0.2), P(fw / 2, fd / 2)], 0.45); }
  // winding footpath to the main road
  const door = [x + Math.sin(ry) * 1.0, z + Math.cos(ry) * 1.0];
  let to = [Math.sign(x) * 0.8, z], best = Math.abs(x);
  for (let k = 0; k < i; k++) { const [ox, oz, ory] = OUTER_HOMES[k]; const od = [ox + Math.sin(ory) * 1.0, oz + Math.cos(ory) * 1.0]; const d = Math.hypot(od[0] - door[0], od[1] - door[1]); if (d < best * 0.8) { best = d; to = od; } }
  footpath(root, door, to, 0.42);
  return h;
}
/** In worlds without churches the church plot holds an ordinary home. */
export function buildSlotHome(root) {
  reseed(5150);
  const [x, z, ry] = SLOTS.church;
  const h = group(root, x, z, ry); h.scale.setScalar(0.85);
  house(h, 0, 0, 2.6, 2.0, { f2: 1.0, roof: M.roofOrange, chimney: true, roofH: 1.2 });
  barrel(h, 1.6, 1.2);
  return h;
}
export function buildWell(root) { well(root, 4.8, -0.2); }
/** One wall segment (and the tower that starts it). kind: palisade | stone | full. */
export function buildWallSegment(root, kind, i) { wallRing(root, RX, RZ, { n: WALL_N, kind, only: (j) => j === i, noGate: true }); }
export function buildGate(root, kind) {
  if (kind === 'palisade') palisadeGate(root, 0, RZ); else if (kind === 'stone') stoneGate(root, 0, RZ); else gatehouse(root, 0, RZ);
}
/** Gate position on the ring = segment 0 start. */
export const GATE = [0, RZ];
export function wallPoint(i) { const a = (i / WALL_N) * Math.PI * 2 + Math.PI / 2; return [Math.cos(a) * RX, Math.sin(a) * RZ]; }

const inEllipse = (x, z, k = 1) => (x / (RX * k)) ** 2 + (z / (RZ * k)) ** 2 < 1;
/** The forest and loose trees, deterministic. */
export function forest() {
  reseed(4242);
  const out = [];
  const avoid = [[-27, -3.5, 6], [-20.5, 18.5, 5.5], [26.5, -5, 6], [23, 16, 6.5], [0, 21, 3], ...OUTER_HOMES.map(([x, z]) => [x, z, 3.2]), ...OUTER_HOMES.map(([x, z]) => [x + (Math.sign(x) || 1) * 3.2, z + 0.6, 3.2])];
  for (let i = 0; i < 520; i++) {
    const x = (rnd() - 0.5) * 74, z = (rnd() - 0.5) * 60 - 2;
    const k = rnd(), s = 0.9 + rnd() * 0.6;
    if (inEllipse(x, z, 1.22)) continue;
    if (Math.abs(x) < 2.4 && z > 10) continue;
    if (avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r)) continue;
    if (z > 20 && k < 0.7) continue;
    out.push({ x, z, s, kind: k < 0.45 ? 'pine' : 'tree', seed: i });
  }
  for (const [x, z] of [[-1.9, 11.4], [2.2, 12.0]]) out.push({ x, z, s: 0.75, kind: 'tree', seed: 900 + x });
  for (let i = 0; i < 50; i++) { const x = (rnd() - 0.5) * 64, z = (rnd() - 0.5) * 50; if (!inEllipse(x, z, 1.15) && !avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r)) out.push({ x, z, s: 0.4 + rnd() * 0.3, kind: rnd() < 0.5 ? 'bush' : 'rock', seed: 2000 + i }); }
  return out;
}
export function buildTree(root, t) {
  reseed(77 + Math.round(t.seed * 13));
  if (t.kind === 'pine') pine(root, t.x, t.z, t.s); else if (t.kind === 'tree') tree(root, t.x, t.z, t.s); else if (t.kind === 'bush') bush(root, t.x, t.z, t.s); else rock(root, t.x, t.z, t.s);
}
