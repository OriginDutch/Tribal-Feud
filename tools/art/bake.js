// Bakes the 3D village into 2D sprites, all from one fixed orthographic camera.
// Every sprite is rendered in place (same world position as in the village) with its own cropped
// frustum, so the game only has to paste the pieces at their pixel offsets, back to front.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DUSK, lights, anims, smokes, people, blockers, gates, reseed, opts, LOOP, person, walkPose, group, box, M } from './lib.js';
import * as L from './layout.js';

opts.noPeople = new URLSearchParams(location.search).get('people') !== '1';
export const PPU = 32; // pixels per world unit
const YAW = THREE.MathUtils.degToRad(28), PITCH = THREE.MathUtils.degToRad(34);
const DIR = new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH));
const CTR = L.BOUNDS.getCenter(new THREE.Vector3());
const SUN = new THREE.Vector3(...(DUSK ? [-14, 6, 4] : [-10, 16, 9])).normalize();

// global camera: defines the pixel grid every sprite snaps to
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
cam.position.copy(CTR).addScaledVector(DIR, 150); cam.lookAt(CTR); cam.updateMatrixWorld();
const toCam = (p) => p.clone().applyMatrix4(cam.matrixWorldInverse);
const G = (() => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const x of [L.BOUNDS.min.x, L.BOUNDS.max.x]) for (const y of [L.BOUNDS.min.y, L.BOUNDS.max.y]) for (const z of [L.BOUNDS.min.z, L.BOUNDS.max.z]) { const q = toCam(new THREE.Vector3(x, y, z)); a = Math.min(a, q.x); b = Math.max(b, q.x); c = Math.min(c, q.y); d = Math.max(d, q.y); } return { minX: a, maxX: b, minY: c, maxY: d }; })();
G.minY -= 0.3;
export const FRAME = { w: Math.round((G.maxX - G.minX) * PPU), h: Math.round((G.maxY - G.minY) * PPU) };

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = DUSK ? 1.45 : 1.0;
document.body.appendChild(renderer.domElement);

function worldBox(obj, filter) {
  const box = new THREE.Box3(), b = new THREE.Box3();
  obj.updateMatrixWorld(true);
  obj.traverse((o) => { if (o.isMesh && o.visible && filter(o)) { b.setFromObject(o); box.union(b); } });
  return box;
}
const isAnimated = (o) => { for (let q = o; q; q = q.parent) if (q.userData?.animated) return true; return false; };
const isFlat = (o) => { const b = new THREE.Box3().setFromObject(o); return b.max.y < 0.09 && b.max.y - b.min.y < 0.07; };

/**
 * Render `root` (already built in world coordinates). part: 'all' | 'decal' (flat ground pieces only) | 'body' (the rest, with shadows).
 * Returns null when nothing is visible.
 */
