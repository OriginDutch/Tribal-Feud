import { useEffect } from 'preact/hooks';
import { formatGameTime } from '../shared/time';
import { TopBar } from './components/TopBar';
import { Nav } from './components/Nav';
import { autoPause, notice, screen, snapshot, togglePause } from './store';
import { DebugScreen } from './screens/DebugScreen';
import { MainScreen } from './screens/MainScreen';
import { OverviewScreen } from './screens/OverviewScreen';
import { RecruitScreen } from './screens/RecruitScreen';
import { SmithScreen } from './screens/SmithScreen';
import { StartScreen } from './screens/StartScreen';

/** Spacebar toggles pause, except while typing in a field. */
function useSpacebarPause(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      // preventDefault also stops a focused button from being "clicked" by the spacebar
      if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'SELECT') {
        e.preventDefault();
        togglePause();
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
      {paused && (
        <div class="banner">
          Auto-pause · {formatGameTime(paused.time)} · {paused.text}
        </div>
      )}
      {n && <div class={`notice ${n.level}`}>{n.text}</div>}
      {hasWorld ? (
        <div class="layout">
          <Nav />
          <main class="content">
            <CurrentScreen />
          </main>
        </div>
      ) : (
        <StartScreen />
      )}
    </>
  );
}
