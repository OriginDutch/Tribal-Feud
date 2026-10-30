import { musicSettings, nowPlaying, setMusic } from '../music/player';
import { TRACK_NAMES } from '../music/playlist';

/** Settings › Geluid: music volume and on/off. */
export function SoundScreen() {
  const s = musicSettings.value;
  const track = nowPlaying.value;
  return (
    <section class="panel sound-panel">
      <h2>Muziek</h2>
      <label class="check">
        <input type="checkbox" checked={!s.muted} onChange={(e) => setMusic({ muted: !e.currentTarget.checked })} />
        Muziek aan
      </label>
      <label class="sound-volume">
        <span>Volume</span>
        <input type="range" min={0} max={100} step={1} value={Math.round(s.volume * 100)} disabled={s.muted} onInput={(e) => setMusic({ volume: Number(e.currentTarget.value) / 100 })} />
        <span class="mono">{Math.round(s.volume * 100)}%</span>
      </label>
      <p class="hint">
        {track && !s.muted ? `Nu: ${TRACK_NAMES[track]}. ` : ''}Eerst een thema, daarna alle nummers in willekeurige volgorde. Muziek speelt alleen in het tabblad waar je naar kijkt.
      </p>
    </section>
  );
}