function shoot(root, part, anchor, { shadows = true, ao = true, fixedBox = null, keepScene = false, mustDraw = part === 'all' || part === 'body', shadowH = Infinity } = {}) {
  if (part !== 'frames') root.traverse((o) => { if (o.isMesh) o.visible = !isAnimated(o) && (part === 'all' || (part === 'decal' ? isFlat(o) : !isFlat(o))); });
  const box = fixedBox ?? worldBox(root, () => true);
  if (box.isEmpty()) return null;
  // the sprite must also hold the shadow: extend the box by the top corners projected along the sun
  const ext = box.clone();
  if (part !== 'decal' && shadows) for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) { const k = Math.min(box.max.y, shadowH) / SUN.y; ext.expandByPoint(new THREE.Vector3(x - SUN.x * k, 0, z - SUN.z * k)); }
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const x of [ext.min.x, ext.max.x]) for (const y of [ext.min.y, ext.max.y]) for (const z of [ext.min.z, ext.max.z]) { const q = toCam(new THREE.Vector3(x, y, z)); a = Math.min(a, q.x); b = Math.max(b, q.x); c = Math.min(c, q.y); d = Math.max(d, q.y); }
  // snap to the global pixel grid, with a pixel of margin
  const px0 = Math.floor((a - G.minX) * PPU) - 2, px1 = Math.ceil((b - G.minX) * PPU) + 2;
  const py0 = Math.floor((G.maxY - d) * PPU) - 2, py1 = Math.ceil((G.maxY - c) * PPU) + 2;
  const w = px1 - px0, h = py1 - py0;
  const scene = new THREE.Scene();
  const parent = root.parent;
  scene.add(root);
  if (part !== 'decal' && shadows) {
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(ext.max.x - ext.min.x + 2, ext.max.z - ext.min.z + 2), new THREE.ShadowMaterial({ opacity: DUSK ? 0.42 : 0.3 }));
    sc.rotation.x = -Math.PI / 2; sc.position.set((ext.min.x + ext.max.x) / 2, 0.002, (ext.min.z + ext.max.z) / 2); sc.receiveShadow = true; scene.add(sc);
  }
  scene.add(new THREE.HemisphereLight(DUSK ? 0x7484b8 : 0xcfe0ff, DUSK ? 0x302a20 : 0x5a4a30, DUSK ? 1.35 : 1.0));
  const sun = new THREE.DirectionalLight(DUSK ? 0xd89a78 : 0xfff1d6, DUSK ? 1.4 : 2.6);
  const c3 = ext.getCenter(new THREE.Vector3()), span = ext.getSize(new THREE.Vector3()).length() + 2;
  sun.position.copy(c3).addScaledVector(SUN, span * 2); sun.target.position.copy(c3); scene.add(sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -span / 2, right: span / 2, top: span / 2, bottom: -span / 2, near: 0.1, far: span * 4 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun);
  const glow = [];
  if (DUSK) for (const l of lights) {
    if (!l.i) continue;
    l.obj.updateWorldMatrix(true, false);
    const p = l.p.clone().applyMatrix4(l.obj.matrixWorld);
    const pl = new THREE.PointLight(l.col, l.i, l.d, 1.8); pl.position.copy(p); scene.add(pl);
    const q = toCam(p); glow.push({ x: Math.round((q.x - G.minX) * PPU), y: Math.round((G.maxY - q.y) * PPU), r: Math.round(l.d * PPU * 0.55), i: l.i, col: '#' + new THREE.Color(l.col).getHexString() });
  }
  const smoke = part === 'decal' || part === 'frames' ? [] : smokes.map((m) => { m.obj.updateWorldMatrix(true, false); const q = toCam(m.p.clone().applyMatrix4(m.obj.matrixWorld)); return [Math.round((q.x - G.minX) * PPU), Math.round((G.maxY - q.y) * PPU)]; });
  const sub = cam.clone();
  Object.assign(sub, { left: G.minX + px0 / PPU, right: G.minX + px1 / PPU, top: G.maxY - py0 / PPU, bottom: G.maxY - py1 / PPU });
  sub.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (ao) {
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, sub));
    const pass = new GTAOPass(scene, sub, w, h); pass.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1, scale: 1.2 }); composer.addPass(pass);
    composer.addPass(new OutputPass());
    composer.render();
    composer.dispose(); pass.dispose?.(); rt.dispose();
  } else renderer.render(scene, sub);
  const data = renderer.domElement.toDataURL('image/png');
  if (mustDraw) {
    // a lost/garbled GPU context renders nothing: fail loudly so the driver retries on a fresh page
    const gl = renderer.getContext(), px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let any = false; for (let i = 3; i < px.length; i += 16) if (px[i] > 8) { any = true; break; }
    if (!any) throw new Error('blank render');
  }
  const depth = anchor ? toCam(anchor).z : 0;
  sun.shadow.dispose(); renderer.renderLists.dispose();
  if (keepScene) { scene.remove(root); if (parent) parent.add(root); } else scene.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  return { data, x: px0, y: py0, w, h, depth, glow, smoke };
}

function fresh() { for (const a of [lights, anims, smokes, people, blockers, gates]) a.length = 0; return new THREE.Group(); }
function settle() { for (const f of anims) f(0.6); }
const ground0 = new THREE.Vector3();

