import { musicSettings, nowPlaying, playingHere, toggleMute } from './player';
import { TRACK_NAMES } from './playlist';
import { keyLabel, keyOf } from '../keys';

/** Speaker in the top bar and on the start screen: music on or off. */
export function MusicButton({ class: cls = '' }: { class?: string }) {
  const muted = musicSettings.value.muted;
  const track = nowPlaying.value;
  const key = keyOf('mute');
  const title = `${muted ? 'Muziek aanzetten' : 'Muziek uitzetten'}${key ? ` (${keyLabel(key)})` : ''}${track && !muted ? ` · ${TRACK_NAMES[track]}` : ''}`;
  return (
    <button type="button" class={`music-btn ${cls}`} onClick={toggleMute} title={title} aria-label={muted ? 'Muziek aanzetten' : 'Muziek uitzetten'} aria-pressed={!muted} data-track={track ?? ''} data-playing={playingHere.value ? 'yes' : 'no'}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
        {muted ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}
      </svg>
    </button>
  );
}
