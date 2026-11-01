import { BuildingsScreen } from './screens/BuildingsScreen';
import { MobileNav, MobileSheets, MobileStatus, MobileTopBar } from './components/MobileShell';
import { isMobile } from './mobile';
import { PerfMeter } from './components/PerfMeter';
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
import { autoPause, blocked, notice, screen, snapshot } from './store';
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
import { AdminScreen } from './screens/AdminScreen';
import { SoundScreen } from './screens/SoundScreen';
import { WorldPanel } from './panels/WorldPanel';
import { AccountModal } from './components/Account';
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
    case 'admin':
      return <AdminScreen />;
    case 'buildings':
      return <BuildingsScreen />;
    case 'sound':
      return <SoundScreen />;
    case 'rules':
      return <main class="grid rules-grid"><WorldPanel /></main>;
    default:
      return <RecruitScreen building={screen.value} />;
  }
}

export function App() {
  useShortcuts();
  const paused = autoPause.value;
  const n = notice.value;
  const hasWorld = snapshot.value?.village != null;
  if (blocked.value) {
    return (
      <div class="blocked-screen">
        <section class="panel">
          <h2>Tribal Feud draait al in een ander tabblad</h2>
          <p>
            Er loopt nog een andere versie van het spel, waarschijnlijk een tabblad van vóór een update. Er mag er maar één tegelijk rekenen, anders
            overschrijven ze elkaars saves. Sluit of herlaad de andere tabbladen van het spel en probeer het dan opnieuw.
          </p>
          <button class="primary" onClick={() => location.reload()}>Opnieuw proberen</button>
        </section>
      </div>
    );
  }

  const mobile = isMobile.value;
  return (
    <>
      {hasWorld && (mobile ? <MobileTopBar /> : <TopBar />)}
      {hasWorld && mobile && <MobileStatus />}
      <PerfMeter />
      {/* overlays: they float over the page so nothing below them moves */}
      <div class="overlays">
        {paused && (
          <div class="banner">
            Auto-pause · {formatGameTime(paused.time)} · {paused.text}
          </div>
        )}
        {n && <div class={`notice ${n.level}`}>{n.text}</div>}
      </div>
      <AccountModal />
      {hasWorld && mobile ? (
        <div class="layout m-layout">
          <main class="content">
            <ScreenTabs />
            <CurrentScreen />
          </main>
          <EndgameModal />
          <ReportPopup />
          <MobileSheets />
          <MobileNav />
        </div>
      ) : hasWorld ? (
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
