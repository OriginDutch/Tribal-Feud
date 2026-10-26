// The village layout shared by the baker: where every building, home, tree and wall piece stands.
import * as THREE from 'three';
import { M, rnd, reseed, softRibbon, softDisc, group, tree, pine, bush, rock, well, house, barrel, crate, box, cyl, fence, logs, gable, hay } from './lib.js';
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
// ---------- farmsteads outside the wall: planned so nothing overlaps ----------
export const ROADS = [];
/** Roads outside the wall: the main road, and side roads to the clay pit + timber camp and to the farm + iron mine. */
const ROADS_OUT = [
  { pts: [[0, 14], [0, 70]], r: 0.9 + 0.5, w: 1.8 },
  { pts: [[0, 17.2], [-7.5, 16.8], [-13.8, 15.0], [-19.0, 12.6], [-23.4, 8.6], [-26.0, 4.2], [-26.6, 1.0]], r: 0.6 + 0.5, w: 1.2 },
  { pts: [[0, 17.2], [8.0, 16.8], [14.4, 14.2], [19.2, 11.2], [23.4, 8.0], [25.4, 4.0], [25.1, 0.2], [24.9, -0.5]], r: 0.6 + 0.5, w: 1.2 },
  { pts: [[-19.0, 12.6], [-20.6, 14.0], [-21.4, 15.4]], r: 0.5 + 0.5, w: 1.0 },
];
ROADS.push(...ROADS_OUT);
function segDist(px, pz, [ax, az], [bx, bz]) { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)); return Math.hypot(px - ax - dx * t, pz - az - dz * t); }
function polyDist(px, pz, pts) { let d = Infinity; for (let k = 0; k < pts.length - 1; k++) d = Math.min(d, segDist(px, pz, pts[k], pts[k + 1])); return d; }
/** Oriented rectangle: centre, half sizes, rotation (about y, like a three.js group). */
const rect = (x, z, hw, hd, rot) => ({ x, z, hw, hd, rot });
function corners(R) { const c = Math.cos(R.rot), s = Math.sin(R.rot); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [R.x + a * R.hw * c + b * R.hd * s, R.z - a * R.hw * s + b * R.hd * c]); }
function inRect(R, px, pz, pad = 0) { const c = Math.cos(R.rot), s = Math.sin(R.rot), dx = px - R.x, dz = pz - R.z; const u = dx * c - dz * s, v = dx * s + dz * c; return Math.abs(u) <= R.hw + pad && Math.abs(v) <= R.hd + pad; }
function rectsOverlap(A, B, pad) {
  const axes = (R) => { const c = Math.cos(R.rot), s = Math.sin(R.rot); return [[c, -s], [s, c]]; };
  for (const [ax, az] of [...axes(A), ...axes(B)]) {
    const pr = (R) => { const p = corners(R).map(([x, z]) => x * ax + z * az); return [Math.min(...p), Math.max(...p)]; };
    const [a0, a1] = pr(A), [b0, b1] = pr(B);
    if (a1 + pad < b0 || b1 + pad < a0) return false;
  }
  return true;
}
function samplesOf(R, n = 5) { const out = []; const c = Math.cos(R.rot), s = Math.sin(R.rot); for (let a = 0; a <= n; a++) for (let b = 0; b <= n; b++) { const u = (a / n * 2 - 1) * R.hw, v = (b / n * 2 - 1) * R.hd; out.push([R.x + u * c + v * s, R.z - u * s + v * c]); } return out; }
const pathPts = (a, b, wob) => { const out = []; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, px = -dz / L, pz = dx / L; for (let k = 0; k <= 12; k++) { const t = k / 12, w = Math.sin(t * Math.PI) * wob * L; out.push([a[0] + dx * t + px * w, a[1] + dz * t + pz * w]); } return out; };

