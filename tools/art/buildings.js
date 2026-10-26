// Every Tribal Feud building as a small diorama, built at the origin and facing +z.
import * as THREE from 'three';
import {
  M, DUSK, rnd, blockers, gates, box, cyl, cone, group, gable, pyramid, windowZ, windowX, doorZ, chimney, torch, addLight, crenels, flag, bannerZ, house,
  barrel, crate, sack, hay, logs, fence, tree, pine, bush, rock, well, brazier, cart, person, horseFig, plaster, sh,
  anim, hammering, chopping, waving, idle, talking, bending, drilling, burst, SPARK,
} from './lib.js';

function patch(g, rx, rz, mat = M.dirt, x = 0, z = 0) { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), mat); m.rotation.x = -Math.PI / 2; m.scale.set(rx, rz, 1); m.position.set(x, 0.012, z); m.receiveShadow = true; g.add(m); return m; }
function slab(g, w, d, mat, x = 0, z = 0, ry = 0, y = 0.014) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.rotation.z = ry; m.position.set(x, y, z); m.receiveShadow = true; g.add(m); return m; }

export const B = {};
/** Roof on posts (open sided), ridge along x. */
function shed(g, x, z, w, d, h, roof = M.thatch, posts = 2) {
  for (let i = 0; i <= posts; i++) for (const s of [-1, 1]) box(g, 0.16, h, 0.16, M.beam, x - w / 2 + (i * w) / posts, 0, z + s * d / 2);
  for (const s of [-1, 1]) box(g, w + 0.1, 0.14, 0.16, M.beam, x, h, z + s * d / 2);
  gable(g, w, d, d * 0.42, 0.3, roof, x, h + 0.14, z, M.wood);
}
const ease2 = (x) => x * x * (3 - 2 * x);

// Hoofdgebouw: stone keep with two half-timber wings
// Hoofdgebouw in 4 stages: 1 longhouse, 2 hall + stone base, 3 stone hall + tower, 4 keep with two wings
B.main = (g, stage = 4) => {
  if (stage === 1) {
    patch(g, 4.2, 2.8, M.dirt, 0, 1.6);
    // thatched longhouse on a low stone footing, posts outside
    const w = 4.6, d = 2.4;
    box(g, w, 0.3, d, M.stone, 0, 0, 0);
    box(g, w, 1.3, d, M.wood, 0, 0.3, 0);
    for (let i = 0; i <= 5; i++) box(g, 0.16, 1.3, 0.16, M.beam, -w / 2 + (i * w) / 5, 0.3, d / 2 + 0.02);
    gable(g, w, d, 1.9, 0.5, M.thatch, 0, 1.6, 0, M.wood);
    doorZ(g, 0, 0.3, d / 2 + 0.03, 0.75, 0.95);
    windowZ(g, -1.4, 0.75, d / 2 + 0.03, 0.36, 0.36); windowZ(g, 1.4, 0.75, d / 2 + 0.03, 0.36, 0.36);
    chimney(g, 1.2, 2.2, -0.3, 1.0);
    flag(g, -2.7, 0, 1.4, M.gold, 2.0);
    logs(g, 3.3, 1.2, 4, 1.5); barrel(g, -2.0, 1.9); cyl(g, 0.6, 0.6, 0.05, M.dirt, 1.6, 0, 2.2, 14);
    idle(person(g, -0.7, 2.1, 0.3, {})); talking(person(g, 1.0, 2.3, -0.6, { carry: 'sack' }));
    return;
  }
  if (stage === 2) {
    patch(g, 4.8, 3.0, M.dirt, 0, 1.8);
    // half-timber hall on a stone ground floor
    house(g, 0, 0, 4.4, 2.8, { f1: 1.4, f2: 1.2, roof: M.roofOrange, chimney: true, doorW: 0.9, doorH: 1.1, wall: M.stone, gableMat: M.wood });
    flag(g, -2.7, 0, 1.6, M.gold, 2.4);
    torch(g, -0.65, 1.0, 1.5); torch(g, 0.65, 1.0, 1.5);
    box(g, 1.3, 0.16, 0.45, M.stone, 0, 0, 1.65);
    barrel(g, -1.9, 2.0); crate(g, 2.0, 2.0);
    idle(person(g, -0.55, 2.4, 0.3, { kind: 'soldier' })); talking(person(g, 1.3, 2.7, -0.6, {}));
    return;
  }
  if (stage === 3) {
    patch(g, 5.4, 3.2, M.cobble, 0, 2.0);
    // square stone tower + one hall wing
    const kw = 2.8, kd = 2.6, kh = 5.0;
    box(g, kw + 0.3, 0.5, kd + 0.3, M.stone, 0.6, 0, 0);
    box(g, kw, kh, kd, M.stone, 0.6, 0.5, 0);
    pyramid(g, kw + 0.5, 1.9, M.slate, 0.6, kh + 0.5, 0);
    doorZ(g, 0.6, 0.5, kd / 2 + 0.02, 0.9, 1.3);
    windowZ(g, 0.6, 2.6, kd / 2 + 0.02, 0.32, 0.7, false); windowZ(g, 0.6, 4.1, kd / 2 + 0.02, 0.32, 0.6, false);
    windowX(g, 0.6 + kw / 2 + 0.02, 3.6, 0, 0.32, 0.7);
    flag(g, 0.6, kh + 2.3, 0, M.gold, 1.2);
    bannerZ(g, 0.6 - 0.95, 3.6, kd / 2 + 0.03, M.gold); bannerZ(g, 0.6 + 0.95, 3.6, kd / 2 + 0.03, M.gold);
    house(g, -2.7, 0.2, 3.4, 2.6, { chimney: true, roof: M.roofOrange, doorX: -0.5 });
    torch(g, 0.0, 1.3, kd / 2 + 0.12); torch(g, 1.2, 1.3, kd / 2 + 0.12);
    box(g, 1.5, 0.18, 0.5, M.stone, 0.6, 0, kd / 2 + 0.35);
    barrel(g, 2.7, 1.9); crate(g, -1.4, 2.3);
    idle(person(g, 0.05, 2.6, 0.3, { kind: 'soldier' })); idle(person(g, 1.2, 2.6, -0.3, { kind: 'soldier' }));
    talking(person(g, -2.2, 2.8, 0.5, {}));
    return;
  }
  patch(g, 6.2, 3.4, M.cobble, 0, 2.2);
  const kw = 3.2, kd = 3.0, kh = 6.4;
  box(g, kw + 0.3, 0.5, kd + 0.3, M.stone, 0, 0, 0);
  box(g, kw, kh, kd, M.stone, 0, 0.5, 0);
  box(g, kw + 0.12, 0.18, kd + 0.12, M.stone, 0, 3.3, 0);
  crenels(g, 0, kh + 0.5, 0, kw, kd);
  doorZ(g, 0, 0.5, kd / 2 + 0.02, 1.0, 1.4);
  for (const y of [2.4, 4.4]) windowZ(g, 0, y, kd / 2 + 0.02, 0.32, 0.7, false);
  windowX(g, kw / 2 + 0.02, 4.4, 0, 0.32, 0.7);
  flag(g, 0, kh + 1.0, 0, M.gold);
  for (const s of [-1, 1]) bannerZ(g, s * 1.05, 4.0, kd / 2 + 0.03, M.gold);
  house(g, -3.6, 0.3, 3.6, 2.8, { chimney: true, roof: M.roofOrange, doorX: -0.6 });
  house(g, 3.6, 0.3, 3.6, 2.8, { roof: M.roofOrange, doorX: 0.6 });
  torch(g, -0.75, 1.3, kd / 2 + 0.12); torch(g, 0.75, 1.3, kd / 2 + 0.12);
  // steps
  box(g, 1.6, 0.18, 0.5, M.stone, 0, 0, kd / 2 + 0.35); box(g, 1.3, 0.18, 0.35, M.stone, 0, 0.18, kd / 2 + 0.25);
  barrel(g, -2.1, 2.2); barrel(g, -1.75, 2.45); crate(g, 2.2, 2.3); crate(g, 2.55, 2.6, 0.35);
  idle(person(g, -0.6, 3.0, 0.4, { kind: 'soldier' })); idle(person(g, 0.65, 3.0, -0.3, { kind: 'soldier' }));
  talking(person(g, 1.5, 4.0, -2.4, { carry: 'sack' })); talking(person(g, 1.2, 3.4, 0.5, {}));
};

