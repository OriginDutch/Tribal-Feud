import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { NavIcon } from './NavIcon';
import { openBuilding, paletteOpen, ranking, screen, send, showOnMap, snapshot, type Screen } from '../store';
import type { BuildingId } from '../../shared/gameData';

interface Entry {
  id: string;
  label: string;
  hint: string;
  icon: string;
  run: () => void;
}

const SCREENS: { id: Screen; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overzicht', icon: 'overview' },
  { id: 'villages', label: 'Dorpen', icon: 'villages' },
  { id: 'manager', label: 'Accountmanager', icon: 'manager' },
  { id: 'quests', label: 'Opdrachten', icon: 'quests' },
  { id: 'map', label: 'Kaart', icon: 'map' },
  { id: 'farm', label: 'Farm-assistent', icon: 'farm' },
  { id: 'reports', label: 'Rapporten', icon: 'reports' },
  { id: 'ranking', label: 'Ranglijst', icon: 'ranking' },
  { id: 'tribes', label: 'Stammen', icon: 'tribes' },
  { id: 'debug', label: 'Log & debug', icon: 'debug' },
];

/** Lower-case, no accents, for matching. */
const fold = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Ctrl+K: jump to a screen, building, own village, player or coordinate. */
export function CommandPalette() {
  const open = paletteOpen.value;
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+K anywhere opens it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        paletteOpen.value = !paletteOpen.value;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    send({ type: 'getRanking' });
    setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  const s = snapshot.value;
  const entries = useMemo<Entry[]>(() => {
    if (!s?.village) return [];
    const close = () => (paletteOpen.value = false);
    const out: Entry[] = [];
    // a coordinate: 500|500, 500 500, 500,500
    const m = q.trim().match(/^(\d{1,4})\s*[|, ]\s*(\d{1,4})$/);
    if (m) {
      const x = Number(m[1]);
      const y = Number(m[2]);
      out.push({ id: `xy-${x}-${y}`, label: `${x}|${y} op de kaart`, hint: 'coördinaat', icon: 'map', run: () => (close(), showOnMap({ x, y })) });
    }
    for (const sc of SCREENS) out.push({ id: `s-${sc.id}`, label: sc.label, hint: 'scherm', icon: sc.icon, run: () => (close(), (screen.value = sc.id)) });
    for (const b of s.village.buildings) {
      out.push({ id: `b-${b.id}`, label: b.name, hint: b.level > 0 ? `gebouw · level ${b.level}` : 'gebouw · niet gebouwd', icon: navIconFor(b.id), run: () => (close(), openBuilding(b.id)) });
    }
    for (const v of s.villages) {
      out.push({ id: `v-${v.id}`, label: v.name, hint: `jouw dorp · ${v.x}|${v.y}`, icon: 'villages', run: () => (close(), send({ type: 'selectVillage', id: v.id })) });
    }
    for (const p of ranking.value) {
      if (!p.isBot || p.villages === 0) continue;
      out.push({ id: `p-${p.id}`, label: p.name, hint: `speler · ${p.villages} ${p.villages === 1 ? 'dorp' : 'dorpen'}`, icon: 'map', run: () => (close(), showOnMap({ owner: p.id })) });
    }
    return out;
  }, [s?.village?.id, s?.villages, ranking.value, q]);

  const shown = useMemo(() => {
    const t = fold(q.trim());
    if (!t) return entries.filter((e) => e.id.startsWith('s-') || e.id.startsWith('v-')).slice(0, 12);
    const hits = entries
      .map((e) => {
        const l = fold(e.label);
        const score = e.id.startsWith('xy-') ? -1 : l.startsWith(t) ? 0 : l.includes(t) ? 1 : fold(e.hint).includes(t) ? 2 : 9;
        return { e, score };
      })
      .filter((x) => x.score < 9)
      .sort((a, b) => a.score - b.score || a.e.label.localeCompare(b.e.label));
    return hits.slice(0, 12).map((x) => x.e);
  }, [entries, q]);

  if (!open) return null;
  const pick = (e: Entry | undefined) => e?.run();

  return (
    <div class="palette-backdrop" onClick={() => (paletteOpen.value = false)}>
      <div class="palette" role="dialog" aria-label="Zoeken" onClick={(e) => e.stopPropagation()}>
        <div class="palette-input">
          <NavIcon name="search" size={16} />
          <input
            ref={input}
            value={q}
            placeholder="Zoek een scherm, gebouw, dorp, speler of 500|500…"
            aria-label="Zoeken"
            onInput={(e) => {
              setQ(e.currentTarget.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') paletteOpen.value = false;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((sel + 1) % Math.max(1, shown.length));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((sel - 1 + shown.length) % Math.max(1, shown.length));
              }
              if (e.key === 'Enter') pick(shown[sel]);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul class="palette-list" role="listbox">
          {shown.length === 0 && <li class="palette-empty">Niets gevonden.</li>}
          {shown.map((e, i) => (
            <li key={e.id} role="option" aria-selected={i === sel}>
              <button class={i === sel ? 'on' : ''} onMouseEnter={() => setSel(i)} onClick={() => pick(e)}>
                <NavIcon name={e.icon} size={17} />
                <span class="palette-label">{e.label}</span>
                <span class="palette-hint">{e.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function navIconFor(id: BuildingId): string {
  const known = ['main', 'barracks', 'stable', 'garage', 'statue', 'snob', 'smith', 'place', 'market'];
  return known.includes(id) ? id : 'overview';
}