const OCCLUDER = new THREE.MeshBasicMaterial({ colorWrite: new URLSearchParams(location.search).get("debug") === "1", color: 0xff0000 });
const FRAMES = 32;
/** Animated pieces of `root` over one loop, in small clusters; everything else only hides what is behind it. */
function frames(root, keyBase, anchor) {
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isMesh && !isAnimated(o)) { o.material = OCCLUDER; o.castShadow = false; } });
  // top-most animated objects
  // only things on the ground cast shadows here (flags and flames up high would smear long shadows across the frame)
  root.traverse((o) => { if (o.isMesh && isAnimated(o)) { const b = new THREE.Box3().setFromObject(o); if (b.min.y > 0.3) o.castShadow = false; } });
  const tops = [];
  root.traverse((o) => { if (o.userData?.animated && !(o.parent && isAnimated(o.parent))) tops.push(o); });
  const at = (k) => { for (const f of anims) f(LOOP + (k * LOOP) / FRAMES); root.updateMatrixWorld(true); };
  // the box each sweeps through over the loop
  const sweeps = tops.map(() => new THREE.Box3());
  for (let k = 0; k < FRAMES; k++) { at(k); tops.forEach((t, i) => sweeps[i].union(worldBox(t, () => true))); }
  // cluster objects whose boxes (padded) touch
  const live = tops.map((t, i) => i).filter((i) => !sweeps[i].isEmpty());
  const groups = live.map((i) => ({ box: sweeps[i].clone().expandByScalar(0.25), items: [i] }));
  for (let merged = true; merged;) {
    merged = false;
    for (let a = 0; a < groups.length && !merged; a++) for (let b = a + 1; b < groups.length; b++) if (groups[a].box.intersectsBox(groups[b].box)) { groups[a].box.union(groups[b].box); groups[a].items.push(...groups[b].items); groups.splice(b, 1); merged = true; break; }
  }
  const out = [];
  groups.forEach((gr, ci) => {
    const box = new THREE.Box3(); for (const i of gr.items) box.union(sweeps[i]);
    const mine = new Set(gr.items.map((i) => tops[i]));
    for (let k = 0; k < FRAMES; k++) {
      at(k);
      for (const t of tops) if (!mine.has(t)) t.visible = false; else t.visible = true;
      const r = shoot(root, 'frames', anchor, { ao: false, fixedBox: box, keepScene: true, shadowH: 1.4 });
      if (r) out.push({ key: `${keyBase}~${ci}~${k}`, ...r, glow: [], smoke: [] });
    }
  });
  return out;
}