// Kazerne: long hall + training yard
B.barracks = (g, stage = 3) => {
  if (stage === 1) {
    patch(g, 3.8, 2.8, M.dirt, 0, 1.2);
    box(g, 3.6, 1.5, 2.2, M.wood, 0, 0, -0.6); gable(g, 3.6, 2.2, 1.3, 0.35, M.thatch, 0, 1.5, -0.6, M.wood);
    doorZ(g, 0.6, 0, 0.52, 0.7, 1.0); windowZ(g, -0.8, 0.7, 0.52, 0.36, 0.4);
    flag(g, 2.2, 0, 0.6, M.red, 2.0);
    fence(g, [[-2.2, 0.9], [-2.2, 3.0], [2.4, 3.0], [2.4, 0.9]]);
    for (const x of [1.5]) { box(g, 0.08, 1.1, 0.08, M.beam, x, 0, 2.4); box(g, 0.5, 0.06, 0.06, M.beam, x, 0.8, 2.4); const s = sh(new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), M.hay)); s.position.set(x, 1.2, 2.4); g.add(s); cyl(g, 0.14, 0.14, 0.4, M.hay, x, 0.55, 2.4, 8); }
    for (let c = 0; c < 3; c++) drilling(person(g, -1.4 + c * 0.6, 1.8, 0, { kind: 'soldier' }));
    waving(person(g, -0.8, 2.6, Math.PI, { kind: 'knight', color: 0x2a3a6a }));
    return;
  }
  patch(g, 5.4, 3.6, M.dirt, 0.2, 1.6);
  const w = 6, d = 2.8;
  box(g, w, 1.6, d, M.stone, 0, 0, -0.6);
  box(g, w + 0.3, 0.14, d + 0.3, M.beam, 0, 1.6, -0.6);
  box(g, w + 0.3, 1.3, d + 0.3, plaster(w), 0, 1.74, -0.6);
  gable(g, w + 0.3, d + 0.3, 1.7, 0.35, M.roofRed, 0, 3.04, -0.6, plaster(3));
  for (const x of [-2.2, -0.8, 2.2]) windowZ(g, x, 0.75, d / 2 - 0.58, 0.32, 0.5, false);
  for (const x of [-2.2, -0.8, 0.8, 2.2]) windowZ(g, x, 2.15, d / 2 - 0.43, 0.4, 0.45);
  doorZ(g, 0.8, 0, d / 2 - 0.58, 0.8, 1.15);
  chimney(g, -2.3, 3.6, -1.2, 1.2);
  flag(g, 3.4, 0, 1.2, M.red, 2.4);
  torch(g, 0.25, 1.0, d / 2 - 0.5); torch(g, 1.35, 1.0, d / 2 - 0.5);
  fence(g, [[-3.6, 1.2], [-3.6, 4.4], [3.8, 4.4], [3.8, 1.2]]);
  // weapon rack
  box(g, 1.6, 0.08, 0.08, M.beam, -2.4, 0.9, 1.3); for (let i = 0; i < 5; i++) { const sp = cyl(g, 0.015, 0.015, 1.3, M.beam, -3.0 + i * 0.3, 0, 1.25, 5); sp.rotation.x = -0.15; }
  // training dummies
  for (const x of [2.2, 3.1]) { box(g, 0.08, 1.1, 0.08, M.beam, x, 0, 3.6); box(g, 0.5, 0.06, 0.06, M.beam, x, 0.8, 3.6); const s = sh(new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), M.hay)); s.position.set(x, 1.2, 3.6); g.add(s); cyl(g, 0.14, 0.14, 0.4, M.hay, x, 0.55, 3.6, 8); }
  // drilling squad
  for (let r = 0; r < (stage >= 3 ? 2 : 1); r++) for (let c = 0; c < 4; c++) drilling(person(g, -2.2 + c * 0.6, 2.2 + r * 0.65, 0, { kind: 'soldier' }));
  waving(person(g, -1.3, 3.75, Math.PI, { kind: 'knight', color: 0x2a3a6a }));
  if (stage >= 3) { // corner watchtower
    box(g, 1.2, 3.4, 1.2, M.stone, -4.5, 0, 1.4); crenels(g, -4.5, 3.4, 1.4, 1.2, 1.2); windowZ(g, -4.5, 2.2, 2.02, 0.22, 0.5, false); flag(g, -4.5, 3.8, 1.4, M.red, 1.2); idle(person(g, -4.5, 1.4, 0.4, { kind: 'archer' })).position.y = 3.65;
  }
  if (stage < 3) return;
  // archery
  const t = group(g, 1.0, 3.9, 0); cyl(t, 0.32, 0.32, 0.06, M.cloth, 0, 0.4, 0, 16).rotation.x = Math.PI / 2; cyl(t, 0.2, 0.2, 0.07, M.red, 0, 0.4, 0, 16).rotation.x = Math.PI / 2;
  { const a = person(g, 1.0, 2.2, 0, { kind: 'archer' }); const L = a.userData.arms[0], Rr = a.userData.arms[1]; a.userData.busyArm = true;
    const arrow = box(g, 0.02, 0.02, 0.32, M.beam, 1.0, 0.62, 2.4); const ah = box(g, 0.04, 0.04, 0.06, M.steel, 0, 0, 0); arrow.add(ah); ah.position.set(0, 0, 0.17); g.remove(ah); arrow.add(ah);
    arrow.userData.animated = true; anim((t) => { const c = (t / 3.2) % 1; const draw = c < 0.55 ? ease2(c / 0.55) : 0; L.rotation.x = -1.45; Rr.rotation.x = -1.45 + draw * 0.1; Rr.position.z = -draw * 0.18; a.userData.torso.rotation.y = -0.15;
      const fly = c >= 0.55 ? Math.min(1, (c - 0.55) / 0.12) : 0; arrow.position.set(1.0, 0.62 + Math.sin(fly * Math.PI) * 0.12, 2.5 + fly * 1.32); arrow.visible = c < 0.95; }); }
};

// Stal: barn with open stalls, paddock and horses
B.stable = (g, stage = 3) => {
  if (stage === 1) {
    patch(g, 3.8, 2.8, M.dirt, 0, 1.0);
    box(g, 3.0, 0.2, 2.0, M.wood, 0, 0, -0.6);
    box(g, 3.0, 1.6, 0.16, M.wood, 0, 0.2, -1.52); for (const s of [-1, 1]) box(g, 0.16, 1.6, 2.0, M.wood, s * 1.42, 0.2, -0.6);
    box(g, 0.1, 0.9, 1.8, M.woodLight, 0, 0.2, -0.6);
    gable(g, 3.0, 2.0, 1.0, 0.35, M.thatch, 0, 1.8, -0.6, M.wood);
    horseFig(g, -0.7, -0.4, -Math.PI / 2, M.horse);
    fence(g, [[-1.8, 0.7], [-1.8, 2.6], [2.0, 2.6], [2.0, 0.7]]);
    horseFig(g, 0.4, 1.6, 0.4, M.horseLight, { graze: true });
    hay(g, 2.4, -0.6, 0.35); bending(person(g, -1.0, 1.5, 0.6, { carry: 'basket' }));
    return;
  }
  patch(g, 5.6, 3.8, M.dirt, 0, 1.4);
  const w = 6.4, d = 2.6;
  box(g, w, 0.3, d, M.stone, 0, 0, -0.8);
  box(g, w, 1.9, 0.2, M.wood, 0, 0.3, -0.8 - d / 2 + 0.1);
  for (const s of [-1, 1]) box(g, 0.2, 1.9, d, M.wood, s * (w / 2 - 0.1), 0.3, -0.8);
  for (let i = 0; i <= 5; i++) { const x = -w / 2 + 0.1 + i * ((w - 0.2) / 5); box(g, 0.18, 1.9, 0.18, M.beam, x, 0.3, -0.8 + d / 2 - 0.1); if (i < 5) box(g, 0.1, 0.9, d - 0.3, M.woodLight, x + 0.05, 0.3, -0.8); }
  box(g, w, 0.18, 0.2, M.beam, 0, 2.2, -0.8 + d / 2 - 0.1);
  gable(g, w, d, 1.4, 0.45, M.thatch, 0, 2.3, -0.8, M.wood);
  // hayloft door
  box(g, 0.8, 0.6, 0.06, M.beam, 0, 2.45, -0.8 + d / 2 + 0.38);
  for (const [x, m] of [[-2.0, M.horse], [-0.75, M.horseDark], [0.5, M.horseLight], [1.75, M.horse]]) horseFig(g, x, -0.5, -Math.PI / 2, m);
  // paddock
  fence(g, [[-3.2, 0.9], [-3.2, 4.2], [3.4, 4.2], [3.4, 0.9]]);
  horseFig(g, -1.6, 2.6, 0.5, M.horseLight, { graze: true }); if (stage >= 3) horseFig(g, 1.5, 3.0, 2.6, M.horseDark, { graze: true });
  if (stage >= 3) { // hayloft barn on the side
    box(g, 2.0, 2.2, 2.4, M.wood, -4.4, 0, -1.2); gable(g, 2.0, 2.4, 1.3, 0.3, M.thatch, -4.4, 2.2, -1.2, M.wood); box(g, 0.7, 0.7, 0.06, M.woodLight, -4.4, 1.6, 0.0); hay(g, -4.4, 0.6, 0.35);
  }
  // trough + hay
  box(g, 1.2, 0.3, 0.4, M.wood, 2.3, 0, 1.6); box(g, 1.05, 0.04, 0.28, M.water, 2.3, 0.27, 1.6);
  hay(g, 3.9, -1.6); if (stage < 3) { hay(g, -3.9, 0.2); hay(g, -3.9, 1.0, 0.35); }
  bending(person(g, 0.2, 1.8, 2.2, { carry: 'basket' }));
  torch(g, -w / 2 - 0.05, 1.3, 0.5);
};

