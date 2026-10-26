import { useEffect, useRef } from 'preact/hooks';
import type { MapVillage } from '../../shared/protocol';

const COL = { own: '#e2a93b', bot: '#d2604a', barb: '#8a8378' } as const;

/**
 * The whole world at a glance: a dot per village (gold = you, red = bots, grey = barbarians),
 * the part the big map shows as a frame. Click or drag to move the big map there.
 */
export function Minimap({ villages, view, onMove }: {
  villages: MapVillage[];
  /** visible part of the big map, in map coordinates */
  view: { x0: number; y0: number; x1: number; y1: number };
  onMove: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // world bounds: around all villages, square, with a margin
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const v of villages) { minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
  if (!villages.length) { minX = minY = 450; maxX = maxY = 550; }
  const size = Math.max(maxX - minX, maxY - minY) + 10;
  const ox = (minX + maxX) / 2 - size / 2, oy = (minY + maxY) / 2 - size / 2;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1, W = c.clientWidth;
    c.width = Math.round(W * dpr); c.height = Math.round(W * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform((dpr * W) / size, 0, 0, (dpr * W) / size, (-ox * dpr * W) / size, (-oy * dpr * W) / size);
    ctx.fillStyle = '#1f2a17'; ctx.fillRect(ox, oy, size, size);
    // continent lines every 100 fields
    ctx.strokeStyle = 'rgba(226,169,59,0.18)'; ctx.lineWidth = size / W;
    for (let k = Math.ceil(ox / 100) * 100; k < ox + size; k += 100) { ctx.beginPath(); ctx.moveTo(k - 0.5, oy); ctx.lineTo(k - 0.5, oy + size); ctx.moveTo(ox, k - 0.5); ctx.lineTo(ox + size, k - 0.5); ctx.stroke(); }
    const dot = Math.max(1, size / W * 2.2);
    for (const kind of ['barb', 'bot'] as const) {
      ctx.fillStyle = COL[kind]; ctx.globalAlpha = kind === 'barb' ? 0.45 : 0.9;
      for (const v of villages) if (v.kind === kind) ctx.fillRect(v.x - dot / 2, v.y - dot / 2, dot, dot);
    }
    ctx.globalAlpha = 1;
    // own villages stand out: bigger, with a dark rim and a soft halo
    const r = dot * 3.2;
    for (const v of villages) if (v.kind === 'own') {
      ctx.fillStyle = 'rgba(226,169,59,0.25)'; ctx.beginPath(); ctx.arc(v.x, v.y, r * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#14110d'; ctx.beginPath(); ctx.arc(v.x, v.y, r * 0.75, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COL.own; ctx.beginPath(); ctx.arc(v.x, v.y, r * 0.55, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#ece3d4'; ctx.lineWidth = (size / W) * 1.5;
    ctx.strokeRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  }, [villages, view.x0, view.y0, view.x1, view.y1, size, ox, oy]);

  const moveTo = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onMove(ox + ((e.clientX - r.left) / r.width) * size, oy + ((e.clientY - r.top) / r.height) * size);
  };
  const own = villages.filter((v) => v.kind === 'own').length, bots = villages.filter((v) => v.kind === 'bot').length, barbs = villages.length - own - bots;
  return (
    <div class="minimap">
      <canvas
        ref={ref}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); moveTo(e); }}
        onPointerMove={(e) => { if (e.buttons & 1) moveTo(e); }}
      />
      <div class="minimap-legend">
        <span><i style={{ background: COL.own }} />jij {own}</span>
        <span><i style={{ background: COL.bot }} />bots {bots}</span>
        <span><i style={{ background: COL.barb }} />barbaren {barbs}</span>
      </div>
    </div>
  );
}
