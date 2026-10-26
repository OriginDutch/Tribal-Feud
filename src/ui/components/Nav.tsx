import { NavIcon } from './NavIcon';
import { screen, snapshot, type Screen } from '../store';

type Item = { id: Screen; label: string; building?: string } | 'sep';

const ITEMS: Item[] = [
  { id: 'overview', label: 'Overzicht' },
  { id: 'villages', label: 'Dorpen' },
  { id: 'manager', label: 'Accountmanager' },
  { id: 'quests', label: 'Opdrachten' },
  'sep',
  { id: 'main', label: 'Hoofdgebouw', building: 'main' },
  { id: 'barracks', label: 'Kazerne', building: 'barracks' },
  { id: 'stable', label: 'Stal', building: 'stable' },
  { id: 'garage', label: 'Werkplaats', building: 'garage' },
  { id: 'statue', label: 'Standbeeld', building: 'statue' },
  { id: 'snob', label: 'Adelshoeve', building: 'snob' },
  { id: 'smith', label: 'Smederij', building: 'smith' },
  { id: 'place', label: 'Verzamelplaats', building: 'place' },
  { id: 'market', label: 'Marktplaats', building: 'market' },
  'sep',
  { id: 'map', label: 'Kaart' },
  { id: 'farm', label: 'Farm-assistent' },
  { id: 'reports', label: 'Rapporten' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'ranking', label: 'Ranglijst' },
  { id: 'tribes', label: 'Stammen' },
  { id: 'debug', label: 'Log & debug' },
];

/** The menu: a slim rail of icons, the name shows on hover (and to screen readers). */
export function Nav() {
  const s = snapshot.value;
  const v = s?.village;
  if (!s || !v) return null;
  const level = (id: string) => v.buildings.find((b) => b.id === id)?.level ?? 0;
  const unread = s.unreadReports;
  const incoming = s.incoming.length;
  const rewards = s.quests.rewards.length;

  return (
    <nav class="rail" aria-label="Menu">
      {ITEMS.map((item, i) => {
        if (item === 'sep') return <div key={`sep-${i}`} class="rail-sep" />;
        const lvl = item.building ? level(item.building) : null;
        const active = screen.value === item.id;
        const badge =
          item.id === 'reports' && unread > 0 ? { n: unread, kind: 'danger' } : item.id === 'inbox' && (s.inboxOpen > 0 || s.inboxUnread > 0) ? { n: s.inboxOpen || s.inboxUnread, kind: s.inboxOpen ? 'good' : 'danger' } : item.id === 'overview' && incoming > 0 ? { n: incoming, kind: 'danger' } : item.id === 'quests' && rewards > 0 ? { n: rewards, kind: 'good' } : item.id === 'villages' ? { n: s.villages.length, kind: 'plain' } : null;
        return (
          <button
            key={item.id}
            class={`rail-item ${active ? 'active' : ''} ${lvl === 0 ? 'unbuilt' : ''}`}
            aria-label={`${item.label}${lvl ? `, level ${lvl}` : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => (screen.value = item.id)}
          >
            <NavIcon name={item.id} />
            {lvl !== null && lvl > 0 && <small class="rail-lvl">{lvl}</small>}
            {badge && badge.kind !== 'plain' && <span class={`rail-badge ${badge.kind}`}>{badge.n}</span>}
            {badge && badge.kind === 'plain' && <small class="rail-lvl">{badge.n}</small>}
            <span class="rail-tip">
              {item.label}
              {lvl ? <em> · level {lvl}</em> : lvl === 0 ? <em> · niet gebouwd</em> : null}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