// Werkplaats: open timber workshop with a crane, ram and catapult
B.garage = (g, stage = 3) => {
  if (stage === 1) {
    patch(g, 3.6, 2.6, M.dirt, 0, 0.6);
    // lean-to against a plank wall, a ram on trestles
    box(g, 3.4, 1.8, 0.14, M.wood, 0, 0, -1.4);
    for (const x of [-1.6, 1.6]) box(g, 0.16, 1.3, 0.16, M.beam, x, 0, 0.2);
    const r0 = box(g, 3.6, 0.1, 1.9, M.roofBrown, 0, 1.45, -0.6); r0.rotation.x = 0.28;
    const log = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.0, 10), M.wood)); log.rotation.z = Math.PI / 2; log.position.set(0, 0.62, -0.5); g.add(log);
    for (const x of [-0.7, 0.7]) { for (const s of [-1, 1]) { const l = box(g, 0.06, 0.55, 0.06, M.beam, x, 0, -0.5 + s * 0.12); l.rotation.x = s * 0.3; } }
    logs(g, -2.4, 0.9, 6, 0.3);
    { const hit = burst(g, 0.3, 0.75, -0.25, M.woodLight, 5, 0.4); hammering(person(g, 0.3, 0.25, Math.PI, { tool: 'hammer' }), 0.95, 0.2, hit); }
    return;
  }
  patch(g, 5.4, 3.6, M.dirt, 0, 0.8);
  const w = 5, d = 3;
  box(g, w, 0.2, d, M.woodLight, 0, 0, -0.8);
  for (const [x, z] of [[-w / 2, -2.3], [w / 2, -2.3], [-w / 2, 0.7], [w / 2, 0.7], [0, 0.7], [0, -2.3]]) box(g, 0.22, 2.4, 0.22, M.beam, x, 0, z);
  box(g, w + 0.2, 2.4, 0.16, M.wood, 0, 0, -2.3);
  gable(g, w, d, 1.5, 0.45, M.roofBrown, 0, 2.4, -0.8, M.wood);
  // ram under construction
  const r = group(g, -1.0, -0.6, 0);
  box(r, 1.9, 0.12, 0.9, M.wood, 0, 0.35, 0);
  for (const s of [-1, 1]) for (const xx of [-0.6, 0.6]) { const w2 = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 12), M.wood)); w2.rotation.x = Math.PI / 2; w2.position.set(xx, 0.25, s * 0.48); r.add(w2); }
  const log = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.2, 10), M.wood)); log.rotation.z = Math.PI / 2; log.position.set(0.1, 0.85, 0); r.add(log);
  cone(r, 0.17, 0.3, M.iron, 1.3, 0.7, 0, 10).rotation.z = -Math.PI / 2;
  for (const s of [-1, 1]) { box(r, 0.08, 0.9, 0.08, M.beam, -0.6, 0.45, s * 0.38); box(r, 0.08, 0.9, 0.08, M.beam, 0.6, 0.45, s * 0.38); }
  if (stage >= 3) {
  // siege tower being built on the left
  const st = group(g, -3.7, 1.0, 0.25);
  box(st, 1.4, 0.2, 1.4, M.wood, 0, 0.25, 0);
  for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) box(st, 0.14, 3.2, 0.14, M.beam, dx, 0.45, dz);
  for (const y of [1.4, 2.4, 3.5]) box(st, 1.4, 0.1, 1.4, M.woodLight, 0, y, 0);
  box(st, 1.3, 2.0, 0.06, M.wood, 0, 1.4, 0.68); box(st, 0.06, 2.0, 1.3, M.wood, 0.68, 1.4, 0);
  for (const s of [-1, 1]) for (const xx of [-0.5, 0.5]) { const w2 = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 12), M.wood)); w2.rotation.x = Math.PI / 2; w2.position.set(xx, 0.22, s * 0.74); st.add(w2); }
  { const hit = burst(g, -3.2, 2.0, 1.6, M.woodLight, 5, 0.4); const w = person(g, -3.1, 1.75, -0.6, { tool: 'hammer' }); w.position.y = 1.45; hammering(w, 1.0, 0.3, hit); }
  // catapult outside
  const c = group(g, 1.9, 1.9, -0.6);
  box(c, 1.6, 0.16, 0.9, M.wood, 0, 0.25, 0);
  for (const s of [-1, 1]) { const w2 = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 12), M.wood)); w2.rotation.x = Math.PI / 2; w2.position.set(0.45, 0.25, s * 0.5); c.add(w2); const w3 = w2.clone(); w3.position.x = -0.45; c.add(w3); }
  for (const s of [-1, 1]) { const p = box(c, 0.1, 0.9, 0.1, M.beam, 0.1, 0.4, s * 0.3); p.rotation.z = -0.2; }
  const arm = box(c, 1.7, 0.1, 0.1, M.beam, -0.1, 1.0, 0); arm.rotation.z = 0.5;
  box(c, 0.3, 0.12, 0.3, M.wood, -0.82, 0.55, 0);
  // crane
  box(g, 0.18, 3.4, 0.18, M.beam, 2.2, 0, -1.6); const jib = box(g, 1.8, 0.12, 0.12, M.beam, 1.5, 3.3, -1.6); void jib;
  cyl(g, 0.01, 0.01, 1.4, M.dark, 0.7, 1.9, -1.6, 4); crate(g, 0.7, -1.6, 0.4, 1.5);
  }
  logs(g, -3.2, 0.8, 9, 0.3); logs(g, 3.6, -1.0, 6, 1.6);
  { const hit = burst(g, -0.6, 0.85, 0.05, M.woodLight, 5, 0.4); hammering(person(g, -0.6, 0.55, Math.PI, { tool: 'hammer' }), 0.9, 0.2, hit); }
  if (stage >= 3) { const hit = burst(g, 1.55, 0.6, 1.5, M.woodLight, 5, 0.4); hammering(person(g, 1.0, 1.0, 0.9, { tool: 'hammer' }), 1.05, 0.6, hit); }
};

// Adelshoeve: noble manor with a slate-roofed tower and a little garden
B.snob = (g) => {
  patch(g, 5, 3.4, M.cobble, 0, 1.6);
  const w = 4.6, d = 3.0;
  box(g, w, 0.5, d, M.stone, 0, 0, -0.4);
  box(g, w, 2.6, d, M.stone, 0, 0.5, -0.4);
  box(g, w + 0.15, 0.16, d + 0.15, M.stone, 0, 1.7, -0.4);
  gable(g, w, d, 1.7, 0.35, M.slate, 0, 3.1, -0.4, M.stone);
  for (const x of [-1.5, -0.6, 0.6, 1.5]) { windowZ(g, x, 2.15, d / 2 - 0.38, 0.38, 0.7, false); if (Math.abs(x) > 1) windowZ(g, x, 0.85, d / 2 - 0.38, 0.38, 0.6, false); }
  doorZ(g, 0, 0.5, d / 2 - 0.38, 0.8, 1.1, M.woodLight);
  box(g, 1.4, 0.12, 0.6, M.stone, 0, 1.75, d / 2 - 0.1); // balcony
  for (let i = 0; i < 5; i++) box(g, 0.05, 0.3, 0.05, M.stone, -0.6 + i * 0.3, 1.87, d / 2 + 0.15);
  // tower
  cyl(g, 0.9, 1.0, 4.8, M.stone, -2.6, 0, -1.2, 14);
  const cr = sh(new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.0, 14), M.slate)); cr.position.set(-2.6, 5.8, -1.2); g.add(cr);
  windowZ(g, -2.6, 3.4, -1.2 + 0.95, 0.28, 0.6, false);
  flag(g, -2.6, 6.8, -1.2, M.blue, 1.2);
  for (const s of [-1, 1]) bannerZ(g, s * 0.95, 2.2, d / 2 - 0.36, M.blue, 0.42, 1.0);
  // garden
  for (const x of [-1.8, 1.8]) { bush(g, x, 2.6, 0.45); cyl(g, 0.3, 0.32, 0.25, M.stone, x, 0, 2.6, 10); }
  cyl(g, 0.6, 0.65, 0.3, M.stone, 0, 0, 2.6, 16); cyl(g, 0.5, 0.5, 0.04, M.water, 0, 0.28, 2.6, 16); cyl(g, 0.08, 0.1, 0.6, M.stone, 0, 0.3, 2.6, 8);
  talking(person(g, 0.6, 2.0, -0.9, { kind: 'knight', color: 0x2a3a6a })); talking(person(g, -0.15, 1.75, 0.9, { color: 0x6a2a6a, hat: false }), 0.4);
  torch(g, -0.6, 0.9, d / 2 - 0.3); torch(g, 0.6, 0.9, d / 2 - 0.3);
};

