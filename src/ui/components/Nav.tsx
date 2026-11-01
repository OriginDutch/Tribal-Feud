import { useEffect, useRef } from 'preact/hooks';
import { NavIcon } from './NavIcon';
import { screen, snapshot, type Screen } from '../store';
import { GROUPS, MENU_BUILDINGS, SETTINGS, groupOf, isMenuBuilding, visibleTabs, type MenuGroup } from '../menu';
import { account } from '../../cloud/auth';
import { newAccounts } from '../../cloud/admin';
import { buildingsMenuOpen, keyHint } from '../keys';
import { isMobile } from '../mobile';

type Badge = { n: number; kind: 'danger' | 'good' | 'plain' } | null;

/** Badges per screen; a group shows the sum of its tabs (danger wins over good). */
export function screenBadge(sc: Screen): Badge {
  const s = snapshot.value!;
  switch (sc) {
    case 'reports': return s.unreadReports > 0 ? { n: s.unreadReports, kind: 'danger' } : null;
    case 'inbox': return s.inboxOpen > 0 || s.inboxUnread > 0 ? { n: s.inboxOpen || s.inboxUnread, kind: s.inboxOpen ? 'good' : 'danger' } : null;
    case 'overview': return s.incoming.length > 0 ? { n: s.incoming.length, kind: 'danger' } : null;
    case 'quests': return !s.autoRewards && s.quests.rewards.length > 0 ? { n: s.quests.rewards.length, kind: 'good' } : null;
    case 'admin': return account.value?.admin && newAccounts.value > 0 ? { n: newAccounts.value, kind: 'danger' } : null;
    default: return null;
  }
}
export function groupBadge(g: MenuGroup): Badge {
  const list = g.tabs.map((t) => screenBadge(t.screen)).filter((b): b is NonNullable<Badge> => !!b);
  if (!list.length) return null;
  return { n: list.reduce((s, b) => s + b.n, 0), kind: list.some((b) => b.kind === 'danger') ? 'danger' : 'good' };
}

/**
 * A screen link: a click opens the screen here; Ctrl/Cmd/Shift-click, a middle click or "open in
 * new tab" opens it in a new tab of the same world (the screen is in the address, see store).
 */
export function go(e: MouseEvent, to: Screen, after?: () => void): void {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  after?.();
  screen.value = to;
}

function RailButton({ g, active }: { g: MenuGroup; active: boolean }) {
  const badge = groupBadge(g);
  const key = keyHint(`group:${g.id}`);
  const to = g.tabs[0]!.screen;
  return (
    <a href={`#${to}`} class={`rail-item ${active ? 'active' : ''}`} aria-label={g.label} aria-current={active ? 'page' : undefined} onClick={(e) => go(e, to, () => (buildingsMenuOpen.value = false))}>
      {key && <small class="rail-key" aria-hidden="true">{key}</small>}
      <NavIcon name={g.icon} size={20} />
      <span class="rail-label">{g.label}</span>
      {badge && <span class={`rail-badge ${badge.kind}`}>{badge.n}</span>}
    </a>
  );
}

/** The buildings with a function, in a menu that opens to the right of the rail. */
function BuildingsMenu({ anchor }: { anchor: HTMLElement | null }) {
  const s = snapshot.value!;
  const v = s.village!;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      buildingsMenuOpen.value = false;
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') buildingsMenuOpen.value = false; };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [anchor]);
  const top = anchor ? Math.max(70, Math.min(anchor.getBoundingClientRect().top - 40, window.innerHeight - 470)) : 120;
  return (
    <div class="bmenu" ref={ref} style={{ top: `${top}px` }} role="menu" aria-label="Gebouwen">
      <div class="bmenu-head">Gebouwen · {v.name}</div>
      {MENU_BUILDINGS.map((b) => {
        const lvl = v.buildings.find((x) => x.id === b.building)?.level ?? 0;
        const key = keyHint(`building:${b.building}`);
        return (
          <a key={b.screen} href={`#${b.screen}`} role="menuitem" class={`bmenu-item ${screen.value === b.screen ? 'active' : ''} ${lvl === 0 ? 'unbuilt' : ''}`}
            onClick={(e) => go(e, b.screen, () => (buildingsMenuOpen.value = false))}>
            <NavIcon name={b.screen} size={18} />
            <span>{b.label}</span>
            <small>{key ? <kbd>{key}</kbd> : null} {lvl ? `lv ${lvl}` : 'niet gebouwd'}</small>
          </a>
        );
      })}
    </div>
  );
}

/** The menu: main groups (tabs inside), one button for the buildings, settings at the bottom. */
export function Nav() {
  const s = snapshot.value;
  const anchor = useRef<HTMLButtonElement>(null);
  if (!s?.village) return null;
  const current = groupOf(screen.value);
  const inBuilding = isMenuBuilding(screen.value);
  const open = buildingsMenuOpen.value;
  const key = keyHint('buildings');
  return (
    <nav class="rail" aria-label="Menu">
      {GROUPS.map((g) => <RailButton key={g.id} g={g} active={current?.id === g.id} />)}
      <div class="rail-sep" />
      <button ref={anchor} class={`rail-item ${inBuilding || open ? 'active' : ''}`} aria-label="Gebouwen" aria-haspopup="menu" aria-expanded={open}
        onClick={() => (buildingsMenuOpen.value = !open)}>
        {key && <small class="rail-key" aria-hidden="true">{key}</small>}
        <NavIcon name="main" size={20} />
        <span class="rail-label">Gebouwen</span>
      </button>
      <div class="rail-fill" />
      <RailButton g={SETTINGS} active={current?.id === SETTINGS.id} />
      {open && <BuildingsMenu anchor={anchor.current} />}
    </nav>
  );
}

/** Tabs above a screen whose group has more than one. */
export function ScreenTabs() {
  const g = groupOf(screen.value, isMobile.value);
  const tabs = g ? visibleTabs(g, account.value?.admin ?? false, isMobile.value) : [];
  if (!g || tabs.length < 2 || !snapshot.value) return null;
  return (
    <div class="screen-tabs" role="tablist" aria-label={g.label}>
      {tabs.map((t) => {
        const b = screenBadge(t.screen);
        const on = t.screen === screen.value;
        return (
          <a key={t.screen} href={`#${t.screen}`} role="tab" aria-selected={on} class={on ? 'on' : ''} onClick={(e) => go(e, t.screen)}>
            {t.label}
            {b && b.kind !== 'plain' && <span class={`tab-badge ${b.kind}`}>{b.n}</span>}
          </a>
        );
      })}
    </div>
  );
}
