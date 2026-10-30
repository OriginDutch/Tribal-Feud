import { definedLetters } from '../../shared/farmTemplates';
import { PlayerLink } from '../components/PlayerLink';
import { VillageHistory } from '../components/VillageHistory';
import { MARK_COLORS, OWNER_COLORS, tribeIndex, villageColor } from '../map/colors';
import { Minimap } from '../map/Minimap';
import { BARB_TYPE_NAMES, BONUS_NAMES, type BarbType } from '../../shared/barbarianTypes';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { MapVillage, TribeView } from '../../shared/protocol';
import { formatGameTime } from '../../shared/time';
import { duration, num } from '../format';
import { attackVillage, inviteCandidates, mapData, mapFocus, mapStyle, openPlayer, openSupport, openTribe, refusedInvites, showOnMap, tribeAsks, selectedVillage, send, setMapStyle, snapshot, villageInfo, reportPopup } from '../store';
import { OVERHANG, forestAt, onSpriteLoad, tierOf, villageAt } from '../map/mapSprites';
import { distance, travelMs } from '../units';

type ArrowKind = 'incoming' | 'attack' | 'farm' | 'support' | 'return';
const ARROW_KINDS: [ArrowKind, string][] = [['incoming', 'Inkomend'], ['attack', 'Aanvallen op spelers'], ['farm', 'Farm (op barbaren)'], ['support', 'Support'], ['return', 'Terugkeer']];
const ARROW_DEFAULTS: Record<ArrowKind, boolean> = { incoming: true, attack: true, farm: false, support: true, return: false };
const ARROW_COLOR: Record<ArrowKind, string> = { incoming: '#e5533f', attack: '#e2a93b', farm: 'rgba(240,215,150,0.75)', support: '#7fbf5a', return: 'rgba(220,210,190,0.7)' };

/** A scout's freshness: green under a day (world speed 1), yellow under 3 days, grey under 7, then none. */
function scoutColor(snap: { time: number; multipliers: { world: number } } | null, at: number): string | null {
  if (!snap) return null;
  const days = ((snap.time - at) * snap.multipliers.world) / 86_400_000;
  return days < 1 ? '#7fdc6a' : days < 3 ? '#f2d14b' : days < 7 ? '#a8997f' : null;
}

const HOVER_DELAY_MS = 600;

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
  grass: '#5f7d3c',
  grassDark: '#5c7a3a',
  grassLight: '#62803f',
};

/** Below this zoom the map shows coloured squares instead of village sprites. */
const SPRITE_ZOOM = 12;
/** Village sprites need more room than flat squares to be readable. */
const SPRITE_START_ZOOM = 44;

/** Cheap stable noise per field, for terrain. */
function fieldHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const MIN_ZOOM = 3;
const MAX_ZOOM = 72;
const key = (x: number, y: number) => `${x}|${y}`;

function continent(x: number, y: number): string {
  return `K${Math.floor(y / 100)}${Math.floor(x / 100)}`;
}

/**
 * The world map. With `embed` it is a small window on someone's villages (the player profile):
 * just the canvas, his villages marked, drag and zoom work, a click opens the big map there.
 */