// Smederij: stone forge with an open front, glowing hearth, anvil
B.smith = (g, stage = 3) => {
  patch(g, 4.4, 3.2, M.dirt, 0, 1.2);
  const w = 4, d = 3;
  if (stage === 1) {
    // open-air forge: a roof on posts over the hearth
    shed(g, -0.2, -0.6, 3.0, 2.2, 1.9, M.thatch, 2);
    box(g, 1.2, 0.8, 0.9, M.stoneDark, -1.0, 0, -1.0); box(g, 0.8, 0.12, 0.5, M.ember, -1.0, 0.75, -0.95);
    if (DUSK) addLight(g, -1.0, 1.3, -0.4, 0xff6a20, 8, 6);
    const a = group(g, 1.05, 1.8, Math.PI / 2); cyl(a, 0.22, 0.26, 0.45, M.wood, 0, 0, 0, 10); box(a, 0.5, 0.18, 0.2, M.iron, 0, 0.45, 0); cone(a, 0.1, 0.25, M.iron, 0.36, 0.45, 0, 6).rotation.z = -Math.PI / 2;
    barrel(g, 2.0, 0.9);
    { const hit = burst(g, 1.05, 0.68, 1.8, SPARK, 10, 0.8); hammering(person(g, 0.5, 1.8, Math.PI / 2, { kind: 'smith' }), 0.8, 0, hit); }
    return;
  }
  box(g, w, 2.2, 0.3, M.stone, 0, 0, -d / 2 - 0.4);
  for (const s of [-1, 1]) box(g, 0.3, 2.2, d, M.stone, s * (w / 2 - 0.15), 0, -0.4);
  for (const s of [-1, 1]) box(g, 0.3, 2.2, 0.3, M.stone, s * 0.6, 0, d / 2 - 0.55);
  box(g, w, 0.3, 0.3, M.beam, 0, 2.2, d / 2 - 0.55);
  gable(g, w, d + 0.3, 1.6, 0.35, M.roofBrown, 0, 2.2, -0.4, M.stone);
  // hearth + chimney
  box(g, 1.4, 0.9, 1.0, M.stoneDark, -1.0, 0, -1.2);
  box(g, 0.9, 0.12, 0.6, M.ember, -1.0, 0.85, -1.15);
  chimney(g, -1.0, 0.9, -1.4, 3.6);
  if (DUSK) addLight(g, -1.0, 1.4, -0.6, 0xff6a20, 10, 7); else addLight(g, -1.0, 1.4, -0.6, 0xff6a20, 0, 1);
  // anvil + tools
  const a = group(g, 1.05, 1.8, Math.PI / 2);
  cyl(a, 0.22, 0.26, 0.45, M.wood, 0, 0, 0, 10);
  box(a, 0.5, 0.18, 0.2, M.iron, 0, 0.45, 0); cone(a, 0.1, 0.25, M.iron, 0.36, 0.45, 0, 6).rotation.z = -Math.PI / 2;
  barrel(g, 2.0, 0.9); box(g, 0.7, 0.12, 0.08, M.beam, -1.6, 1.4, -1.5);
  // swords on a rack outside
  box(g, 1.2, 0.08, 0.08, M.beam, -1.6, 0.85, 1.8); for (let i = 0; i < 4; i++) box(g, 0.05, 0.8, 0.02, M.steel, -2.0 + i * 0.27, 0.15, 1.75);
  { const hit = burst(g, 1.05, 0.68, 1.8, SPARK, 10, 0.8); hammering(person(g, 0.5, 1.8, Math.PI / 2, { kind: 'smith' }), 0.8, 0, hit); }
  talking(person(g, 1.9, 2.3, -2.2, {}));
  torch(g, 1.0, 1.1, d / 2 - 0.35);
  if (stage >= 3) { // armoury annex with a second chimney
    house(g, 3.6, -0.8, 2.2, 2.0, { f2: 0, roof: M.roofBrown, roofH: 1.1, chimney: true, wall: M.stone, gableMat: M.stone });
    box(g, 1.2, 0.08, 0.08, M.beam, 3.6, 0.9, 0.45); for (let i = 0; i < 4; i++) box(g, 0.24, 0.5, 0.05, M.steel, 3.2 + i * 0.27, 0.5, 0.42);
  }
};

// Verzamelplaats: banners, tents, a stage and a campfire
B.place = (g) => {
  patch(g, 4.4, 3.4, M.dirt, 0, 0.4);
  box(g, 2.4, 0.4, 1.6, M.woodLight, 0, 0, -1.4);
  box(g, 0.8, 0.2, 0.5, M.woodLight, 0, 0, -0.4);
  flag(g, -1.0, 0.4, -1.8, M.red, 2.8); flag(g, 1.0, 0.4, -1.8, M.gold, 2.8);
  for (const [x, z, m] of [[-3.0, -0.8, M.cloth], [3.0, -0.6, M.red], [-2.8, 2.0, M.cloth]]) { const t = group(g, x, z, rnd()); cone(t, 0.9, 1.4, m, 0, 0, 0, 6); box(t, 0.06, 1.8, 0.06, M.beam, 0, 0, 0); }
  brazier(g, 0.9, 1.4, 0.8);
  // map table
  box(g, 1.0, 0.06, 0.7, M.woodLight, -0.8, 0.7, 0.9); for (const [x, z] of [[-1.2, 0.65], [-0.4, 0.65], [-1.2, 1.15], [-0.4, 1.15]]) box(g, 0.06, 0.7, 0.06, M.beam, x, 0, z);
  box(g, 0.8, 0.01, 0.5, M.cloth, -0.8, 0.76, 0.9);
  for (let i = 0; i < 5; i++) idle(person(g, -1.6 + i * 0.75, 2.6, Math.PI, { kind: i % 2 ? 'soldier' : 'archer', color: i % 2 ? undefined : 0x4a6a3a }));
  waving(person(g, 0, -1.2, 0, { kind: 'knight', color: 0x2a3a6a }));
  talking(person(g, -1.5, 1.4, 0.8, {})); crate(g, 2.4, 1.4); barrel(g, 2.8, 1.0);
};

// Standbeeld: paladin on a pedestal in a small garden
B.statue = (g) => {
  patch(g, 2.6, 2.6, M.cobble);
  cyl(g, 1.6, 1.7, 0.2, M.stone, 0, 0, 0, 20);
  box(g, 1.3, 0.3, 1.3, M.marble, 0, 0.2, 0); box(g, 1.0, 1.1, 1.0, M.marble, 0, 0.5, 0); box(g, 1.2, 0.2, 1.2, M.marble, 0, 1.6, 0);
  const st = group(g, 0, 0, 0, 1.8); st.scale.setScalar(2.2);
  const p = person(st, 0, 0, 0, { kind: 'knight' });
  p.traverse((o) => { if (o.isMesh) o.material = M.bronze; });
  const sw = box(st, 0.03, 0.55, 0.02, M.bronze, 0.2, 0.55, 0.05); sw.rotation.z = -0.4;
  for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) bush(g, x, z, 0.5);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const f = sh(new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), [M.red, M.gold, M.cloth][i % 3])); f.position.set(Math.cos(a) * 1.35, 0.25, Math.sin(a) * 1.35); g.add(f); }
  talking(person(g, 1.3, 1.8, -2.4, {})); talking(person(g, 1.75, 1.6, -1.9, { hat: false }), 0.5);
};

// Marktplaats: a covered market hall plus stalls
B.market = (g, stage = 3) => {
  patch(g, 5.2, 3.6, stage === 1 ? M.dirt : M.cobble, 0, 0.6);
  // hall on stone pillars
  const w = 3.6, d = 2.4;
  if (stage >= 2) {
  for (const [x, z] of [[-1.6, -1.9], [0, -1.9], [1.6, -1.9], [-1.6, -0.1], [0, -0.1], [1.6, -0.1]]) box(g, 0.3, 1.5, 0.3, M.stone, x, 0, z);
  box(g, w + 0.4, 1.2, d + 0.4, plaster(w), 0, 1.5, -1.0);
  windowZ(g, -0.9, 1.9, -1.0 + d / 2 + 0.22); windowZ(g, 0.9, 1.9, -1.0 + d / 2 + 0.22);
  gable(g, w + 0.4, d + 0.4, 1.3, 0.35, M.roofRed, 0, 2.7, -1.0, plaster(3));
  for (const x of [-0.8, 0.8]) { crate(g, x, -1.2); sack(g, x + 0.35, -0.8); }
  if (stage >= 3) { box(g, 0.7, 0.8, 0.7, plaster(1), 0, 3.6, -1.0); pyramid(g, 1.0, 0.8, M.roofRed, 0, 4.4, -1.0); flag(g, 0, 5.1, -1.0, M.gold, 1.0); }
  }
  // stalls
  const stall = (x, z, ry, cloth) => {
    const s = group(g, x, z, ry);
    box(s, 1.3, 0.7, 0.6, M.woodLight, 0, 0, 0);
    for (const [xx, zz] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) box(s, 0.06, 1.4, 0.06, M.beam, xx, 0, zz);
    const aw = sh(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.9), cloth)); aw.position.set(0, 1.45, 0.1); aw.rotation.x = 0.25; s.add(aw);
    for (let i = 0; i < 4; i++) { const f = sh(new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), [M.red, M.gold, M.leafLight, M.clay][i])); f.position.set(-0.45 + i * 0.3, 0.76, 0.1); s.add(f); }
    waving(person(s, 0, -0.55, 0, {}));
  };
  if (stage === 1) { stall(-1.2, 0.2, 0.2, M.red); stall(1.2, 0.4, -0.2, M.cloth); cart(g, 2.8, -1.4, 2.6); }
  else { stall(-3.0, 1.0, 0.3, M.red); stall(-0.6, 2.4, 0, M.cloth); if (stage >= 3) stall(2.2, 1.6, -0.4, M.blue); cart(g, 3.6, -1.0, 2.6); }
  idle(person(g, -1.6, 1.6, 0.4, { carry: 'basket' })); if (stage >= 2) { idle(person(g, 1.0, 1.0, 2.4, {})); talking(person(g, 0.6, 3.3, 3.0, { carry: 'sack' })); }
};

