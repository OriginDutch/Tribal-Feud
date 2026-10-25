import { BARB_TYPE_NAMES, BONUS_NAMES, type BarbType } from '../../shared/barbarianTypes';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { MapVillage } from '../../shared/protocol';
import { formatGameTime } from '../../shared/time';
import { duration, num } from '../format';
import { attackVillage, mapData, mapFocus, selectedVillage, send, snapshot } from '../store';
import { distance, travelMs } from '../units';

const TYPE_LETTER: Record<BarbType, string> = { resource: 'G', military: 'M', defensive: 'V', balanced: 'B' };

const COLORS = {
  bg: '#1d2318',
  grid: 'rgba(255,255,255,0.04)',
  continent: 'rgba(200,150,62,0.35)',
  label: 'rgba(236,227,212,0.45)',
  own: '#e0b04a',
  bot: '#b5523b',
  barb: '#8f8678',
  bonus: '#b48ad8',
  selected: '#ffffff',
  attacked: '#7fa35a',
  focus: '#5fd3e8',
};

const MIN_ZOOM = 3;
const MAX_ZOOM = 40;
const key = (x: number, y: number) => `${x}|${y}`;

function continent(x: number, y: number): string {
  return `K${Math.floor(y / 100)}${Math.floor(x / 100)}`;
}

