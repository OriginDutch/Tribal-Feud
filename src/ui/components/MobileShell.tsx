/**
 * The phone layout around the screens: a compact top bar (village, clock), a status line
 * (incoming attacks, your leader's order), the bottom bar with five places, and the sheets that
 * slide up from it (speed, "Meer", picking a village). Desktop keeps the side rail.
 */
import { useState } from 'preact/hooks';
import { SPEEDS, formatGameTime } from '../../shared/time';
import { num } from '../format';
import { GROUPS, MOBILE_GROUPS, MORE_IDS, SETTINGS, groupOf, isMenuBuilding, type MenuGroup } from '../menu';
import { mobileSheet } from '../mobile';
import { groupFilter, screen, send, setGroupFilter, snapshot, togglePause, type Screen } from '../store';
import { musicSettings, setMusic } from '../music/player';
import { account, openAccount } from '../../cloud/auth';
import { NavIcon } from './NavIcon';
import { ResIcon } from './ResIcon';
import { OrderChip } from './OrderPanel';
import { groupBadge } from './Nav';
import { stepVillage } from './VillageSwitcher';

const open = (to: Screen) => { mobileSheet.value = null; screen.value = to; };

function Res({ kind, value, sub, full }: { kind: 'wood' | 'stone' | 'iron' | 'pop'; value: number; sub: string; full: boolean }) {
  return (
    <div class={`m-res ${full ? 'full' : ''}`}>
      <ResIcon kind={kind} size={14} />
      <span><b>{num(value)}</b><small>{sub}</small></span>
    </div>
  );
}

export function MobileTopBar() {
  const s = snapshot.value!;
  const v = s.village!;
  const many = s.villages.length > 1;
  const speedOpen = mobileSheet.value === 'speed';
  const [h, m] = formatGameTime(s.time).split(' · ')[1]!.split(':');
  return (
    <header class="m-top">
      <div class="m-row">
        <button class="m-step" aria-label="Vorig dorp" disabled={!many} onClick={() => stepVillage(-1)}>‹</button>
        <button class="m-vname" aria-haspopup="dialog" onClick={() => (mobileSheet.value = mobileSheet.value === 'villages' ? null : 'villages')}>
          <b>{v.name} <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></b>
          <small>{v.x}|{v.y} · {s.villages.findIndex((x) => x.id === v.id) + 1}/{s.villages.length} dorpen</small>
        </button>
        <button class="m-step" aria-label="Volgend dorp" disabled={!many} onClick={() => stepVillage(1)}>›</button>
        <button class={`m-clock ${speedOpen ? 'open' : ''} ${s.paused ? 'paused' : ''}`} aria-label="Snelheid en pauze" aria-expanded={speedOpen} onClick={() => (mobileSheet.value = speedOpen ? null : 'speed')}>
          {s.paused ? (
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1" fill="currentColor" /><rect x="14" y="4" width="5" height="16" rx="1" fill="currentColor" /></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" fill="currentColor" /></svg>
          )}
          <span><b>{formatGameTime(s.time).split(' · ')[0]} · {h}:{m}</b><small>{s.paused ? 'pauze' : `${s.speed}×`}</small></span>
        </button>
      </div>
      <div class="m-res-row">
        <Res kind="wood" value={v.res[0] ?? 0} sub="hout" full={(v.res[0] ?? 0) >= v.storage} />
        <Res kind="stone" value={v.res[1] ?? 0} sub="leem" full={(v.res[1] ?? 0) >= v.storage} />
        <Res kind="iron" value={v.res[2] ?? 0} sub="ijzer" full={(v.res[2] ?? 0) >= v.storage} />
        <Res kind="pop" value={v.pop.used} sub={`/ ${num(v.pop.max)}`} full={v.pop.used >= v.pop.max} />
      </div>
    </header>
  );
}