// Houthakker: log cabin, saw horse, log piles, stumps among trees
B.wood = (g, stage = 3) => {
  if (stage === 1) {
    patch(g, 3.2, 2.4, M.dirt, 0, 0.6);
    const r0 = box(g, 2.4, 0.1, 1.6, M.thatch, -0.4, 1.3, -0.8); r0.rotation.x = 0.35;
    for (const x of [-1.5, 0.7]) box(g, 0.14, 1.2, 0.14, M.beam, x, 0, -0.1);
    logs(g, -0.4, -1.0, 6, 0); logs(g, 1.9, 0.6, 3, 1.4);
    cyl(g, 0.25, 0.28, 0.4, M.wood, -0.8, 0, 1.0, 10);
    for (const [x, z] of [[2.0, -1.6], [-2.2, 1.6]]) cyl(g, 0.22, 0.26, 0.25, M.wood, x, 0, z, 8);
    for (const [x, z, s] of [[-2.8, -1.8, 1.1], [2.9, -2.0, 1.2], [3.2, 0.8, 1], [-3.0, 0.4, 0.9]]) pine(g, x, z, s);
    { const hit = burst(g, -0.8, 0.45, 1.0, M.woodLight, 6, 0.6); chopping(person(g, -0.8, 0.52, 0, { tool: 'axe' }), 1.4, 0, hit); }
    return;
  }
  patch(g, 4.4, 3.0, M.dirt, 0, 0.8);
  const w = 3, d = 2.4;
  const walls = group(g, 0, -0.6);
  for (let i = 0; i < 8; i++) { const y = 0.12 + i * 0.22; for (const s of [-1, 1]) { const l = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, w + 0.3, 8), M.wood)); l.rotation.z = Math.PI / 2; l.position.set(0, y, s * d / 2); walls.add(l); const l2 = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, d + 0.3, 8), M.wood)); l2.rotation.x = Math.PI / 2; l2.position.set(s * w / 2, y + 0.11, 0); walls.add(l2); } }
  box(walls, w, 1.7, d, M.woodLight, 0, 0.05, 0);
  gable(walls, w, d, 1.2, 0.4, M.thatch, 0, 1.85, 0, M.wood);
  doorZ(walls, -0.6, 0, d / 2 + 0.12, 0.6, 0.95); windowZ(walls, 0.7, 0.75, d / 2 + 0.12);
  chimney(walls, 0.9, 2.2, -0.4, 0.9);
  logs(g, 2.6, 0.2, 10, Math.PI / 2); logs(g, -2.7, 1.2, 6, 0.4);
  // sawhorse + chopping block
  for (const s of [-1, 1]) { const a = box(g, 0.06, 0.7, 0.06, M.beam, 0.8 + s * 0.15, 0, 1.8); a.rotation.z = s * 0.4; }
  const lg = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.4, 8), M.wood)); lg.rotation.z = Math.PI / 2; lg.position.set(0.8, 0.65, 1.8); g.add(lg);
  cyl(g, 0.25, 0.28, 0.4, M.wood, -0.8, 0, 1.9, 10);
  for (const [x, z] of [[-3.4, -1.4], [3.2, 2.4], [-2.0, 2.8]]) cyl(g, 0.22, 0.26, 0.25, M.wood, x, 0, z, 8);
  for (const [x, z, s] of [[-3.8, -2.6, 1.1], [3.8, -2.4, 1.2], [-4.2, 0, 0.9], [stage >= 3 ? 4.4 : 4.4, stage >= 3 ? 1.6 : 1.0, 1]]) pine(g, x, z, s);
  { const hit = burst(g, -0.8, 0.45, 1.9, M.woodLight, 6, 0.6); chopping(person(g, -0.8, 1.42, 0, { tool: 'axe' }), 1.4, 0, hit); }
  if (stage >= 3) {
    shed(g, 4.4, -0.6, 2.6, 1.8, 1.7, M.roofBrown, 2); const bl = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.4, 10), M.wood)); bl.rotation.z = Math.PI / 2; bl.position.set(4.4, 0.5, -0.6); g.add(bl); box(g, 0.02, 0.6, 0.6, M.steel, 4.4, 0.4, -0.6);
  }
  if (stage >= 3) { const sawer = person(g, 0.8, 1.45, 0, {}); sawer.userData.busyArm = true; const saw = box(g, 0.5, 0.06, 0.01, M.steel, 0.8, 0.72, 1.8); saw.userData.animated = true; anim((t) => { const s = Math.sin(t * ((2 * Math.PI) / 3.2) * 3) * 0.15; saw.position.x = 0.8 + s; sawer.userData.arms[1].rotation.x = -1.0 + s; sawer.userData.arms[0].rotation.x = -1.0 + s; }); }
};

// Leemgroeve: terraced clay pit, drying racks and a kiln
B.stone = (g, stage = 3) => {
  // pit: a terraced crater dug into a clay mound
  const prof = (stage === 1 ? [[0, 0.02], [0.9, 0.02], [1.0, 0.24], [1.5, 0.26], [1.9, 0.0]] : [[0, 0.02], [0.7, 0.02], [0.8, 0.22], [1.3, 0.24], [1.4, 0.46], [1.9, 0.48], [2.0, 0.7], [2.5, 0.72], [3.0, 0.0]]).reverse().map(([r, y]) => new THREE.Vector2(r, y));
  const pit = sh(new THREE.Mesh(new THREE.LatheGeometry(prof, 36), M.clay)); pit.scale.set(1, 1, 0.72); pit.position.set(-0.8, 0, -0.4); g.add(pit);
  if (stage === 1) {
    cart(g, -2.6, 0.9, 0.5);
    bending(person(g, -0.6, -0.3, 0.4, { carry: 'basket' })); { const d = person(g, 0.4, 0.6, 2.6, { tool: 'hammer' }); hammering(d, 1.2); }
    rock(g, -2.4, -1.4, 0.5); bush(g, 2.6, 1.0, 0.5); return;
  }
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.62, 20), M.water); water.rotation.x = -Math.PI / 2; water.scale.y = 0.72; water.position.set(-0.8, 0.04, -0.4); g.add(water);
  // ladder down the terraces
  // drying racks with bricks
  for (const z of [1.6, 2.3]) { box(g, 2.2, 0.06, 0.4, M.wood, 2.0, 0.5, z); for (const x of [1.0, 3.0]) box(g, 0.06, 0.5, 0.06, M.beam, x, 0, z); for (let i = 0; i < 7; i++) box(g, 0.22, 0.12, 0.3, M.clay, 1.15 + i * 0.3, 0.56, z); }
  if (stage >= 3) {
  // kiln
  const k = sh(new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.stoneDark)); k.position.set(2.6, 0, -1.0); g.add(k);
  box(g, 0.5, 0.45, 0.2, M.ember, 2.6, 0.05, -0.2);
  chimney(g, 2.8, 0.6, -1.3, 0.8);
  if (DUSK) addLight(g, 2.6, 0.6, 0.3, 0xff6a20, 6, 5);
  }
  cart(g, -3.2, 1.6, 0.5); for (let i = 0; i < 3; i++) box(g, 0.5, 0.3, 0.4, M.clay, 0.2 + i * 0.12, i * 0.3, 2.4);
  box(g, 0.06, 1.0, 0.06, M.beam, -2.4, 0, -1.2);
  bending(person(g, -0.1, -0.1, 0.4, { carry: 'basket' })); { const d = person(g, -1.8, -1.0, 1.2, { tool: 'hammer' }); d.position.y = 0.47; hammering(d, 1.2); } bending(person(g, 1.8, 1.3, Math.PI, {}), 0.3); idle(person(g, -2.0, 1.0, 1.8, { carry: 'sack' }));
  rock(g, -3.6, -1.4, 0.5); bush(g, 3.8, 1.2, 0.5);
};

