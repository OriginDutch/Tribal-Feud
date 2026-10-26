// The village layout shared by the baker: where every building, home, tree and wall piece stands.
import * as THREE from 'three';
import { M, rnd, reseed, group, tree, pine, bush, rock, well, house, barrel, crate, box, cyl } from './lib.js';
import { B, wallRing, palisadeGate, stoneGate, gatehouse } from './buildings.js';

export const RX = 18.5, RZ = 14, WALL_N = 28;
export const BOUNDS = new THREE.Box3(new THREE.Vector3(-31, 0, -16), new THREE.Vector3(31, 6, 24));

/** Lowest level of each stage, per building. Level 0 = a building plot. */
export const STAGE_LEVELS = {
  main: [1, 5, 15, 25], barracks: [1, 10, 20], stable: [1, 7, 15], garage: [1, 5, 10], smith: [1, 7, 15],
  market: [1, 10, 20], storage: [1, 10, 20], wood: [1, 10, 20], stone: [1, 10, 20], iron: [1, 10, 20], farm: [1, 10, 20],
  hide: [1, 5], snob: [1], place: [1], statue: [1], wall: [1, 6, 15],
};
/** Where each building stands: x, z, rotation, scale, plot size (w, d) for level 0. */
export const SLOTS = {
  main: [0, -7.4, 0, 1.0, 7, 4], snob: [-9.6, -5.4, 0.45, 0.9, 5, 3.5], smith: [9.2, -6.0, -0.45, 0.92, 4.5, 3.5],
  barracks: [-11.6, 1.4, 0.6, 0.86, 6, 4], stable: [11.8, 1.8, -0.6, 0.86, 6, 4], place: [-5.4, 7.0, 0.2, 0.82, 5, 4],
  market: [5.6, 7.2, -0.2, 0.86, 5.5, 4], statue: [0, 1.3, 0, 0.62, 3, 3], storage: [-10.2, 7.4, 0.8, 0.8, 5, 3.5],
  garage: [10.2, 7.4, -0.8, 0.8, 5, 3.5], hide: [-4.2, 11.6, 0.15, 0.6, 3, 2.5],
  wood: [-27, -3.5, 0.5, 0.9, 5, 4], stone: [-20.5, 18.5, 0.35, 0.9, 5, 4], iron: [26.5, -5, -0.5, 0.9, 5, 4], farm: [23, 16, -0.45, 0.9, 6, 4],
};
/** Villagers' homes, in the order they appear as the headquarters grows. */
export const HOMES = [[-14.6, -3.6, 1.0, 2.2], [14.8, -3.2, -1.0, 2.2], [-4.4, -12.0, 0.05, 2.4], [4.8, -12.2, -0.05, 2.4], [-15.0, 5.0, 1.3, 2.0], [15.2, 5.4, -1.3, 2.0], [4.6, 11.8, -0.15, 2.0], [-8.8, -10.2, 0.6, 2.0], [9.0, -10.2, -0.6, 2.0]];
export const WALL_KINDS = ['palisade', 'stone', 'full'];

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
  road(root, [[0, 30], [0, 14], [0, 1.5], [0, -3.6]], 1.8);
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
  const avoid = [[-27, -3.5, 6], [-20.5, 18.5, 5.5], [26.5, -5, 6], [23, 16, 6.5], [0, 21, 3]];
  for (let i = 0; i < 520; i++) {
    const x = (rnd() - 0.5) * 74, z = (rnd() - 0.5) * 60 - 2;
    const k = rnd(), s = 0.9 + rnd() * 0.6;
    if (inEllipse(x, z, 1.22)) continue;
    if (Math.abs(x) < 2.4 && z > 10) continue;
    if (avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r)) continue;
    if (z > 20 && k < 0.7) continue;
    out.push({ x, z, s, kind: k < 0.45 ? 'pine' : 'tree', seed: i });
  }
  for (const [x, z] of [[-3.6, -1.9], [-1.9, 11.4], [2.2, 12.0]]) out.push({ x, z, s: 0.75, kind: 'tree', seed: 900 + x });
  for (let i = 0; i < 50; i++) { const x = (rnd() - 0.5) * 64, z = (rnd() - 0.5) * 50; if (!inEllipse(x, z, 1.15) && !avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r)) out.push({ x, z, s: 0.4 + rnd() * 0.3, kind: rnd() < 0.5 ? 'bush' : 'rock', seed: 2000 + i }); }
  return out;
}
export function buildTree(root, t) {
  reseed(77 + Math.round(t.seed * 13));
  if (t.kind === 'pine') pine(root, t.x, t.z, t.s); else if (t.kind === 'tree') tree(root, t.x, t.z, t.s); else if (t.kind === 'bush') bush(root, t.x, t.z, t.s); else rock(root, t.x, t.z, t.s);
}
