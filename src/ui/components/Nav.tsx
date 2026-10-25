import { screen, snapshot, type Screen } from '../store';

export function Nav() {
  const v = snapshot.value?.village;
  if (!v) return null;
  const level = (id: string) => v.buildings.find((b) => b.id === id)?.level ?? 0;

  const items: { id: Screen; label: string; building?: string }[] = [
    { id: 'overview', label: 'Overzicht' },
    { id: 'quests', label: 'Opdrachten' },
    { id: 'main', label: 'Hoofdgebouw', building: 'main' },
    { id: 'barracks', label: 'Kazerne', building: 'barracks' },
    { id: 'stable', label: 'Stal', building: 'stable' },
    { id: 'garage', label: 'Werkplaats', building: 'garage' },
    { id: 'statue', label: 'Standbeeld', building: 'statue' },
    { id: 'smith', label: 'Smederij', building: 'smith' },
    { id: 'place', label: 'Verzamelplaats', building: 'place' },
    { id: 'map', label: 'Kaart' },
    { id: 'farm', label: 'Farm-assistent' },
    { id: 'reports', label: 'Rapporten' },
    { id: 'ranking', label: 'Ranglijst' },
    { id: 'debug', label: 'Log & debug' },
  ];
  const unread = snapshot.value?.unreadReports ?? 0;
  const rewardCount = snapshot.value?.quests.rewards.length ?? 0;

  return (
    <nav class="nav">
      <div class="village-name">
        {v.name} <span class="muted">({v.x}|{v.y})</span>
      </div>
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
            {item.id === 'quests' && rewardCount > 0 && <span class="badge good">{rewardCount}</span>}
          </button>
        );
      })}
    </nav>
  );
}