// IJzermijn: rocky hill with a timbered entrance, rails, ore cart
B.iron = (g, stage = 3) => {
  // hill
  const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 1), M.rock); hill.scale.set(stage === 1 ? 0.95 : 1.25, stage === 1 ? 0.6 : 0.75, 0.85); hill.position.set(0, 0.4, -2.0); hill.castShadow = hill.receiveShadow = true; g.add(hill);
  for (const [x, z, s] of [[-3.0, -0.6, 0.8], [2.8, -0.4, 0.7], [-1.8, 0.4, 0.4], [3.4, 1.0, 0.5]]) rock(g, x, z, s);
  if (stage === 1) {
    box(g, 1.1, 1.3, 1.0, M.dark, 0, 0, 0.2);
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) box(g, 0.05, 0.05, 0.05, M.beam, s * 0.2, 0.2 + i * 0.25, 0.75);
    for (let i = 0; i < 5; i++) { const o = sh(new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), std2())); o.position.set(1.2 + (rnd() - 0.5) * 0.6, 0.12, 1.4 + (rnd() - 0.5) * 0.5); g.add(o); }
    { const hit = burst(g, 1.2, 0.35, 1.4, M.rock, 6, 0.5); hammering(person(g, 0.8, 1.95, 2.6, { kind: 'smith' }), 1.0, 0, hit, true); }
    return;
  }
  // entrance
  box(g, 1.8, 2.0, 1.2, M.dark, 0, 0, 0.25);
  for (const s of [-1, 1]) box(g, 0.25, 2.0, 0.25, M.beam, s * 0.9, 0, 0.9);
  box(g, 2.3, 0.28, 0.3, M.beam, 0, 2.0, 0.9);
  box(g, 2.6, 0.12, 1.4, M.roofBrown, 0, 2.35, 0.5).rotation.x = 0.25;
  torch(g, -1.15, 0.9, 1.0); torch(g, 1.15, 0.9, 1.0);
  if (stage >= 3) {
  // rails
  for (const s of [-1, 1]) box(g, 0.05, 0.05, 3.8, M.iron, s * 0.32, 0, 2.6);
  for (let i = 0; i < 9; i++) box(g, 0.9, 0.04, 0.12, M.wood, 0, 0, 0.9 + i * 0.42);
  // mine cart
  const c = group(g, 0, 2.4, 0);
  box(c, 0.8, 0.45, 0.6, M.iron, 0, 0.18, 0);
  for (let i = 0; i < 5; i++) { const o = sh(new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), std2())); o.position.set(-0.25 + i * 0.12, 0.66, (i % 2) * 0.1 - 0.05); c.add(o); }
  }
  // ore pile
  for (let i = 0; i < 9; i++) { const o = sh(new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + rnd() * 0.1, 0), std2())); o.position.set(2.0 + (rnd() - 0.5) * 0.9, 0.12 + (i > 5 ? 0.2 : 0), 2.4 + (rnd() - 0.5) * 0.7); g.add(o); }
  if (stage >= 3) { box(g, 1.4, 1.2, 1.0, M.wood, -2.4, 0, 2.2); gable(g, 1.4, 1.0, 0.6, 0.2, M.roofBrown, -2.4, 1.2, 2.2, M.wood); }
  idle(person(g, 0.6, 1.6, 0.2, { carry: 'sack' }));
  { const hit = burst(g, 2.0, 0.35, 2.4, M.rock, 6, 0.5); hammering(person(g, 1.6, 2.95, 2.6, { kind: 'smith' }), 1.0, 0, hit, true); }
};
const oreMat = new THREE.MeshStandardMaterial({ color: 0x5a4a44, roughness: 0.6, metalness: 0.4, flatShading: true });
function std2() { return oreMat; }

// Boerderij: farmhouse, barn and fields
B.farm = (g, stage = 3) => {
  if (stage === 1) {
    slab(g, 2.8, 2.0, M.wheat, -0.4, 1.8); fence(g, [[-1.9, 0.7], [-1.9, 2.9], [1.1, 2.9], [1.1, 0.7]]);
    house(g, 0, -1.0, 2.2, 1.9, { f2: 0, roofH: 1.2, roof: M.thatch, chimney: true });
    hay(g, 1.9, -0.2, 0.35);
    for (let i = 0; i < 2; i++) { const ch = sh(new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), M.cloth)); ch.position.set(1.6 + i * 0.25, 0.1, 0.8); g.add(ch); }
    bending(person(g, -0.6, 1.8, 0.3, { carry: 'basket' }));
    return;
  }
  slab(g, 3.2, 2.2, M.wheat, -2.4, 2.0); slab(g, 3.2, 2.2, M.greens, 1.2, 2.0); if (stage >= 3) slab(g, 2.2, 2.2, M.wheat, 4.0, 1.0, 0.3);
  fence(g, [[-4.1, 0.8], [-4.1, 3.2], [2.9, 3.2]]);
  house(g, -1.6, -1.2, 2.8, 2.2, { f2: 0, roofH: 1.4, roof: M.thatch, chimney: true });
  // barn
  box(g, 2.8, 2.2, 2.4, M.wood, 2.0, 0, -1.4); gable(g, 2.8, 2.4, 1.6, 0.3, M.roofBrown, 2.0, 2.2, -1.4, M.wood);
  box(g, 1.2, 1.5, 0.06, M.woodLight, 2.0, 0, -0.17); box(g, 1.3, 0.08, 0.1, M.beam, 2.0, 0.75, -0.12).rotation.z = 0.85; box(g, 1.3, 0.08, 0.1, M.beam, 2.0, 0.75, -0.12).rotation.z = -0.85;
  if (stage >= 3) {
  // windmill
  const wm = group(g, -4.4, -1.6, 0.4);
  cyl(wm, 0.55, 0.8, 2.8, M.stone, 0, 0, 0, 10); cone(wm, 0.75, 0.9, M.thatch, 0, 2.8, 0, 10);
  const hub = group(wm, 0, 0, 0, 2.6); hub.position.z = 0.75;
  for (let i = 0; i < 4; i++) { const b = box(hub, 0.12, 1.6, 0.04, M.beam, 0, 0, 0); b.position.y = 0; b.geometry.translate(0, 0.8, 0); b.rotation.z = (i * Math.PI) / 2 + 0.4; const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.3), M.cloth); sail.geometry.translate(0.26, 0.85, 0.03); sail.rotation.z = b.rotation.z; sail.material.side = THREE.DoubleSide; hub.add(sail); }
  hub.userData.animated = true; anim((t) => { hub.rotation.z = -t * (Math.PI / 3.2); });
  }
  hay(g, 3.8, -0.4); hay(g, 4.3, 0, 0.35);
  for (let i = 0; i < 5; i++) { const c = group(g, 0.2 + i * 0.28, 0.25 + (i % 2) * 0.3, rnd() * 6); c.userData.animated = true; const r0 = c.rotation.y; const bd = sh(new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), M.cloth)); bd.position.y = 0.1; c.add(bd); const hd = group(c, 0, 0, 0, 0.16); hd.position.z = 0.07; const hm = sh(new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), M.cloth)); hm.position.z = 0.03; hd.add(hm); const bk = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.04, 4), M.gold); bk.rotation.x = Math.PI / 2; bk.position.z = 0.08; hd.add(bk); const ph = rnd() * 5; anim((t) => { const k = Math.max(0, Math.sin(t * ((2 * Math.PI) / 3.2) * 3 + ph)) ** 6; hd.rotation.x = k * 1.1; hd.position.y = 0.16 - k * 0.06; c.rotation.y = r0 + Math.sin(t * ((2 * Math.PI) / 3.2) + ph) * 0.3; }); }
  bending(person(g, -2.4, 2.0, 0.3, { carry: 'basket' })); bending(person(g, 1.3, 2.3, -0.5, {}), 0.5); talking(person(g, 0.4, 0.9, 2.6, { carry: 'sack' }));
};

// Opslagplaats: big warehouse, stone ground floor and timber loft, goods outside
B.storage = (g, stage = 3) => {
  if (stage === 1) {
    patch(g, 3.4, 2.4, M.dirt, 0, 0.8);
    shed(g, 0, -0.6, 3.2, 2.0, 1.7, M.thatch, 2);
    for (let i = 0; i < 4; i++) barrel(g, -1.1 + (i % 2) * 0.46, -0.9 + Math.floor(i / 2) * 0.46);
    for (let i = 0; i < 3; i++) crate(g, 0.6 + i * 0.45, -0.7); crate(g, 0.8, -0.7, 0.4, 0.45); for (let i = 0; i < 3; i++) sack(g, 0.6 + i * 0.35, -0.1);
    talking(person(g, 0.2, 1.2, 0.4, { carry: 'sack' }));
    return;
  }
  patch(g, 4.8, 3.2, M.dirt, 0, 1.2);
  const w = stage >= 3 ? 5.2 : 4.4, d = 3.2;
  box(g, w, 1.8, d, M.stone, 0, 0, -0.6);
  if (stage >= 3) {
  box(g, w + 0.2, 0.14, d + 0.2, M.beam, 0, 1.8, -0.6);
  box(g, w + 0.2, 1.4, d + 0.2, M.wood, 0, 1.94, -0.6);
  gable(g, w + 0.2, d + 0.2, 1.9, 0.4, M.roofRed, 0, 3.34, -0.6, M.wood);
  } else gable(g, w, d, 1.6, 0.4, M.roofRed, 0, 1.8, -0.6, M.stone);
  // big doors + loft hoist
  box(g, 1.6, 1.5, 0.12, M.woodLight, 0, 0, d / 2 - 0.55); box(g, 0.06, 1.5, 0.14, M.beam, 0, 0, d / 2 - 0.52);
  if (stage >= 3) {
  box(g, 0.9, 0.9, 0.1, M.woodLight, 0, 2.2, d / 2 - 0.42); box(g, 0.14, 0.14, 1.1, M.beam, 0, 3.5, d / 2 - 0.1);
  cyl(g, 0.01, 0.01, 1.0, M.dark, 0, 2.5, d / 2 + 0.4, 4); crate(g, 0, d / 2 + 0.4, 0.4, 2.1);
  for (const x of [-1.9, 1.9]) windowZ(g, x, 2.4, d / 2 - 0.48);
  }
  for (let i = 0; i < 4; i++) barrel(g, -2.2 + (i % 2) * 0.46, 1.6 + Math.floor(i / 2) * 0.46);
  barrel(g, -2.0, 1.83, 0.5);
  for (let i = 0; i < 3; i++) crate(g, 1.8 + i * 0.5, 1.5); crate(g, 2.05, 1.5, 0.45, 0.45);
  for (let i = 0; i < 4; i++) sack(g, 1.6 + i * 0.35, 2.2);
  if (stage >= 3) cart(g, -0.6, 2.6, 0.2);
  bending(person(g, 0.9, 1.6, 0.6, { carry: 'sack' })); talking(person(g, -1.0, 1.6, -0.4, {}));
  torch(g, -1.0, 1.0, d / 2 - 0.5); torch(g, 1.0, 1.0, d / 2 - 0.5);
};

