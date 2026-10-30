import { PlayerScreen } from './screens/PlayerScreen';
import { SupportScreen } from './screens/SupportScreen';
import { InboxScreen } from './screens/InboxScreen';
import { TribesScreen } from './screens/TribesScreen';
import { useEffect } from 'preact/hooks';
import { formatGameTime } from '../shared/time';
import { TopBar } from './components/TopBar';
import { Nav, ScreenTabs } from './components/Nav';
import { EndgameModal } from './components/EndgameModal';
import { RelationsScreen } from './screens/RelationsScreen';
import { StatsScreen } from './screens/StatsScreen';
import { ScavengeScreen } from './screens/ScavengeScreen';
import { SimulatorScreen } from './screens/SimulatorScreen';
import { autoPause, notice, screen, snapshot } from './store';
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
import { NewsScreen } from './screens/NewsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { onShortcut } from './keys';
import { NewsTicker } from './components/NewsTicker';
import { ReportPopup } from './components/ReportPopup';
import { QuestToasts } from './components/QuestToasts';
import { CommandPalette } from './components/CommandPalette';

/** All keyboard shortcuts go through one handler (see keys). */
function useShortcuts(): void {
  useEffect(() => {
    document.addEventListener('keydown', onShortcut);
    return () => document.removeEventListener('keydown', onShortcut);
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
    case 'relations':
      return <RelationsScreen />;
    case 'stats':
      return <StatsScreen />;
    case 'simulator':
      return <SimulatorScreen />;
    case 'scavenge':
      return <ScavengeScreen />;
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
    case 'news':
      return <NewsScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <RecruitScreen building={screen.value} />;
  }
}

export function App() {
  useShortcuts();
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
            <ScreenTabs />
            <CurrentScreen />
          </main>
          <aside class="toast-col" aria-label="Meldingen">
            <QuestToasts />
          </aside>
          <CommandPalette />
          <EndgameModal />
          <ReportPopup />
          <NewsTicker />
        </div>
      ) : (
        <StartScreen />
      )}
    </>
  );
}
