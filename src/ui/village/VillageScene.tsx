import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BuildingId } from '../../shared/gameData';
import type { VillageView } from '../../sim/view';
import { openBuilding, setVillageLight, villageLight } from '../store';
import { walkers } from './villageLife';
import { isMobile } from '../mobile';
import { useSaved } from '../useSaved';
import { tr } from '../../shared/i18n';

/** Phone: labels as level dots (default), full labels or none. A desktop always shows full labels. */
type LabelMode = 'dots' | 'full' | 'none';
const NEXT_MODE: Record<LabelMode, LabelMode> = { dots: 'full', full: 'none', none: 'dots' };
const MODE_TEXT: Record<LabelMode, string> = { dots: '● Levels', full: '▤ Labels', none: '○ Geen' };
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
  const zoomAt = (fx: number, fy: number, k: number) => setView((v) => {
    const w = Math.min(HOME.w, Math.max(HOME.w / MAX_ZOOM, v.w / k));
    if (Math.abs(w - v.w) < 0.5) return v;
    const h = (w / HOME.w) * HOME.h;
    return clampView({ x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy, w, h });
  });

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
    // Everything that stands still (ground, decals, buildings, trees) is drawn once into a canvas of the
    // final size, back to front; each frame is that one blit plus what moves. Something that moves is
    // drawn at its depth by drawing it, then again the still pieces in front of it that it overlaps.
    const statics = pieces.bodies.filter((p) => !p.frames).sort((a, b) => a.d - b.d);
    const anims = pieces.bodies.filter((p) => p.frames);
    const back = document.createElement('canvas'); back.width = c.width; back.height = c.height;
    const bctx = back.getContext('2d')!;
    let backHover: string | null | undefined;
    const buildBack = (hv: string | null) => {
      backHover = hv;
      bctx.setTransform(scale, 0, 0, scale, -VIEW.x * scale, -VIEW.y * scale);
      bctx.drawImage(baked.ground, 0, 0);
      for (const p of pieces.decals) bctx.drawImage(baked.atlases[p.s.a]!, p.s.sx, p.s.sy, p.s.w, p.s.h, p.s.x, p.s.y, p.s.w, p.s.h);
      for (const p of statics) {
        if (hv && p.building === hv) bctx.filter = 'brightness(1.28) saturate(1.1)';
        bctx.drawImage(baked.atlases[p.s.a]!, p.s.sx, p.s.sy, p.s.w, p.s.h, p.s.x, p.s.y, p.s.w, p.s.h);
        bctx.filter = 'none';
      }
    };
    // A mover is drawn on a small canvas of its own first; the still pieces in front of it cut it
    // away there (by their alpha), then it goes onto the frame. So it hides behind what stands in
    // front of it, and nothing is drawn twice (no doubled shadows).
    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d')!;
    const place = (d: number, x: number, y: number, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
      const ox = Math.floor((x - VIEW.x) * scale), oy = Math.floor((y - VIEW.y) * scale);
      const tw = Math.ceil(w * scale) + 2, th = Math.ceil(h * scale) + 2;
      if (tmp.width < tw) tmp.width = tw;
      if (tmp.height < th) tmp.height = th;
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.clearRect(0, 0, tw, th);
      tctx.setTransform(scale, 0, 0, scale, -VIEW.x * scale - ox, -VIEW.y * scale - oy);
      draw(tctx);
      tctx.globalCompositeOperation = 'destination-out';
      for (const p of statics) {
        if (p.d <= d) continue;
        const r = p.s;
        if (r.x >= x + w || r.x + r.w <= x || r.y >= y + h || r.y + r.h <= y) continue;
        // only the part that overlaps the mover
        const ix = Math.max(r.x, x), iy = Math.max(r.y, y), iw = Math.min(r.x + r.w, x + w) - ix, ih = Math.min(r.y + r.h, y + h) - iy;
        tctx.drawImage(baked.atlases[r.a]!, r.sx + ix - r.x, r.sy + iy - r.y, iw, ih, ix, iy, iw, ih);
      }
      tctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(tmp, 0, 0, tw, th, ox, oy, tw, th);
      ctx.setTransform(scale, 0, 0, scale, -VIEW.x * scale, -VIEW.y * scale);
    };
    const blitTo = (g: CanvasRenderingContext2D, s: Sprite, dx = s.x, dy = s.y) => g.drawImage(baked.atlases[s.a]!, s.sx, s.sy, s.w, s.h, dx, dy, s.w, s.h);
    // a puff of smoke, drawn once and stamped with alpha and size (no gradient per puff per frame)
    const puff = document.createElement('canvas'); puff.width = puff.height = 64;
    {
      const p = puff.getContext('2d')!;
      const col = light === 'dusk' ? '120,114,104' : '225,220,210';
      const g = p.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, `rgba(${col},1)`); g.addColorStop(1, `rgba(${col},0)`);
      p.fillStyle = g; p.fillRect(0, 0, 64, 64);
    }
    // a pool of warm light (dusk), drawn once and stamped with alpha and size
    const glow = document.createElement('canvas'); glow.width = glow.height = 128;
    {
      const p = glow.getContext('2d')!;
      const g = p.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,170,80,1)'); g.addColorStop(1, 'rgba(255,140,50,0)');
      p.fillStyle = g; p.fillRect(0, 0, 128, 128);
    }
    // the canvas out of sight (scrolled away, another screen on top): no frames
    let visible = true;
    const io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); }, { threshold: 0 });
    io.observe(c);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = -1;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t = reduce ? 0 : (now - t0) / 1000;
      const tick = Math.floor(t * FPS);
      if ((tick === last || !visible) && !dirty) return;
      last = tick; dirty = false;
      if (hoverRef.current !== backHover) buildBack(hoverRef.current);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(back, 0, 0);
      ctx.setTransform(scale, 0, 0, scale, -VIEW.x * scale, -VIEW.y * scale);
      // what moves: animated pieces and the people, at their depth
      const list: { d: number; x: number; y: number; w: number; h: number; draw: (g: CanvasRenderingContext2D) => void }[] = anims.map((p: Piece) => {
        const f = p.frames![Math.floor((t / m.loop) * m.frames) % m.frames] ?? p.s;
        return { d: p.d, x: f.x, y: f.y, w: f.w, h: f.h, draw: (g) => blitTo(g, f) };
      });
      if (!reduce) for (const w of walkers(t, wallKind)) {
        const s = m.sprites[walkKey(w.name, w.heading, w.dist, w.moving)];
        if (!s) continue;
        const [x, y, d] = project(m, w.x, w.y, w.z);
        const dx = Math.round(x + s.x - o[0]), dy = Math.round(y + s.y - o[1]);
        list.push({ d: d + w.bias, x: dx, y: dy, w: s.w, h: s.h, draw: (g) => blitTo(g, s, dx, dy) });
      }
      list.sort((a, b) => a.d - b.d);
      for (const it of list) place(it.d, it.x, it.y, it.w, it.h, it.draw);
      // chimney smoke
      for (const p of pieces.bodies) for (const [sx, sy] of p.s.smoke ?? []) for (let i = 0; i < 4; i++) {
        const k = (t / m.loop + i / 4 + ((sx * 7) % 10) / 40) % 1;
        const r = 3 + k * 10, cx = sx + k * 16, cy = sy - k * 50;
        ctx.globalAlpha = 0.3 * Math.sin(Math.PI * Math.min(1, k * 1.15));
        ctx.drawImage(puff, cx - r, cy - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      if (light === 'dusk') {
        // warm light pools around fires, torches and lit windows
        ctx.globalCompositeOperation = 'lighter';
        for (const p of pieces.bodies) for (const g of p.s.glow ?? []) {
          const r = Math.max(30, g.r) * (1 + Math.sin(t * 9 + g.x) * 0.06);
          ctx.globalAlpha = Math.min(0.22, 0.05 + g.i * 0.012);
          ctx.drawImage(glow, g.x - r, g.y + r * 0.15 - r, r * 2, r * 2);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(vig, 0, 0);
    };
    let dirty = true;
    redraw.current = () => { dirty = true; };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); redraw.current = () => {}; };
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

  const [savedMode, setMode] = useSaved<LabelMode>('village-labels-mobile', 'dots');
  const mode: LabelMode = isMobile.value ? savedMode : 'full';

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
  }, [baked, pieces, village.buildings, view]);

  return (
    <div class="village-scene" ref={wrap} onWheel={(e) => { e.preventDefault(); const r = canvas.current!.getBoundingClientRect(); zoomAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, e.deltaY < 0 ? 1.15 : 1 / 1.15); }}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={tr('Dorpsoverzicht van {name}', { name: village.name })}
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
      {!baked && <div class="village-loading">{error ?? tr('Dorp laden…')}</div>}
      {mode !== 'none' && labels.map((l) => {
        const built = l!.b.level > 0;
        if (mode === 'dots' && !built) return null;
        return (
          <button
            key={l!.b.id}
            class={`village-label ${mode === 'dots' ? 'dot' : ''} ${built ? '' : 'unbuilt'} ${hover === l!.b.id ? 'hot' : ''}`}
            aria-label={built ? tr('{name} level {n}', { name: l!.b.name, n: l!.b.level }) : tr('{name}: nog niet gebouwd', { name: l!.b.name })}
            style={{ left: `${l!.x}%`, top: `${l!.y}%` }}
            title={built ? tr('{name} level {n}', { name: l!.b.name, n: l!.b.level }) : tr('{name}: nog niet gebouwd', { name: l!.b.name })}
            onMouseEnter={() => setHover(l!.b.id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => openBuilding(l!.b.id)}
          >
            {mode === 'full' && <span>{l!.b.name}</span>}
            {built && <b>{l!.b.level}</b>}
          </button>
        );
      })}
      <div class="village-zoom" role="group" aria-label={tr('Zoom')}>
        <button onClick={() => zoomAt(0.5, 0.5, 1.4)} title={tr('Inzoomen')}>+</button>
        <button onClick={() => zoomAt(0.5, 0.5, 1 / 1.4)} title={tr('Uitzoomen')}>−</button>
        <button onClick={() => setView(HOME)} title={tr('Heel dorp')}>⤢</button>
      </div>
      <div class="village-light" role="group" aria-label={tr('Licht')}>
        <button class={light === 'day' ? 'on' : ''} onClick={() => setVillageLight('day')}>{tr('☀ Dag')}</button>
        <button class={light === 'dusk' ? 'on' : ''} onClick={() => setVillageLight('dusk')}>{tr('☾ Schemer')}</button>
        {isMobile.value && (
          <button onClick={() => setMode(NEXT_MODE[mode])} title={tr('Wisselen tussen levels, volledige labels en geen labels')}>{tr(MODE_TEXT[mode])}</button>
        )}
      </div>
    </div>
  );
}