// Schuilplaats: a hidden cellar hatch under a haystack among bushes
B.hide = (g, stage = 2) => {
  patch(g, 2.2, 1.8, M.dirt);
  box(g, 1.2, 0.12, 0.9, M.wood, 0.3, 0, 0.3);
  const lid = box(g, 0.6, 0.06, 0.9, M.woodLight, -0.1, 0.12, 0.3); lid.rotation.z = 0.9; lid.position.set(-0.3, 0.35, 0.3);
  box(g, 1.0, 0.04, 0.7, M.dark, 0.3, 0.1, 0.3);
  if (stage === 1) { bush(g, -1.2, -0.4, 0.55); bush(g, 1.4, -0.6, 0.5); idle(person(g, 0.6, 1.1, 2.6, { hat: false })); return; }
  hay(g, -1.3, -0.5, 0.32); hay(g, -0.9, -1.0, 0.28);
  const stack = sh(new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.1, 10), M.hay)); stack.position.set(1.4, 0.55, -0.8); g.add(stack);
  for (const [x, z] of [[-1.8, 1.0], [1.8, 1.0], [0.2, -1.6], [2.2, -0.2]]) bush(g, x, z, 0.55);
  idle(person(g, 0.6, 1.1, 2.6, { hat: false }));
};

// Muur: a wall corner with the gatehouse (the whole ring is built in the village scene)
export function wallRing(g, rx, rz, opts = {}) {
  const kind = opts.kind ?? 'full'; // palisade | stone | full
  if (kind === 'palisade') return palisadeRing(g, rx, rz, opts);
  const N = opts.n ?? 28, H = opts.h ?? (kind === 'stone' ? 1.45 : 1.8), T = kind === 'stone' ? 0.65 : 0.8;
  const pts = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2 + Math.PI / 2; pts.push([Math.cos(a) * rx, Math.sin(a) * rz]); }
  // pts[0] is the gate (front, +z)
  const towerAt = (i) => i % 4 === 0 && i !== 0;
  for (let i = 0; i < N; i++) {
    if (opts.only && !opts.only(i)) continue;
    const a = pts[i], b = pts[(i + 1) % N];
    const gateSide = i === 0 || i === N - 1;
    let [x1, z1] = a, [x2, z2] = b;
    if (i === 0) { const t = 2.6 / Math.hypot(x2 - x1, z2 - z1); x1 += (x2 - x1) * t; z1 += (z2 - z1) * t; }
    if (i === N - 1) { const t = 2.6 / Math.hypot(x2 - x1, z2 - z1); x2 -= (x2 - x1) * t; z2 -= (z2 - z1) * t; }
    const len = Math.hypot(x2 - x1, z2 - z1) + T * 0.9, ang = -Math.atan2(z2 - z1, x2 - x1);
    const seg = group(g, (x1 + x2) / 2, (z1 + z2) / 2, ang);
    box(seg, len, H, T, M.stone, 0, 0, 0);
    box(seg, len, 0.12, T + 0.14, M.stone, 0, H, 0);
    const n = Math.floor(len / 0.6);
    for (let k = 0; k < n; k += 2) box(seg, 0.32, 0.38, 0.22, M.stone, -len / 2 + 0.3 + k * 0.6, H + 0.12, T / 2 - 0.05);
    for (let k = 0; k < n; k += 2) box(seg, 0.32, 0.3, 0.18, M.stone, -len / 2 + 0.3 + k * 0.6, H + 0.12, -T / 2 + 0.05);
    void gateSide;
  }
  for (let i = 0; i < N; i++) {
    if (!towerAt(i) || (opts.only && !opts.only(i))) continue;
    const [x, z] = pts[i];
    if (kind === 'stone') { // square wooden lookouts on stone footings
      box(g, 1.3, H + 0.3, 1.3, M.stone, x, 0, z);
      for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) box(g, 0.12, 1.4, 0.12, M.beam, x + dx, H + 0.3, z + dz);
      box(g, 1.4, 0.12, 1.4, M.woodLight, x, H + 0.3, z);
      for (const s of [-1, 1]) { box(g, 1.4, 0.4, 0.06, M.wood, x, H + 0.42, z + s * 0.6); box(g, 0.06, 0.4, 1.4, M.wood, x + s * 0.6, H + 0.42, z); }
      pyramid(g, 1.7, 0.9, M.thatch, x, H + 1.7, z);
      continue;
    }
    cyl(g, 0.95, 1.05, H + 1.2, M.stone, x, 0, z, 12);
    cyl(g, 1.12, 1.12, 0.3, M.stone, x, H + 1.2, z, 12);
    for (let k = 0; k < 10; k += 2) { const a = (k / 10) * Math.PI * 2; box(g, 0.32, 0.4, 0.3, M.stone, x + Math.cos(a) * 0.98, H + 1.5, z + Math.sin(a) * 0.98, -a); }
    if (i % 8 === 0) cone(g, 1.3, 1.6, M.roofRed, x, H + 1.5, z, 12);
  }
  if (!opts.noGate) (kind === 'stone' ? stoneGate : gatehouse)(g, pts[0][0], pts[0][1]);
  return pts;
}
function stake(g, x, z, h) { cyl(g, 0.11, 0.13, h, M.wood, x, 0, z, 6); cone(g, 0.11, 0.26, M.woodLight, x, h, z, 6); }
function palisadeRing(g, rx, rz, opts) {
  const N = 250, H = 1.5;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * rx, z = Math.sin(a) * rz;
    if (Math.abs(x) < 1.4 && z > 0) continue; // gate gap
    if (opts.only) { const seg = Math.floor((i / N) * 28); if (!opts.only(seg)) continue; }
    stake(g, x, z, H + (i % 3) * 0.12);
  }
  if (opts.noGate) return;
  // gate: two posts with a crossbar and a wooden door, a watch platform on each side
  palisadeGate(g, 0, rz);
}
export function palisadeGate(g, gx, gz) {
  const gg = group(g, gx, gz, 0);
  for (const s of [-1, 1]) { box(gg, 0.3, 2.6, 0.3, M.beam, s * 1.25, 0, 0); box(gg, 1.0, 0.1, 1.0, M.woodLight, s * 1.9, 1.6, -0.3); for (const [dx, dz] of [[-0.4, -0.7], [0.4, -0.7], [-0.4, 0.1], [0.4, 0.1]]) box(gg, 0.1, 1.6, 0.1, M.beam, s * 1.9 + dx, 0, dz); idle(person(gg, s * 1.9, -0.3, 0, { kind: 'soldier' })).position.y = 1.7; }
  box(gg, 2.9, 0.22, 0.3, M.beam, 0, 2.5, 0);
  const dl = box(gg, 1.1, 1.8, 0.1, M.wood, -0.62, 0, 0.1); dl.rotation.y = 1.1; dl.position.set(-1.05, 0.9, 0.55);
  const dr = box(gg, 1.1, 1.8, 0.1, M.wood, 0.62, 0, 0.1); dr.rotation.y = -1.1; dr.position.set(1.05, 0.9, 0.55);
  torch(gg, -1.25, 1.6, 0.2); torch(gg, 1.25, 1.6, 0.2);
  blockers.push({ obj: gg, x0: -1.45, x1: -1.05, z0: -0.2, z1: 0.2 }, { obj: gg, x0: 1.05, x1: 1.45, z0: -0.2, z1: 0.2 });
}
export function stoneGate(g, x, z) {
  const gh = group(g, x, z, 0);
  for (const s of [-1, 1]) { box(gh, 1.3, 2.6, 1.6, M.stone, s * 1.4, 0, 0); crenels(gh, s * 1.4, 2.6, 0, 1.3, 1.6); }
  box(gh, 1.6, 0.6, 1.4, M.stone, 0, 2.1, 0);
  for (const s of [-1, 1]) { const d = box(gh, 0.75, 2.0, 0.1, M.wood, 0, 0, 0); d.position.set(s * 0.62, 0, 0.55); d.rotation.y = s * -1.2; }
  torch(gh, -0.8, 1.2, 0.85); torch(gh, 0.8, 1.2, 0.85);
  idle(person(gh, -1.4, 0, 0, { kind: 'soldier' })).position.set(-1.4, 2.65, 0); idle(person(gh, 1.4, 0, 0, { kind: 'soldier' })).position.set(1.4, 2.65, 0);
  flag(gh, 1.4, 3.05, -0.4, M.gold, 1.3);
}
export function gatehouse(g, x, z) {
  const gh = group(g, x, z, 0);
  for (const s of [-1, 1]) blockers.push({ obj: gh, x0: s * 1.7 - 0.9, x1: s * 1.7 + 0.9, z0: -1.1, z1: 1.1 });
  gates.push({ obj: gh, x0: -0.8, x1: 0.8, z0: -1.1, z1: 1.1 });
  for (const s of [-1, 1]) { box(gh, 1.8, 4.2, 2.2, M.stone, s * 1.7, 0, 0); crenels(gh, s * 1.7, 4.2, 0, 1.8, 2.2); windowZ(gh, s * 1.7, 2.6, 1.12, 0.22, 0.6, false); }
  box(gh, 1.7, 1.4, 2.0, M.stone, 0, 2.8, 0);
  box(gh, 1.9, 0.2, 2.2, M.stone, 0, 4.2, 0);
  gable(gh, 1.9, 2.2, 1.1, 0.25, M.roofRed, 0, 4.4, 0, M.stone);
  const arch = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.0, 16, 1, false, 0, Math.PI), M.stone)); arch.rotation.x = Math.PI / 2; arch.rotation.z = Math.PI / 2; arch.position.set(0, 2.8, 0); arch.scale.set(1, 1, 1); void arch;
  // portcullis (raised, peeking out)
  for (let i = 0; i < 6; i++) box(gh, 0.05, 0.6, 0.05, M.iron, -0.65 + i * 0.26, 2.25, 0.9);
  box(gh, 1.6, 0.05, 0.05, M.iron, 0, 2.5, 0.9);
  for (const s of [-1, 1]) bannerZ(gh, s * 1.7, 3.2, 1.12, M.gold, 0.6, 1.2);
  torch(gh, -0.95, 1.4, 1.2); torch(gh, 0.95, 1.4, 1.2);
  flag(gh, 0, 5.5, 0, M.gold, 1.4);
  idle(person(gh, -1.15, 1.7, 0, { kind: 'soldier' })); idle(person(gh, 1.15, 1.7, 0, { kind: 'soldier' }));
  return gh;
}
B.wall = (g, stage = 3) => {
  patch(g, 4.5, 3, M.dirt, 0, 2.4);
  const rx = 13, rz = 10;
  const sub = group(g, 0, -rz + 0.2, 0);
  wallRing(sub, rx, rz, { n: 28, only: (i) => i <= 3 || i >= 24, kind: ['palisade', 'stone', 'full'][stage - 1] });
  talking(person(g, 0.3, 3.0, 2.6, { carry: 'sack' })); talking(person(g, -0.2, 3.6, -0.6, {}));
};

