import { PlayerScreen } from './screens/PlayerScreen';
import { SupportScreen } from './screens/SupportScreen';
import { InboxScreen } from './screens/InboxScreen';
import { TribesScreen } from './screens/TribesScreen';
import { useEffect } from 'preact/hooks';
import { formatGameTime } from '../shared/time';
import { TopBar } from './components/TopBar';
import { Nav } from './components/Nav';
import { EndgameModal } from './components/EndgameModal';
import { autoPause, notice, screen, snapshot, togglePause } from './store';
import { DebugScreen } from './screens/DebugScreen';
import { MainScreen } from './screens/MainScreen';
import { OverviewScreen } from './screens/OverviewScreen';
import { RecruitScreen } from './screens/RecruitScreen';
import { SmithScreen } from './screens/SmithScreen';
import { StartScreen } from './screens/StartScreen';
import { MapScreen } from './screens/MapScreen';
import { PlaceScreen } from './screens/PlaceScreen';
import { MarketScreen } from './screens/MarketScreen';
import { BuildingScreen } from './buildings/BuildingScreen';
import { FarmScreen } from './screens/FarmScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { QuestsScreen } from './screens/QuestsScreen';
import { RankingScreen } from './screens/RankingScreen';
import { VillagesScreen } from './screens/VillagesScreen';
import { ManagerScreen } from './screens/ManagerScreen';
import { stepVillage } from './components/VillageSwitcher';
import { QuestToasts } from './components/QuestToasts';
import { CommandPalette } from './components/CommandPalette';

/** Spacebar toggles pause, except while typing in a field. */
function useSpacebarPause(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      // preventDefault also stops a focused button from being "clicked" by the spacebar
      const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
      if (e.code === 'Space' && !typing) {
        e.preventDefault();
        togglePause();
      }
      // A / D: previous / next village, like TW
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.code === 'KeyA') stepVillage(-1);
        if (e.code === 'KeyD') stepVillage(1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

function CurrentScreen() {
  switch (screen.value) {
    case 'overview':
      return <OverviewScreen />;
    case 'main':
      return <MainScreen />;
    case 'smith':
      return <SmithScreen />;
    case 'debug':
      return <DebugScreen />;
    case 'map':
      return <MapScreen />;
    case 'place':
      return <PlaceScreen />;
    case 'building':
      return <BuildingScreen />;
    case 'market':
      return <MarketScreen />;
    case 'farm':
      return <FarmScreen />;
    case 'reports':
      return <ReportsScreen />;
    case 'quests':
      return <QuestsScreen />;
    case 'ranking':
      return <RankingScreen />;
    case 'tribes':
      return <TribesScreen />;
    case 'inbox':
      return <InboxScreen />;
    case 'support':
      return <SupportScreen />;
    case 'player':
      return <PlayerScreen />;
    case 'villages':
      return <VillagesScreen />;
    case 'manager':
      return <ManagerScreen />;
    default:
      return <RecruitScreen building={screen.value} />;
  }
}

export function App() {
  useSpacebarPause();
  const paused = autoPause.value;
  const n = notice.value;
  const hasWorld = snapshot.value?.village != null;

  return (
    <>
      <TopBar />
      {/* overlays: they float over the page so nothing below them moves */}
      <div class="overlays">
        {paused && (
          <div class="banner">
            Auto-pause · {formatGameTime(paused.time)} · {paused.text}
          </div>
        )}
        {n && <div class={`notice ${n.level}`}>{n.text}</div>}
      </div>
      {hasWorld ? (
        <div class="layout">
          <Nav />
          <main class="content">
            <CurrentScreen />
          </main>
          <aside class="toast-col" aria-label="Meldingen">
            <QuestToasts />
          </aside>
          <CommandPalette />
          <EndgameModal />
        </div>
      ) : (
        <StartScreen />
      )}
    </>
  );
}
