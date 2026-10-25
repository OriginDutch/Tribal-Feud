import { QuestToasts } from './QuestToasts';
import { VillageSwitcher } from './VillageSwitcher';
import { screen, snapshot, type Screen } from '../store';

export function Nav() {
  const v = snapshot.value?.village;
  if (!v) return null;
  const level = (id: string) => v.buildings.find((b) => b.id === id)?.level ?? 0;

  const items: { id: Screen; label: string; building?: string }[] = [
    { id: 'overview', label: 'Overzicht' },
    { id: 'villages', label: `Dorpen (${snapshot.value?.villages.length ?? 1})` },
    { id: 'manager', label: 'Accountmanager' },
    { id: 'quests', label: 'Opdrachten' },
    { id: 'main', label: 'Hoofdgebouw', building: 'main' },
    { id: 'barracks', label: 'Kazerne', building: 'barracks' },
    { id: 'stable', label: 'Stal', building: 'stable' },
    { id: 'garage', label: 'Werkplaats', building: 'garage' },
    { id: 'statue', label: 'Standbeeld', building: 'statue' },
    { id: 'snob', label: 'Adelshoeve', building: 'snob' },
    { id: 'smith', label: 'Smederij', building: 'smith' },
    { id: 'place', label: 'Verzamelplaats', building: 'place' },
    { id: 'market', label: 'Marktplaats', building: 'market' },
    { id: 'map', label: 'Kaart' },
    { id: 'farm', label: 'Farm-assistent' },
    { id: 'reports', label: 'Rapporten' },
    { id: 'ranking', label: 'Ranglijst' },
    { id: 'debug', label: 'Log & debug' },
  ];
  const unread = snapshot.value?.unreadReports ?? 0;
  const incoming = snapshot.value?.incoming.length ?? 0;
  const rewardCount = snapshot.value?.quests.rewards.length ?? 0;

  return (
    <nav class="nav">
      <VillageSwitcher />
      {items.map((item) => {
        const lvl = item.building ? level(item.building) : null;
        return (
          <button
            key={item.id}
            class={`nav-item ${screen.value === item.id ? 'active' : ''} ${lvl === 0 ? 'unbuilt' : ''}`}
            onClick={() => (screen.value = item.id)}
          >
            <span>{item.label}</span>
            {lvl !== null && <span class="lvl">{lvl > 0 ? lvl : '—'}</span>}
            {item.id === 'reports' && unread > 0 && <span class="badge">{unread}</span>}
            {item.id === 'overview' && incoming > 0 && (
              <span class="badge danger" title="Inkomende aanvallen">
                ⚔ {incoming}
              </span>
            )}
            {item.id === 'quests' && rewardCount > 0 && <span class="badge good">{rewardCount}</span>}
          </button>
        );
      })}
      <QuestToasts />
    </nav>
  );
}