// Kerk: 1 wooden chapel, 2 stone church, 3 church with a tall spire. Faces +z, nave along z.
function nave(g, w, len, wallH, wallMat, roof, roofH) {
  box(g, w + 0.2, 0.3, len + 0.2, M.stone, 0, 0, 0);
  box(g, w, wallH, len, wallMat, 0, 0.3, 0);
  const r = group(g, 0, 0, Math.PI / 2); gable(r, len, w, roofH, 0.3, roof, 0, 0.3 + wallH, 0, wallMat);
  for (let i = 0; i < 3; i++) { const z = -len / 2 + ((i + 0.75) * len) / 3.2; windowX(g, w / 2 + 0.02, 0.9, z, 0.26, 0.9); }
}
function arched(g, x, y, z, w, h) { box(g, w, h, 0.1, M.window, x, y, z); const a = sh(new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.1, 12, 1, false, 0, Math.PI), M.window)); a.rotation.x = Math.PI / 2; a.rotation.z = Math.PI / 2; a.position.set(x, y + h, z); g.add(a); }
function cross(g, x, y, z, s = 1) { box(g, 0.06 * s, 0.5 * s, 0.06 * s, M.gold, x, y, z); box(g, 0.3 * s, 0.06 * s, 0.06 * s, M.gold, x, y + 0.3 * s, z); }
B.church = (g, stage = 3) => {
  patch(g, 3.4, 3.6, M.cobble, 0, 1.0);
  if (stage === 1) {
    nave(g, 2.4, 3.6, 1.6, M.wood, M.thatch, 1.5);
    doorZ(g, 0, 0.3, 1.82, 0.7, 1.0);
    // little bell frame on the front gable
    for (const s of [-1, 1]) box(g, 0.08, 0.7, 0.08, M.beam, s * 0.22, 3.3, 1.6);
    box(g, 0.6, 0.08, 0.12, M.beam, 0, 4.0, 1.6); cone(g, 0.14, 0.22, M.bronze, 0, 3.7, 1.6, 10);
    cross(g, 0, 4.1, 1.6, 0.8);
    talking(person(g, 0.9, 2.6, -0.4, { color: 0x3a2f28, hat: false })); idle(person(g, -0.6, 3.0, 0.4, {}));
    return;
  }
  const len = stage === 2 ? 4.2 : 4.8, w = 2.8;
  nave(g, w, len, 2.4, M.stone, M.slate, 1.8);
  // apse at the back
  const ap = sh(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.4, 14, 1, false, Math.PI / 2, Math.PI), M.stone)); ap.position.set(0, 1.5, -len / 2); g.add(ap);
  const apr = sh(new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.2, 14, 1, false, Math.PI / 2, Math.PI), M.slate)); apr.position.set(0, 3.3, -len / 2); g.add(apr);
  // tower at the front
  const th = stage === 2 ? 4.2 : 6.0, tw = 1.5;
  box(g, tw, th, tw, M.stone, 0, 0, len / 2 + tw / 2 - 0.2);
  const spire = sh(new THREE.Mesh(new THREE.ConeGeometry(tw * 0.74, stage === 2 ? 1.6 : 3.4, 4), M.slate)); spire.rotation.y = Math.PI / 4; spire.position.set(0, th + (stage === 2 ? 0.8 : 1.7), len / 2 + tw / 2 - 0.2); g.add(spire);
  cross(g, 0, th + (stage === 2 ? 1.6 : 3.4), len / 2 + tw / 2 - 0.2, stage === 2 ? 1 : 1.3);
  for (const s of [-1, 1]) { arched(g, s * 0.0 + (s > 0 ? 0 : 0), th - 1.2, len / 2 + tw - 0.18, 0.3, 0.5); }
  doorZ(g, 0, 0, len / 2 + tw - 0.17, 0.8, 1.3);
  arched(g, 0, 2.0, len / 2 + tw - 0.17, 0.4, 0.7);
  if (stage === 3) { for (const s of [-1, 1]) box(g, 0.35, 1.8, 0.5, M.stone, s * (w / 2 + 0.15), 0, 0.2); flag(g, 1.6, 0, 2.6, M.gold, 1.8); }
  torch(g, -0.6, 0.9, len / 2 + tw - 0.1); torch(g, 0.6, 0.9, len / 2 + tw - 0.1);
  talking(person(g, 1.1, len / 2 + tw + 0.9, -0.5, { color: 0x3a2f28, hat: false })); talking(person(g, 1.6, len / 2 + tw + 1.2, -2.5, {}));
  idle(person(g, -1.2, len / 2 + tw + 1.0, 0.3, { carry: 'basket' }));
};
// Eerste kerk: an old, squat stone chapel with a stubby tower.
B.firstchurch = (g) => {
  patch(g, 3.0, 3.0, M.cobble, 0, 0.8);
  nave(g, 2.4, 3.4, 1.9, M.stoneDark, M.roofBrown, 1.5);
  box(g, 1.3, 3.4, 1.3, M.stoneDark, 0, 0, 2.2); crenels(g, 0, 3.4, 2.2, 1.2, 1.2); cross(g, 0, 3.7, 2.2, 1);
  doorZ(g, 0, 0, 2.87, 0.7, 1.1);
  for (const [x, z] of [[-1.9, 1.6], [-2.1, 0.6], [1.9, 1.2]]) { box(g, 0.25, 0.45, 0.08, M.stone, x, 0, z); }
  torch(g, -0.5, 0.9, 2.95); torch(g, 0.5, 0.9, 2.95);
  idle(person(g, 1.2, 3.6, -0.4, { color: 0x3a2f28, hat: false }));
};