/** One bake job → sprite(s). */
window.bake = (job) => {
  opts.noPeople = !job.anim && job.type !== 'walker';
  reseed(9000 + [...JSON.stringify(job)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
  const root = fresh();
  if (job.type === 'ground') {
    L.buildGround(root);
    // render the full frame in one go
    const scene = new THREE.Scene(); scene.add(root);
    scene.add(new THREE.HemisphereLight(DUSK ? 0x7484b8 : 0xcfe0ff, DUSK ? 0x302a20 : 0x5a4a30, DUSK ? 1.35 : 1.0));
    const sun = new THREE.DirectionalLight(DUSK ? 0xd89a78 : 0xfff1d6, DUSK ? 1.4 : 2.6); sun.position.copy(SUN).multiplyScalar(50); scene.add(sun);
    const sub = cam.clone(); Object.assign(sub, { left: G.minX, right: G.minX + FRAME.w / PPU, top: G.maxY, bottom: G.maxY - FRAME.h / PPU }); sub.updateProjectionMatrix();
    renderer.setSize(FRAME.w, FRAME.h); renderer.render(scene, sub);
    return [{ key: 'ground', data: renderer.domElement.toDataURL('image/png'), x: 0, y: 0, w: FRAME.w, h: FRAME.h, depth: -1e9, glow: [] }];
  }
  const out = [];
  const take = (key, part, anchor, o) => { const r = shoot(root, part, anchor, o); if (r) out.push({ key, ...r }); };
  if (job.anim) opts.noPeople = false;
  if (job.type === 'building' && job.anim) {
    const g = L.buildBuilding(root, job.id, job.stage);
    return frames(root, `${job.id}@${job.stage}`, g.getWorldPosition(new THREE.Vector3()));
  }
  if (job.type === 'gate' && job.anim) { L.buildGate(root, job.kind); return frames(root, `gate-${job.kind}`, new THREE.Vector3(L.GATE[0], 0, L.GATE[1])); }
  if (job.type === 'walker') return walker(job);
  if (job.type === 'building') {
    const g = L.buildBuilding(root, job.id, job.stage); settle();
    const anchor = g.getWorldPosition(new THREE.Vector3());
    take(`${job.id}@${job.stage}:decal`, 'decal', anchor, { ao: false });
    take(`${job.id}@${job.stage}`, 'body', anchor);
    // label + hit anchor: top centre of the body in pixels
    const top = worldBox(root, (o) => !isFlat(o));
    if (!top.isEmpty() && out.length) { const q = toCam(new THREE.Vector3(anchor.x, top.max.y, anchor.z)); out[out.length - 1].label = [Math.round((q.x - G.minX) * PPU), Math.round((G.maxY - q.y) * PPU)]; const f = toCam(anchor); out[out.length - 1].foot = [Math.round((f.x - G.minX) * PPU), Math.round((G.maxY - f.y) * PPU)]; }
  } else if (job.type === 'home') {
    const h = L.buildHome(root, job.i); settle();
    take(`home${job.i}`, 'all', h.getWorldPosition(new THREE.Vector3()));
  } else if (job.type === 'well') {
    L.buildWell(root); take('well', 'all', new THREE.Vector3(4.8, 0, -0.2));
  } else if (job.type === 'wall') {
    L.buildWallSegment(root, job.kind, job.i); settle();
    const [x1, z1] = L.wallPoint(job.i), [x2, z2] = L.wallPoint(job.i + 1);
    take(`wall-${job.kind}-${job.i}`, 'all', new THREE.Vector3((x1 + x2) / 2, 0, (z1 + z2) / 2));
  } else if (job.type === 'gate') {
    L.buildGate(root, job.kind); settle();
    take(`gate-${job.kind}`, 'all', new THREE.Vector3(L.GATE[0], 0, L.GATE[1]));
  } else if (job.type === 'trees') {
    const all = L.forest();
    for (const i of job.items) L.buildTree(root, all[i]);
    const [cx, cz] = job.center;
    take(`trees${job.cell}`, 'all', new THREE.Vector3(cx, 0, cz), { ao: false });
  }
  void ground0;
  return out;
};
/** A figure walking in 16 directions × 8 steps (+ standing), at the origin; the game moves it around. */
const WALK_STEPS = 8, DIRS = 16;
function walker(job) {
  const out = [];
  for (let d = 0; d < DIRS; d++) {
    for (let k = 0; k <= WALK_STEPS; k++) {
      for (const a of [lights, anims, people, blockers, gates]) a.length = 0;
      reseed(job.seed ?? 5);
      const root = new THREE.Group();
      const ry = (d / DIRS) * Math.PI * 2;
      let fig;
      if (job.kind === 'barrow') {
        const wb = group(root, 0, 0, ry);
        fig = person(wb, 0, -0.45, 0, {}); fig.userData.busyArm = true; fig.userData.arms[0].rotation.x = -0.55; fig.userData.arms[1].rotation.x = -0.55;
        box(wb, 0.42, 0.22, 0.55, M.woodLight, 0, 0.18, 0.15); for (const s of [-1, 1]) box(wb, 0.04, 0.04, 0.5, M.beam, s * 0.17, 0.32, -0.2);
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 12), M.wood); wh.rotation.z = Math.PI / 2; wh.position.set(0, 0.13, 0.5); wh.castShadow = true; wb.add(wh);
        for (let i = 0; i < 3; i++) { const sk = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), M.cloth); sk.position.set(-0.1 + i * 0.1, 0.42, 0.12 + (i % 2) * 0.1); sk.castShadow = true; wb.add(sk); }
        wh.rotation.x = k * 0.8;
      } else fig = person(root, 0, 0, ry, { kind: job.kind, carry: job.carry, color: job.color });
      const dist = (k / WALK_STEPS) * ((2 * Math.PI) / 9.5);
      walkPose(fig, dist, k < WALK_STEPS);
      const r = shoot(root, 'frames', new THREE.Vector3(0, 0, 0), { ao: false, mustDraw: true });
      if (r) out.push({ key: `walk-${job.name}-${d}-${k}`, ...r });
    }
  }
  return out;
}
window.FRAME = FRAME; window.PPU = PPU;
/** World (x, y, z) → scene pixels and depth, as an affine map: [ax, ay, az, c] per output. */
window.proj = (() => {
  const f = (x, y, z) => { const q = toCam(new THREE.Vector3(x, y, z)); return [(q.x - G.minX) * PPU, (G.maxY - q.y) * PPU, q.z]; };
  const o = f(0, 0, 0), X = f(1, 0, 0), Y = f(0, 1, 0), Z = f(0, 0, 1);
  return [0, 1, 2].map((i) => [X[i] - o[i], Y[i] - o[i], Z[i] - o[i], o[i]]);
})();
window.forestCells = (cell = 3.5) => {
  const all = L.forest(), cells = new Map();
  all.forEach((t, i) => { const k = `${Math.floor(t.x / cell)},${Math.floor(t.z / cell)}`; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i); });
  return [...cells.entries()].map(([k, items]) => { const [a, b] = k.split(',').map(Number); return { cell: k.replace(',', '_'), items, center: [(a + 0.5) * cell, (b + 0.5) * cell] }; });
};
window.layout = { STAGE_LEVELS: L.STAGE_LEVELS, HOMES: L.HOMES.length, WALL_N: L.WALL_N, KINDS: L.WALL_KINDS, SLOTS: Object.keys(L.SLOTS) };
window.__ready = true;
