import { tr } from '../../shared/i18n';
import { musicSettings, nowPlaying, setMusic } from '../music/player';
import { TRACK_NAMES } from '../music/playlist';
import { ALL_SFX, SFX_NAMES, setSfx, sfxSettings, testSound } from '../sfx';

/** Settings › Geluid: music volume and on/off. */
export function SoundScreen() {
  const s = musicSettings.value;
  const track = nowPlaying.value;
  const fx = sfxSettings.value;
  return (
    <>
    <section class="panel sound-panel">
      <h2>{tr('Muziek')}</h2>
      <label class="check">
        <input type="checkbox" checked={!s.muted} onChange={(e) => setMusic({ muted: !e.currentTarget.checked })} />
        {tr('Muziek aan')}
      </label>
      <label class="sound-volume">
        <span>{tr('Volume')}</span>
        <input type="range" min={0} max={100} step={1} value={Math.round(s.volume * 100)} disabled={s.muted} onInput={(e) => setMusic({ volume: Number(e.currentTarget.value) / 100 })} />
        <span class="mono">{Math.round(s.volume * 100)}%</span>
      </label>
      <p class="hint">
        {track && !s.muted ? tr('Nu: {track}.', { track: TRACK_NAMES[track] }) + ' ' : ''}{tr('Eerst een thema, daarna alle nummers in willekeurige volgorde. Muziek speelt alleen in het tabblad waar je naar kijkt.')}
      </p>
    </section>
    <section class="panel sound-panel">
      <h2>{tr('Geluidseffecten')}</h2>
      <label class="check">
        <input type="checkbox" checked={!fx.muted} onChange={(e) => setSfx({ muted: !e.currentTarget.checked })} />
        {tr('Geluidseffecten aan')}
      </label>
      <label class="sound-volume">
        <span>{tr('Volume')}</span>
        <input type="range" min={0} max={100} step={1} value={Math.round(fx.volume * 100)} disabled={fx.muted} onInput={(e) => setSfx({ volume: Number(e.currentTarget.value) / 100 })} />
        <span class="mono">{Math.round(fx.volume * 100)}%</span>
      </label>
      <ul class="sfx-list">
        {ALL_SFX.map((id) => (
          <li key={id}>
            <label class="check">
              <input
                type="checkbox"
                disabled={fx.muted}
                checked={!fx.off.includes(id)}
                onChange={(e) => setSfx({ off: e.currentTarget.checked ? fx.off.filter((x) => x !== id) : [...fx.off, id] })}
              />
              {tr(SFX_NAMES[id])}
            </label>
            <button class="small" onClick={() => testSound(id)} title={tr('Laat horen')}>▶</button>
          </li>
        ))}
      </ul>
      <p class="hint">{tr('Farmruns maken geen geluid. Komen er meer tegelijk, dan hoor je het belangrijkste (verloren gaat voor gewonnen), hooguit één per twee seconden.')}</p>
    </section>
    </>
  );
}
