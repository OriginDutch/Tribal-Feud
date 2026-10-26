import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BuildingId } from '../../shared/gameData';
import type { VillageView } from '../../sim/view';
import { openBuilding, setVillageLight, villageLight } from '../store';
import { walkers } from './villageLife';
import { type Baked, type Piece, type Sprite, hits, loadVillage, piecesFor, project, stageFor } from './villageSprites';

/** The part of the baked frame that is shown at zoom 1 (scene pixels). */
const HOME = { x: 170, y: 150, w: 2020, h: 1110 };
const MAX_ZOOM = 2;
const FPS = 12;

/** The baked 3D village, built up from sprites for the current building levels, with its life on top. */
export function VillageScene({ village }: { village: VillageView }) {
  const light = villageLight.value;
  const [baked, setBaked] = useState<Baked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [view, setView] = useState(HOME);
  const VIEW = view;
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const clampView = (v: { x: number; y: number; w: number; h: number }) => {
    const w = Math.min(HOME.w, Math.max(HOME.w / MAX_ZOOM, v.w)), h = (w / HOME.w) * HOME.h;
    const fw = baked?.m.w ?? 2400, fh = baked?.m.h ?? 1400;
    return { w, h, x: Math.max(0, Math.min(fw - w, v.x)), y: Math.max(0, Math.min(fh - h, v.y)) };
  };
  const zoomAt = (fx: number, fy: number, k: number) => setView((v) => { const w = v.w / k; const n = clampView({ x: v.x + (v.w - w) * fx, y: v.y + (v.h - (w / HOME.w) * HOME.h) * fy, w, h: 0 }); return n; });

  useEffect(() => {
    let live = true;
    setError(null);
    loadVillage(light).then((b) => live && setBaked(b), (e: unknown) => live && setError(String(e)));
    return () => { live = false; };
  }, [light]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const levels = useMemo(() => Object.fromEntries(village.buildings.map((b) => [b.id, b.level])), [village.buildings]);
  const key = Object.entries(levels).map(([id, l]) => `${id}${l}`).join(',');
  const pieces = useMemo(() => (baked ? piecesFor(baked, levels) : { decals: [], bodies: [] }), [baked, key]);
  const wallKind = baked ? baked.m.wallKinds[stageFor(baked.m, 'wall', levels.wall ?? 0) - 1] : undefined;

  // draw loop: everything is repainted back to front each frame (a few hundred drawImage calls)
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  useEffect(() => {
    const c = canvas.current;
    if (!c || !baked || !width) return;
    const { m } = baked;
    const scale = Math.min(1.5, (width * (window.devicePixelRatio || 1)) / VIEW.w);
    c.width = Math.round(VIEW.w * scale);
    c.height = Math.round(VIEW.h * scale);
    const ctx = c.getContext('2d')!;
    // the vignette never changes: draw it once
    const vig = document.createElement('canvas'); vig.width = c.width; vig.height = c.height;
    { const v = vig.getContext('2d')!; const g = v.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.45, c.width / 2, c.height / 2, c.width * 0.62); g.addColorStop(0, 'rgba(13,11,8,0)'); g.addColorStop(1, `rgba(13,11,8,${light === 'dusk' ? 0.7 : 0.45})`); v.fillStyle = g; v.fillRect(0, 0, c.width, c.height); }
    const o = project(m, 0, 0, 0);
    const walkKey = (name: string, heading: number, dist: number, moving: boolean) => {
      const dir = (((Math.round((heading / (Math.PI * 2)) * m.dirs) % m.dirs) + m.dirs) % m.dirs);
      const step = moving ? Math.floor((dist / ((2 * Math.PI) / 9.5)) * m.walkSteps) % m.walkSteps : m.walkSteps;
      return `walk-${name}-${dir}-${step}`;
    };
    const blit = (s: Sprite, dx = s.x, dy = s.y) => ctx.drawImage(baked.atlases[s.a]!, s.sx, s.sy, s.w, s.h, dx, dy, s.w, s.h);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = -1;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t = reduce ? 0 : (now - t0) / 1000;
      const tick = Math.floor(t * FPS);
      if (tick === last && !dirty) return;
      last = tick; dirty = false;
      ctx.setTransform(scale, 0, 0, scale, -VIEW.x * scale, -VIEW.y * scale);
      ctx.drawImage(baked.ground, 0, 0);
      for (const p of pieces.decals) blit(p.s);
      // moving people join the depth sort
      const list: { d: number; draw: () => void }[] = pieces.bodies.map((p: Piece) => ({
        d: p.d,
        draw: p.frames ? () => { const f = p.frames![Math.floor((t / m.loop) * m.frames) % m.frames]; if (f) blit(f); } : () => blit(p.s),
      }));
      if (!reduce) for (const w of walkers(t, wallKind)) {
        const s = m.sprites[walkKey(w.name, w.heading, w.dist, w.moving)];
        if (!s) continue;
        const [x, y, d] = project(m, w.x, w.y, w.z);
        list.push({ d: d + w.bias, draw: () => blit(s, Math.round(x + s.x - o[0]), Math.round(y + s.y - o[1])) });
      }
      list.sort((a, b) => a.d - b.d);
      for (const it of list) it.draw();
      // chimney smoke
      for (const p of pieces.bodies) for (const [sx, sy] of p.s.smoke ?? []) for (let i = 0; i < 4; i++) {
        const k = (t / m.loop + i / 4 + ((sx * 7) % 10) / 40) % 1;
        const r = 3 + k * 10, cx = sx + k * 16, cy = sy - k * 50;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        const col = light === 'dusk' ? '120,114,104' : '225,220,210';
        g.addColorStop(0, `rgba(${col},${0.3 * Math.sin(Math.PI * Math.min(1, k * 1.15))})`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      if (light === 'dusk') {
        // warm light pools around fires, torches and lit windows
        ctx.globalCompositeOperation = 'lighter';
        for (const p of pieces.bodies) for (const g of p.s.glow ?? []) {
          const r = Math.max(30, g.r), flick = 1 + Math.sin(t * 9 + g.x) * 0.06;
          const grad = ctx.createRadialGradient(g.x, g.y + r * 0.15, 0, g.x, g.y + r * 0.15, r * flick);
          const a = Math.min(0.22, 0.05 + g.i * 0.012);
          grad.addColorStop(0, `rgba(255,170,80,${a})`); grad.addColorStop(1, 'rgba(255,140,50,0)');
          ctx.fillStyle = grad; ctx.fillRect(g.x - r * 1.1, g.y - r * 1.1, r * 2.2, r * 2.4);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      const h = hoverRef.current;
      if (h) {
        ctx.save();
        ctx.filter = 'brightness(1.15) drop-shadow(0 0 4px rgba(226,169,59,0.95))';
        for (const p of pieces.bodies) if (p.building === h && !p.frames) blit(p.s);
        ctx.restore();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(vig, 0, 0);
    };
    let dirty = true;
    redraw.current = () => { dirty = true; };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); redraw.current = () => {}; };
  }, [baked, pieces, width, light, wallKind, view]);
  const redraw = useRef<() => void>(() => {});
  useEffect(() => redraw.current(), [hover]);

  const toScene = (e: MouseEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [VIEW.x + ((e.clientX - r.left) / r.width) * VIEW.w, VIEW.y + ((e.clientY - r.top) / r.height) * VIEW.h];
  };
  const pick = (e: MouseEvent): string | null => {
    if (!baked) return null;
    const [x, y] = toScene(e);
    const bs = pieces.bodies;
    for (let i = bs.length - 1; i >= 0; i--) { const p = bs[i]!; if (p.building && !p.frames && hits(baked, p.s, x, y)) return p.building; }
    return null;
  };

  // label spots: under each building's footprint (scene px)
  const labels = useMemo(() => {
    if (!baked) return [];
    return village.buildings.map((b) => {
      const ps = pieces.bodies.filter((p) => p.building === b.id && !p.frames);
      if (!ps.length) return null;
      let at: [number, number];
      if (b.id === 'wall') { const g = ps.find((p) => p.key.startsWith('gate-'))!.s; at = [g.x + g.w / 2, g.y + g.h - 10]; }
      else at = ps[0]!.s.foot ?? [ps[0]!.s.x + ps[0]!.s.w / 2, ps[0]!.s.y + ps[0]!.s.h];
      return { b, x: ((at[0] - VIEW.x) / VIEW.w) * 100, y: ((at[1] - VIEW.y) / VIEW.h) * 100 };
    }).filter((l) => l !== null && l.x > 2 && l.x < 98 && l.y > 2 && l.y < 98);
  }, [baked, pieces, village.buildings]);

  return (
    <div class="village-scene" ref={wrap} onWheel={(e) => { e.preventDefault(); const r = canvas.current!.getBoundingClientRect(); zoomAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, e.deltaY < 0 ? 1.15 : 1 / 1.15); }}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Dorpsoverzicht van ${village.name}`}
        style={{ cursor: hover ? 'pointer' : 'default' }}
        onMouseMove={(e) => {
          const d = drag.current;
          if (d && (e.buttons & 1)) {
            const r = canvas.current!.getBoundingClientRect();
            if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
            if (d.moved) setView((v) => clampView({ ...v, x: d.vx - ((e.clientX - d.x) / r.width) * v.w, y: d.vy - ((e.clientY - d.y) / r.height) * v.h }));
            return;
          }
          const h = pick(e); if (h !== hover) setHover(h);
        }}
        onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; }}
        onMouseUp={() => { setTimeout(() => { drag.current = null; }, 0); }}
        onMouseLeave={() => { setHover(null); drag.current = null; }}
        onClick={(e) => { if (drag.current?.moved) return; const h = pick(e); if (h) openBuilding(h as BuildingId); }}
      />
      {!baked && <div class="village-loading">{error ?? 'Dorp laden…'}</div>}
      {labels.map((l) => {
        const built = l!.b.level > 0;
        return (
          <button
            key={l!.b.id}
            class={`village-label ${built ? '' : 'unbuilt'} ${hover === l!.b.id ? 'hot' : ''}`}
            style={{ left: `${l!.x}%`, top: `${l!.y}%` }}
            title={built ? `${l!.b.name} level ${l!.b.level}` : `${l!.b.name}: nog niet gebouwd`}
            onMouseEnter={() => setHover(l!.b.id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => openBuilding(l!.b.id)}
          >
            <span>{l!.b.name}</span>
            {built && <b>{l!.b.level}</b>}
          </button>
        );
      })}
      <div class="village-zoom" role="group" aria-label="Zoom">
        <button onClick={() => zoomAt(0.5, 0.5, 1.4)} title="Inzoomen">+</button>
        <button onClick={() => zoomAt(0.5, 0.5, 1 / 1.4)} title="Uitzoomen">−</button>
        <button onClick={() => setView(HOME)} title="Heel dorp">⤢</button>
      </div>
      <div class="village-light" role="group" aria-label="Licht">
        <button class={light === 'day' ? 'on' : ''} onClick={() => setVillageLight('day')}>☀ Dag</button>
        <button class={light === 'dusk' ? 'on' : ''} onClick={() => setVillageLight('dusk')}>☾ Schemer</button>
      </div>
    </div>
  );
}
