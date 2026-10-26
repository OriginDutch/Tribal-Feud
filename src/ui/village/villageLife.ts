// The few people that walk around the village. Each has a route of its own (one-way loops with fixed
// spacing, or back-and-forth on a stretch nobody else uses), so they never need to dodge anyone.
const RX = 18.5, RZ = 14, WALL_N = 28;

export interface Walker { name: string; x: number; y: number; z: number; heading: number; dist: number; moving: boolean; bias: number }

const ring: [number, number][] = [];
for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; ring.push([Math.cos(a) * 3.0, 1.3 + Math.sin(a) * 2.35]); }
const ringLen = ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]!; return s + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);

function along(pts: [number, number][], s: number): [number, number, number] {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= l) { const k = s / l; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[0] - a[0], b[1] - a[1])]; }
    s -= l;
  }
  const p = pts[0]!; return [p[0], p[1], 0];
}

/** Walk a→b, pause, turn, walk back, pause. */
function shuttle(a: [number, number], b: [number, number], speed: number, pause: number, t: number, ph: number) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), walk = L / speed, cyc = 2 * (walk + pause);
  const c = (t + ph * cyc) % cyc, half = c >= cyc / 2, u = half ? c - cyc / 2 : c;
  const moving = u < walk, k = moving ? u / walk : 1, f = half ? 1 - k : k;
  const head = Math.atan2(b[0] - a[0], b[1] - a[1]) + (half ? Math.PI : 0);
  return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, heading: moving ? head : head + (u - walk > pause * 0.5 ? Math.PI : 0), dist: (moving ? u : walk) * speed, moving };
}
const wallPoint = (i: number): [number, number] => { const a = (i / WALL_N) * Math.PI * 2 + Math.PI / 2; return [Math.cos(a) * RX, Math.sin(a) * RZ]; };

/** Everyone walking at time t. wallKind: undefined (no wall), 'palisade', 'stone' or 'full'. */
export function walkers(t: number, wallKind: string | undefined): Walker[] {
  const out: Walker[] = [];
  const names = ['v0', 'v1', 'v2', 'v1'];
  for (let i = 0; i < 4; i++) {
    const s = (i * 4.3 + t * 0.55) % ringLen;
    const [x, z, h] = along(ring, s);
    out.push({ name: names[i]!, x, y: 0, z, heading: h, dist: t * 0.55, moving: true, bias: 0 });
  }
  const b = shuttle([0.5, 11.4], [0.5, 5.4], 0.6, 1.6, t, 0.15);
  out.push({ name: 'barrow', x: b.x, y: 0, z: b.z, heading: b.heading, dist: b.dist, moving: b.moving, bias: 0 });
  if (wallKind === 'stone' || wallKind === 'full') {
    const y = wallKind === 'stone' ? 1.57 : 1.92;
    [2, 6, 9, 13, 18, 22, 25].forEach((i, n) => {
      const [ax, az] = wallPoint(i), [bx, bz] = wallPoint(i + 1);
      const g = shuttle([ax + (bx - ax) * 0.3, az + (bz - az) * 0.3], [ax + (bx - ax) * 0.7, az + (bz - az) * 0.7], 0.35, 2.2, t, (n * 0.37) % 1);
      out.push({ name: 'soldier', x: g.x, y, z: g.z, heading: g.heading, dist: g.dist, moving: g.moving, bias: 0.6 });
    });
  }
  return out;
}