export function MapScreen() {
  const data = mapData.value;
  const s = snapshot.value;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ cx: 500, cy: 500, zoom: 14, centered: false });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [, redraw] = useState(0);
  /** "Kijk op de kaart": whose villages are marked (a player id, or one village id for a barbarian). */
  const [focus, setFocus] = useState<{ owner?: number; villageId?: number; name: string; index: number } | null>(null);

  // fresh map data while the map is open (barbarians grow, reports come in)
  useEffect(() => {
    send({ type: 'getMap' });
    const t = window.setInterval(() => send({ type: 'getMap' }), 3000);
    return () => window.clearInterval(t);
  }, []);

  const byCoord = useMemo(() => {
    const m = new Map<string, MapVillage>();
    for (const v of data?.villages ?? []) m.set(key(v.x, v.y), v);
    return m;
  }, [data]);
  const byId = useMemo(() => new Map((data?.villages ?? []).map((v) => [v.id, v])), [data]);
  const own = data ? byId.get(data.ownVillageId) : undefined;

  if (own && !cam.current.centered) {
    cam.current.cx = own.x;
    cam.current.cy = own.y;
    cam.current.centered = true;
  }

  // villages of the focused player, biggest first
  const focusList = useMemo(() => {
    if (!focus || !data) return [];
    if (focus.owner === undefined) return data.villages.filter((v) => v.id === focus.villageId);
    return data.villages.filter((v) => v.owner === focus.owner).sort((a, b) => b.points - a.points);
  }, [focus, data]);
  const focusIds = useMemo(() => new Set(focusList.map((v) => v.id)), [focusList]);

  const jumpTo = (v: MapVillage) => {
    cam.current.cx = v.x;
    cam.current.cy = v.y;
    cam.current.centered = true;
    selectedVillage.value = v.id;
    draw();
  };

  // a request from elsewhere (ranking, reports, ...) once the map data is there
  useEffect(() => {
    const req = mapFocus.value;
    if (!req || !data) return;
    mapFocus.value = null;
    const at = req.x !== undefined && req.y !== undefined ? byCoord.get(key(req.x, req.y)) : undefined;
    const owner = req.owner ?? at?.owner;
    if (at?.kind === 'barb' || owner === undefined) {
      if (!at) return;
      setFocus({ villageId: at.id, name: at.name, index: 0 });
      jumpTo(at);
      return;
    }
    const list = data.villages.filter((v) => v.owner === owner).sort((a, b) => b.points - a.points);
    const first = list[0];
    if (!first) return;
    const index = at ? Math.max(0, list.findIndex((v) => v.id === at.id)) : 0;
    setFocus({ owner, name: first.ownerName, index });
    jumpTo(list[index] ?? first);
  }, [mapFocus.value, data]);

  const step = (delta: number) => {
    if (!focus || focusList.length === 0) return;
    const index = (focus.index + delta + focusList.length) % focusList.length;
    setFocus({ ...focus, index });
    const v = focusList[index];
    if (v) jumpTo(v);
  };

  // --- drawing ---
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { cx, cy, zoom } = cam.current;
    const toScreen = (x: number, y: number) => [w / 2 + (x - cx) * zoom, h / 2 + (y - cy) * zoom] as const;
    const x0 = Math.floor(cx - w / 2 / zoom) - 1;
    const x1 = Math.ceil(cx + w / 2 / zoom) + 1;
    const y0 = Math.floor(cy - h / 2 / zoom) - 1;
    const y1 = Math.ceil(cy + h / 2 / zoom) + 1;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    if (zoom >= 10) {
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) {
        const [sx] = toScreen(x - 0.5, 0);
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
      }
      for (let y = y0; y <= y1; y++) {
        const [, sy] = toScreen(0, y - 0.5);
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
      }
      ctx.stroke();
    }

    // continents
    ctx.strokeStyle = COLORS.continent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(x0 / 100) * 100; x <= x1; x += 100) {
      const [sx] = toScreen(x - 0.5, 0);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    for (let y = Math.ceil(y0 / 100) * 100; y <= y1; y += 100) {
      const [, sy] = toScreen(0, y - 0.5);
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();
    ctx.fillStyle = COLORS.label;
    ctx.font = '12px system-ui, sans-serif';
    for (let cyK = Math.floor(y0 / 100); cyK <= Math.floor(y1 / 100); cyK++) {
      for (let cxK = Math.floor(x0 / 100); cxK <= Math.floor(x1 / 100); cxK++) {
        const [sx, sy] = toScreen(Math.max(cxK * 100, x0 + 1) - 0.5, Math.max(cyK * 100, y0 + 1) - 0.5);
        ctx.fillText(`K${cyK}${cxK}`, sx + 4, sy + 14);
      }
    }

    // villages
    const size = Math.max(2, zoom * 0.72);
    const sel = selectedVillage.value;
    for (const v of data?.villages ?? []) {
      if (v.x < x0 || v.x > x1 || v.y < y0 || v.y > y1) continue;
      const [sx, sy] = toScreen(v.x, v.y);
      ctx.fillStyle = v.kind === 'own' ? COLORS.own : v.kind === 'bot' ? COLORS.bot : COLORS.barb;
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      if (v.bonus) {
        ctx.strokeStyle = COLORS.bonus;
        ctx.lineWidth = Math.max(1, size / 8);
        ctx.strokeRect(sx - size / 2 + 1, sy - size / 2 + 1, size - 2, size - 2);
      }
      if (v.barbType && zoom >= 14) {
        ctx.fillStyle = '#1b1712';
        ctx.font = `bold ${Math.round(size * 0.55)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(TYPE_LETTER[v.barbType], sx, sy + 1);
      }
      if (v.last && zoom >= 8) {
        ctx.fillStyle = v.last.result === 'loss' ? COLORS.bot : COLORS.attacked;
        const d = Math.max(2, size / 4);
        ctx.fillRect(sx + size / 2 - d, sy - size / 2, d, d);
      }
      if (focusIds.has(v.id)) {
        ctx.strokeStyle = COLORS.focus;
        ctx.lineWidth = Math.max(2, size / 6);
        ctx.strokeRect(sx - size / 2 - 3, sy - size / 2 - 3, size + 6, size + 6);
      }
      if (v.id === sel) {
        ctx.strokeStyle = COLORS.selected;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx - size / 2 - 2, sy - size / 2 - 2, size + 4, size + 4);
      }
    }
  };

  useEffect(draw);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => ro.disconnect();
  });

  // --- input ---
  const fieldAt = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const { cx, cy, zoom } = cam.current;
    return {
      x: Math.round(cx + (e.clientX - rect.left - rect.width / 2) / zoom),
      y: Math.round(cy + (e.clientY - rect.top - rect.height / 2) / zoom),
    };
  };

  const onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: cam.current.cx, cy: cam.current.cy, moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      cam.current.cx = d.cx - dx / cam.current.zoom;
      cam.current.cy = d.cy - dy / cam.current.zoom;
      draw();
    } else {
      const f = fieldAt(e);
      if (!hover || hover.x !== f.x || hover.y !== f.y) setHover(f);
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      const f = fieldAt(e);
      const v = byCoord.get(key(f.x, f.y));
      selectedVillage.value = v ? v.id : null;
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const before = fieldAt(e);
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    cam.current.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.current.zoom * factor));
    const after = fieldAt(e);
    cam.current.cx += before.x - after.x;
    cam.current.cy += before.y - after.y;
    draw();
    redraw((n) => n + 1);
  };

  const centerOn = (x: number, y: number) => {
    cam.current.cx = x;
    cam.current.cy = y;
    draw();
  };

  const selected = selectedVillage.value !== null ? byId.get(selectedVillage.value) : undefined;
  const hovered = hover ? byCoord.get(key(hover.x, hover.y)) : undefined;

  return (
    <div class="screen map-screen">
      <div class="map-head">
        <h2>Kaart</h2>
        <span class="muted">
          {hover ? `${hover.x}|${hover.y} · ${continent(hover.x, hover.y)}` : ''}
          {hovered ? ` · ${hovered.name} (${num(hovered.points)} p)` : ''}
        </span>
        <span class="legend">
          <i style={{ background: COLORS.own }} /> jij <i style={{ background: COLORS.bot }} /> bots{' '}
          <i style={{ background: COLORS.barb }} /> barbaren <i style={{ background: COLORS.bonus }} /> bonus
        </span>
        {own && (
          <button class="small" onClick={() => centerOn(own.x, own.y)}>
            Naar mijn dorp
          </button>
        )}
        {focus && focusList.length > 0 && (
          <span class="map-focus">
            <i style={{ borderColor: COLORS.focus }} />
            {focus.owner === undefined ? focus.name : `Dorpen van ${focus.name} (${focusList.length})`}
            {focusList.length > 1 && (
              <>
                <button class="small" title="Vorig dorp" onClick={() => step(-1)}>
                  ◀
                </button>
                <span class="mono muted">
                  {focus.index + 1}/{focusList.length}
                </span>
                <button class="small" title="Volgend dorp" onClick={() => step(1)}>
                  ▶
                </button>
              </>
            )}
            <button class="small" title="Markering weg" onClick={() => setFocus(null)}>
              ✕
            </button>
          </span>
        )}
      </div>
      <div class="map-body">
        <canvas
          ref={canvasRef}
          class="map-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHover(null)}
          onWheel={onWheel}
        />
        <aside class="panel map-side">
          {!data && <p class="muted">Kaart laden…</p>}
          {data && !selected && <p class="muted">Klik op een dorp. Slepen = verschuiven, scrollen = zoomen.</p>}
          {selected && own && s?.village && (
            <>
              <h3>{selected.name}</h3>
              <table class="table compact">
                <tbody>
                  <tr>
                    <td>Coördinaten</td>
                    <td class="right mono">
                      {selected.x}|{selected.y} {continent(selected.x, selected.y)}
                    </td>
                  </tr>
                  <tr>
                    <td>Eigenaar</td>
                    <td class="right">{selected.ownerName}</td>
                  </tr>
                  <tr>
                    <td>Punten</td>
                    <td class="right mono">{num(selected.points)}</td>
                  </tr>
                  {selected.bonus && (
                    <tr>
                      <td>Bonus</td>
                      <td class="right">{BONUS_NAMES[selected.bonus]}</td>
                    </tr>
                  )}
                  {selected.kind === 'barb' && (
                    <tr>
                      <td>Type</td>
                      <td class="right">{selected.barbType ? BARB_TYPE_NAMES[selected.barbType] : <span class="muted">onbekend (verkennen)</span>}</td>
                    </tr>
                  )}
                  {selected.kind !== 'own' && (
                    <tr>
                      <td>Muur</td>
                      <td class="right mono">{selected.wall ?? <span class="muted">?</span>}</td>
                    </tr>
                  )}
                  {selected.kind !== 'own' && (
                    <>
                      <tr>
                        <td>Afstand</td>
                        <td class="right mono">{distance(own, selected).toFixed(1)} velden</td>
                      </tr>
                      <tr>
                        <td>Looptijd LC / speer / ram</td>
                        <td class="right mono">
                          {(['light', 'spear', 'ram'] as const)
                            .map((u) => duration(travelMs({ [u]: 1 }, s.village?.units ?? [], distance(own, selected), s.marchFactor)))
                            .join(' / ')}
                        </td>
                      </tr>
                    </>
                  )}
                  {selected.last && (
                    <tr>
                      <td>Laatste aanval</td>
                      <td class="right">
                        <span class={`dot ${selected.last.result}`} /> {formatGameTime(selected.last.time)}
                        {selected.last.loot > 0 && <span class="muted"> · buit {num(selected.last.loot)}</span>}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {selected.kind === 'own' && selected.id !== own.id && (
                <div class="row">
                  <button class="primary" onClick={() => send({ type: 'selectVillage', id: selected.id })}>
                    Naar dit dorp
                  </button>
                  <button onClick={() => attackVillage(selected.x, selected.y)}>Ondersteunen</button>
                </div>
              )}
              {selected.kind !== 'own' && (
                <div class="row">
                  <button class="primary" onClick={() => attackVillage(selected.x, selected.y)}>
                    {selected.kind === 'barb' ? 'Aanvallen' : 'Verzamelplaats'}
                  </button>
                  <button onClick={() => send({ type: 'sendFarm', from: own.id, to: selected.id, template: 'A' })}>Farm A</button>
                  <button onClick={() => send({ type: 'sendFarm', from: own.id, to: selected.id, template: 'B' })}>Farm B</button>
                  <button
                    disabled={selected.estimate === undefined}
                    title={selected.estimate === undefined ? 'Eerst verkennen' : `~${num(selected.estimate)} buit`}
                    onClick={() => send({ type: 'sendFarm', from: own.id, to: selected.id, template: 'C' })}
                  >
                    Farm C
                  </button>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
