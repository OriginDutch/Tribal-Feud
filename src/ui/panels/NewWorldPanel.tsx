import { useState } from 'preact/hooks';
import type { PresetId } from '../../shared/config';
import type { Command } from '../../shared/protocol';
import { autoPause, send } from '../store';

type Preset = Exclude<PresetId, 'custom'>;

export function NewWorldPanel() {
  const [name, setName] = useState('Wereld 1');
  const [preset, setPreset] = useState<Preset>('classic');
  const [seed, setSeed] = useState('');

  const create = () => {
    const cmd: Command = { type: 'newWorld', preset, name };
    if (seed.trim() !== '') cmd.seed = Number(seed) >>> 0;
    autoPause.value = null;
    send(cmd);
  };

  return (
    <section class="panel">
      <h2>Nieuwe wereld</h2>
      <label>
        Naam
        <input type="text" maxLength={40} value={name} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <label>
        Preset
        <select value={preset} onChange={(e) => setPreset(e.currentTarget.value as Preset)}>
          <option value="classic">Classic</option>
          <option value="speed">Speed</option>
          <option value="hardcore">Hardcore</option>
        </select>
      </label>
      <label>
        Seed
        <input
          type="number"
          min={0}
          placeholder="leeg = willekeurig"
          value={seed}
          onInput={(e) => setSeed(e.currentTarget.value)}
        />
      </label>
      <button onClick={create}>Nieuwe wereld</button>
    </section>
  );
}