/** Only when something is going on: attacks on you, your leader's order. */
export function MobileStatus() {
  const s = snapshot.value!;
  const inc = s.incoming;
  const order = s.leaderOrder || s.scoutOrders?.length;
  if (!inc.length && !order) return null;
  const first = inc.length ? Math.min(...inc.map((m) => m.arrives)) : 0;
  const total = Math.max(0, first - s.time) / 1000;
  const eta = `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(total % 60)).padStart(2, '0')}`;
  return (
    <div class="m-status">
      {inc.length > 0 && (
        <a href="#overview" class="m-incoming" onClick={(e) => { e.preventDefault(); open('overview'); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 19 L19 5 M15 5 H19 V9" /><path d="M19 19 L5 5 M5 9 V5 H9" /></svg>
          <span>{inc.length} {inc.length === 1 ? 'aanval' : 'aanvallen'} · eerste over {eta}</span>
        </a>
      )}
      {order ? <OrderChip /> : null}
    </div>
  );
}

function NavLink({ g, label, onClick, active }: { g?: MenuGroup; label: string; icon?: string; onClick: () => void; active: boolean }) {
  const badge = g ? groupBadge(g) : null;
  return (
    <button class={`m-nav-item ${active ? 'on' : ''}`} aria-current={active ? 'page' : undefined} onClick={onClick}>
      <NavIcon name={g?.icon ?? 'more'} size={22} />
      <span>{label}</span>
      {badge && <i class={`m-badge ${badge.kind}`}>{badge.n}</i>}
    </button>
  );
}

export function MobileNav() {
  const cur = groupOf(screen.value, true);
  const inMore = mobileSheet.value === 'more';
  const moreBadge = [...MORE_IDS.map((id) => GROUPS.find((g) => g.id === id)!), SETTINGS].map(groupBadge).filter(Boolean);
  const inBuilding = isMenuBuilding(screen.value);
  return (
    <nav class="m-nav" aria-label="Hoofdmenu">
      {MOBILE_GROUPS.map((g) => (
        <NavLink key={g.id} g={g} label={g.label} active={!inMore && (cur?.id === g.id || (g.id === 'dorp' && inBuilding))} onClick={() => open(g.tabs[0]!.screen)} />
      ))}
      <button class={`m-nav-item ${inMore || (cur && !MOBILE_GROUPS.includes(cur)) ? 'on' : ''}`} aria-expanded={inMore} onClick={() => (mobileSheet.value = inMore ? null : 'more')}>
        {inMore ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18" /></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7 H20 M4 12 H20 M4 17 H20" /></svg>
        )}
        <span>{inMore ? 'Sluiten' : 'Meer'}</span>
        {!inMore && moreBadge.length > 0 && <i class="m-badge good">{moreBadge.reduce((a, b) => a + b!.n, 0)}</i>}
      </button>
    </nav>
  );
}

function Sheet({ label, children, top = false }: { label: string; children: preact.ComponentChildren; top?: boolean }) {
  return (
    <>
      <button class="m-scrim" aria-label="Sluiten" onClick={() => (mobileSheet.value = null)} />
      <section class={`m-sheet ${top ? 'top' : ''}`} role="dialog" aria-label={label}>
        {!top && <div class="m-grip" aria-hidden="true" />}
        {children}
      </section>
    </>
  );
}

function SpeedSheet() {
  const s = snapshot.value!;
  const music = musicSettings.value;
  return (
    <Sheet label="Spelsnelheid" top>
      <div class="m-sheet-head">
        <h2>Spelsnelheid</h2>
        <span class="muted mono">{formatGameTime(s.time)}</span>
      </div>
      <button class="m-big primary" onClick={() => togglePause()}>{s.paused ? '▶ Start' : '❚❚ Pauze'}</button>
      <div class="m-speeds" role="group" aria-label="Snelheid">
        {SPEEDS.map((sp) => (
          <button key={sp} class={s.speed === sp ? 'on' : ''} aria-pressed={s.speed === sp} onClick={() => send({ type: 'setSpeed', speed: sp })}>{sp}×</button>
        ))}
      </div>
      <div class="m-two">
        <button onClick={() => { send({ type: 'saveWorld' }); mobileSheet.value = null; }}>Opslaan</button>
        <button onClick={() => setMusic({ muted: !music.muted })}>Muziek: {music.muted ? 'uit' : 'aan'}</button>
      </div>
    </Sheet>
  );
}

function MoreSheet() {
  const s = snapshot.value!;
  const groups = [...MORE_IDS.map((id) => GROUPS.find((g) => g.id === id)!), SETTINGS];
  const news = s.news[0];
  return (
    <Sheet label="Meer">
      <div class="m-tiles">
        {groups.map((g) => {
          const b = groupBadge(g);
          return (
            <button key={g.id} class="m-tile" onClick={() => open(g.tabs[0]!.screen)}>
              <NavIcon name={g.icon} size={24} />
              <span>{g.label}</span>
              {b && <i class={`m-badge ${b.kind}`}>{b.n}</i>}
            </button>
          );
        })}
      </div>
      <div class="m-list">
        <button onClick={() => { mobileSheet.value = null; openAccount(); }}><span>Account</span><small>{account.value?.email ?? 'niet ingelogd'} ›</small></button>
        <button onClick={() => open('news')}><span>Nieuws</span><small>{news ? news.head : ''} ›</small></button>
      </div>
    </Sheet>
  );
}

function VillageSheet() {
  const s = snapshot.value!;
  const [q, setQ] = useState('');
  const g = groupFilter.value;
  const inc = new Map<number, number>();
  for (const m of s.incoming) inc.set(m.to.id, Math.min(inc.get(m.to.id) ?? Infinity, m.arrives));
  const needle = q.trim().toLowerCase();
  const list = s.villages
    .filter((v) => !g || v.groups.includes(g))
    .filter((v) => !needle || v.name.toLowerCase().includes(needle) || `${v.x}|${v.y}`.includes(needle));
  return (
    <Sheet label="Dorp kiezen">
      <label class="m-search">
        <span class="sr-only">Zoek een dorp</span>
        <input type="search" placeholder="Zoek op naam of 515|479" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      </label>
      {s.groups.length > 0 && (
        <div class="m-chips">
          <button class={!g ? 'on' : ''} onClick={() => setGroupFilter(null)}>Alle {s.villages.length}</button>
          {s.groups.map((x) => (
            <button key={x.id} class={g === x.id ? 'on' : ''} onClick={() => setGroupFilter(x.id)}>{x.name} {s.villages.filter((v) => v.groups.includes(x.id)).length}</button>
          ))}
        </div>
      )}
      <div class="m-vlist">
        {list.map((v) => {
          const at = inc.get(v.id);
          return (
            <button key={v.id} class={v.id === s.village?.id ? 'on' : ''} onClick={() => { send({ type: 'selectVillage', id: v.id }); mobileSheet.value = null; }}>
              <span><b>{v.name}</b><small>{v.x}|{v.y} · {num(v.points)} p</small></span>
              {at !== undefined && <em>aanval over {Math.max(0, Math.round((at - s.time) / 60_000))} min</em>}
            </button>
          );
        })}
        {!list.length && <p class="muted">Geen dorp gevonden.</p>}
      </div>
    </Sheet>
  );
}

export function MobileSheets() {
  const which = mobileSheet.value;
  if (which === 'speed') return <SpeedSheet />;
  if (which === 'more') return <MoreSheet />;
  if (which === 'villages') return <VillageSheet />;
  return null;
}