export const FARMS = (() => {
  let sd = 9137; const r = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
  const keepOut = [[-20.5, 18.5, 6.8], [23, 16, 7.8], [-27, -3.5, 6.5], [26.5, -5, 6.5]];
  const solids = []; // rects already taken (houses, yards, fields)
  const paths = []; // polylines already taken, radius 0.45
  const farms = [];
  const clear = (R, pad = 0.35) => {
    if (keepOut.some(([a, b, d]) => samplesOf(R).some(([x, z]) => Math.hypot(x - a, z - b) < d))) return false;
    if ((R.x / (RX * 1.25)) ** 2 + (R.z / (RZ * 1.25)) ** 2 < 1 + 0.15) return false;
    if (samplesOf(R).some(([x, z]) => ROADS_OUT.some((q) => polyDist(x, z, q.pts) < q.r + pad) || (x / (RX * 1.22)) ** 2 + (z / (RZ * 1.22)) ** 2 < 1)) return false;
    if (solids.some((S) => rectsOverlap(R, S, pad))) return false;
    if (paths.some((p) => samplesOf(R).some(([x, z]) => polyDist(x, z, p) < 0.45 + pad))) return false;
    return true;
  };
  const pathClear = (pts, own) => pts.every(([x, z], k) => k < 1 || !solids.some((S) => !own.includes(S) && inRect(S, x, z, 0.4)));
  for (let t = 0; t < 20000 && farms.length < 20; t++) {
    const x = (r() - 0.5) * 42, z = 15.5 + r() * 26;
    // face roughly toward the main road
    const rot = (x > 0 ? -Math.PI / 2 : Math.PI / 2) + (r() - 0.5) * 0.7;
    const style = 0;
    const hs = rect(x, z, 1.25, 1.1, rot);
    const fwd = [Math.sin(rot), Math.cos(rot)], side = [Math.cos(rot), -Math.sin(rot)];
    const yard = rect(x - fwd[0] * 2.0, z - fwd[1] * 2.0, 1.3, 0.8, rot);
    if (!clear(hs, 0.6) || !clear(yard, 0.3)) continue;
    // fields: beside or behind the house, away from the road
    const fields = [];
    const away = x > 0 ? 1 : -1;
    const want = r() < 0.6 ? 2 : 1;
    for (let tries = 0; tries < 60 && fields.length < want; tries++) {
      const fw = 1.3 + r() * 1.0, fd = 0.9 + r() * 0.7, fr = rot + (r() - 0.5) * 0.5;
      const k = r();
      const u = k < 0.4 ? -(1.9 + fw) - r() * 0.8 : k < 0.8 ? (1.9 + fw) + r() * 0.8 : (r() - 0.5) * 2; // sideways (local x)
      const v = k < 0.8 ? (r() - 0.6) * 3 : -(3.4 + fd) - r() * 0.6; // forward (local z), negative = behind
      const fx = x + side[0] * u + fwd[0] * v, fz = z + side[1] * u + fwd[1] * v;
      const F = rect(fx, fz, fw, fd, fr);
      if (clear(F, 0.4) && !rectsOverlap(F, hs, 0.5) && !rectsOverlap(F, yard, 0.4) && !fields.some((G) => rectsOverlap(F, G, 0.5))) fields.push(F);
    }
    // a path from the door to the main road, a side road or a neighbour's door, whichever is clear and short
    const door = [x + fwd[0] * 1.6, z + fwd[1] * 1.6];
    const targets = [[Math.sign(x) * 1.0, z + (r() - 0.5) * 1.5]];
    for (const q of ROADS_OUT.slice(1)) { let best = null, bd = Infinity; for (let k = 0; k < q.pts.length - 1; k++) for (let u = 0; u <= 10; u++) { const a = q.pts[k], b = q.pts[k + 1]; const p = [a[0] + (b[0] - a[0]) * u / 10, a[1] + (b[1] - a[1]) * u / 10]; const d = Math.hypot(p[0] - door[0], p[1] - door[1]); if (d < bd) { bd = d; best = p; } } targets.push(best); }
    for (const fm of farms) targets.push(fm.door);
    targets.sort((a, b) => Math.hypot(a[0] - door[0], a[1] - door[1]) - Math.hypot(b[0] - door[0], b[1] - door[1]));
    const own = [hs, yard, ...fields];
    let path = null;
    for (const tg of targets.slice(0, 4)) { for (const wob of [0.08, -0.08, 0.16, -0.16, 0]) { const p = pathPts(door, tg, wob); if (Math.hypot(tg[0] - door[0], tg[1] - door[1]) < 16 && pathClear(p, own) && !fields.some((F) => p.some(([px, pz]) => inRect(F, px, pz, 0.45)))) { path = p; break; } } if (path) break; }
    if (!path || !fields.length) continue;
    // stop the path at the edge of whatever road it joins, so it never paints over it
    { const cut = path.findIndex(([px, pz]) => ROADS_OUT.some((q) => polyDist(px, pz, q.pts) < q.w / 2 + 0.05)); if (cut > 1) path = path.slice(0, cut + 1); }
    solids.push(hs, yard, ...fields); paths.push(path);
    farms.push({ x, z, rot, door, fields, path, seed: 400 + farms.length * 13 });
  }
  farms.sort((a, b) => Math.hypot(a.x, a.z - RZ) - Math.hypot(b.x, b.z - RZ));
  // anything that used another farm's door as target must come after it: keep the order stable by re-sorting dependants
  return farms.map((f, n) => ({ ...f, style: n < 5 ? 2 - (n % 2) : n < 13 ? (n % 4 === 0 ? 0 : 1) : (n % 3 === 0 ? 1 : 0), yard: n % 2 }));
})();
export const OUTER_HOMES = FARMS.map((f) => [f.x, f.z]);

