import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BuildingId } from '../../shared/gameData';
import type { VillageView } from '../../sim/view';
import { openBuilding, setVillageLight, villageLight } from '../store';
import { type Baked, type Piece, hits, loadVillage, piecesFor } from './villageSprites';

/** The part of the baked frame that is shown (scene pixels). */
const VIEW = { x: 170, y: 150, w: 2020, h: 1110 };

/** The baked 3D village, built up from sprites for the current building levels. */
export function VillageScene({ village }: { village: VillageView }) {
  const light = villageLight.value;
  const [baked, setBaked] = useState<Baked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

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
  const pieces = useMemo(() => (baked ? piecesFor(baked.m, levels) : []), [baked, key]);

  // draw
  useEffect(() => {
    const c = canvas.current;
    if (!c || !baked || !width) return;
    const scale = Math.min(1, (width * (window.devicePixelRatio || 1)) / VIEW.w);
    c.width = Math.round(VIEW.w * scale);
    c.height = Math.round(VIEW.h * scale);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(scale, 0, 0, scale, -VIEW.x * scale, -VIEW.y * scale);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(baked.ground, 0, 0);
    const draw = (p: Piece) => ctx.drawImage(baked.atlases[p.s.a]!, p.s.sx, p.s.sy, p.s.w, p.s.h, p.s.x, p.s.y, p.s.w, p.s.h);
    for (const p of pieces) draw(p);
    if (light === 'dusk') {
      // warm light pools around fires, torches and lit windows
      ctx.globalCompositeOperation = 'lighter';
      for (const p of pieces) for (const g of p.s.glow ?? []) {
        const r = Math.max(30, g.r);
        const grad = ctx.createRadialGradient(g.x, g.y + r * 0.15, 0, g.x, g.y + r * 0.15, r);
        const a = Math.min(0.22, 0.05 + g.i * 0.012);
        grad.addColorStop(0, `rgba(255,170,80,${a})`); grad.addColorStop(1, 'rgba(255,140,50,0)');
        ctx.fillStyle = grad; ctx.fillRect(g.x - r, g.y - r, r * 2, r * 2.3);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (hover) {
      ctx.save();
      ctx.filter = 'brightness(1.15) drop-shadow(0 0 4px rgba(226,169,59,0.95))';
      for (const p of pieces) if (p.building === hover && !p.key.endsWith(':decal')) draw(p);
      ctx.restore();
    }
    // soft vignette so the forest fades into the panel
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const v = ctx.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.45, c.width / 2, c.height / 2, c.width * 0.62);
    v.addColorStop(0, 'rgba(13,11,8,0)'); v.addColorStop(1, `rgba(13,11,8,${light === 'dusk' ? 0.7 : 0.45})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, c.width, c.height);
  }, [baked, pieces, width, hover, light]);

  const toScene = (e: MouseEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [VIEW.x + ((e.clientX - r.left) / r.width) * VIEW.w, VIEW.y + ((e.clientY - r.top) / r.height) * VIEW.h];
  };
  const pick = (e: MouseEvent): string | null => {
    if (!baked) return null;
    const [x, y] = toScene(e);
    for (let i = pieces.length - 1; i >= 0; i--) { const p = pieces[i]!; if (p.building && !p.key.endsWith(':decal') && hits(baked, p.s, x, y)) return p.building; }
    return null;
  };

  // label spots: under each building's footprint (scene px)
  const labels = useMemo(() => {
    if (!baked) return [];
    return village.buildings.map((b) => {
      const ps = pieces.filter((p) => p.building === b.id && !p.key.endsWith(':decal'));
      if (!ps.length) return null;
      let at: [number, number];
      if (b.id === 'wall') { const g = ps.find((p) => p.key.startsWith('gate-'))!.s; at = [g.x + g.w / 2, g.y + g.h - 10]; }
      else at = ps[0]!.s.foot ?? [ps[0]!.s.x + ps[0]!.s.w / 2, ps[0]!.s.y + ps[0]!.s.h];
      return { b, x: ((at[0] - VIEW.x) / VIEW.w) * 100, y: ((at[1] - VIEW.y) / VIEW.h) * 100 };
    }).filter((l) => l !== null && l.x > 2 && l.x < 98 && l.y > 2 && l.y < 98);
  }, [baked, pieces, village.buildings]);

  return (
    <div class="village-scene" ref={wrap}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Dorpsoverzicht van ${village.name}`}
        style={{ cursor: hover ? 'pointer' : 'default' }}
        onMouseMove={(e) => { const h = pick(e); if (h !== hover) setHover(h); }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => { const h = pick(e); if (h) openBuilding(h as BuildingId); }}
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
      <div class="village-light seg" role="group" aria-label="Licht">
        <button class={light === 'day' ? 'on' : ''} onClick={() => setVillageLight('day')}>☀ Dag</button>
        <button class={light === 'dusk' ? 'on' : ''} onClick={() => setVillageLight('dusk')}>☾ Schemer</button>
      </div>
    </div>
  );
}