export function MapScreen({ embed }: { embed?: { owner: number } } = {}) {
  const data = mapData.value;
  const s = snapshot.value;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ cx: 500, cy: 500, zoom: mapStyle.value === 'sprites' ? SPRITE_START_ZOOM : 14, centered: false, centeredOn: -1 });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [, redraw] = useState(0);
  /** "Kijk op de kaart": whose villages are marked (a player id, or one village id for a barbarian). */
  const [focus, setFocus] = useState<{ owner?: number; tribe?: number; villageId?: number; name: string; index: number } | null>(null);
  const [search, setSearch] = useState('');
  const [searchError, setSearchError] = useState('');

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

  // open on the village you have selected, and follow it when you switch villages (A/D) on the map;
  // the snapshot is always fresh, the map data may still be from your last visit
  const here = s?.village;
  if (!embed && here && cam.current.centeredOn !== here.id) {
    cam.current.cx = here.x;
    cam.current.cy = here.y;
    cam.current.centered = true;
    cam.current.centeredOn = here.id;
  }

  // villages of the focused player, biggest first
  const focusList = useMemo(() => {
    if (!focus || !data) return [];
    if (focus.tribe !== undefined) return data.villages.filter((v) => v.tribe === focus.tribe).sort((a, b) => b.points - a.points);
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

  // embedded: frame the player's villages once the data is there
  useEffect(() => {
    if (!embed || !data || cam.current.centeredOn === -2) return;
    const list = data.villages.filter((v) => v.owner === embed.owner);
    if (!list.length) return;
    const xs = list.map((v) => v.x), ys = list.map((v) => v.y);
    const c = canvasRef.current;
    const w = c?.clientWidth || 800, h = c?.clientHeight || 300;
    cam.current.cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    cam.current.cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const fit = Math.min(w / (Math.max(...xs) - Math.min(...xs) + 8), h / (Math.max(...ys) - Math.min(...ys) + 8));
    cam.current.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit));
    cam.current.centered = true;
    cam.current.centeredOn = -2;
    setFocus({ owner: embed.owner, name: list[0]!.ownerName, index: 0 });
  }, [data, embed?.owner]);

  // a request from elsewhere (ranking, reports, ...) once the map data is there
  useEffect(() => {
    if (embed) return;
    const req = mapFocus.value;
    if (!req || !data) return;
    mapFocus.value = null;
    if (req.tribe !== undefined) {
      const t = data.tribes.find((x) => x.id === req.tribe);
      const list = data.villages.filter((v) => v.tribe === req.tribe).sort((a, b) => b.points - a.points);
      if (!t || !list[0]) return;
      setFocus({ tribe: t.id, name: `[${t.tag}] ${t.name}`, index: 0 });
      jumpTo(list[0]);
      return;
    }
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
  const pretty = mapStyle.value === 'sprites';
  const draw = () => (mapStyle.value === 'sprites' ? drawSprites() : drawFlat());

  /** Commands on the map, per kind: incoming red, attacks gold, farming (on barbarians) pale gold, support green, returns dashed grey. */
  const [arrows, setArrowsState] = useState<Record<ArrowKind, boolean>>(() => {
    try { return { ...ARROW_DEFAULTS, ...(JSON.parse(localStorage.getItem('tf-map-arrows') ?? '{}') as Partial<Record<ArrowKind, boolean>>) }; } catch { return ARROW_DEFAULTS; }
  });
  const setArrow = (k: ArrowKind, on: boolean) => {
    const next = { ...arrows, [k]: on };
    setArrowsState(next);
    try { localStorage.setItem('tf-map-arrows', JSON.stringify(next)); } catch { /* fine */ }
  };
  const [arrowMenu, setArrowMenu] = useState(false);
  useEffect(() => {
    if (!arrowMenu) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.arrow-pick')) setArrowMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [arrowMenu]);
  const lines = ARROW_KINDS.some(([k]) => arrows[k]);
  const drawLines = (ctx: CanvasRenderingContext2D, toScreen: (x: number, y: number) => readonly [number, number], zoom: number) => {
    if (!lines || !s) return;
    const arrow = (from: { x: number; y: number }, to: { x: number; y: number }, color: string, dashed = false) => {
      const [x1, y1] = toScreen(from.x, from.y);
      const [x2, y2] = toScreen(to.x, to.y);
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 4) return;
      // stop short of the village so the arrowhead stays visible
      const back = Math.min(len * 0.3, zoom * 0.45);
      const ex = x2 - ((x2 - x1) / len) * back, ey = y2 - ((y2 - y1) / len) * back;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(1.5, Math.min(3, zoom / 14));
      ctx.setLineDash(dashed ? [6, 5] : []);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
      const a = Math.atan2(ey - y1, ex - x1), head = Math.max(7, Math.min(13, zoom / 4));
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - head * Math.cos(a - 0.45), ey - head * Math.sin(a - 0.45));
      ctx.lineTo(ex - head * Math.cos(a + 0.45), ey - head * Math.sin(a + 0.45));
      ctx.closePath();
      ctx.fill();
    };
    ctx.save();
    ctx.globalAlpha = 0.85;
    for (const m of s.movements) {
      if (m.kind === 'trade' || m.kind === 'tradeReturn') continue;
      const kind: ArrowKind = m.kind === 'support' ? 'support' : m.kind === 'return' ? 'return' : m.to.owner === -1 ? 'farm' : 'attack';
      if (!arrows[kind]) continue;
      arrow(m.from, m.to, ARROW_COLOR[kind], kind === 'return');
    }
    if (arrows.incoming) for (const m of s.incoming) arrow(m.from, m.to, ARROW_COLOR.incoming);
    ctx.restore();
  };
  /** Churches: where your villages have faith (soft gold circles). */
  const [faith, setFaithState] = useState(() => {
    try { return localStorage.getItem('tf-map-faith') !== 'off'; } catch { return true; }
  });
  const setFaith = (on: boolean) => {
    setFaithState(on);
    try { localStorage.setItem('tf-map-faith', on ? 'on' : 'off'); } catch { /* fine */ }
  };
  const drawFaith = (ctx: CanvasRenderingContext2D, toScreen: (x: number, y: number) => readonly [number, number], zoom: number) => {
    if (!faith || !data?.churches?.length) return;
    ctx.save();
    ctx.fillStyle = 'rgba(226,169,59,0.10)';
    ctx.strokeStyle = 'rgba(226,169,59,0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    for (const c of data.churches) {
      const [cx, cy] = toScreen(c.x, c.y);
      ctx.beginPath();
      ctx.arc(cx, cy, c.radius * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  };
  /** The marked player's or tribe's ground: one soft fill over all their villages. */
  const drawArea = (ctx: CanvasRenderingContext2D, toScreen: (x: number, y: number) => readonly [number, number], zoom: number) => {
    if (!focus || focusList.length < 2) return;
    const color = focus.tribe !== undefined ? (data?.tribes.find((t) => t.id === focus.tribe)?.color ?? COLORS.focus) : COLORS.focus;
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const v of focusList) {
      const [sx, sy] = toScreen(v.x, v.y);
      ctx.moveTo(sx + zoom * 3.2, sy);
      ctx.arc(sx, sy, zoom * 3.2, 0, Math.PI * 2);
    }
    ctx.fill('nonzero');
    ctx.restore();
  };

  /** Search box: a player, a tribe ([TAG] or name) or coordinates. */
  const runSearch = (q: string) => {
    setSearchError('');
    const text = q.trim();
    if (!text || !data) return;
    const xy = /^(\d{1,4})\s*[|,/ ]\s*(\d{1,4})$/.exec(text);
    if (xy) {
      const x = Number(xy[1]), y = Number(xy[2]);
      cam.current.cx = x; cam.current.cy = y;
      const v = byCoord.get(key(x, y));
      if (v) selectedVillage.value = v.id;
      draw();
      return;
    }
    const low = text.toLowerCase().replace(/^\[|\]$/g, '');
    const tribe = data.tribes.find((t) => t.tag.toLowerCase() === low) ?? data.tribes.find((t) => t.name.toLowerCase() === low) ?? data.tribes.find((t) => `[${t.tag}] ${t.name}`.toLowerCase() === text.toLowerCase());
    if (tribe) { mapFocus.value = { tribe: tribe.id }; return; }
    const owners = new Map<string, number>();
    for (const v of data.villages) if (v.owner >= 0) owners.set(v.ownerName.toLowerCase(), v.owner);
    const exact = owners.get(text.toLowerCase());
    const id = exact ?? [...owners].find(([n]) => n.startsWith(text.toLowerCase()))?.[1];
    if (id !== undefined) { mapFocus.value = { owner: id }; return; }
    setSearchError('Niets gevonden');
  };
  const suggestions = useMemo(() => {
    if (!data) return [];
    const names = new Set<string>();
    for (const v of data.villages) if (v.owner >= 0) names.add(v.ownerName);
    return [...data.tribes.map((t) => `[${t.tag}] ${t.name}`), ...[...names].sort()];
  }, [data]);

  const linesKey = s ? `${s.incoming.map((m) => m.id).join(',')}|${s.movements.map((m) => m.id).join(',')}` : '';

  const drawSprites = () => {
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
    const square = (x: number, y: number, grow: number) => {
      const [sx, sy] = toScreen(x, y);
      const half = zoom / 2 + grow;
      ctx.strokeRect(sx - half, sy - half, half * 2, half * 2);
    };

    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(0, 0, w, h);
    const sprites = zoom >= SPRITE_ZOOM;

    // ground variation: two batched paths, one fill per shade
    if (sprites) {
      const dark = new Path2D();
      const light = new Path2D();
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const n = fieldHash(x, y);
          if (n > 0.3) continue;
          const [sx, sy] = toScreen(x - 0.5, y - 0.5);
          (n < 0.15 ? dark : light).rect(sx, sy, zoom, zoom);
        }
      }
      ctx.fillStyle = COLORS.grassDark;
      ctx.fill(dark);
      ctx.fillStyle = COLORS.grassLight;
      ctx.fill(light);
    }
    if (zoom >= 10) {
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
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
    ctx.lineWidth = 1.5;
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
    ctx.fillStyle = 'rgba(236,227,212,0.7)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (let cyK = Math.floor(y0 / 100); cyK <= Math.floor(y1 / 100); cyK++) {
      for (let cxK = Math.floor(x0 / 100); cxK <= Math.floor(x1 / 100); cxK++) {
        const [sx, sy] = toScreen(Math.max(cxK * 100, x0 + 1) - 0.5, Math.max(cyK * 100, y0 + 1) - 0.5);
        ctx.fillText(`K${cyK}${cxK}`, sx + 4, sy + 14);
      }
    }

    const px = zoom * dpr;
    const tribesById = tribeIndex(data?.tribes);
    const ownerColor = (v: MapVillage) => villageColor(v, tribesById, data?.marks);
    const sel = selectedVillage.value;
    const overhang = (OVERHANG / 64) * zoom;
    const place = (img: CanvasImageSource, x: number, y: number) => {
      const [sx, sy] = toScreen(x - 0.5, y - 0.5);
      ctx.drawImage(img, Math.round(sx * dpr) / dpr, Math.round((sy - overhang) * dpr) / dpr, zoom, zoom + overhang);
    };

    // sprites row by row from the top: tall things (keeps, banners, trees) reach into the row above,
    // so a village in front covers the one behind it
    if (sprites) {
      for (let y = y0; y <= y1 + 1; y++) {
        for (let x = x0; x <= x1; x++) {
          const v = byCoord.get(key(x, y));
          if (v) {
            const img = villageAt(tierOf(v.points), ownerColor(v), v.kind !== 'barb', v.id, px);
            if (img) place(img, x, y);
          } else if (fieldHash(y, x) < 0.1) {
            const img = forestAt(Math.floor(fieldHash(x + 7, y) * 4), px);
            if (img) place(img, x, y);
          }
        }
      }
    }

    // markers on top of all sprites
    for (const v of data?.villages ?? []) {
      if (v.x < x0 || v.x > x1 || v.y < y0 || v.y > y1) continue;
      const color = ownerColor(v);
      const [sx, sy] = toScreen(v.x, v.y);
      if (!sprites) {
        const size = Math.max(2, zoom * 0.72);
        ctx.fillStyle = color;
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      }
      if (v.bonus) {
        ctx.strokeStyle = COLORS.bonus;
        ctx.lineWidth = Math.max(1, zoom / 14);
        square(v.x, v.y, -Math.max(1, zoom / 20));
      }
      if (sprites && v.barbType && zoom >= 20) {
        const r = Math.max(5, zoom * 0.16);
        const lx = sx - zoom * 0.32;
        const ly = sy + zoom * 0.32;
        ctx.fillStyle = 'rgba(27,23,18,0.8)';
        ctx.beginPath();
        ctx.arc(lx, ly, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ece3d4';
        ctx.font = `bold ${Math.round(r * 1.2)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(TYPE_LETTER[v.barbType], lx, ly + 0.5);
      }
      if (v.scoutedAt !== undefined && zoom >= 14) {
        const c = scoutColor(snapshot.value, v.scoutedAt);
        if (c) {
          const r = Math.max(4, zoom * 0.13);
          const lx = sx - zoom * 0.32, ly = sy + zoom * 0.32;
          ctx.fillStyle = 'rgba(27,23,18,0.85)';
          ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.fill();
          // an eye: almond and pupil, in the colour of how fresh the scout is
          ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = Math.max(1, r / 4);
          ctx.beginPath(); ctx.ellipse(lx, ly, r * 0.7, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.arc(lx, ly, r * 0.22, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (v.note && zoom >= 14) {
        // a note: a small page bottom right
        const w = Math.max(6, zoom * 0.17), h = w * 1.25;
        const lx = sx + zoom * 0.3 - w / 2, ly = sy + zoom * 0.3 - h / 2;
        ctx.fillStyle = '#efe6d6'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
        ctx.fillRect(lx, ly, w, h); ctx.strokeRect(lx, ly, w, h);
        ctx.strokeStyle = '#7d705c';
        for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(lx + w * 0.2, ly + (h * i) / 3); ctx.lineTo(lx + w * 0.8, ly + (h * i) / 3); ctx.stroke(); }
      }
      if (v.last && zoom >= 8) {
        ctx.fillStyle = v.last.result === 'loss' ? COLORS.bot : COLORS.attacked;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        const r = Math.max(2.5, zoom / 9);
        ctx.beginPath();
        ctx.arc(sx + zoom * 0.34, sy - zoom * 0.34, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      if (focusIds.has(v.id)) {
        ctx.strokeStyle = COLORS.focus;
        ctx.lineWidth = Math.max(2, zoom / 12);
        square(v.x, v.y, 1);
      }
      if (v.id === sel) {
        ctx.strokeStyle = COLORS.selected;
        ctx.lineWidth = 2;
        square(v.x, v.y, 2);
      }
    }
    drawFaith(ctx, toScreen, zoom);
    drawArea(ctx, toScreen, zoom);
    drawLines(ctx, toScreen, zoom);
  };

  const drawFlat = () => {
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
    const tribesById = tribeIndex(data?.tribes);
    for (const v of data?.villages ?? []) {
      if (v.x < x0 || v.x > x1 || v.y < y0 || v.y > y1) continue;
      const [sx, sy] = toScreen(v.x, v.y);
      ctx.fillStyle = villageColor(v, tribesById, data?.marks);
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
    drawFaith(ctx, toScreen, zoom);
    drawArea(ctx, toScreen, zoom);
    drawLines(ctx, toScreen, zoom);
  };

  // redraw only when what is drawn changes, not on every game update
  const sel = selectedVillage.value;
  const style = mapStyle.value;
  useEffect(draw, [data, focusIds, sel, style, here?.id, arrows, linesKey, faith]);
  // sprites load in the background: redraw when one is ready
  useEffect(() => {
    onSpriteLoad(() => draw());
    return () => onSpriteLoad(null);
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => ro.disconnect();
  });

  // --- input ---
  /** Map coordinates under the pointer, not rounded. */
  const pointAt = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { cx, cy, zoom } = cam.current;
    return { x: cx + (sx - rect.width / 2) / zoom, y: cy + (sy - rect.height / 2) / zoom };
  };
  /** The field under the pointer. */
  const fieldAt = (e: { clientX: number; clientY: number }) => {
    const p = pointAt(e);
    return { x: Math.round(p.x), y: Math.round(p.y) };
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
  /** The hover card: after resting on a village for a moment, so it never gets in the way. */
  const [card, setCard] = useState<{ id: number; x: number; y: number } | null>(null);
  const cardTimer = useRef<{ t: number; field: string } | null>(null);
  const hideCard = () => {
    if (cardTimer.current) window.clearTimeout(cardTimer.current.t);
    cardTimer.current = null;
    setCard(null);
  };
  const planCard = (e: PointerEvent) => {
    const f = fieldAt(e);
    const k = key(f.x, f.y);
    if (cardTimer.current?.field === k) return;
    hideCard();
    const v = byCoord.get(k);
    if (!v) return;
    const x = e.offsetX, y = e.offsetY;
    cardTimer.current = { field: k, t: window.setTimeout(() => setCard({ id: v.id, x, y }), HOVER_DELAY_MS) };
  };
  useEffect(() => () => { if (cardTimer.current) window.clearTimeout(cardTimer.current.t); }, []);
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) redraw((n) => n + 1);
    if (d && !d.moved) {
      const f = fieldAt(e);
      const v = byCoord.get(key(f.x, f.y));
      if (embed) {
        if (v) showOnMap({ x: v.x, y: v.y });
        return;
      }
      selectedVillage.value = v ? v.id : null;
      // a player's village: show all of that player's villages at once
      if (v && v.kind === 'bot') {
        const list = (data?.villages ?? []).filter((x) => x.owner === v.owner).sort((a, b) => b.points - a.points);
        setFocus({ owner: v.owner, name: v.ownerName, index: Math.max(0, list.findIndex((x) => x.id === v.id)) });
      }
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const before = pointAt(e);
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    cam.current.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.current.zoom * factor));
    const after = pointAt(e);
    cam.current.cx += before.x - after.x;
    cam.current.cy += before.y - after.y;
    draw();
    redraw((n) => n + 1);
  };

  /** The part of the map that is on screen, for the minimap frame. */
  const viewBox = () => {
    const c = canvasRef.current, { cx, cy, zoom } = cam.current;
    const w = (c?.clientWidth ?? 800) / zoom, h = (c?.clientHeight ?? 600) / zoom;
    return { x0: cx - w / 2 - 0.5, y0: cy - h / 2 - 0.5, x1: cx + w / 2 - 0.5, y1: cy + h / 2 - 0.5 };
  };
  const centerOn = (x: number, y: number) => {
    cam.current.cx = x;
    cam.current.cy = y;
    draw();
  };

  const selected = selectedVillage.value !== null ? byId.get(selectedVillage.value) : undefined;
  const selectedTribe = selected?.tribe !== undefined ? data?.tribes.find((t) => t.id === selected.tribe) : undefined;
  const hovered = hover ? byCoord.get(key(hover.x, hover.y)) : undefined;

  if (embed) {
    return (
      <div class="map-embed">
        <canvas
          ref={canvasRef}
          class="map-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHover(null)}
          onWheel={onWheel}
        />
        <span class="map-embed-hover muted">
          {hovered ? `${hovered.name} (${hovered.x}|${hovered.y}) · ${hovered.kind === 'barb' ? 'barbaren' : hovered.ownerName} · ${num(hovered.points)} p` : 'Slepen = verschuiven, scrollen = zoomen, klik = grote kaart'}
        </span>
      </div>
    );
  }

  return (
    <div class="screen map-screen">
      <div class="map-head">
        <h2>Kaart</h2>
        <span class="muted map-hoverinfo">
          {hover ? `${hover.x}|${hover.y} · ${continent(hover.x, hover.y)}` : ''}
          {hovered ? ` · ${hovered.name} (${num(hovered.points)} p)` : ''}
        </span>
        <span class="legend">
          <i style={{ background: COLORS.own }} /> jij <i class="tribe-swatch" /> stammen <i style={{ background: OWNER_COLORS.bot }} /> zonder stam{' '}
          <i style={{ background: COLORS.barb }} /> barbaren <i style={{ background: COLORS.bonus }} /> bonus
        </span>
        {own && (
          <button class="small" onClick={() => centerOn(own.x, own.y)}>
            Naar mijn dorp
          </button>
        )}
        <button
          class="small"
          title={pretty ? 'Platte kaart met gekleurde vakjes, zoals eerst' : 'Kaart met getekende dorpjes'}
          onClick={() => setMapStyle(pretty ? 'flat' : 'sprites')}
        >
          {pretty ? 'Klassieke weergave' : 'Dorpjes-weergave'}
        </button>
        <span class="arrow-pick">
          <button class={`small ${lines ? 'active' : ''}`} aria-expanded={arrowMenu} onClick={() => setArrowMenu(!arrowMenu)} title="Welke bevelen als pijl op de kaart staan">
            Pijlen ▾
            {s && s.incoming.length > 0 && <span class="badge">{s.incoming.length}</span>}
          </button>
          {arrowMenu && (
            <span class="arrow-menu" role="group" aria-label="Pijlen op de kaart">
              {ARROW_KINDS.map(([k, label]) => (
                <label key={k}>
                  <input type="checkbox" checked={arrows[k]} onChange={(e) => setArrow(k, e.currentTarget.checked)} />
                  <i style={{ background: ARROW_COLOR[k] }} /> {label}
                </label>
              ))}
            </span>
          )}
        </span>
        {data?.churches && (
          <button class={`small ${faith ? 'active' : ''}`} title="Waar je dorpen geloof hebben (bereik van je kerken)" onClick={() => setFaith(!faith)}>
            Geloof {faith ? 'aan' : 'uit'}
          </button>
        )}
        <form class="map-search" onSubmit={(e) => { e.preventDefault(); runSearch(search); }}>
          <input
            list="map-search-list"
            placeholder="Speler, [STAM] of 501|497"
            value={search}
            onInput={(e) => { setSearch(e.currentTarget.value); setSearchError(''); }}
            onChange={(e) => runSearch(e.currentTarget.value)}
          />
          <datalist id="map-search-list">
            {suggestions.map((n) => <option key={n} value={String(n)} />)}
          </datalist>
          {searchError && <span class="error">{searchError}</span>}
        </form>
        {focus && focusList.length > 0 && (
          <span class="map-focus">
            <i style={{ borderColor: COLORS.focus }} />
            {focus.tribe !== undefined ? `Stam ${focus.name} (${focusList.length})` : focus.owner === undefined ? focus.name : `Dorpen van ${focus.name} (${focusList.length})`}
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
        <div class="map-canvas-wrap">
          <canvas
            ref={canvasRef}
            class="map-canvas"
            onPointerDown={(e) => { hideCard(); onPointerDown(e); }}
            onPointerMove={(e) => { onPointerMove(e); if (!drag.current) planCard(e); }}
            onPointerUp={onPointerUp}
            onPointerLeave={() => { setHover(null); hideCard(); }}
            onWheel={(e) => { hideCard(); onWheel(e); }}
          />
          {card && byId.get(card.id) && <HoverCard v={byId.get(card.id)!} x={card.x} y={card.y} tribes={data?.tribes ?? []} />}
        </div>
        <aside class="map-side">
          {data && (
            <section class="panel minimap-panel">
              <Minimap
                villages={data.villages}
                tribes={data.tribes}
                view={viewBox()}
                onMove={(x, y) => { centerOn(x, y); redraw((n) => n + 1); }}
              />
            </section>
          )}
          <section class="panel">
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
                    <td class="right"><PlayerLink id={selected.owner} name={selected.ownerName} /></td>
                  </tr>
                  {selectedTribe && (
                    <tr>
                      <td>Stam</td>
                      <td class="right">
                        <button class="link tribe-tag" style={{ '--tc': selectedTribe.color }} onClick={() => openTribe(selectedTribe.id)}>
                          [{selectedTribe.tag}]
                        </button>
                      </td>
                    </tr>
                  )}
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
                        <button class="link" title="Rapport bekijken" disabled={selected.last.report === undefined}
                          onClick={() => { const r = villageInfo.value?.reports.find((x) => x.id === selected.last!.report); if (r) reportPopup.value = r; }}>
                          <span class={`dot ${selected.last.result}`} /> {formatGameTime(selected.last.time)}
                          {selected.last.loot > 0 && <span class="muted"> · buit {num(selected.last.loot)}</span>}
                        </button>
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
                  <button onClick={() => openSupport(selected.id)}>Support plannen</button>
                </div>
              )}
              {selected.kind !== 'own' && (
                <div class="row">
                  <button class="primary" onClick={() => attackVillage(selected.x, selected.y)}>
                    {selected.kind === 'barb' ? 'Aanvallen' : 'Verzamelplaats'}
                  </button>
                  {definedLetters(snapshot.value?.farmTemplates).map((l) => (
                    <button key={l} onClick={() => send({ type: 'sendFarm', from: own.id, to: selected.id, template: l })}>Farm {l}</button>
                  ))}
                  <button
                    disabled={selected.estimate === undefined}
                    title={selected.estimate === undefined ? 'Eerst verkennen' : `~${num(selected.estimate)} buit`}
                    onClick={() => send({ type: 'sendFarm', from: own.id, to: selected.id, template: '*' })}
                  >
                    Farm *
                  </button>
                </div>
              )}
              {selected.kind === 'bot' && data && (
                <PlayerPanel
                  owner={selected.owner}
                  name={selected.ownerName}
                  tribeId={selected.tribe}
                  villages={data.villages.filter((x) => x.owner === selected.owner).sort((a, b) => b.points - a.points)}
                  selectedId={selected.id}
                  onPick={(x) => { jumpTo(x); setFocus((f) => (f ? { ...f, index: Math.max(0, focusList.findIndex((y) => y.id === x.id)) } : f)); }}
                />
              )}
              <VillageHistory id={selected.id} {...(selected.kind === 'bot' ? { owner: selected.owner } : {})} />
            </>
          )}
          </section>
        </aside>
      </div>
    </div>
  );
}

/** The owner of the selected village: all their villages, and what you can do with them as a player. */
function PlayerPanel({ owner, name, tribeId, villages, selectedId, onPick }: {
  owner: number;
  name: string;
  tribeId?: number;
  villages: MapVillage[];
  selectedId: number;
  onPick: (v: MapVillage) => void;
}) {
  const s = snapshot.value;
  const data = mapData.value;
  useEffect(() => { send({ type: 'getRanking' }); }, [owner]);
  const tribe = tribeId !== undefined ? data?.tribes.find((t) => t.id === tribeId) : undefined;
  const leader = !!s?.myTribeLeader && s.myTribe !== null;
  const inMine = tribeId !== undefined && tribeId === s?.myTribe;
  const invited = tribeAsks.value.some((a) => a.kind === 'invite' && a.player === owner);
  const declined = refusedInvites.value[owner] ?? 0;
  const cand = inviteCandidates.value.find((c) => c.id === owner);
  const total = villages.reduce((t, v) => t + v.points, 0);
  return (
    <div class="player-panel">
      <h3>
        <PlayerLink id={owner} name={name} />{' '}
        {tribe && (
          <button class="link tribe-tag" style={{ '--tc': tribe.color }} onClick={() => openTribe(tribe.id)}>
            [{tribe.tag}]
          </button>
        )}
      </h3>
      <p class="muted">
        {villages.length} {villages.length === 1 ? 'dorp' : 'dorpen'} · {num(total)} punten
      </p>
      <ul class="player-villages">
        {villages.map((v) => (
          <li key={v.id} class={v.id === selectedId ? 'on' : ''}>
            <button class="link" onClick={() => onPick(v)}>
              {v.name} <span class="muted">({v.x}|{v.y})</span>
            </button>
            <span class="mono muted">{num(v.points)}</span>
          </li>
        ))}
      </ul>
      <MarkRow label="Speler markeren" current={data?.marks.players[owner]} onPick={(c) => send({ type: 'setMark', target: 'player', id: owner, color: c })} />
      {tribe && <MarkRow label={`[${tribe.tag}] markeren`} current={data?.marks.tribes[tribe.id]} onPick={(c) => send({ type: 'setMark', target: 'tribe', id: tribe.id, color: c })} />}
      <div class="row wrap">
        <button class="small" onClick={() => openPlayer(owner)}>
          Profiel
        </button>
        {leader && !inMine && (invited ? (
          <span class="muted">uitgenodigd</span>
        ) : (
          <button class="small" onClick={() => send({ type: 'tribeInvite', player: owner })}>
            Uitnodigen voor je stam
          </button>
        ))}
        {leader && !inMine && cand?.blocked === 'far' && (
          <span class="refused" title="Hij zegt nee: te ver van het centrum van je stam">
            te ver ({cand.distance} / max {cand.reach})
          </span>
        )}
        {inMine && <span class="muted">zit in jouw stam</span>}
        {s?.myTribe !== null && s?.myTribe !== undefined && !inMine && (
          <>
            <button class="small" title="Vraag je stam dit dorp aan te vallen" onClick={() => send({ type: 'giveOrder', kind: 'attack', target: selectedId })}>
              Stam: aanvallen
            </button>
            <button class="small" title="Vraag je stam deze speler met rust te laten" onClick={() => send({ type: 'giveOrder', kind: 'spare', target: owner })}>
              Stam: met rust laten
            </button>
            <button class="small" title="Vraag je stam zich op deze speler te richten" onClick={() => send({ type: 'giveOrder', kind: 'focus', target: owner })}>
              Stam: focus
            </button>
          </>
        )}
        {declined > 0 && <span class="refused">{declined}× afgewezen</span>}
      </div>
    </div>
  );
}

/** A row of colour swatches: your own colour for a player or tribe on the map (click again = off). */
function MarkRow({ label, current, onPick }: { label: string; current?: string; onPick: (c: string | null) => void }) {
  return (
    <div class="mark-row" role="group" aria-label={label}>
      <span class="muted">{label}</span>
      {MARK_COLORS.map((c) => (
        <button key={c} class={`mark-swatch ${current === c ? 'on' : ''}`} style={{ background: c }} aria-label={`${label}: ${c}`} aria-pressed={current === c}
          onClick={() => onPick(current === c ? null : c)} />
      ))}
      {current && <button class="small link" onClick={() => onPick(null)}>weg</button>}
    </div>
  );
}

/** A small card next to the village under the pointer: who, how big, what you know. */
function HoverCard({ v, x, y, tribes }: { v: MapVillage; x: number; y: number; tribes: TribeView[] }) {
  const s = snapshot.value;
  const tribe = v.tribe !== undefined ? tribes.find((t) => t.id === v.tribe) : undefined;
  const scout = v.scoutedAt !== undefined ? scoutColor(s, v.scoutedAt) : null;
  const flip = x > 520;
  return (
    <div class="map-hovercard" style={{ left: `${flip ? x - 266 : x + 16}px`, top: `${Math.max(8, y - 20)}px` }} role="tooltip">
      <strong>{v.name} <span class="muted">({v.x}|{v.y})</span></strong>
      <span>{v.kind === 'barb' ? 'Barbaren' : v.ownerName}{tribe ? ` [${tribe.tag}]` : ''} · {num(v.points)} p</span>
      {v.kind === 'barb' && v.barbType && <span class="muted">{BARB_TYPE_NAMES[v.barbType]}{v.wall !== undefined ? ` · muur ${v.wall}` : ''}</span>}
      {v.kind !== 'barb' && v.wall !== undefined && <span class="muted">muur {v.wall}</span>}
      {v.last && <span class="muted">laatste aanval {formatGameTime(v.last.time)} · {v.last.result === 'loss' ? 'verloren' : 'gewonnen'}{v.last.loot ? ` · buit ${num(v.last.loot)}` : ''}</span>}
      {scout && <span class="muted"><i class="hc-dot" style={{ background: scout }} /> verkend {s ? formatGameTime(v.scoutedAt!) : ''}</span>}
      {v.note && <span class="muted">heeft een notitie (klik voor meer)</span>}
    </div>
  );
}