/** Roads: soft ribbons. Ends that run off-screen stay full; ends that join something fade out. */
function road(g, pts, w = 1.4, o = {}) { softRibbon(g, pts, w, { fade: o.fade ?? [w * 1.2, w * 1.6], ruts: w >= 1.5, taper: 0.25 }); }
export function buildGround(root) {
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(140, 140, 1, 1), M.grass.clone());
  gr.material.map = M.grass.map.clone(); gr.material.map.repeat.set(32, 32); gr.material.map.needsUpdate = true;
  gr.rotation.x = -Math.PI / 2; gr.receiveShadow = true; root.add(gr);
  softDisc(root, RX - 0.5, RZ - 0.5, M.dirt, 0, 0, { y: 0.005, alpha: 0.16, order: 0 });
  road(root, [[0, 70], [0, 14], [0, 4.0]], 1.8, { fade: [0, 2.5] }); road(root, [[0, 0.0], [0, -3.6]], 1.6, { fade: [1.5, 2.5] });
  road(root, [[0, 1.5], [-6, 3.4], [-10.4, 2.6]]); road(root, [[0, 1.5], [6, 3.4], [10.6, 3.0]]);
  road(root, [[-6, 3.4], [-9.8, 8.4]]); road(root, [[6, 3.4], [9.8, 8.4]]);
  road(root, [[0, -1.2], [-8, -3.6]]); road(root, [[0, -1.2], [7.6, -3.8]]);
  for (const q of ROADS_OUT.slice(1)) road(root, q.pts, q.w);
  softDisc(root, 4.4, 3.5, M.cobble, 0, 1.4, { y: 0.02, order: 10 });
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
function footpath(root, pts, w = 0.45) { softRibbon(root, pts, w * 1.15, { fade: [0.6, 1.4], taper: 0.5, alpha: 0.9, y: 0.014 }); }
export function buildOuterHome(root, i) {
  const F = FARMS[i];
  reseed(F.seed);
  const h = group(root, F.x, F.z, F.rot); h.scale.setScalar(0.85);
  if (F.style === 0) house(h, 0, 0, 1.8, 1.6, { f1: 1.2, f2: 0, roof: M.thatch, roofH: 1.0, wall: M.wood, gableMat: M.wood, chimney: rnd() < 0.5 });
  else if (F.style === 1) house(h, 0, 0, 2.1, 1.8, { f1: 1.3, f2: 0, roof: M.thatch, roofH: 1.1, chimney: true });
  else house(h, 0, 0, 2.3, 1.9, { f1: 1.4, f2: 0, roof: rnd() < 0.5 ? M.roofBrown : M.roofOrange, roofH: 1.2, chimney: true });
  if (F.yard === 0) { logs(h, -0.8, -2.3, 4, 0); hay(h, 0.9, -2.2, 0.35); }
  else { box(h, 1.1, 0.9, 0.8, M.wood, 0.2, 0, -2.3); gable(h, 1.1, 0.8, 0.4, 0.1, M.thatch, 0.2, 0.9, -2.3, M.wood); }
  for (const R of F.fields) {
    // irregular field inside its planned rectangle, fence along the side away from the house
    const g = group(root, R.x, R.z, R.rot);
    const j = () => (rnd() - 0.5) * 0.35;
    const c = [[-R.hw + 0.2 + j(), -R.hd + 0.2 + j()], [R.hw - 0.2 + j(), -R.hd + 0.2 + j()], [R.hw - 0.2 + j(), R.hd - 0.2 + j()], [-R.hw + 0.2 + j(), R.hd - 0.2 + j()]];
    const geo = new THREE.ShapeGeometry(new THREE.Shape(c.map(([a, b]) => new THREE.Vector2(a, -b))));
    const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 3, uv.getY(k) / 3);
    const m = new THREE.Mesh(geo, rnd() < 0.55 ? M.wheat : M.greens); m.rotation.x = -Math.PI / 2; m.position.y = 0.018; m.receiveShadow = true; g.add(m);
    if (rnd() < 0.65) fence(g, [[-R.hw + 0.1, -R.hd + 0.1], [R.hw - 0.1, -R.hd + 0.1], [R.hw - 0.1, R.hd - 0.1]], 0.45);
  }
  footpath(root, F.path, 0.42);
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
  const avoid = [[-27, -3.5, 6], [-20.5, 18.5, 5.5], [26.5, -5, 6], [23, 16, 6.5], [0, 21, 3], ...FARMS.flatMap((f) => [[f.x, f.z, 3.4], ...f.fields.map((R) => [R.x, R.z, Math.max(R.hw, R.hd) + 1.2]), ...f.path.filter((_, k) => k % 3 === 0).map(([x, z]) => [x, z, 1.1])])];
  for (let i = 0; i < 1300; i++) {
    const x = (rnd() - 0.5) * 100, z = (rnd() - 0.5) * 84 + 2;
    const k = rnd(), s = 0.9 + rnd() * 0.6;
    if (inEllipse(x, z, 1.22)) continue;
    if (Math.abs(x) < 2.4 && z > 10) continue;
    if (avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r)) continue;
    if (ROADS_OUT.some((q) => polyDist(x, z, q.pts) < q.w / 2 + 1.3 * s) || ROADS_OUT.some((q) => polyDist(x, z - 1.6 * s, q.pts) < q.w / 2 + 0.6)) continue;
    if (z > 20 && Math.abs(x) < 24 && k < 0.6) continue;
    out.push({ x, z, s, kind: k < 0.45 ? 'pine' : 'tree', seed: i });
  }
  for (const [x, z] of [[-1.9, 11.4], [2.2, 12.0]]) out.push({ x, z, s: 0.75, kind: 'tree', seed: 900 + x });
  for (let i = 0; i < 50; i++) { const x = (rnd() - 0.5) * 64, z = (rnd() - 0.5) * 50; if (!inEllipse(x, z, 1.15) && !avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r) && !ROADS_OUT.some((q) => polyDist(x, z, q.pts) < q.w / 2 + 0.6)) out.push({ x, z, s: 0.4 + rnd() * 0.3, kind: rnd() < 0.5 ? 'bush' : 'rock', seed: 2000 + i }); }
  return out;
}
export function buildTree(root, t) {
  reseed(77 + Math.round(t.seed * 13));
  if (t.kind === 'pine') pine(root, t.x, t.z, t.s); else if (t.kind === 'tree') tree(root, t.x, t.z, t.s); else if (t.kind === 'bush') bush(root, t.x, t.z, t.s); else rock(root, t.x, t.z, t.s);
}
